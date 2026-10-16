# Esquema de base de datos (Fase 1 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §4` (Spec 003). Dominio: `docs/architecture/system-design.md §2` (entidades e invariantes I1-I5), `§3` (propiedad de datos), `§4` (módulos), `§5` y `docs/architecture/state-machines.md §1-§5` (ids exactos de estados). Esta spec produce código (tablas, cliente, migración, tests) pero ninguna UI ni lógica de negocio.

## 1. Objetivo

Definir el esquema PostgreSQL (Neon) con Drizzle ORM y su estrategia de migraciones, de modo que las restricciones de integridad del dominio (`system-design.md §2`, I1-I5) queden garantizadas también a nivel de datos y no solo en servicios:

- una sola propuesta ganadora por proyecto (I1);
- una sola propuesta por desarrollador y proyecto (D5);
- unicidad de identificadores externos de Stripe y de eventos de webhook procesados (idempotencia, `system-design.md §7`);
- a lo sumo un intento de pago activo por proyecto;
- `livemode = false` siempre (I5), montos positivos, solo USD (D9).

Ratifica las decisiones D1, D4, D5, D6, D7, D9 (`system-design.md §8`). Declara el nombre de la variable de conexión a Neon; el resto de variables y `.env.example` quedan para las specs 009/017 (D10).

## 2. Contexto y alcance

Decisiones humanas ya aprobadas: Drizzle ORM + Neon Postgres; un rol por usuario con Neon como fuente de verdad (D1); una propuesta por desarrollador por proyecto (D5); sin tabla `simulatedTransfer` hasta la spec 011 (D6); solo USD (D9); Stripe Connect al final (spec 011).

- Incluye:
  - Tablas, columnas, PKs, FKs, enums, CHECKs, índices únicos (incluidos parciales) e índices de consulta.
  - Cliente Drizzle, `drizzle.config.ts`, scripts de migración y migración inicial generada.
  - Tests de restricciones contra una base PGlite en memoria.
- No incluye:
  - Servicios, schemas Zod, guards o lógica de transición (specs 004-010).
  - Sincronización Clerk -> `users` (spec 004).
  - Tabla `simulated_transfers` (D6, spec 011).
  - Contenido de `.env.example`, secretos y pipeline de despliegue (D10; specs 009/017). No se escribe ningún valor de conexión.
  - Tablas de archivos/Supabase Storage (sin archivos en el MVP).
  - Búsqueda de texto completo, índice GIN de tecnologías, soft delete, tablas de auditoría/historial (YAGNI).

## 3. Requisitos funcionales

- RF1. Existen las tablas `users`, `developer_profiles`, `projects`, `proposals`, `proposal_selections`, `payment_attempts`, `processed_payment_events` con las columnas del punto 6.
- RF2. Los enums de estado usan exactamente los ids de `state-machines.md`: `project_status` (`draft`, `published`, `proposal_selected`, `contracted`, `closed`), `proposal_status` (`pending`, `accepted`, `rejected`, `withdrawn`), `payment_attempt_status` (`pending`, `completed_test`, `failed`, `canceled`), `user_role` (`client`, `developer`, `admin`). `transferStatus` no es columna (derivado, D6).
- RF3. La BD rechaza: segunda propuesta `accepted` para un proyecto; segunda propuesta de un mismo desarrollador al mismo proyecto; segunda selección por proyecto o por propuesta; dos intentos de pago `pending`/`completed_test` para un proyecto; `stripe_event_id`, `stripe_checkout_session_id` o `stripe_payment_intent_id` duplicados; montos <= 0; moneda distinta de USD; `livemode = true`.
- RF4. La BD rechaza una selección o un intento de pago cuya propuesta no pertenezca al proyecto indicado (FK compuesta).
- RF5. El cliente Drizzle permite transacciones interactivas (necesarias para la selección de propuesta y la idempotencia de webhooks; ver punto 6.7).
- RF6. Hay scripts `db:generate` y `db:migrate`, y la migración inicial versionada en el repositorio.

## 4. Requisitos no funcionales

- Nunca se almacenan credenciales, contraseñas ni datos de tarjeta (`system-design.md §3`).
- Tests de BD aislados: nunca tocan la BD de Neon real ni requieren red ni secretos.
- Nombres de tablas y columnas en inglés, `snake_case`; tablas en plural.
- YAGNI: sin índices, columnas ni tablas que ninguna spec 005-011 vaya a consultar.
- Todo timestamp es `timestamptz` (UTC).

## 5. Reglas de negocio (materializadas en datos)

- I1: `proposal_selections.project_id` único y `proposal_selections.proposal_id` único; índice único parcial `proposals(project_id) WHERE status = 'accepted'` como red de seguridad adicional.
- D5: único `(project_id, developer_id)` en `proposals`. Una propuesta retirada sigue ocupando el par (no se reenvía).
- Un solo intento activo por proyecto: índice único parcial `payment_attempts(project_id) WHERE status IN ('pending','completed_test')`. `failed`/`canceled` no bloquean reintentos (`state-machines.md §3`).
- I2/I5: `amount_cents`, `currency` y `livemode` existen en `payment_attempts`; la copia desde la propuesta la hace el servicio (spec 009), la BD solo valida `> 0`, `'USD'` y `livemode = false`.
- Los CHECKs de coherencia estado/timestamp se limitan a los baratos y sin ambigüedad (ver 6.3). Las transiciones válidas entre estados NO se fuerzan en BD (las hacen las funciones de transición de cada módulo, `system-design.md §4`).

## 6. Modelo de datos y migraciones

### 6.1 Convenciones

- PK: `id uuid primary key default gen_random_uuid()` (Drizzle `uuid().defaultRandom()`), salvo `developer_profiles` (PK = `user_id`) y `processed_payment_events` (PK = `stripe_event_id`).
- Timestamps: `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()` con `$onUpdate(() => new Date())` de Drizzle (a nivel de aplicación, sin triggers) en tablas mutables. Timestamps de transición nullable (`published_at`, `closed_at`, ...).
- FKs: `ON DELETE RESTRICT` por defecto (no hay borrado de usuarios ni de datos con historial en el MVP). Excepción: `developer_profiles.user_id` -> `CASCADE` (el perfil no tiene sentido sin usuario).
- Un borrador de proyecto sin hijos puede borrarse (spec 005); no hay FK que lo impida porque aún no tiene propuestas (D3).
- Dinero: ver 6.4.

### 6.2 Tablas

Propietario de cada tabla = módulo de `system-design.md §4`.

**`users`** (módulo `users`)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | uuid | PK |
| `clerk_user_id` | text | NOT NULL, UNIQUE |
| `role` | `user_role` | NOT NULL (sin default; se fija al registrarse, D1) |
| `display_name` | text | NOT NULL |
| `email` | text | NOT NULL (no único; la fuente de verdad es Clerk) |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default now() |

**`developer_profiles`** (módulo `users`, 1:1 con usuario, D4)

| Columna | Tipo | Restricción |
|---|---|---|
| `user_id` | uuid | PK, FK `users.id` CASCADE |
| `headline` | text | NOT NULL |
| `bio` | text | NOT NULL |
| `technologies` | text[] | NOT NULL, default `'{}'` |
| `external_url` | text | NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default now() |

Que el usuario tenga rol `developer` se valida en el servicio, no en BD.

**`projects`** (módulo `projects`)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | uuid | PK |
| `client_id` | uuid | NOT NULL, FK `users.id` RESTRICT |
| `title` | text | NOT NULL |
| `category` | text | NOT NULL (lista cerrada la define la spec 005) |
| `description` | text | NOT NULL |
| `budget_min_cents` | integer | NOT NULL, CHECK `> 0` |
| `budget_max_cents` | integer | NOT NULL, CHECK `>= budget_min_cents` |
| `currency` | text | NOT NULL, default `'USD'`, CHECK `= 'USD'` |
| `timeline_weeks` | integer | NOT NULL, CHECK `> 0` |
| `technologies` | text[] | NOT NULL, default `'{}'` |
| `status` | `project_status` | NOT NULL, default `'draft'` |
| `published_at` | timestamptz | NULL |
| `contracted_at` | timestamptz | NULL |
| `closed_at` | timestamptz | NULL, CHECK `(status = 'closed') = (closed_at IS NOT NULL)` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default now() |

**`proposals`** (módulo `proposals`)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | NOT NULL, FK `projects.id` RESTRICT |
| `developer_id` | uuid | NOT NULL, FK `users.id` RESTRICT |
| `price_cents` | integer | NOT NULL, CHECK `> 0` |
| `currency` | text | NOT NULL, default `'USD'`, CHECK `= 'USD'` |
| `timeline_weeks` | integer | NOT NULL, CHECK `> 0` |
| `description` | text | NOT NULL |
| `status` | `proposal_status` | NOT NULL, default `'pending'` |
| `withdrawn_at` | timestamptz | NULL |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default now() |

Restricciones: UNIQUE `(project_id, developer_id)`; UNIQUE `(id, project_id)` (destino de FKs compuestas); índice único parcial `proposals_one_accepted_per_project_idx` en `(project_id) WHERE status = 'accepted'`.

**`proposal_selections`** (módulo `proposals`; hecho inmutable)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | NOT NULL, UNIQUE |
| `proposal_id` | uuid | NOT NULL, UNIQUE |
| `selected_by` | uuid | NOT NULL, FK `users.id` RESTRICT (cliente que seleccionó) |
| `selected_at` | timestamptz | NOT NULL, default now() |

FK compuesta `(proposal_id, project_id)` -> `proposals(id, project_id)` RESTRICT (garantiza que la propuesta es del proyecto). `project_id` además referencia `projects.id` implícitamente mediante la FK compuesta; se declara también la FK simple a `projects.id` RESTRICT para claridad del grafo.

**`payment_attempts`** (módulo `payments`)

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | NOT NULL, FK `projects.id` RESTRICT |
| `proposal_id` | uuid | NOT NULL |
| `client_id` | uuid | NOT NULL, FK `users.id` RESTRICT |
| `amount_cents` | integer | NOT NULL, CHECK `> 0` |
| `currency` | text | NOT NULL, default `'USD'`, CHECK `= 'USD'` |
| `status` | `payment_attempt_status` | NOT NULL, default `'pending'` |
| `stripe_checkout_session_id` | text | NULL, UNIQUE (Postgres admite múltiples NULL) |
| `stripe_payment_intent_id` | text | NULL, UNIQUE |
| `livemode` | boolean | NOT NULL, default `false`, CHECK `livemode = false` |
| `completed_at` | timestamptz | NULL, CHECK `(status = 'completed_test') = (completed_at IS NOT NULL)` |
| `created_at`, `updated_at` | timestamptz | NOT NULL, default now() |

Restricciones: FK compuesta `(proposal_id, project_id)` -> `proposals(id, project_id)` RESTRICT; índice único parcial `payment_attempts_one_active_per_project_idx` en `(project_id) WHERE status IN ('pending','completed_test')`.

**`processed_payment_events`** (módulo `payments`; idempotencia)

| Columna | Tipo | Restricción |
|---|---|---|
| `stripe_event_id` | text | PK (la unicidad es la clave de idempotencia) |
| `type` | text | NOT NULL |
| `payment_attempt_id` | uuid | NULL, FK `payment_attempts.id` RESTRICT |
| `result` | `processed_event_result` | NOT NULL (`applied`, `ignored`) |
| `received_at` | timestamptz | NOT NULL, default now() |

Patrón previsto para la spec 010 (no se implementa aquí): `INSERT ... ON CONFLICT (stripe_event_id) DO NOTHING RETURNING` dentro de la misma transacción que el cambio de estado.

### 6.3 Índices de consulta

| Consulta (spec) | Índice |
|---|---|
| Catálogo público, orden por reciente (006) | `projects (published_at DESC, id DESC) WHERE status = 'published'` |
| Catálogo filtrado por categoría (006) | `projects (category, published_at DESC) WHERE status = 'published'` |
| Proyectos del cliente (005, 012) | `projects (client_id, created_at DESC)` |
| Propuestas por proyecto (007, 008) | cubierto por UNIQUE `(project_id, developer_id)` (prefijo `project_id`) |
| Propuestas del desarrollador (007, 013) | `proposals (developer_id, created_at DESC)` |
| Intentos por proyecto (009, 012) | `payment_attempts (project_id, created_at DESC)` |
| Resolver intento desde webhook (010) | cubierto por UNIQUE de `stripe_checkout_session_id` / `stripe_payment_intent_id` |
| Selección por proyecto/propuesta | cubierto por sus UNIQUE |

### 6.4 Dinero (D9)

Enteros en centavos USD (`integer`, columnas `*_cents`) más columna `currency` con CHECK `= 'USD'`. Justificación: Stripe opera en la unidad menor como entero (sin conversión ni redondeo entre Nexora y Stripe); evita errores de coma flotante y de `numeric` devuelto como string por el driver; el CHECK permite abrir otras monedas con una migración trivial. Límite: `integer` (int4) llega a ~21,4 millones de USD, holgado para el MVP; si hiciera falta, `bigint` en una migración posterior. La conversión a dólares para mostrar es una utilidad de presentación (specs 005-007, fuera de esta spec).

### 6.5 Ubicación del cliente y del esquema (D7)

- Tablas en cada módulo propietario, archivos `*.table.ts` (nuevo sufijo, para no colisionar con `.schema.ts` = Zod de `SETUP.md §1.4`). Respeta propiedad de datos por módulo (`system-design.md §3-§4`) y la dirección de dependencias: `proposals` importa tablas de `projects` y `users`; `payments` de `projects`, `proposals`, `users`; sin ciclos.
- Cliente en `src/lib/db/client.ts` (transversal, como indica `SETUP.md §1.6` para `src/lib`). Se instancia `drizzle(pool)` **sin** pasar el objeto `schema`: los módulos usan el query builder con sus tablas (`db.select().from(projects)`), de modo que `src/lib` no importa de `src/modules` (evita invertir la dependencia). La API relacional (`db.query`) no se usa (YAGNI).
- `drizzle.config.ts` apunta `schema` al glob `./src/modules/*/schema/*.table.ts`.
- Enums (`pgEnum`) viven en el `*.table.ts` del módulo dueño y se exportan de allí.
- Requiere añadir el sufijo `.table.ts` a `docs/SETUP.md §1.4` (cambio documental fuera de esta spec; ver Decisión pendiente 3).

Estructura de archivos propuesta:

```
drizzle.config.ts
drizzle/                                  <- migraciones SQL generadas (versionadas)
src/lib/db/client.ts
src/lib/db/test-db.ts                     <- helper PGlite para tests
src/modules/users/schema/users.table.ts
src/modules/users/schema/developer-profiles.table.ts
src/modules/projects/schema/projects.table.ts
src/modules/proposals/schema/proposals.table.ts
src/modules/proposals/schema/proposal-selections.table.ts
src/modules/payments/schema/payment-attempts.table.ts
src/modules/payments/schema/processed-payment-events.table.ts
```

### 6.6 Variable de conexión

`DATABASE_URL`: cadena de conexión de Neon (la del endpoint pooled). La usan el cliente y `drizzle-kit`. Sin valores en el repositorio (`.env*` está en `.gitignore`); su documentación en `.env.example` es de las specs 009/017.

### 6.7 Transacción atómica de selección y driver

El driver `drizzle-orm/neon-http` ejecuta cada sentencia como petición HTTP independiente y no soporta transacciones interactivas (solo `db.batch`, que no permite lógica condicional entre sentencias). La selección (`published -> proposal_selected`, propuesta `pending -> accepted`, resto `pending -> rejected`, insert en `proposal_selections`) y la idempotencia de webhooks necesitan `BEGIN ... COMMIT` con lectura intermedia y rollback.

Recomendación: `drizzle-orm/neon-serverless` con `Pool` de `@neondatabase/serverless` (WebSocket) y `db.transaction(...)`, ejecutado solo en runtime Node.js (no Edge) y con la selección de la fila `projects ... FOR UPDATE` (o `UPDATE ... WHERE status = 'published' RETURNING`) como primer paso para serializar selecciones concurrentes.

Alternativas descartadas:
- `neon-http` + `db.batch`: atómico pero sin ramificación; el conflicto se detectaría solo por la restricción de BD, sin mensajes de error de negocio claros.
- `node-postgres` (`pg`) con TCP: soporta transacciones, pero Neon recomienda el driver serverless para entornos serverless y añade otra dependencia.

Red de seguridad en datos (independiente del driver): los índices únicos de I1 (parcial de `proposals`, UNIQUE de `proposal_selections`) hacen que, aun si el servicio fallara, dos ganadores sean imposibles; la segunda transacción recibe violación de unicidad que el servicio traduce a error de conflicto (`state-machines.md §5`).

Supuestos a verificar en T0 (no se pudo consultar documentación vigente en esta sesión): (a) que `drizzle-orm/neon-serverless` soporta `db.transaction` con el `Pool` en la versión instalada; (b) que `@neondatabase/serverless` usa el `WebSocket` global de Node (>= 22; el entorno local es Node 24.11) sin necesidad de `ws`/`neonConfig.webSocketConstructor`; si no, añadir `ws` y `@types/ws` y registrarlo en el PR; (c) que `drizzle-kit migrate` funciona con la cadena pooled; si falla (locks), usar una segunda variable `DATABASE_URL_UNPOOLED` solo para migraciones y registrarlo.

### 6.8 Estrategia de migraciones (drizzle-kit)

- Flujo: editar `*.table.ts` -> `npm run db:generate` (genera SQL en `drizzle/`) -> revisar el SQL en el PR -> `npm run db:migrate` (aplica a la BD apuntada por `DATABASE_URL`). Los archivos de `drizzle/` y `drizzle/meta/` se versionan.
- `drizzle-kit push` no se usa en ningún entorno compartido (no deja historial); solo es aceptable contra una rama Neon local desechable.
- Una migración ya aplicada no se edita; los cambios se hacen con otra migración. Los cambios destructivos (drop de columna/tabla, cambio de tipo) requieren spec aprobada.
- Lo que Drizzle no exprese (si algún índice parcial o CHECK no se genera correctamente) se añade con `drizzle-kit generate --custom` (SQL manual versionado). T4 comprueba en el SQL generado que los índices parciales y CHECKs de 6.2 están presentes.
- Añadir valores a un enum es una migración `ALTER TYPE ... ADD VALUE`; quitar o renombrar valores requiere migración manual y spec.
- Cuándo se ejecuta `db:migrate` en cada entorno (previo al deploy, ramas Neon por preview) lo define la spec 017.
- Evolución prevista: `simulated_transfers` (spec 011) y cualquier columna adicional de las specs 005-010 se añaden por migraciones posteriores, no editando la inicial.

### 6.9 Dependencias (T0, tarea serial dueña de `package.json`)

| Paquete | Tipo | Motivo |
|---|---|---|
| `drizzle-orm` | dep | ORM y query builder |
| `@neondatabase/serverless` | dep | Pool WebSocket para Neon (transacciones) |
| `drizzle-kit` | dev | generar y aplicar migraciones |
| `dotenv` | dev | `drizzle.config.ts` carga `DATABASE_URL` desde `.env.local` (drizzle-kit no lo hace solo; `@next/env` es transitiva y no se declara) |
| `@electric-sql/pglite` | dev | Postgres embebido en memoria para tests de restricciones sin tocar Neon |

No se instalan `tsx` (drizzle-kit ejecuta su config TS por sí mismo y no hay scripts propios) ni `ws` (condicional al supuesto 6.7-b) ni `pg`.

### 6.10 Pruebas de BD sin tocar producción

Se usa PGlite en memoria (`drizzle-orm/pglite`) y se aplica la migración generada con `drizzle-orm/pglite/migrator`, de modo que el test valida el SQL realmente versionado. Los archivos de test BD declaran `// @vitest-environment node` (el entorno global es jsdom). PGlite soporta índices parciales, CHECK, FKs compuestas y enums. Limitación: no replica concurrencia real entre conexiones de Neon, por lo que la serialización de selecciones simultáneas se prueba en la spec 008 (a nivel de servicio) y aquí solo se prueba la restricción.

## 7. Contratos de servidor o API

No aplica (sin endpoints). Contratos de código que esta spec expone:

- `src/lib/db/client.ts`: exporta `db` (instancia Drizzle con `neon-serverless`) y el tipo de transacción `DbTransaction` para que los servicios acepten un `tx`.
- Cada `*.table.ts` exporta su tabla y sus enums; los tipos de fila (`typeof table.$inferSelect` / `$inferInsert`) se derivan en el `.types.ts` del módulo en specs posteriores.

## 8. Permisos y seguridad

- `DATABASE_URL` es secreto: solo servidor, nunca `NEXT_PUBLIC_*`, nunca en el repositorio ni en logs.
- `src/lib/db/client.ts` solo se importa desde código de servidor (servicios, route handlers, server actions); fallar con error claro si `DATABASE_URL` no está definida.
- La autorización por fila (propietario, autor, admin; `system-design.md §6`) se hace en servicios (spec 004); no se usa RLS de Postgres en el MVP.
- No hay columnas para datos de tarjeta ni secretos de Stripe; solo ids externos.
- Tests de BD usan PGlite en memoria; ninguna credencial.

## 9. Estados, errores y casos límite

- Violación de unicidad en `proposal_selections` / índice parcial de aceptadas: selecciones simultáneas; el servicio la traduce a conflicto (`state-machines.md §5`).
- Violación de `(project_id, developer_id)`: segunda propuesta del mismo desarrollador (incluso tras retirarla, D5).
- Violación del índice de intento activo: doble clic o dos pestañas iniciando pago; reintento tras `failed`/`canceled` sí permitido.
- `INSERT ... ON CONFLICT DO NOTHING` sin fila devuelta en `processed_payment_events`: evento repetido; no cambia estado.
- Crear `payment_attempts` antes de conocer el id de Checkout: por eso `stripe_checkout_session_id` es nullable; el servicio de la spec 009 decide el orden.
- Webhook fuera de orden: la BD no impide regresiones de estado; lo impide el servicio (spec 010). Se documenta para que 010 no asuma lo contrario.
- `updated_at` es de aplicación: una escritura por SQL manual no lo actualiza (aceptado).
- Conexión inalcanzable o `DATABASE_URL` ausente: el cliente lanza error explícito al primer uso; no hay reintentos en esta spec.

## 10. Criterios de aceptación verificables

- AC1: `npm run db:generate` produce una migración inicial en `drizzle/` con las 7 tablas del punto 6.2 y los 4 enums de RF2 con los ids exactos de `state-machines.md`; un segundo `db:generate` sin cambios no produce migración nueva.
- AC2: Aplicar la migración inicial sobre una BD PGlite vacía termina sin errores y crea todas las tablas, FKs, CHECKs e índices de 6.2 y 6.3.
- AC3: Insertar dos `proposals` con el mismo `(project_id, developer_id)` falla por unicidad.
- AC4: Dos `proposals` `accepted` en el mismo proyecto fallan por el índice parcial; una `accepted` más varias `rejected`/`pending`/`withdrawn` en el mismo proyecto es válido.
- AC5: Dos `proposal_selections` para el mismo `project_id`, o para el mismo `proposal_id`, fallan; una selección con `proposal_id` de otro proyecto falla por la FK compuesta.
- AC6: Dos `payment_attempts` con estado `pending`/`completed_test` para el mismo proyecto fallan; un `failed` o `canceled` seguido de un nuevo `pending` es válido.
- AC7: `payment_attempts` rechaza `amount_cents <= 0`, `currency <> 'USD'`, `livemode = true`, `completed_at` inconsistente con el estado, y un `proposal_id` que no pertenece al `project_id`.
- AC8: `stripe_checkout_session_id` y `stripe_payment_intent_id` duplicados (no nulos) fallan; varios NULL son válidos.
- AC9: Insertar dos veces el mismo `stripe_event_id` en `processed_payment_events` falla por PK; con `ON CONFLICT DO NOTHING` la segunda no inserta ni lanza.
- AC10: `projects` rechaza `budget_min_cents <= 0`, `budget_max_cents < budget_min_cents`, `timeline_weeks <= 0`, `currency <> 'USD'` y `closed_at` inconsistente con `status`; `proposals` rechaza `price_cents <= 0` y `timeline_weeks <= 0`.
- AC11: `users.clerk_user_id` duplicado falla; `developer_profiles` solo admite una fila por usuario; borrar un usuario con proyectos o propuestas falla (RESTRICT).
- AC12: Los valores de enum fuera de los ids canónicos son rechazados por la BD.
- AC13: `src/lib/db/client.ts` usa `neon-serverless` y `db.transaction` está disponible en el tipo exportado; sin `DATABASE_URL` lanza un error claro al usarse.
- AC14: `npm run lint`, `npm run test` y `npm run build` pasan; ningún archivo de `src/lib` importa de `src/modules`.

## 11. Pruebas requeridas

Vitest, entorno `node` por archivo (`// @vitest-environment node`), contra PGlite con la migración real aplicada (6.10):

- `src/lib/db/migrations.test.ts` (obligatorio): AC1 (comprobación textual del SQL generado: presencia de los índices parciales, CHECKs y enums), AC2, AC12.
- `src/lib/db/constraints.test.ts` (obligatorio): AC3-AC11 (un `describe` por tabla). Los helpers de inserción mínima viven en el propio archivo; la BD en memoria viene de `src/lib/db/test-db.ts`.
- `src/lib/db/client.test.ts` (obligatorio, ligero): AC13, sin conectar a Neon (importación con `DATABASE_URL` ausente/simulada).

No requieren test: los `*.table.ts` por sí solos (declarativos; se cubren en las pruebas anteriores) ni `drizzle.config.ts`.

## 12. Tareas, dependencias y riesgos

### Tareas

#### T0 — Dependencias, configuración y cliente (serial, base)
- Archivos: `package.json`, `package-lock.json`, `drizzle.config.ts`, `src/lib/db/client.ts`, `src/lib/db/test-db.ts`
- Depende de: —
- Paralelizable: no
- Cubre: RF5, RF6 (scripts `db:generate` y `db:migrate` en `package.json`), AC13 (parcial), verificación de los supuestos 6.7 a-c (registrar el resultado en el PR; si alguno falla, volver a `borrador`).

#### T1 — Tablas de `users` y `projects`
- Archivos: `src/modules/users/schema/users.table.ts`, `src/modules/users/schema/developer-profiles.table.ts`, `src/modules/projects/schema/projects.table.ts`
- Depende de: T0
- Paralelizable: no (T2 importa estas tablas)
- Cubre: RF1, RF2 (`user_role`, `project_status`), parte de AC10, AC11, AC12

#### T2 — Tablas de `proposals`
- Archivos: `src/modules/proposals/schema/proposals.table.ts`, `src/modules/proposals/schema/proposal-selections.table.ts`
- Depende de: T1
- Paralelizable: no (T3 referencia `proposals`)
- Cubre: RF1, RF2 (`proposal_status`), RF3, RF4 (selección), AC3, AC4, AC5

#### T3 — Tablas de `payments`
- Archivos: `src/modules/payments/schema/payment-attempts.table.ts`, `src/modules/payments/schema/processed-payment-events.table.ts`
- Depende de: T2
- Paralelizable: no
- Cubre: RF1, RF2 (`payment_attempt_status`, `processed_event_result`), RF3, RF4 (pagos), AC6, AC7, AC8, AC9

#### T4 — Migración inicial y tests de restricciones
- Archivos: `drizzle/` (SQL y `meta/` generados por `npm run db:generate`; no se editan a mano salvo `--custom`), `src/lib/db/migrations.test.ts`, `src/lib/db/constraints.test.ts`, `src/lib/db/client.test.ts`
- Depende de: T3
- Paralelizable: no
- Cubre: AC1, AC2, AC13, AC14 y verificación de AC3-AC12; RF3, RF6
- Nota: la migración se genera una sola vez con el esquema completo; `db:migrate` contra Neon real no forma parte de esta tarea (spec 017).

### Dependencias y riesgos

- Dependencias: spec 002 (hecha). Bloquea 004-011.
- Riesgo: supuestos 6.7 (a-c) sin verificar con documentación vigente; mitigación: T0 los comprueba antes de seguir.
- Riesgo: Drizzle no genere algún índice parcial o CHECK como se espera; mitigación: AC1 lo comprueba y se usa `--custom`.
- Riesgo: PGlite difiere de Neon en algo no cubierto; mitigación: la spec 017 añade una verificación de la migración sobre una rama Neon.
- Riesgo: el sufijo `.table.ts` no está en `SETUP.md`; sin actualizarlo, el reviewer podría objetarlo.
- Riesgo: añadir `category` como `text` libre difiere de una lista cerrada; se reconcilia en la spec 005 con una migración si hace falta.
- No se tocó `node_modules/next/dist/docs/` porque esta spec no usa APIs de Next.

## 13. Decisiones pendientes

Cada una con recomendación; requieren aprobación humana.

1. Driver: `neon-serverless` (Pool WebSocket) con transacciones interactivas, runtime Node.js. Recomendado frente a `neon-http`+`batch` y a `pg`.
2. Dinero: enteros en centavos (`*_cents`, `integer`) + `currency` con CHECK `'USD'`. Recomendado frente a `numeric`.
3. Ubicación (D7): tablas en `src/modules/<domain>/schema/*.table.ts`, cliente en `src/lib/db/client.ts` sin `schema` y sin API relacional; añadir el sufijo `.table.ts` a `SETUP.md §1.4`.
4. Tests de BD: PGlite en memoria con la migración real, en vez de una rama Neon de CI (que exige red y secretos).
5. Migraciones: `generate` + `migrate`, carpeta `drizzle/` versionada, sin `push` en entornos compartidos, migraciones aplicadas inmutables.
6. Una sola variable `DATABASE_URL` (pooled) para app y migraciones; solo se añade `DATABASE_URL_UNPOOLED` si T0 comprueba que las migraciones fallan con la pooled.
7. `category` como `text` NOT NULL; la lista cerrada (y posible enum) la decide la spec 005.
8. Todos los campos de `projects` NOT NULL incluso en `draft` (el formulario de borrador exige el formulario completo); alternativa: permitir NULL en borrador y validar al publicar (más flexible, requiere CHECK condicional).
9. `updated_at` mantenido por la aplicación (`$onUpdate`), sin triggers de Postgres.
10. `payment_attempts.stripe_checkout_session_id` nullable único (permite insertar el intento `pending` antes de crear la sesión en Stripe); alternativa: NOT NULL e insertar después de crear la sesión.
11. `processed_payment_events`: PK = `stripe_event_id` y enum `processed_event_result` (`applied`, `ignored`); la spec 010 puede ampliarlo.
12. PKs `uuid` con `gen_random_uuid()` en lugar de `serial`/identity.
13. `ON DELETE RESTRICT` por defecto (CASCADE solo en `developer_profiles.user_id`); sin borrado de usuarios en el MVP.
14. FKs compuestas `(proposal_id, project_id)` hacia `proposals(id, project_id)` en `proposal_selections` y `payment_attempts`.
15. `email` no único en `users` (Clerk es la fuente de verdad); alternativa: único.
16. Moneda como `text` + CHECK `= 'USD'` en lugar de enum (más fácil de ampliar).
17. Dependencias: `dotenv` como dev dependency para `drizzle.config.ts`; `ws` y `tsx` no se instalan salvo que T0 demuestre que hacen falta.
18. Se acepta que la BD no impide regresiones de estado (p. ej. `completed_test` -> `failed`); lo garantizan los servicios (spec 010).

## 14. Estado de aprobación

Estado: borrador. Pendiente de aprobación humana (incluidas las 18 decisiones del punto 13). No lanzar `developer` hasta que un humano la apruebe. Cualquier edición posterior a la aprobación devuelve la spec a `borrador`.

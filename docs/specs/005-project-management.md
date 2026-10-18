# Gestión de proyectos del cliente (Fase 2 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §5` (Spec 005), `docs/BRIEF.md §6.2`. Dominio: `docs/architecture/system-design.md §2` (entidad proyecto, invariantes I1-I5), `§4` (módulos y dependencias), `§6` (permisos), `§8` (D1, D3, D8); `docs/architecture/state-machines.md §1` (estados del proyecto, D2, D3). Esquema usado: `src/modules/projects/schema/projects.table.ts` (spec 003, done). Autorización: spec 004 (done), `src/modules/auth`. Diseño visual de referencia (solo contexto de campos, estados y pantallas): https://claude.ai/artifact/VmUpQeQu1q9LscALC9g5Wm.

## 1. Objetivo

Que un cliente pueda crear, editar, publicar, despublicar y cerrar sus proyectos, y ver la lista de "Mis proyectos", con todas las reglas de estado y propiedad aplicadas en el servidor. Entrega:

- Contrato de servicio `src/modules/projects/services/project.service.ts` (crear borrador, editar, publicar, despublicar, cerrar, listar propios, detalle propio) con las guardas de transición de `state-machines.md §1`.
- Schemas Zod (validación de título, descripción, presupuesto USD con conversión a centavos, plazo, tecnologías, categoría) y tipos.
- Server actions delgadas que autentican, validan y delegan al servicio.
- Páginas privadas del cliente: lista "Mis proyectos" y formulario de publicar/editar.
- Base reutilizable: `src/lib/money.ts` (USD <-> centavos) para esta spec y la 007.

No define el catálogo público (006), las propuestas (007), la selección (008), pagos (009-011) ni el panel completo (012).

## 2. Contexto y alcance

Decisiones humanas ya aprobadas: D1 un rol por usuario (solo `client` crea proyectos); D8 el administrador solo lee y cierra; dinero en centavos enteros (`*_cents`), moneda USD; recurso privado ajeno -> 404, 403 solo por rol; autorización siempre en servidor; D3 `published -> draft` solo sin propuestas; D2 cierre tras selección mientras no haya pago `completed_test`; Stripe Connect al final.

- Incluye:
  - Servicio de proyectos, schemas, tipos, errores de dominio y server actions en `src/modules/projects`.
  - Lista paginada con filtro por estado y orden ("Mis proyectos") y formulario crear/editar con acciones de ciclo de vida.
  - Páginas `/dashboard/projects`, `/projects/new` y `/projects/[id]/edit` (rutas privadas reservadas en spec 004 RF4).
  - Lista cerrada de categorías, valores por defecto y validación del borrador.
  - Cierre por admin a nivel de servicio y action (sin pantalla de admin).
  - Componentes shadcn nuevos y `src/lib/money.ts` en la tarea base T0.
- No incluye:
  - Catálogo público y detalle público `/projects` y `/projects/[id]` (spec 006). Esta spec no toca esas rutas; `/projects/new` y `/projects/[id]/edit` son segmentos distintos y no colisionan.
  - Propuestas recibidas, selección, estado de pago y panel `/dashboard` (spec 012); no hay detalle de proyecto con propuestas aquí.
  - Transiciones `published -> proposal_selected` y `proposal_selected -> contracted`: pertenecen a las specs 008 y 010 (las ejecutan con funciones de transición que añadirán a `project.service`). Esta spec no las implementa.
  - Borrado de borradores (ver D-J), duplicar proyecto, adjuntos, búsqueda de texto, vistas de admin, notificaciones.
  - Confirmaciones y mensajes pulidos (spec 014): aquí solo mínimos funcionales.
  - Cambios de esquema o migraciones: ninguno (ver 6).

### Reutilizar (inventario; verificado con Glob/ls)

- `src/modules/projects/schema/projects.table.ts` (`projects`, `projectStatusEnum`, checks de presupuesto/plazo/moneda/`closed_at`, índices de catálogo y `projects_client_created_idx`): sin cambios. El tipo de fila es `typeof projects.$inferSelect`.
- `src/modules/proposals/schema/proposals.table.ts` y `src/modules/payments/schema/payment-attempts.table.ts`: solo lectura/actualización puntual desde el servicio de proyectos (ver 5 y D-B).
- `src/modules/auth/**`: `getCurrentUser`, `requireUser`, `requireRole`, `requireOwnership` (`current-user.service.ts`), `can` (`permissions.ts`, ya incluye `project.create|update|publish|close|readPrivate`), `AuthError`, `authErrorToResponse`, `handleAuthErrorForPage` (`auth-errors.ts`), tipos `AuthUser`, `Role`, `Action` (`auth.types.ts`). No se crean guards nuevos.
- `src/modules/auth/actions/complete-onboarding.action.ts`: patrón a seguir para server actions (validar con Zod, identidad del servidor, `redirect` fuera de `try`, mensajes en español).
- `src/modules/users/services/users.service.ts`: no se necesita (el actor ya viene resuelto en `AuthUser`).
- `src/lib/db/client.ts` (`db`, Pool de neon-serverless: soporta transacciones) y `src/lib/db/test-db.ts` (`createTestDb()` PGlite con migraciones reales). El patrón de test de `users.service.test.ts` (mock de `@/lib/db/client` con `Proxy` hacia la BD de test, mock de `server-only`) se replica.
- `src/lib/utils.ts` (`cn`). Sin `src/hooks` ni `src/components/shared` previos.
- UI: `src/components/ui` solo contiene `button.tsx`. Verificado con `npx shadcn@latest search @shadcn -q native-select` que existe `@shadcn/native-select`. Se añaden en T0 `input`, `textarea`, `label`, `badge`, `native-select` (los demás se descartan por YAGNI: card/table/dialog/skeleton). Estilos de la lista con Tailwind sobre markup semántico simple.
- `@tanstack/react-table`, `@tanstack/react-query`, `zustand`, `axios`: no se usan (ver 12). Lista y filtros se resuelven en servidor con `searchParams`.

## 3. Requisitos funcionales

### RF1. Campos y validación (schemas Zod, `src/modules/projects/schemas/project.schema.ts`)

Se mantiene la convención `schemas/` de SETUP.md (la carpeta existente `schema/` guarda solo las tablas Drizzle de la spec 003). Zod instalado: `^4.6.5` (usar `z.flattenError`, no `.flatten()` deprecado en v4; el developer lo confirma contra el paquete).

`projectInputSchema` (forma de dominio, ya en centavos y lista de tecnologías; es lo que consume el servicio):

| Campo | Regla |
|---|---|
| `title` | `trim`, 5-120 caracteres |
| `category` | enum cerrado (RF2) |
| `description` | `trim`, 30-5000 caracteres |
| `budgetMinCents` | entero, 100 (USD 1) a 100_000_000 (USD 1.000.000); siempre menor que el `int4` de la columna |
| `budgetMaxCents` | entero, mismo rango, y `>= budgetMinCents` (error asociado a `budgetMaxCents`) |
| `timelineWeeks` | entero, 1-104 |
| `technologies` | arreglo de 1 a 15 strings; cada uno `trim`, 1-30 caracteres, sin vacíos; duplicados eliminados sin distinguir mayúsculas (se conserva la primera escritura) |

`currency` no es campo de entrada: el servicio no lo envía y la columna toma su default `USD` (check `projects_currency_usd`).

Función de formulario `parseProjectForm(formData): { success: true; data: ProjectInput } | { success: false; fieldErrors: Partial<Record<ProjectFieldName, string>>; values: Record<ProjectFieldName, string> }` en el mismo archivo:

- Campos del formulario (strings): `title`, `category`, `description`, `budgetMinUsd`, `budgetMaxUsd`, `timelineWeeks`, `technologies` (texto separado por comas: `"React, Node.js"`).
- Convierte `budgetMinUsd/MaxUsd` con `usdToCents` (RF9) y `technologies` con split por coma; el resto lo valida `projectInputSchema`. Los errores de `budgetMinCents/budgetMaxCents` se re-etiquetan a `budgetMinUsd/budgetMaxUsd` para la UI. Un valor USD no parseable produce error de campo, no excepción.
- Devuelve `values` (los strings enviados) para repoblar el formulario tras un error (los formularios con `<form action>` de React 19 se vacían tras la acción; ver RF7).
- Mensajes de error en español, una cadena por campo.

### RF2. Categorías (decisión de esta spec)

`category` es `text NOT NULL` en BD; la lista cerrada se valida en la aplicación y vive en `project.schema.ts` como `PROJECT_CATEGORIES` (fuente única para el schema, el `<native-select>` y el filtro futuro de 006):

`["Frontend & UI/UX", "Backend & APIs", "Full Stack", "E-commerce", "WordPress", "Otros"]`

- Se guarda el texto tal cual (no hay tabla de categorías: YAGNI). Los índices `projects_catalog_category_idx` de 003 ya filtran por ese texto.
- Una categoría retirada de la lista en el futuro deja filas históricas válidas en BD; solo se valida al escribir y al publicar (ver RF3, `INVALID_PROJECT`).

### RF3. Estados, transiciones y guardas (servicio)

`state-machines.md §1` es normativa; aquí solo se fijan las guardas de implementación. Todas las transiciones son `UPDATE ... WHERE id = ? AND status = <estado observado> ... RETURNING` (o dentro de una transacción con la fila bloqueada `FOR UPDATE` cuando se leen otras tablas); 0 filas afectadas = el estado cambió entre lectura y escritura -> se relee y se lanza el error que corresponda (nunca se pisa un estado ajeno).

| Operación | Transición | Quién | Condiciones adicionales |
|---|---|---|---|
| `createProject` | (nuevo) `draft` o `published` | `client` | Entrada válida (RF1). Con `{ publish: true }` inserta ya en `published` con `publishedAt = now()` (atómico, evita un borrador huérfano si falla la publicación) |
| `updateProject` | sin cambio de estado | `client` dueño | Editable por estado: ver RF4 |
| `publishProject` | `draft -> published` | `client` dueño | Re-valida la fila con `projectInputSchema` (si no pasa: `INVALID_PROJECT`); fija `publishedAt = now()` |
| `unpublishProject` | `published -> draft` | `client` dueño | D3: transacción con fila bloqueada; si existe cualquier fila en `proposals` para el proyecto (cualquier estado, incluida `withdrawn`): `HAS_PROPOSALS`. Pone `publishedAt = null` |
| `closeProject` | `published|proposal_selected|contracted -> closed` | `client` dueño o `admin` | Desde `published`: en la misma transacción las propuestas `pending` pasan a `rejected`. Desde `proposal_selected`: si existe un `payment_attempt` `pending` o `completed_test` del proyecto -> `PAYMENT_IN_PROGRESS` (D2, versión conservadora hasta que 010/012 definan la cancelación; ver D-C). Fija `closedAt = now()` (check `projects_closed_at_matches_status`) |
| (cualquier otra combinación estado/operación, incluido cerrar `draft` o cerrar `closed`) | no permitida | | `INVALID_STATE` |

- `publishedAt` se reescribe al republicar (el catálogo ordena por `publishedAt desc`).
- `updatedAt` lo mantiene `$onUpdate` de la tabla.
- Los estados `proposal_selected` y `contracted` no se pueden alcanzar desde esta spec (no existe función que los escriba, ni `contractedAt` se toca). Hasta que existan 008/010 esas ramas de `closeProject` están implementadas y probadas con filas sembradas directamente en BD de test.

Invariantes de `system-design.md §2`:

- I1 (una selección por proyecto): esta spec no crea selecciones ni escribe `proposal_selected`; la garantía sigue en el índice único de 003 y se aplica en 008.
- I2, I4, I5 (importe del servidor, `completed_test` solo por webhook, pagos solo de prueba): esta spec nunca escribe pagos ni `contractedAt` ni mueve un proyecto a `contracted`; el texto de UI no menciona dinero real ni pagos.
- I3 (pago y transferencia independientes): no aplica.
- Moneda: el servicio no acepta `currency`; los importes visibles se muestran como `USD`.

### RF4. Qué es editable por estado

| Estado | Editable | Notas |
|---|---|---|
| `draft` | todos los campos | |
| `published` | solo `title`, `description`, `technologies` | `category`, presupuesto y plazo quedan bloqueados porque los desarrolladores ofertan sobre ellos. El servicio compara los valores enviados con los guardados; si difieren: `LOCKED_FIELDS` (el formulario envía los campos bloqueados como `readOnly` con su valor actual, así el envío es idéntico) |
| `proposal_selected`, `contracted`, `closed` | ninguno | `INVALID_STATE`. La página de edición muestra el formulario completo en solo lectura |

La edición nunca cambia `status`, `clientId` ni fechas de ciclo de vida (la lista de columnas del `SET` es explícita).

### RF5. Propiedad y visibilidad

- Solo el cliente dueño crea y edita (`requireOwnership(actor, project.clientId)` sin `allowAdmin`). Admin: lectura (`getMyProject`, `allowAdmin: true`) y cierre (`closeProject`, `allowAdmin: true`) y nada más (D8).
- Cada función del servicio recibe `actor: AuthUser` (resuelto por la action con `requireRole`) y repite `can(actor.role, <action>)` -> si falla `AuthError("FORBIDDEN")`; luego carga el proyecto y aplica `requireOwnership`. Defensa en profundidad: el servicio nunca confía en que quien lo llama ya autorizó. Un id inexistente y un id ajeno dan el mismo `AuthError("NOT_FOUND")` (404).
- `clientId` sale siempre de `actor.id`, nunca del input (RF7 de spec 004).
- Un `draft` nunca es visible fuera del dueño (y admin en lectura). La visibilidad pública de `published` es la spec 006; esta spec no expone ninguna ruta pública.
- Las lecturas de lista filtran por `client_id = actor.id` en el `WHERE`.

### RF6. Listado "Mis proyectos" (paginación, filtros, orden)

`listMyProjects(actor, query)` con `query` validado por `projectListQuerySchema` (los valores inválidos o ausentes caen en el default con `.catch`, nunca error):

| Parámetro URL | Valores | Default |
|---|---|---|
| `status` | `all` o cualquier `project_status` | `all` |
| `sort` | `newest` (creación desc), `oldest` (creación asc) | `newest` |
| `page` | entero >= 1 | `1` |

- Tamaño de página fijo: 10 (constante del servicio; no lo controla la URL). Desempate por `id` para orden estable. Usa `projects_client_created_idx`.
- Paginación por offset (el volumen por cliente es bajo; keyset sería sobreingeniería).
- Respuesta: `{ items: ProjectListItem[]; total: number; page: number; pageSize: number; totalPages: number }`. `ProjectListItem` = campos de la lista (id, title, category, status, presupuesto en centavos, plazo, createdAt, updatedAt, publishedAt) + `proposalCount` (subconsulta de conteo a `proposals`; permite a la UI saber si ofrece "Despublicar").
- Sin búsqueda de texto ni filtro por categoría (YAGNI; no los pide el requerimiento).
- `getMyProject(actor, id): Promise<ProjectDetail>` = fila completa + `proposalCount`.

### RF7. Server actions (decisión: server actions, no route handlers)

Decisión: las seis mutaciones y las lecturas de las páginas privadas se hacen con server actions y servicio llamado desde Server Components; no se crean route handlers para proyectos.

Justificación (verificada en `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` y `forms.md`):

- Los consumidores son los formularios y botones de la propia app: `<form action>` + `useActionState` da progressive enhancement, estado `pending` y errores por campo sin código de red propio (Forms guide).
- Los route handlers se reservan para clientes externos, webhooks (Clerk, Stripe) y respuestas no-UI; aquí no hay ninguno (YAGNI, no hay API pública de proyectos).
- Las lecturas se hacen en el Server Component de la página llamando al servicio (sin capa fetch/axios ni react-query).
- Cuidados que se heredan de la guía: un server action es un endpoint POST alcanzable directamente, por lo que cada action vuelve a autenticar y autorizar (`requireRole`) aunque la página ya lo haya hecho; los actions del cliente se despachan secuencialmente (aceptable aquí); `redirect()` y `notFound()` lanzan por diseño y no van dentro de un `try` que los capture.

Archivo `src/modules/projects/actions/project.actions.ts` (`"use server"`; solo exporta funciones async):

```ts
createProjectAction(prev: ProjectFormState, formData: FormData): Promise<ProjectFormState>
updateProjectAction(projectId: string, prev: ProjectFormState, formData: FormData): Promise<ProjectFormState>   // se usa con .bind(null, id)
publishProjectAction(projectId: string): Promise<ProjectActionResult>
unpublishProjectAction(projectId: string): Promise<ProjectActionResult>
closeProjectAction(projectId: string): Promise<ProjectActionResult>
```

- Todas: `requireRole("client")` (close: `requireRole("client", "admin")`) -> validar entrada -> servicio -> `revalidatePath("/dashboard/projects")` (y `/projects/<id>/edit` en lifecycle) -> resultado. `projectId` se valida como UUID con Zod antes de tocar BD; uno mal formado devuelve el mismo resultado que un id inexistente (404 de página no aplica en action: `{ ok: false, code: "NOT_FOUND" }`).
- Create/update: botón de envío con `name="intent"`: `draft` (guardar) o `publish`. En create con `publish` el servicio inserta ya publicado. En update con `publish` la action ejecuta `updateProject` y después `publishProject` (no atómico: si la publicación falla, los cambios quedan guardados como borrador y se informa el error; aceptado). Éxito: `redirect("/dashboard/projects")` fuera de `try`.
- Errores: `AuthError` -> `handleAuthErrorForPage(e)` (redirige a sign-in/onboarding o `notFound()`); `ProjectError` -> estado de error con mensaje en español (mapa código -> mensaje en la action); validación -> `{ status: "error", fieldErrors, values, message }`; cualquier otro error -> mensaje genérico, sin filtrar detalles de BD.
- Contratos de estado (en `project.types.ts`):

```ts
type ProjectFieldName = "title" | "category" | "description" | "budgetMinUsd" | "budgetMaxUsd" | "timelineWeeks" | "technologies";
type ProjectFormState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors: Partial<Record<ProjectFieldName, string>>; values: Record<ProjectFieldName, string> };
type ProjectActionResult = { ok: true } | { ok: false; code: ProjectErrorCode | "VALIDATION" | "NOT_FOUND" | "UNKNOWN"; message: string };
```

### RF8. Páginas privadas (solo routing en `src/app`, componentes en el módulo)

| Ruta | Contenido | Guard |
|---|---|---|
| `/dashboard/projects` | "Mis proyectos": lista con filtros por estado (enlaces), orden, paginación, botón "Nuevo proyecto" y acciones por fila según estado | `requireRole("client")` + `handleAuthErrorForPage` |
| `/projects/new` | formulario de creación (botones "Guardar borrador" y "Publicar") | `requireRole("client")` |
| `/projects/[id]/edit` | vista privada del proyecto: formulario según RF4 + barra de acciones (publicar, despublicar, cerrar según estado y `proposalCount`) | `requireRole("client")` + `getMyProject` (404 si ajeno/inexistente) |

- Un admin que abra estas rutas recibe 404 (`requireRole("client")` -> `FORBIDDEN` -> `notFound()`); la UI de admin no existe en esta spec.
- Next 16: `params` y `searchParams` de las páginas son `Promise` (verificado en `03-file-conventions/page.md`); se hace `await`. Las páginas usan `auth()` indirectamente, por lo que son dinámicas.
- Acciones por estado en la barra/fila: `draft` -> Editar, Publicar; `published` -> Editar (campos limitados), Despublicar (solo si `proposalCount === 0`), Cerrar; `proposal_selected` y `contracted` -> Ver, Cerrar (el resultado puede ser `PAYMENT_IN_PROGRESS`); `closed` -> Ver.
- Detalle con propuestas, pago y acciones de selección: spec 012 (no se enlaza nada que no exista).
- Lifecycle desde botones: componente cliente que llama a las actions dentro de `startTransition`, muestra error en una región `aria-live` y usa `window.confirm` para despublicar y cerrar (confirmación mínima; spec 014 la sustituirá por un diálogo).
- Etiquetas de estado = columna "Etiqueta" de `state-machines.md §1` (constante `PROJECT_STATUS_LABELS`).

### RF9. Dinero: USD <-> centavos (`src/lib/money.ts`, T0)

Utilidad transversal (la usará también la spec 007):

- `usdToCents(input: string | number): number | null`: acepta solo `^\d+(\.\d{1,2})?$` (sin signo, exponente ni separador de miles; se recorta el espacio); calcula con enteros sobre la cadena (no `Math.round(x * 100)`, evita errores de coma flotante); devuelve `null` si no cumple o supera `Number.MAX_SAFE_INTEGER`.
- `centsToUsd(cents: number): string`: valor de entrada de formulario, p. ej. `150050 -> "1500.50"`, sin separadores.
- `formatUsd(cents: number): string`: presentación, p. ej. `"$1,500.50"` o `"USD 1,500.50"` (`Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`).
- La conversión sucede solo en la frontera (formulario/presentación); el servicio y la BD solo ven centavos enteros.

### RF10. Estados mínimos de UI

- Carga: `loading.tsx` de `/dashboard/projects` (texto + bloque con `animate-pulse`, sin componente nuevo). Botones de envío con `disabled` mientras `pending`.
- Error: `error.tsx` (cliente) de `/dashboard/projects` con mensaje y botón "Reintentar" (`reset`). Errores de action se muestran inline en el formulario/barra.
- Vacío: sin proyectos -> estado vacío con llamada a la acción "Crear tu primer proyecto"; con filtro sin resultados -> "No hay proyectos con este estado" y enlace para quitar el filtro. `EmptyState` en `src/components/shared/empty-state.tsx` (T0; SETUP.md §1 lo prevé; reutilizable en 006/012).
- Accesibilidad mínima: `<label>` asociado, `aria-invalid` y `aria-describedby` en campos con error, región `aria-live="polite"` para el mensaje general.

## 4. Requisitos no funcionales

- Server-only: `project.service.ts` importa `server-only` (patrón de `users.service.ts`). La lógica de negocio vive en el servicio, no en las actions ni en las páginas.
- Sin dependencias nuevas de npm (ver 12). Sin secretos ni variables de entorno nuevas.
- Next 16: se consultaron `server-actions.md`, `forms.md`, `page.md`, `route-handlers.md`, `revalidatePath` y `redirect` en `node_modules/next/dist/docs/`; el developer re-verifica cualquier firma que use.
- Archivos pequeños y por responsabilidad: schema valida, servicio aplica reglas y persiste, action traduce a UI, componente renderiza (SETUP.md §2).

## 5. Reglas de negocio

- R1. Solo `client` crea, edita, publica, despublica; `client` dueño o `admin` cierran (matriz de spec 004 RF7, ya implementada en `can`).
- R2. D3: `published -> draft` solo si no existe ninguna propuesta del proyecto (cualquier estado; ver D-D).
- R3. Cerrar desde `published` rechaza las propuestas `pending` en la misma transacción (`state-machines.md §1`). Esto implica que el servicio de proyectos hace un `UPDATE proposals SET status='rejected' WHERE project_id = ? AND status = 'pending'`: es una excepción explícita a "las transiciones entre módulos pasan por funciones del módulo dueño", porque `proposals` aún no existe como servicio. Cuando exista 007, esa línea se reemplaza por una llamada a su función de transición (ver D-B y Próximas fases).
- R4. Un proyecto `closed` es terminal e inmutable.
- R5. Solo `published` admite propuestas (lo aplica 007); esta spec garantiza que `draft` y `closed` nunca tienen propuestas nuevas porque el estado se cambia con guardas.
- R6. Concurrencia: dos acciones simultáneas sobre un mismo proyecto no pueden dejarlo inconsistente (guarda `WHERE status = ...` + bloqueo de fila donde se leen otras tablas). Riesgo residual documentado: una propuesta que se inserte a la vez que se despublica; 007 debe insertar propuestas comprobando `status = 'published'` bajo bloqueo (`FOR SHARE`/`FOR UPDATE` del proyecto) en su transacción. Se registra en Próximas fases.
- R7. Nada de lo que escribe esta spec es dato de pago ni se presenta como tal.

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones: `projects` (spec 003) cubre todos los campos, `technologies text[]` y los checks (`projects_budget_min_positive`, `projects_budget_range`, `projects_currency_usd`, `projects_timeline_positive`, `projects_closed_at_matches_status`).

Decisión sobre campos NOT NULL del borrador (decisión 8 de spec 003): un borrador es un proyecto con todos los campos válidos que aún no se publicó. Se usa un único schema (RF1) para "Guardar borrador" y "Publicar"; no hay valores centinela ni defaults inventados (descripción vacía, presupuesto 0) que luego haya que distinguir y que además violarían `projects_budget_min_positive`. Consecuencia: no se puede guardar un borrador incompleto (ver D-A para la alternativa y su coste).

Contrato de tipos (`src/modules/projects/types/project.types.ts`):

```ts
type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
type Project = typeof projects.$inferSelect;
type ProjectInput = z.infer<typeof projectInputSchema>;       // title, category, description, budgetMinCents, budgetMaxCents, timelineWeeks, technologies
type ProjectListQuery = { status: "all" | ProjectStatus; sort: "newest" | "oldest"; page: number };
type ProjectListItem = Pick<Project, "id"|"title"|"category"|"status"|"budgetMinCents"|"budgetMaxCents"|"timelineWeeks"|"createdAt"|"updatedAt"|"publishedAt"> & { proposalCount: number };
type ProjectDetail = Project & { proposalCount: number };
type ProjectPage = { items: ProjectListItem[]; total: number; page: number; pageSize: number; totalPages: number };
const PROJECT_STATUS_LABELS: Record<ProjectStatus, string>;   // Borrador | Publicado | Con propuesta seleccionada · pendiente de pago | En contratación | Cerrado
// + ProjectFieldName, ProjectFormState, ProjectActionResult (RF7)
```

## 7. Contratos de servidor o API

Servicio `src/modules/projects/services/project.service.ts` (server-only; usa `db`; todas lanzan `AuthError` o `ProjectError`):

```ts
createProject(actor: AuthUser, input: ProjectInput, opts?: { publish?: boolean }): Promise<Project>
updateProject(actor: AuthUser, projectId: string, input: ProjectInput): Promise<Project>
publishProject(actor: AuthUser, projectId: string): Promise<Project>
unpublishProject(actor: AuthUser, projectId: string): Promise<Project>
closeProject(actor: AuthUser, projectId: string): Promise<Project>
listMyProjects(actor: AuthUser, query: ProjectListQuery): Promise<ProjectPage>
getMyProject(actor: AuthUser, projectId: string): Promise<ProjectDetail>
```

Errores de dominio (`src/modules/projects/services/project-errors.ts`, mismo estilo que `AuthError`):

```ts
type ProjectErrorCode = "INVALID_STATE" | "HAS_PROPOSALS" | "LOCKED_FIELDS" | "INVALID_PROJECT" | "PAYMENT_IN_PROGRESS";
class ProjectError extends Error { code: ProjectErrorCode; status: 409 | 422 }   // INVALID_PROJECT 422, el resto 409
```

Autorización por función: `createProject` `project.create`; `updateProject` `project.update` (+ownership); `publishProject` y `unpublishProject` `project.publish` (+ownership; no hay acción `project.unpublish` en la matriz de spec 004 y se reutiliza); `closeProject` `project.close` (+ownership `allowAdmin: true`); `listMyProjects` `project.readPrivate` (filtra por `actor.id`, por lo que admin ve lista vacía); `getMyProject` `project.readPrivate` (+ownership `allowAdmin: true`).

Actions: ver RF7. Sin route handlers ni endpoints nuevos.

## 8. Permisos y seguridad

- Autorización en cuatro capas independientes: guard de página (`requireRole`), guard de action (`requireRole`), `can` + `requireOwnership` dentro del servicio, y filtro por `client_id` en SQL. Ninguna depende de la UI ni de `proxy.ts`.
- Recurso ajeno o inexistente -> 404 indistinguible; rol incorrecto -> 403 (en páginas, `notFound()` vía `handleAuthErrorForPage`).
- El actor nunca se toma de la entrada; `clientId`, `status`, `publishedAt`, `closedAt` nunca vienen del formulario (el schema no los define y los campos extra de `FormData` se ignoran).
- Admin: solo lectura y cierre; no puede crear, editar, publicar ni despublicar proyectos de otros.
- Las actions usan el mecanismo de origen/CSRF integrado de Next; no hay protección adicional (rate limiting y auditoría: spec 015).
- Mensajes de error genéricos hacia el cliente en fallos inesperados; no se registran descripciones de proyecto completas.
- Texto libre (título, descripción, tecnologías) se renderiza siempre como texto de React (sin `dangerouslySetInnerHTML`).

## 9. Estados, errores y casos límite

- Doble envío de "Crear" (doble clic o dos pestañas): puede crear dos proyectos; mitigado en UI con `disabled` durante `pending`, no hay unicidad por título (no se pide).
- Publicar un borrador que otro proceso ya publicó: la guarda `WHERE status='draft'` da 0 filas -> `INVALID_STATE` con mensaje "El proyecto ya no está en borrador".
- Despublicar mientras entra una propuesta: ver R6 (residual hasta 007).
- Cerrar un proyecto `closed`/`draft`: `INVALID_STATE`.
- `proposal_selected` con pago `pending` -> cerrar da `PAYMENT_IN_PROGRESS` hasta que 010/012 definan cancelación (D2).
- Editar un `published` cambiando presupuesto/plazo/categoría (petición manipulada): `LOCKED_FIELDS`, sin escribir nada.
- Presupuesto con decimales de más ("10.999"), con coma o con signo: error de campo; "1500.5" -> 150050 centavos.
- `budgetMax < budgetMin`: error en `budgetMaxUsd`.
- Tecnologías duplicadas ("React, react") -> se guarda una; más de 15 o vacío -> error.
- `page` fuera de rango o no numérico: no error; sin resultados se muestra el vacío filtrado; `status` inválido: `all`.
- Categoría histórica fuera de la lista (cambio futuro de lista): `publishProject` -> `INVALID_PROJECT` con mensaje para editar el borrador.
- Fallo de BD en servidor: la action devuelve mensaje genérico; la lista muestra `error.tsx`.
- Sesión expirada durante una action: `AuthError` -> redirect a `/sign-in`.
- Cuenta de usuario sin onboarding: `ONBOARDING_REQUIRED` -> `/onboarding` (guards de spec 004).

## 10. Criterios de aceptación verificables

- AC1. `createProject` con entrada válida inserta un `draft` con `clientId = actor.id`, `currency = 'USD'`, `publishedAt = null`; con `{ publish: true }` inserta `published` con `publishedAt` no nulo. Un actor `developer` o `admin` recibe `FORBIDDEN` y no escribe.
- AC2. `projectInputSchema` rechaza título < 5 o > 120, descripción < 30 o > 5000, categoría fuera de la lista, presupuesto fuera de rango o con `max < min`, plazo no entero o fuera de 1-104, tecnologías vacías/>15/con elementos vacíos o > 30 caracteres; acepta el caso válido y elimina duplicados sin distinguir mayúsculas.
- AC3. `usdToCents`: `"1500"->150000`, `"1500.5"->150050`, `"0.07"->7`, `"1500.50"->150050`; `null` para `""`, `"-1"`, `"1,500"`, `"1e3"`, `"10.999"`, `"abc"`; `centsToUsd(150050) === "1500.50"`; sin errores de coma flotante (`"19.99"->1999`, `"1.15"->115`).
- AC4. `parseProjectForm` convierte USD a centavos y `technologies` a lista, devuelve `fieldErrors` con claves de UI (`budgetMinUsd`, `budgetMaxUsd`) y `values` con lo enviado ante error.
- AC5. `updateProject` en `draft` cambia todos los campos; en `published` cambia título/descripción/tecnologías y lanza `LOCKED_FIELDS` si cambia categoría, presupuesto o plazo (sin escribir nada); en `proposal_selected`, `contracted` o `closed` lanza `INVALID_STATE`. Nunca cambia `status` ni `clientId`.
- AC6. `publishProject` pasa `draft -> published` con `publishedAt`; sobre otro estado lanza `INVALID_STATE`; con una fila que ya no cumple el schema lanza `INVALID_PROJECT` sin cambiar el estado.
- AC7. `unpublishProject` pasa `published -> draft` y pone `publishedAt = null` cuando no hay propuestas; con al menos una propuesta (cualquier estado) lanza `HAS_PROPOSALS` y deja el estado intacto; sobre otro estado `INVALID_STATE`.
- AC8. `closeProject` desde `published`, `proposal_selected` o `contracted` deja `closed` con `closedAt` no nulo; desde `published` las propuestas `pending` pasan a `rejected` y las demás no cambian; desde `draft` o `closed` `INVALID_STATE`; desde `proposal_selected` con un pago `pending` o `completed_test` `PAYMENT_IN_PROGRESS`; el `admin` puede cerrar proyectos ajenos.
- AC9. Un cliente que no es dueño recibe `AuthError NOT_FOUND` (404) en `updateProject`, `publishProject`, `unpublishProject`, `closeProject` y `getMyProject`, igual que ante un id inexistente; `admin` solo pasa en `getMyProject` y `closeProject`, y recibe `FORBIDDEN` o `NOT_FOUND` en las demás.
- AC10. Dos llamadas concurrentes a `publishProject` (o a `closeProject`) sobre el mismo proyecto dejan un estado coherente: una gana y la otra recibe `INVALID_STATE`.
- AC11. `listMyProjects` devuelve solo proyectos del actor; filtra por `status`; ordena por creación `newest|oldest` con desempate estable; pagina de 10 en 10 con `total` y `totalPages` correctos; parámetros inválidos caen a defaults; incluye `proposalCount` correcto.
- AC12. `getMyProject` devuelve la fila con `proposalCount`.
- AC13. Cada action autentica con `requireRole` antes de validar; con `AuthError` no llama al servicio; con entrada inválida no llama al servicio y devuelve `fieldErrors` y `values`; con éxito de create/update llama a `revalidatePath` y redirige a `/dashboard/projects`; `ProjectError` se traduce a mensaje en español sin lanzar; un `projectId` que no es UUID no llega a BD.
- AC14. `/dashboard/projects`, `/projects/new` y `/projects/[id]/edit` redirigen a `/sign-in` sin sesión, a `/onboarding` sin fila, y dan 404 a un `developer`/`admin` y a un cliente ajeno (verificación manual, ver 11).
- AC15. La lista muestra estados de carga, error y vacío (con y sin filtro); los controles de paginación/orden/filtro son enlaces que reflejan `searchParams`.
- AC16. El formulario repuebla los valores tras un error de validación, marca los campos con `aria-invalid` y los campos bloqueados de un proyecto `published` aparecen `readOnly`.
- AC17. `project.service` no exporta ninguna función que escriba `proposal_selected`, `contracted` ni `contractedAt` (comprobación estática en el test del módulo exportado).
- AC18. `npm run lint`, `npm run test` y `npm run build` pasan; ningún test usa red, Clerk ni Neon reales; `package.json` no cambia (salvo lo que genere `npx shadcn add` en T0 sobre `src/components/ui`, que no añade dependencias nuevas de npm; si lo hiciera se informa y se vuelve a borrador).

## 11. Pruebas requeridas

Vitest, junto al archivo, `// @vitest-environment node` donde no haya DOM.

- `src/lib/money.test.ts` (AC3): casos de AC3, bordes (`"0"`, `"0.00"`, ceros a la izquierda, espacios, muy grande) y `formatUsd`.
- `src/modules/projects/schemas/project.schema.test.ts` (AC2, AC4, parte de AC11): válidos e inválidos por campo y en los bordes (5/120, 30/5000, 100/100_000_000, 1/104, 1/15 tecnologías), deduplicado de tecnologías, `parseProjectForm` con `FormData`, re-etiquetado de errores y `values`, y `projectListQuerySchema` con parámetros inválidos.
- `src/modules/projects/services/project.service.test.ts` con `createTestDb()` (PGlite, migraciones reales; mock de `@/lib/db/client` como en `users.service.test.ts` y de `server-only`), sembrando usuarios `client`, `developer`, `admin`, proyectos en cada estado, propuestas y `payment_attempts` directamente con Drizzle: AC1, AC5-AC12 y AC17, incluida la concurrencia con `Promise.all` y los estados `proposal_selected`/`contracted` sembrados a mano. Las respuestas de ownership no se mockean: se usa `requireOwnership` real con `AuthUser` reales (no se mockea Clerk porque el servicio recibe `actor`).
- `src/modules/projects/actions/project.actions.test.ts` (AC13): `requireRole` de `@/modules/auth/services/current-user.service` mockeado en el borde (más `@/modules/projects/services/project.service`, `next/cache` y `next/navigation` mockeados); casos sin sesión, rol incorrecto, validación, éxito (revalidate + redirect), `ProjectError`, id no UUID, close con admin.
- No requieren test unitario (SETUP.md §3): páginas de `src/app`, `loading.tsx`, `error.tsx`, componentes presentacionales (`project-list`, `project-status-badge`, `empty-state`) y componentes de formulario/acciones que solo cablean actions. Verificación manual (humano tras T4): flujo completo crear borrador -> editar -> publicar -> despublicar -> cerrar con un usuario `client`, acceso con un `developer`, y acceso a un id ajeno (AC14-AC16).

## 12. Dependencias y riesgos

- Dependencias npm: ninguna nueva. Se descarta `react-hook-form` (y `@hookform/resolvers`): el formulario son 7 campos, la validación es Zod en servidor (fuente de verdad, necesaria igualmente porque las actions son endpoints directos) y React 19 `useActionState` + atributos HTML (`required`, `minLength`, `inputMode`) cubren estado, `pending` y errores por campo; añadirlo duplicaría la validación y una librería de estado de formulario sin necesidad. Misma lógica para no usar `react-query` (lecturas en Server Components) ni `@tanstack/react-table` (lista de 10 filas con enlaces, sin ordenación por columna en cliente).
- Componentes shadcn nuevos (T0, `npx shadcn@latest add input textarea label badge native-select`): base-nova sobre Base UI; el developer confirma que cada uno existe en el registro y no necesita paquetes npm adicionales. `native-select` evita el `Select` de Base UI (portal/popup y su propio manejo de `name`) en un formulario basado en `FormData`.
- Riesgos: (1) dependencia de módulos `projects -> proposals/payments` a nivel de esquema (ver D-B); (2) condición de carrera despublicar vs. propuesta nueva hasta 007 (R6); (3) sin `deleted` de borradores pueden acumularse (impacto bajo); (4) `window.confirm` es provisional (014); (5) límites numéricos (categorías, rangos, longitudes) son valores por defecto razonables sujetos a D-F.

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. Los componentes shadcn y `src/lib/**` van serializados primero en T0. Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer corre el build al final.

### T0 — Base: componentes shadcn, dinero y estado vacío (serial, primero)

- Archivos: `src/components/ui/{input,textarea,label,badge,native-select}.tsx` (vía `npx shadcn@latest add`), `src/lib/money.ts`, `src/lib/money.test.ts`, `src/components/shared/empty-state.tsx`.
- Depende de: —
- Paralelizable: no
- Cubre: AC3, parte de AC18

### T1 — Tipos, schemas y errores de dominio

- Archivos: `src/modules/projects/types/project.types.ts`, `src/modules/projects/schemas/project.schema.ts`, `src/modules/projects/schemas/project.schema.test.ts`, `src/modules/projects/services/project-errors.ts`.
- Depende de: T0 (`usdToCents`)
- Paralelizable: no (contrato base de T2-T4)
- Cubre: AC2, AC4, parte de AC11

### T2 — Servicio de proyectos (+ doc de arquitectura)

- Archivos: `src/modules/projects/services/project.service.ts`, `src/modules/projects/services/project.service.test.ts`, `docs/architecture/system-design.md` (§4: nota de referencia de esquema de solo lectura/escritura puntual `projects -> proposals/payments` y registro de la excepción R3; solo si se aprueba D-B).
- Depende de: T1
- Paralelizable: no (T3 y T4 importan su contrato; puede arrancar T3/T4 en paralelo solo cuando exista este archivo, ver abajo)
- Cubre: AC1, AC5-AC12, AC17

### T3 — Server actions

- Archivos: `src/modules/projects/actions/project.actions.ts`, `src/modules/projects/actions/project.actions.test.ts`.
- Depende de: T1, T2
- Paralelizable: sí (con T4: archivos disjuntos; T4 importa las firmas fijadas en RF7)
- Cubre: AC13

### T4 — UI y páginas

- Archivos: `src/modules/projects/components/{project-form,project-list,project-status-badge,project-lifecycle-actions,projects-loading,projects-error}.tsx`, `src/app/dashboard/projects/{page,loading,error}.tsx`, `src/app/projects/new/page.tsx`, `src/app/projects/[id]/edit/page.tsx`.
- Depende de: T1, T2 (las páginas llaman al servicio), contrato de T3 (RF7)
- Paralelizable: sí (con T3)
- Cubre: AC14, AC15, AC16 (verificación manual; sin tests unitarios obligatorios)

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: aprobada por el humano con las recomendaciones por defecto de D-A a D-L.

- D-A. Borrador con campos obligatorios. Recomendación: un único schema completo para borrador y publicación (sin centinelas; un borrador es un proyecto completo aún no visible). Alternativa: borrador relajado (solo título y categoría) con valores centinela (descripción `''`, presupuesto mínimo 1 centavo, plazo 1) y validación completa al publicar; mejor UX de "guardar y seguir luego", pero mete datos falsos en columnas NOT NULL que 006/012 tendrían que ignorar y el check `projects_budget_min_positive` impide un 0 real.
- D-B. Dependencia de módulos y excepción de transición. `projects` leerá `proposals` (conteo, D3) y `payment_attempts` (D2) y actualizará `proposals` (`pending -> rejected` al cerrar) importando solo sus tablas Drizzle, no sus servicios. Recomendación: permitirlo ahora con la nota en `system-design.md §4` (T2) y reemplazar el `UPDATE` por la función de transición de `proposals` en la spec 007. Alternativa: aplazar el cierre desde `published` y el chequeo de pagos a 007/010 (deja a 005 sin "cerrar" completo).
- D-C. Cierre desde `proposal_selected` con intento de pago `pending`. Recomendación: bloquear con `PAYMENT_IN_PROGRESS` hasta que 010/012 definan cancelar/esperar (consistente con D2 y `state-machines.md §5`). Alternativa: permitirlo y cancelar el intento (requiere lógica de pagos que aún no existe).
- D-D. Qué cuenta como "propuestas" en D3. Recomendación: cualquier fila (incluida `withdrawn`), lectura literal de D3 y conserva el historial. Alternativa: solo `pending` (más permisiva, pero deja propuestas `withdrawn` huérfanas en un borrador).
- D-E. Edición en `published`. Recomendación: solo título, descripción y tecnologías; categoría, presupuesto y plazo bloqueados. Alternativas: editar todo mientras no haya propuestas (más flexible; más ramas) o nada en `published` (más estricto; obliga a despublicar para corregir una errata).
- D-F. Límites numéricos y de texto (títulos 5-120, descripción 30-5000, presupuesto USD 1-1.000.000, plazo 1-104 semanas, 1-15 tecnologías de hasta 30 caracteres) y lista de categorías de RF2. Recomendación: aprobarlos como están; son defaults fáciles de ajustar en un solo archivo.
- D-G. Entrada de presupuesto. Recomendación: texto con hasta 2 decimales y conversión sin flotantes (RF9). Alternativa: solo dólares enteros (más simple, pierde centavos que la BD sí admite).
- D-H. Tecnologías. Recomendación: un campo de texto separado por comas (sin componente de "chips"). Alternativa: input de etiquetas (requiere un componente nuevo y manejo de estado cliente; YAGNI ahora).
- D-I. Ubicación de páginas. Recomendación: `/dashboard/projects`, `/projects/new`, `/projects/[id]/edit` (coherente con spec 004 RF4 y sin chocar con el catálogo de 006). Alternativa: todo bajo `/dashboard/projects/...`; evita mezclar privadas dentro de `/projects` pero cambia las rutas ya reservadas en 004.
- D-J. Borrado de borradores (`state-machines.md §1` lo deja a esta spec). Recomendación: diferirlo (no figura en las operaciones pedidas; un borrador es invisible y sin coste). Alternativa: añadir `deleteDraft` (borrado físico solo en `draft` y dueño; FK `restrict` no lo impide al no haber hijos) con su action y botón; es una tarea pequeña adicional y no cambia el esquema.
- D-K. Confirmación de despublicar/cerrar con `window.confirm`. Recomendación: aceptar como provisional hasta la spec 014. Alternativa: añadir `alert-dialog` de shadcn en T0 (más componentes y estado cliente).
- D-L. Sin pantalla de admin. Recomendación: mantener (D8 solo exige que el servicio permita lectura y cierre; la UI de admin no está en el alcance del MVP ni en una spec numerada). Alternativa: añadir una vista mínima de cierre para admin (nueva tarea).

## Próximas fases

- 006: catálogo y detalle público (`published`), filtro por categoría con `PROJECT_CATEGORIES`; revalida el catálogo desde las actions de esta spec (añadir `revalidatePath` público ahí).
- 007: propuestas; insertar con comprobación del estado `published` bajo bloqueo de fila del proyecto (cierra el riesgo R6) y exponer la función de transición `pending -> rejected` que sustituya el `UPDATE` directo de R3 (actualizar D-B).
- 008 y 010: añadir a `project.service` las funciones de transición `published -> proposal_selected` y `proposal_selected -> contracted`, con sus propias pruebas.
- 010/012: definir cancelación del intento `pending` y relajar `PAYMENT_IN_PROGRESS` si se decide (D-C); panel completo del cliente con propuestas y pago.
- 014: diálogos de confirmación, mensajes de éxito/error y accesibilidad ampliada.
- 015: rate limiting de las actions de creación y auditoría de cierres.

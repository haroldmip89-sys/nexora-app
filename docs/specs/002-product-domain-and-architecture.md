# Dominio del producto y arquitectura (Fase 1 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Esta spec es solo documental: no produce código de la app ni instala paquetes. Su salida ejecutable son dos documentos (`docs/architecture/system-design.md`, `docs/architecture/state-machines.md`) y la nueva `docs/SETUP.md §4`.

## 1. Objetivo

Definir, antes de cualquier esquema o código (specs 003+), el modelo de dominio de Nexora según `docs/SDD-PLAN.md §4` (Spec 002) y `docs/BRIEF.md §4, §6, §7, §8`:

- Entidades y relaciones.
- Qué datos pertenecen a Nexora (Neon), a Clerk, a Stripe y a Supabase Storage.
- Estructura propuesta de `src/modules/<domain>`.
- Máquinas de estado con transiciones permitidas y quién las dispara.
- Cerrar la brecha detectada en la spec 001: los agentes citan `docs/SETUP.md §4` y `docs/architecture/`, que no existen. Esta spec especifica su creación.

Esta spec cubre las decisiones de 001 (Decisiones técnicas 2 y 8) y fija el contrato de nombres de entidades y estados para 003 (schema), 004 (auth), 005-008 (proyectos/propuestas) y 009-011 (pagos).

## 2. Contexto y alcance

### Decisiones ya confirmadas por un humano

- Stack de `BRIEF.md §9` se mantiene: Clerk, Drizzle ORM + Neon Postgres, Supabase Storage, Stripe, Zod.
- Stripe Connect en test mode se implementa como último paso (spec 011 / fase final). Mientras tanto la transferencia al desarrollador se modela como "pendiente de implementación".
- Prefijo `NNN-slug.md` para specs en `docs/specs/`.
- Esta spec 002 incluye la tarea documental de crear `docs/architecture/system-design.md` y añadir `§4` a `docs/SETUP.md`.
- El diseño visual (https://claude.ai/artifact/VmUpQeQu1q9LscALC9g5Wm) está aprobado y se usa solo como contexto de entidades, estados y campos.

### Incluye

- Especificar el contenido de `docs/architecture/system-design.md`, `docs/architecture/state-machines.md` y `docs/SETUP.md §4`.
- Fijar en esta spec el vocabulario canónico (entidades, campos de negocio, identificadores de estado) que 003+ deben respetar.

### No incluye

- Schema SQL, tipos de columna, índices, migraciones Drizzle (spec 003).
- Integración Clerk, middleware, protección de rutas, sincronización (spec 004).
- Reglas detalladas de validación de formularios, paginación, filtros (specs 005-007).
- Contratos de Stripe Checkout/webhooks (specs 009-010) y Stripe Connect (spec 011).
- Uso de Supabase Storage más allá de reservarlo como destino de archivos privados (spec 015/017). El MVP no tiene ninguna entidad con archivos.
- Cualquier código en `src/`, instalación de paquetes o `npx shadcn add`.

### Reutilizar

- `docs/BRIEF.md`, `docs/SDD-PLAN.md`, `docs/specs/001-repository-audit.md`: fuente de requisitos e inventario. Nada de `src/` es reutilizable (no existe `src/modules/`; ver 001 §Inventario 2).
- Convenciones existentes de `docs/SETUP.md §1` (naming, sufijos, subcarpetas por necesidad).
- Formato de citas que usan los agentes: `system-design.md §N` (ver T1, que fija numeración estable).

### Archivos

| Archivo | Acción | Tarea |
|---|---|---|
| `docs/architecture/system-design.md` | crear | T1 |
| `docs/architecture/state-machines.md` | crear | T2 |
| `docs/SETUP.md` | modificar (solo añadir `## 4`) | T3 |

Ningún otro archivo se toca. No se modifican `.claude/agents/*` (sus citas ya apuntan a `SETUP.md §4` / `docs/architecture/`).

## 3. Requisitos funcionales

Contenido que los documentos deben tener (el contenido normativo vive en esta spec y los docs lo transcriben/expanden sin contradecirlo).

### RF1. Entidades y relaciones (destino: `system-design.md §2`)

Todas viven en Neon, salvo indicación. Los nombres son conceptuales; los nombres de tabla y columnas finales los fija la spec 003.

| Entidad | Propósito | Campos de negocio | Relaciones |
|---|---|---|---|
| Usuario (`user`) | Identidad interna de Nexora vinculada a Clerk | `clerkUserId` (único), rol, nombre visible, email, fechas | 1 usuario : N proyectos (si cliente); 1 : N propuestas (si desarrollador); 1 : 0..1 perfil de desarrollador |
| Rol | Atributo del usuario, no entidad aparte | `client` \| `developer` \| `admin` | Un solo rol por usuario (ver D1) |
| Perfil del desarrollador (`developerProfile`) | Información pública/básica del desarrollador | titular, bio, tecnologías, enlace externo opcional | 1:1 con usuario (rol `developer`) |
| Proyecto (`project`) | Necesidad publicada por un cliente | título, categoría, descripción, presupuesto mín/máx USD, plazo en semanas, tecnologías, estado | N:1 cliente (usuario); 1:N propuestas; 0..1 selección; 0..N intentos de pago |
| Propuesta (`proposal`) | Oferta de un desarrollador a un proyecto | precio USD, plazo en semanas, descripción de la solución, estado | N:1 proyecto; N:1 desarrollador (usuario); un desarrollador tiene como máximo una propuesta por proyecto (ver D5) |
| Selección de propuesta (`proposalSelection`) | Hecho inmutable "este proyecto eligió esta propuesta" | proyecto, propuesta, cliente que seleccionó, fecha | 1:1 con proyecto y 1:1 con propuesta; garantiza como máximo un ganador por proyecto (regla BRIEF §7.4-5) |
| Intento de pago (`paymentAttempt`) | Un intento de pago en Stripe Checkout (test) | proyecto, propuesta ganadora, cliente, importe USD y moneda copiados de la propuesta en el servidor, id de Checkout Session, id de PaymentIntent (cuando exista), estado, `livemode=false` | N:1 proyecto; N:1 propuesta; como máximo un intento `pending` o `completed_test` por proyecto |
| Evento de pago procesado (`processedPaymentEvent`) | Registro para idempotencia de webhooks | `stripeEventId` (único), tipo, fecha de recepción, resultado del procesamiento | referencia opcional al intento de pago afectado |
| Registro de transferencia simulada (`simulatedTransfer`) | Liquidación al desarrollador, distinta del pago | intento de pago, desarrollador destino, estado | 1:1 con intento de pago `completed_test`. **Diferido**: ver D6 |

Invariantes de dominio (a reflejar en `system-design.md §2`):

- I1. Máximo una selección por proyecto y una propuesta seleccionada por proyecto.
- I2. Importe y moneda de un intento de pago salen siempre de la propuesta ganadora guardada en servidor, nunca del cliente.
- I3. El pago (`paymentAttempt`) y la transferencia son entidades y estados independientes.
- I4. Ningún estado de pago `completed_test` se alcanza sin un evento de Stripe verificado en servidor.
- I5. Todo dato de pago en este alcance es de Test Mode y nunca se presenta como dinero real.

### RF2. Propiedad de datos (destino: `system-design.md §3`)

| Dato | Fuente de verdad | Notas |
|---|---|---|
| Credenciales, contraseña, sesión, verificación de email, proveedores OAuth | Clerk | Nexora nunca los almacena |
| Identificador de identidad (`clerkUserId`) | Clerk (origen), copia en Neon | Clave de vinculación; único |
| Email y nombre visible | Clerk (origen), copia en Neon para listados y relaciones | Spec 004 define sincronización; mínima exposición de datos personales |
| Rol de negocio | Neon (`user.role`) | Fuente de verdad de autorización. Se puede reflejar en metadata de Clerk solo como caché (decisión D1) |
| Perfil del desarrollador, proyectos, propuestas, selecciones | Neon | Datos de dominio |
| Intentos de pago: estado, importe, relaciones con proyecto/propuesta | Neon | El estado local solo cambia por webhook verificado |
| Checkout Session, PaymentIntent, Event, instrumentos de pago, datos de tarjeta | Stripe | Neon guarda solo identificadores externos (únicos) y estado derivado. Nunca datos de tarjeta |
| Eventos de webhook procesados | Neon (`processedPaymentEvent`) | Copia del `event.id` para idempotencia |
| Archivos privados | Supabase Storage | MVP sin archivos; reservado. Acceso solo por URLs firmadas desde servidor (spec 015). Neon guardaría solo la ruta del objeto |
| Cuenta conectada del desarrollador (Stripe Connect) | Stripe (+ id en Neon) | Fuera hasta spec 011 |

### RF3. Estructura de módulos propuesta (destino: `system-design.md §4`)

Solo se crean las subcarpetas que cada spec de implementación necesite (YAGNI, `SETUP.md §1.5`). Nada de esto se crea en esta spec.

```
src/
  modules/
    auth/        -> integración Clerk: resolver usuario actual y rol, guards de servidor (spec 004)
    users/       -> usuario interno + perfil del desarrollador (servicios, schemas, tipos)
    projects/    -> proyectos y su ciclo de vida (spec 005-006)
    proposals/   -> propuestas y selección de propuesta (spec 007-008)
    payments/    -> intentos de pago, eventos procesados, transferencia (specs 009-011)
  lib/
    db/          -> cliente Drizzle y schema (ubicación final: spec 003)
  app/
    api/webhooks/stripe/route.ts   -> solo routing; delega a modules/payments (spec 010)
```

Reglas:

- Dependencias permitidas entre módulos: `proposals` -> `projects`, `users`; `payments` -> `projects`, `proposals`, `users`; `projects` -> `users`; todos -> `auth` para identidad. Sin dependencias circulares.
- La selección de propuesta es una operación transaccional que escribe en `proposals` y `projects`. Vive en `proposals` (servicio de selección) y usa una función de transición expuesta por `projects`. La spec 008 lo detalla.
- La transición `proposal_selected -> contracted` la ejecuta el servicio de `payments` llamando a la función de transición de `projects` (nunca por SQL directo desde otro módulo).
- `src/app` solo routing. Clientes de Clerk, Stripe y Supabase en `src/lib` (singletons mínimos); lógica de negocio en los módulos.
- Nombre `users` y no `profile`/`accounts`, para agrupar usuario y perfil de desarrollador (ver D4).

### RF4. Máquinas de estado (destino: `state-machines.md` y resumen en `system-design.md §5`)

Identificadores canónicos en inglés (snake_case) y etiqueta de UI aprobada. Los textos de UI aprobados en el diseño visual son los de la columna "Etiqueta".

**Proyecto (`project.status`)**

| Id | Etiqueta |
|---|---|
| `draft` | Borrador |
| `published` | Publicado |
| `proposal_selected` | Con propuesta seleccionada · pendiente de pago |
| `contracted` | En contratación |
| `closed` | Cerrado |

| Transición | Quién la dispara | Condición |
|---|---|---|
| `draft -> published` | Cliente propietario | Datos del proyecto válidos (spec 005) |
| `published -> draft` | Cliente propietario | Solo si no tiene propuestas (D3, pendiente) |
| `published -> proposal_selected` | Sistema, dentro de la transacción de selección iniciada por el cliente propietario | El proyecto sigue en `published`; la propuesta seleccionada está en `pending` |
| `proposal_selected -> contracted` | Sistema, tras procesar un webhook verificado que deja el pago en `completed_test` | Intento de pago asociado a la propuesta ganadora |
| `published -> closed` | Cliente propietario (o administrador) | Cierre manual; las propuestas `pending` pasan a `rejected` |
| `proposal_selected -> closed` | Cliente propietario (o administrador) | Cancelación antes de pagar; ver D2 |
| `contracted -> closed` | Cliente propietario (o administrador) | Cierre manual tras la contratación |

`closed` es terminal. `draft` no pasa a `closed` en el MVP (un borrador se edita o se descarta; el borrado queda para spec 005). Solo `published` admite nuevas propuestas.

**Propuesta (`proposal.status`)**

| Id | Etiqueta |
|---|---|
| `pending` | Pendiente |
| `accepted` | Aceptada |
| `rejected` | Rechazada |
| `withdrawn` | Retirada |

| Transición | Quién la dispara | Condición |
|---|---|---|
| (creación) -> `pending` | Desarrollador autor | Proyecto en `published`; usuario con rol `developer`; no es el propietario del proyecto |
| `pending -> accepted` | Sistema, dentro de la transacción de selección (acción del cliente propietario) | Exactamente una por proyecto |
| `pending -> rejected` | Sistema, en la misma transacción de selección para las demás; o al cerrarse el proyecto sin ganador | — |
| `pending -> withdrawn` | Desarrollador autor | Solo mientras el proyecto está `published` |

`accepted`, `rejected` y `withdrawn` son terminales. Una propuesta `accepted` no se retira en el MVP.

**Intento de pago (`paymentAttempt.status`)**

La ausencia de intento equivale a "No iniciado" (no es un estado almacenado).

| Id | Etiqueta |
|---|---|
| `pending` | Pendiente |
| `completed_test` | Completado en Test Mode |
| `failed` | Fallido |
| `canceled` | Cancelado |

| Transición | Quién la dispara | Condición |
|---|---|---|
| (creación) -> `pending` | Servidor, al pedir el cliente propietario iniciar el pago | Proyecto en `proposal_selected`; no existe otro intento `pending`/`completed_test` para el proyecto |
| `pending -> completed_test` | Webhook de Stripe verificado (firma válida) | Evento de éxito; la página de retorno nunca dispara esta transición |
| `pending -> failed` | Webhook de Stripe verificado | Evento de fallo de pago |
| `pending -> canceled` | Webhook de Stripe verificado (sesión expirada) o cancelación explícita del servidor al abandonar la sesión | La redirección de cancelación del navegador solo informa; no cambia el estado por sí sola |

Estados terminales: `completed_test`, `failed`, `canceled`. Un reintento crea un intento nuevo. Un evento tardío o repetido nunca revierte `completed_test` ni reabre un estado terminal. La spec 010 detalla el mapeo exacto de eventos de Stripe.

**Transferencia al desarrollador (`transferStatus`)**

| Id | Etiqueta | Cuándo |
|---|---|---|
| `not_applicable` | No aplicable | Derivado: no existe pago `completed_test` para el proyecto. No se almacena |
| `pending_implementation` | Pendiente de implementación | Derivado en el MVP inicial: existe pago `completed_test` y Stripe Connect aún no está implementado |
| `simulated` | Simulada | Solo si la spec 011 incorpora Connect en test mode o simulación almacenada |

| Transición | Quién la dispara | Condición |
|---|---|---|
| `not_applicable -> pending_implementation` | Derivada automáticamente al pasar el pago a `completed_test` | Sin acción de usuario |
| `pending_implementation -> simulated` | Sistema (spec 011, última fase) | Pago `completed_test`; flujo de test aprobado |

Hasta la spec 011 no existe la tabla `simulatedTransfer`; el estado se deriva del pago (D6). Una transferencia `simulated` nunca se muestra como dinero recibido (BRIEF §7.14).

### RF5. Tarea documental `system-design.md` y `SETUP.md §4` (ver "Tareas")

`system-design.md` debe tener secciones numeradas estables para que los agentes puedan citarlas (`system-design.md §N`):

1. Visión y principios (resumen de `BRIEF §12`; reglas de negocio de `BRIEF §7` enlazadas, no copiadas)
2. Entidades y relaciones (RF1, con diagrama Mermaid `erDiagram`)
3. Propiedad de datos: Neon / Clerk / Stripe / Supabase Storage (RF2)
4. Estructura de módulos y dependencias permitidas (RF3)
5. Estados y transiciones (resumen y enlace a `state-machines.md`; subsecciones 5.1 proyecto, 5.2 propuesta, 5.3 pago, 5.4 transferencia)
6. Roles y permisos (matriz Visitante/Cliente/Desarrollador/Administrador × acciones, derivada de `BRIEF §4`; el detalle de enforcement es spec 004)
7. Pagos y webhooks: principios (verificación de firma, idempotencia, retorno del navegador no es fuente de verdad, Test Mode)
8. Decisiones registradas (confirmadas) y decisiones pendientes con su spec destino

`SETUP.md §4` ("Documentación de arquitectura") debe ser una tabla temática que mapea cada tema con el archivo y la sección de `docs/architecture/` a leer, y la instrucción de leer solo la sección correspondiente.

## 4. Requisitos no funcionales

- Los documentos están en español (como el resto de `docs/`); identificadores de entidades, campos y estados en inglés.
- Cada sección de `system-design.md` es autocontenida y breve (los agentes leen solo la sección citada). Sin duplicar contenido entre `system-design.md` y `state-machines.md`: el detalle de transiciones vive en `state-machines.md`; `system-design.md §5` solo resume y enlaza.
- Los documentos no contradicen `BRIEF.md` ni `SDD-PLAN.md`; ante conflicto, prevalece esta spec aprobada y se deja constancia.
- No se introducen entidades ni campos que el diseño visual aprobado y el brief no justifiquen (YAGNI).

## 5. Reglas de negocio

Se heredan de `BRIEF.md §7` (1-15). Esta spec las traduce a estructuras de dominio así:

| Regla BRIEF §7 | Traducción de dominio |
|---|---|
| 1, 3, 6 | `project.status = published` es la única condición que admite propuestas |
| 4, 5, 7 | `proposalSelection` 1:1 con proyecto; selección transaccional; solo el cliente propietario |
| 8 | Acceso a proyecto/propuesta/pago privados solo por propietario, autor o administrador (matriz en `system-design.md §6`) |
| 9, 10, 11, 12 | Estado de pago solo cambia por webhook verificado; idempotencia vía `processedPaymentEvent`; `failed`/`canceled` nunca pasan a `completed_test` |
| 13, 14, 15 | `livemode=false` siempre; transferencia independiente del pago; sin comisiones |

Reglas adicionales propuestas por esta spec (la persona que aprueba valida; ver sección 13): un desarrollador tiene como máximo una propuesta activa por proyecto (D5); un cliente no puede enviar propuestas a su propio proyecto; el rol se fija una sola vez al registrarse (D1).

## 6. Modelo de datos y migraciones

Esta spec define el modelo conceptual (RF1) únicamente. No genera migraciones ni schema. La spec 003 traducirá RF1 a Drizzle respetando:

- Unicidad de selección por proyecto y por propuesta (I1) a nivel de base de datos.
- Unicidad de `stripeEventId`, id de Checkout Session y de PaymentIntent.
- Como máximo un intento `pending`/`completed_test` por proyecto (índice único parcial).
- Los estados de RF4 como enums con exactamente esos identificadores.

## 7. Contratos de servidor o API

No aplica (no hay endpoints en esta spec). Solo se reserva la ubicación de la ruta de webhook (`src/app/api/webhooks/stripe/route.ts`, RF3) para la spec 010.

## 8. Permisos y seguridad

- Matriz de permisos de alto nivel (a documentar en `system-design.md §6`; enforcement en spec 004):

| Acción | Visitante | Cliente | Desarrollador | Administrador |
|---|---|---|---|---|
| Ver catálogo y detalle de proyectos `published` | sí | sí | sí | sí |
| Crear/editar/publicar/cerrar proyecto propio | no | sí | no | cierre/soporte |
| Ver propuestas de un proyecto | no | solo de proyectos propios | solo las propias | sí (lectura) |
| Enviar/retirar propuesta | no | no | sí (proyecto `published`) | no |
| Seleccionar propuesta | no | solo en proyecto propio | no | no |
| Iniciar pago de prueba | no | solo en proyecto propio con propuesta seleccionada | no | no |
| Ver estado de pago | no | proyectos propios | su propuesta ganadora | sí (lectura) |

- El rol de administrador se asigna fuera de la app (manualmente); el alcance exacto lo define la spec 004 (`BRIEF §4`).
- Información de contacto privada solo visible según permisos (`BRIEF §6.6`); la spec 013 define qué datos se muestran al desarrollador ganador.
- Los documentos de arquitectura no contienen secretos, claves ni valores reales de entorno.

## 9. Estados, errores y casos límite

Casos que los documentos deben dejar explícitos:

- Dos selecciones simultáneas del mismo proyecto: solo una gana; la otra recibe error de conflicto (I1).
- Retirada de propuesta concurrente con selección de esa propuesta: gana la que se confirma primero; la otra falla sin dejar estado inconsistente.
- Webhook repetido: no cambia estado (`processedPaymentEvent`).
- Webhook fuera de orden (ej. `canceled`/`failed` tras `completed_test`): se ignora la regresión.
- Pago fallido o cancelado: el proyecto permanece en `proposal_selected` y puede crearse un nuevo intento.
- Retorno del navegador a la URL de éxito antes del webhook: la UI muestra "verificando"; no se afirma pago completado.
- Cliente intenta cerrar un proyecto con pago `pending`: comportamiento a definir en spec 010/012 (ver D2).
- Usuario sin fila interna aunque exista en Clerk (primer ingreso, sincronización pendiente): spec 004.

## 10. Criterios de aceptación verificables

- AC1: existe `docs/architecture/system-design.md` con las 8 secciones numeradas de RF5, en ese orden y con esos títulos.
- AC2: `system-design.md §2` lista las 8 entidades de RF1 (Usuario/rol, Perfil del desarrollador, Proyecto, Propuesta, Selección, Intento de pago, Evento de pago procesado, Transferencia simulada) con campos de negocio y relaciones, incluye un diagrama Mermaid `erDiagram` y las invariantes I1-I5.
- AC3: `system-design.md §3` contiene una tabla que asigna cada categoría de dato de RF2 a exactamente una fuente de verdad (Neon, Clerk, Stripe o Supabase Storage) y declara que Nexora no almacena credenciales ni datos de tarjeta.
- AC4: `system-design.md §4` define los módulos `auth`, `users`, `projects`, `proposals` y `payments` con su responsabilidad y las dependencias permitidas de RF3, y no propone subcarpetas vacías ni módulos adicionales.
- AC5: `docs/architecture/state-machines.md` define las 4 máquinas (proyecto, propuesta, intento de pago, transferencia) con los identificadores y etiquetas exactos de RF4, cada transición con su disparador (rol o sistema/webhook) y condición, y los estados terminales.
- AC6: ninguna transición a `completed_test` ni a `contracted` tiene como disparador la página de retorno del navegador o una acción del cliente; ambas dependen de un webhook verificado.
- AC7: `state-machines.md` establece que la transferencia es independiente del pago y que `pending_implementation`/`simulated` nunca se muestran como dinero recibido.
- AC8: `docs/SETUP.md` contiene una sección `## 4.` que mapea al menos los temas auth/roles, datos/entidades, pagos y webhooks, estados, y módulos (inventario: no aplica, indicarlo) a `archivo#sección` existentes en `docs/architecture/`; las secciones 1-3 de `SETUP.md` no se modifican.
- AC9: todo enlace/cita de `SETUP.md §4` apunta a un archivo y sección que existen (verificable por búsqueda de los encabezados).
- AC10: los documentos no contienen código de la app, instrucciones de instalación ni valores de secretos.
- AC11: los identificadores de estado y entidades de los documentos son idénticos a los de esta spec (sin sinónimos).
- AC12: el único contenido modificado fuera de `docs/architecture/` es la adición de `## 4` en `docs/SETUP.md`; `git status` no muestra cambios en `src/`, `package.json` ni `.claude/`.

## 11. Pruebas requeridas

Ninguna prueba unitaria: no hay código de aplicación. La verificación del reviewer es documental: contrastar AC1-AC12 contra los tres archivos (lectura y búsqueda de encabezados/identificadores) y confirmar con `git status` que no hay cambios fuera de los archivos propios.

Esta spec fija, para las specs siguientes, qué pruebas serán obligatorias (se detallan en 003+ y 016): transiciones válidas e inválidas de cada máquina de estado (tests de servicio), idempotencia de webhooks, selección concurrente, schemas Zod de proyecto/propuesta.

## 12. Dependencias y riesgos

### Dependencias

- Spec 001 (aprobada). Decisiones humanas confirmadas listadas en la sección 2.
- Siguientes: 003 (schema) consume RF1/RF4; 004 (auth) consume RF2/§8; 008 y 009-011 consumen RF4.

### Riesgos

- Que las specs posteriores contradigan identificadores de estado. Mitigación: AC11 y citas obligatorias `system-design.md §N`.
- Sobre-modelar (YAGNI): la entidad de transferencia se difiere a la spec 011 (D6) y el perfil del desarrollador se mantiene mínimo.
- Divergencia entre `SETUP.md §4` y los documentos si estos cambian. Mitigación: T3 depende de T1 y T2; cualquier cambio posterior de secciones requiere actualizar `§4`.
- Ambigüedad "cerrar con pago pendiente" (D2): se deja registrada para no bloquear 003.

### Tareas

Máximo 5; 3 tareas, todas documentales. Cada archivo pertenece a una sola tarea. Los agentes `developer` aplican solo a estos archivos de `docs/`. No hay tarea `T0` (no hay `package.json`, `layout.tsx`, `globals.css` ni `shadcn add`).

#### T1 — `system-design.md`

- Archivos: `docs/architecture/system-design.md`
- Depende de: —
- Paralelizable: sí (con T2)
- Cubre: AC1, AC2, AC3, AC4, AC10, AC11
- Contenido requerido: RF1, RF2, RF3, matriz de RF8 (permisos), principios de pagos y decisiones de la sección 13; en `§5` solo resumen y enlace a `state-machines.md`.

#### T2 — `state-machines.md`

- Archivos: `docs/architecture/state-machines.md`
- Depende de: —
- Paralelizable: sí (con T1; ambos usan el vocabulario canónico fijado en esta spec)
- Cubre: AC5, AC6, AC7, AC10, AC11
- Contenido requerido: RF4 completo (tablas de estados y transiciones, terminales) más diagramas Mermaid `stateDiagram-v2` por máquina y los casos límite de la sección 9.

#### T3 — `SETUP.md §4`

- Archivos: `docs/SETUP.md`
- Depende de: T1, T2
- Paralelizable: no
- Cubre: AC8, AC9, AC12
- Contenido requerido: añadir al final `## 4. Documentación de arquitectura`, con: regla de lectura (solo la sección necesaria, citar como `system-design.md §N`), tabla tema -> `archivo §sección` (auth/roles -> `system-design.md §6`; entidades y datos -> `§2` y `§3`; módulos -> `§4`; estados -> `§5` y `state-machines.md`; pagos/webhooks -> `§7`; decisiones -> `§8`; inventario -> no aplica), y la regla de que cambios de arquitectura requieren spec aprobada. No se modifican las secciones 1-3.

## 13. Decisiones pendientes

### Ya confirmadas (no requieren aprobación; ver sección 2)

Stack del BRIEF §9; Stripe Connect como último paso (011) con transferencia "pendiente de implementación" mientras tanto; prefijo `NNN-slug.md`; esta spec crea `system-design.md` y `SETUP.md §4`.

### Pendientes de aprobación humana

- **D1. Roles.** Propuesta: un solo rol por usuario (`client` | `developer` | `admin`) elegido al registrarse y no modificable en el MVP; fuente de verdad en Neon (`user.role`), con posible caché en metadata de Clerk. Alternativa: un usuario con ambos roles. Impacta 003/004.
- **D2. Cierre con pago en curso y cancelación tras selección.** Propuesta: `proposal_selected -> closed` permitido mientras no exista pago `completed_test`; si hay un intento `pending`, hay que cancelarlo o esperar su resolución (detalle en 010/012). Alternativa: permitir reabrir la selección (`proposal_selected -> published`) para elegir otra propuesta. Propuesta de esta spec: no reabrir en el MVP.
- **D3. Despublicar.** Propuesta: `published -> draft` solo sin propuestas. Alternativa: no permitir despublicar.
- **D4. Ubicación del perfil del desarrollador.** Propuesta: dentro del módulo `users` (sin módulo `profile` separado). Alternativa: módulo `profiles`.
- **D5. Una propuesta por desarrollador por proyecto.** Propuesta: restricción de unicidad (editable mientras `pending`; retirada y nueva propuesta no permitida en el MVP). Alternativa: permitir reenviar tras retirar.
- **D6. Entidad de transferencia.** Propuesta: no crear `simulatedTransfer` hasta la spec 011; antes, `transferStatus` se deriva del pago. Alternativa: crear la tabla desde 003 con estado `pending_implementation`.
- **D7. Ubicación del cliente Drizzle y schema** (`src/lib/db` vs otra): se decide en spec 003; aquí solo se reserva `src/lib/db`.
- **D8. Alcance del rol administrador.** Propuesta: lectura de proyectos/propuestas/pagos y cierre de proyectos; sin moderación. Se confirma en spec 004.
- **D9. Moneda.** Propuesta: solo USD en el MVP, almacenada con el importe (`BRIEF §10`: sin multimoneda), y número de decimales/centavos a decidir en 003.
- **D10. Pendientes de 001 que siguen abiertos** y que esta spec no resuelve: convención de variables de entorno y `.env.example` (se propone resolver en 009/017).

## 14. Estado de aprobación

Estado: borrador. Requiere revisión y aprobación humana explícita antes de lanzar a `developer`. Pendiente de aprobar: la sección 13 (D1-D10) y el contenido normativo de RF1-RF4. Una edición posterior a la aprobación devuelve la spec a `borrador`.

## Preguntas abiertas

Ver sección 13 (decisiones pendientes D1-D10). No hay otras.

## Próximas fases

- Spec 003 `database-schema.md`: traducir RF1/RF4 a Drizzle.
- Spec 004 `authentication-and-authorization.md`: Clerk, sincronización de usuario, roles, guards.
- Specs 005-008: proyectos, catálogo, propuestas, selección.
- Specs 009-011: Stripe Checkout test, webhooks e idempotencia, y Stripe Connect en test mode como último paso.

# Gestión de propuestas del desarrollador (Fase 2 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §5` (Spec 007), `docs/BRIEF.md §6.3` y `§7` (reglas 2, 3, 7, 8). Dominio: `docs/architecture/system-design.md §2` (entidades propuesta/selección, invariantes I1-I5), `§4` (módulos y dependencias; excepción de esquema D-B de la spec 005), `§6` (permisos), `§8` (D5, D8, D9); `docs/architecture/state-machines.md §1` (solo `published` admite propuestas) y `§2` (propuesta: `pending`/`accepted`/`rejected`/`withdrawn`, quién dispara cada transición). Esquema usado: `src/modules/proposals/schema/proposals.table.ts` (spec 003, done). Autorización: spec 004 (done), `src/modules/auth`. Bases: spec 005 (done, patrón de servicio/actions/listado), spec 006 (done, punto de extensión `proposal-cta.tsx`). Diseño visual: solo referencia (formulario precio/plazo/descripción, panel del desarrollador con pestañas por estado, tabla comparativa del cliente con panel de detalle); no es contrato.

## 1. Objetivo

Que un desarrollador pueda enviar una propuesta a un proyecto `published`, editarla mientras está `pending` y retirarla, y ver "Mis propuestas"; y que el cliente dueño pueda consultar y comparar las propuestas recibidas de un proyecto propio (precio, plazo, descripción) sin ver el contacto del desarrollador. Todas las reglas de estado, propiedad y privacidad se aplican en el servidor. Entrega:

- Contrato de servicio `src/modules/proposals/services/proposal.service.ts` (crear, editar, retirar, mis propuestas, propuesta propia de un proyecto, propuestas de un proyecto propio, detalle de una propuesta de proyecto propio) y errores de dominio `ProposalError`.
- Función de transición hoja `proposal-transitions.ts` (`pending -> rejected` al cerrar el proyecto) que sustituye el `UPDATE` directo de la spec 005 (decisión D-E).
- Schemas Zod (precio USD con conversión a centavos, plazo, descripción, `searchParams` de los dos listados) y tipos con proyecciones explícitas por rol.
- Server actions delgadas (crear, editar, retirar).
- UI: formulario/estado de la propuesta propia en el detalle público `/projects/[id]` (reemplaza el placeholder de 006), "Mis propuestas" (`/dashboard/proposals`) y propuestas recibidas del cliente (`/projects/[id]/proposals`), con enlace desde "Mis proyectos".

No define la selección de propuesta ni el botón "Seleccionar esta propuesta" (spec 008), pagos (009-011), paneles completos (012/013) ni notificaciones.

## 2. Contexto y alcance

Decisiones humanas ya aprobadas: D5 (una propuesta por desarrollador por proyecto; editable mientras `pending`; sin reenvío tras retirar; retirar solo en `pending` y antes de la selección); solo el rol `developer` envía (D1); el cliente dueño las consulta pero no las selecciona aquí; recurso privado ajeno -> 404, 403 solo por rol; autorización siempre en servidor; dinero en centavos USD (`usdToCents`/`formatUsd`, D9) y CHECKs de 003; un desarrollador no puede proponer en un proyecto no `published`; Stripe Connect al final. Privacidad: el contacto del desarrollador no se expone al cliente hasta ser seleccionado (`BRIEF §6.6`; lo define 013), la lista pública no expone propuestas ni `clientId`.

- Incluye:
  - Servicio, schemas, tipos, errores y server actions en `src/modules/proposals`.
  - `withdrawnAt` (escrito al retirar; ver RF3).
  - Transición hoja `pending -> rejected` y refactor de una línea en `project.service.ts` (D-E) con la nota de arquitectura en `system-design.md §4`.
  - Sección de propuesta propia en el detalle público (vía `proposal-cta.tsx`), `/dashboard/proposals` y `/projects/[id]/proposals`.
  - Enlace "Ver propuestas" desde "Mis proyectos".
  - Dos piezas compartidas pequeñas: `form-field.tsx` (extraído de `project-form.tsx`, D-K) y `pagination-nav.tsx`.
- No incluye:
  - Selección de propuesta, `pending -> accepted`, transición `published -> proposal_selected`, rechazo de las demás al seleccionar (008). Solo queda un punto de extensión (RF8).
  - Pagos, contacto del desarrollador, perfil público del desarrollador, panel `/dashboard` de cualquier rol (012/013), notificaciones, adjuntos, comentarios o negociación.
  - Vista de admin (D-L de 005): el servicio permite lectura al admin (D8, `§6`) pero no hay pantalla.
  - Cambios de esquema o migraciones (ver 6), dependencias npm, componentes shadcn nuevos.
  - Enlace a "Mis propuestas" en el header global (el header no conoce el rol; 006 D-H/013). El acceso es desde el detalle público (RF8).

### Reutilizar (inventario verificado con Glob/Read)

| Existente | Uso en 007 |
|---|---|
| `src/modules/proposals/schema/proposals.table.ts` | Sin cambios. CHECK `price_cents > 0`, `currency = 'USD'`, `timeline_weeks > 0`; UNIQUE `proposals_project_developer_unique (project_id, developer_id)`; índice parcial una `accepted` por proyecto (no lo toca 007); `proposals_developer_created_idx (developer_id, created_at desc)` sirve a "Mis propuestas"; `withdrawn_at` nullable. `proposal-selections.table.ts`: no se usa |
| `src/modules/projects/schema/projects.table.ts` | Solo lectura (estado, dueño, título) con proyección explícita; lock de fila del proyecto en `createProposal` |
| `src/modules/auth/**` | `requireRole`, `requireOwnership`, `can` (`proposal.create\|withdraw\|read` ya existen), `AuthError`, `handleAuthErrorForPage`, `getCurrentUser` (cacheado), tipos `AuthUser`/`Action`. No se crean guards ni acciones nuevas en la matriz (ver discrepancias) |
| `src/modules/projects/services/project.service.ts` | Patrón a seguir (`assertCan`, `loadOwned`, transacciones, `UPDATE ... WHERE status`, `.for("update")`). Se modifica una línea (T2) |
| `src/modules/projects/services/project-errors.ts` | Patrón de `ProposalError` (código, `status`, mapa código -> estado HTTP) |
| `src/modules/projects/services/public-catalog.service.ts` (`getPublicProject`, ya `cache`) | La sección del desarrollador lo usa para mostrar el presupuesto del cliente como ayuda (sin consulta extra por petición). No se modifica |
| `src/modules/projects/components/proposal-cta.tsx` | Punto de extensión de 006: se modifica solo la rama `developer` (T4) |
| `src/modules/projects/components/project-list.tsx`, `project-form.tsx`, `project-status-badge.tsx`, `projects-loading.tsx`, `projects-error.tsx` | Patrón visual y de listado (chips de filtro como `<nav>` de enlaces, paginación, vacío). `project-list.tsx` recibe el enlace (T5); `project-form.tsx` se refactoriza para usar `FormField` (T4). Loading/error no se reutilizan (textos "proyectos" fijos): se crean `proposals-loading/error` genéricos |
| `src/lib/money.ts` | `usdToCents`, `centsToUsd`, `formatUsd` |
| `src/lib/db/client.ts`, `src/lib/db/test-db.ts` | Cliente con transacciones (Pool neon-serverless) y PGlite con migraciones reales; patrón de mock de `project.service.test.ts` |
| `src/modules/projects/schemas/project.schema.ts` (`PROJECT_LIMITS`) | Fuente de los límites de precio y plazo (D-A) |
| `src/components/ui`: `button`, `input`, `textarea`, `label`, `badge` | Formulario, acciones, badge de estado. No se añade ningún componente shadcn (las "pestañas" son enlaces como en 005, no `tabs`; la tabla es `<table>` semántica con Tailwind) |
| `src/components/shared/empty-state.tsx` | Estados vacíos |
| `src/modules/auth/actions/complete-onboarding.action.ts`, `src/modules/projects/actions/project.actions.ts` | Patrón de server actions (auth -> validar -> servicio -> revalidate; `redirect` fuera de `try`) |

No existen `src/hooks` ni stores; no se necesitan.

## 3. Requisitos funcionales

### RF1. Operaciones y contrato de servicio (punto 1)

Archivo `src/modules/proposals/services/proposal.service.ts` (`import "server-only"`; todas lanzan `AuthError` o `ProposalError`; cada función recibe `actor: AuthUser` y repite `can`/rol, nunca confía en quien llama):

```ts
createProposal(actor, projectId: string, input: ProposalInput): Promise<DeveloperProposal>
updateProposal(actor, proposalId: string, input: ProposalInput): Promise<DeveloperProposal>
withdrawProposal(actor, proposalId: string): Promise<DeveloperProposal>
listMyProposals(actor, query: Partial<MyProposalsQuery>): Promise<MyProposalsPage>
getMyProposalForProject(actor, projectId: string): Promise<DeveloperProposal | null>      // "detalle propia"
listProjectProposals(actor, projectId: string, query: Partial<ProjectProposalsQuery>): Promise<ProjectProposalsPage>
getProjectProposal(actor, projectId: string, proposalId: string): Promise<ClientProposalDetail>   // "detalle de proyecto propio"
export const MY_PROPOSALS_PAGE_SIZE = 10;
export const PROJECT_PROPOSALS_PAGE_SIZE = 20;
```

| Operación | Quién | Autorización (en este orden) |
|---|---|---|
| `createProposal` | `developer` | `can(role, "proposal.create")` -> si no, `FORBIDDEN` (client y admin) |
| `updateProposal` | `developer` autor | `can(role, "proposal.create")` (no hay `proposal.update` en la matriz de 004; se reutiliza, como 005 reutilizó `project.publish`); carga la propuesta; `developerId !== actor.id` o inexistente -> `NOT_FOUND` |
| `withdrawProposal` | `developer` autor | `can(role, "proposal.withdraw")`; mismo `NOT_FOUND` |
| `listMyProposals`, `getMyProposalForProject` | `developer` | `can(role, "proposal.read")` y `role === "developer"` (client/admin -> `FORBIDDEN`: "mis propuestas" solo tiene sentido para el autor); siempre `WHERE developer_id = actor.id` |
| `listProjectProposals`, `getProjectProposal` | `client` dueño del proyecto, `admin` (lectura) | `can(role, "proposal.read")` y `role !== "developer"` (un desarrollador no consulta las propuestas de otros: `FORBIDDEN`); proyecto leído con `select({ clientId })`, inexistente o ajeno -> `NOT_FOUND` vía `requireOwnership(actor, clientId, { allowAdmin: true })` |

Notas:

- Un id de propuesta inexistente y uno ajeno dan el mismo `AuthError("NOT_FOUND")` (404). En `getProjectProposal`, una propuesta de otro proyecto, inexistente o `withdrawn` también es `NOT_FOUND`.
- `proposal.read` está concedido a los tres roles en `permissions.ts` y no distingue "propias" de "de mi proyecto": por eso los dos grupos añaden la comprobación de rol explícita. No se modifica la matriz de 004 (ver discrepancias).
- `listMyProposals`/`listProjectProposals` validan `query` con los schemas de RF2 (valores inválidos caen al default; el servicio nunca lanza por query).
- `clientId`, `developerId`, email, `clerkUserId` y cualquier campo no listado en las proyecciones de RF6 nunca salen del servicio: las consultas declaran columna por columna (sin `select()` ni `returning()` crudo hacia la UI).
- Errores de dominio (`src/modules/proposals/services/proposal-errors.ts`, mismo estilo que `ProjectError`; las fallas de autorización siguen siendo `AuthError`, no se duplican):

```ts
type ProposalErrorCode =
  | "PROJECT_NOT_OPEN"      // el proyecto existe y fue público pero ya no admite propuestas
  | "ALREADY_PROPOSED"      // UNIQUE (project_id, developer_id): ya existe una propuesta (pending/accepted/rejected)
  | "RESEND_NOT_ALLOWED"    // D5: la propuesta del par fue retirada; no se reenvía
  | "INVALID_STATE";        // editar/retirar una propuesta que ya no está pending
type ProposalError extends Error { code: ProposalErrorCode; status: 409 }
```

### RF2. Validaciones y límites (punto 2; decisión D-A)

`src/modules/proposals/schemas/proposal.schema.ts` (la carpeta `schemas/` es la convención de SETUP §1; `schema/` guarda solo las tablas Drizzle). Zod `^4.6.5` (`z.flattenError`, no `.flatten()`).

`PROPOSAL_LIMITS` importa de `PROJECT_LIMITS` lo que debe coincidir por dominio y define lo propio:

| Campo | Regla | Coherencia con 003 |
|---|---|---|
| `priceCents` | entero, `PROJECT_LIMITS.budgetCents` = 100 (USD 1) a 100_000_000 (USD 1.000.000) | CHECK `price_cents > 0` (la app es más estricta); el tope es menor que el máximo de `int4` de la columna (2.147.483.647) |
| `timelineWeeks` | entero, `PROJECT_LIMITS.timelineWeeks` = 1-104 | CHECK `timeline_weeks > 0` |
| `description` | `trim`, 30-5000 caracteres | `text NOT NULL`, sin tope en BD |
| `currency` | no es entrada: la columna toma su default `USD` | CHECK `currency = 'USD'` (D9) |

- El precio de la propuesta NO se restringe al rango de presupuesto del proyecto (D-B): el cliente compara ofertas por encima o por debajo; la UI muestra el presupuesto del cliente como ayuda.
- Formulario (strings): `priceUsd`, `timelineWeeks`, `description`. `parseProposalForm(formData): { success: true; data: ProposalInput } | { success: false; fieldErrors: Partial<Record<ProposalFieldName, string>>; values: Record<ProposalFieldName, string> }`. Convierte `priceUsd` con `usdToCents` (los errores de `priceCents` se re-etiquetan a `priceUsd`; un valor no parseable es error de campo, no excepción); devuelve `values` para repoblar tras un error (mismo patrón que `parseProjectForm`); mensajes en español, una cadena por campo.
- Queries (`searchParams`, defaults con `.catch`, nunca error):
  - `myProposalsQuerySchema`: `status` (`all|pending|accepted|rejected|withdrawn`, default `all`), `page` (entero >= 1, default 1).
  - `projectProposalsQuerySchema`: `sort` (`recent` default | `price_asc` | `timeline_asc`), `page` (>= 1), `proposal` (UUID opcional para el panel de detalle; inválido -> `undefined`).
  - Tamaños de página fijos (constantes del servicio; no controlables por URL).

### RF3. Elegibilidad, atomicidad y concurrencia (punto 3; decisiones D-C, D-D)

`state-machines.md §2` es normativa; aquí se fijan las guardas de implementación.

**`createProposal`** (transacción; mismo estilo que `unpublishProject`/`closeProject`):

1. `assertCan(proposal.create)`.
2. `db.transaction`: `select({ id, status, clientId }) from projects where id = ? FOR SHARE`.
   - No existe -> `AuthError("NOT_FOUND")`.
   - `status = 'draft'` -> `AuthError("NOT_FOUND")` (un borrador nunca fue público; el 404 no revela su existencia, igual que 006 R5).
   - `status` en `proposal_selected | contracted | closed` -> `ProposalError("PROJECT_NOT_OPEN")` (el proyecto fue público; mensaje útil al desarrollador que tenía la página abierta).
3. `insert into proposals (projectId, developerId = actor.id, priceCents, timelineWeeks, description) ... ON CONFLICT (project_id, developer_id) DO NOTHING RETURNING *`.
   - Sin fila devuelta (conflicto con el UNIQUE) -> se lee la propuesta existente del par: `withdrawn` -> `RESEND_NOT_ALLOWED`; cualquier otro estado -> `ALREADY_PROPOSED`.
4. `developerId` sale de `actor.id`, nunca del input; `status` toma el default `pending`; `withdrawnAt` queda `null`.

Justificación de la guarda de elegibilidad (decisión D-D): se elige **transacción con `SELECT ... FOR SHARE` del proyecto** frente a un `INSERT ... SELECT ... WHERE status='published'` sin lock.

- Bajo `READ COMMITTED` un insert condicionado por un subselect sin lock no impide que un `closeProject`/`unpublishProject` concurrente confirme entre la comprobación y el insert (el subselect no bloquea la fila del proyecto), dejando una propuesta `pending` en un proyecto `closed`. Es exactamente el riesgo residual R6 de la spec 005.
- `FOR SHARE` entra en conflicto con el `FOR UPDATE` que ya toman `unpublishProject` y `closeProject` (005): o bien el cierre/despublicación confirma primero y `createProposal` ve el estado nuevo (`NOT_FOUND`/`PROJECT_NOT_OPEN`), o bien la propuesta confirma primero y entonces `unpublishProject` ve la propuesta y falla con `HAS_PROPOSALS` (D3), y `closeProject` la pasa a `rejected` en su transacción. En ningún orden queda una propuesta `pending` en un proyecto no `published`.
- `FOR SHARE` (no `FOR UPDATE`): varios desarrolladores pueden proponer a la vez sin serializarse entre sí; solo chocan con las transiciones del proyecto.
- `ON CONFLICT DO NOTHING` en vez de capturar el error 23505: el UNIQUE sigue siendo el árbitro (sin pre-lectura con carrera), no se aborta la transacción de Postgres por un error SQL y no se depende del formato del error (drizzle 0.45 envuelve los errores de driver en `DrizzleQueryError`). Dos envíos simultáneos del mismo desarrollador: uno inserta y el otro recibe `ALREADY_PROPOSED`.
- Un desarrollador no puede proponer en un proyecto propio: solo `client` crea proyectos (005, `project.create`) y D1 impide que un usuario sea ambos, de modo que ningún desarrollador es dueño de un proyecto. La comprobación de rol de `assertCan` basta; no se añade una guarda `clientId === actor.id` (YAGNI). Un test siembra el caso imposible solo para documentar que el rol bloquea antes.

**`updateProposal`**:

1. `assertCan(proposal.create)`; leer `select({ id, developerId, status }) from proposals where id = ?` (inexistente o ajeno -> `NOT_FOUND`).
2. `UPDATE proposals SET priceCents, timelineWeeks, description WHERE id = ? AND developer_id = actor.id AND status = 'pending' RETURNING ...` (lista de columnas del `SET` explícita: nunca `status`, `projectId`, `developerId`, `withdrawnAt`; `updatedAt` lo mantiene `$onUpdate`).
3. 0 filas -> `ProposalError("INVALID_STATE")` ("la propuesta ya no está pendiente"): una selección o retirada concurrente cambió el estado. Cubre `accepted`, `rejected` y `withdrawn`.
4. No se bloquea el proyecto: `pending` implica proyecto `published` por construcción (el cierre de 005 y la selección de 008 pasan las `pending` a `rejected` en la misma transacción), y el `WHERE status = 'pending'` es la guarda atómica (mismo estilo que `WHERE status = ...` de `project.service`).

**`withdrawProposal`**:

1. `assertCan(proposal.withdraw)`; misma lectura/ownership.
2. `UPDATE proposals SET status = 'withdrawn', withdrawnAt = now() WHERE id = ? AND developer_id = actor.id AND status = 'pending' RETURNING ...`. 0 filas -> `INVALID_STATE` (incluye "ya retirada", "ya aceptada/rechazada" y "gana la selección concurrente", `state-machines.md §5`).
3. `state-machines §2` condiciona la retirada a "proyecto `published`": se garantiza por el invariante `pending => published` (arriba), sin join ni bloqueo adicional.
4. `withdrawnAt` solo se escribe aquí; la tabla no tiene CHECK que relacione `withdrawn_at` con el estado (a diferencia de `projects_closed_at_matches_status`), por lo que la consistencia la fija el servicio y la prueba (AC8). No se añade migración (ver 6).
5. No hay reenvío: la fila retirada sigue ocupando el UNIQUE del par (D5); `createProposal` devuelve `RESEND_NOT_ALLOWED`.

### RF4. Transición `pending -> rejected` y excepción D-B de 005 (punto 4; decisión D-E)

Decisión: **007 introduce la función de transición de `proposals` y refactoriza el `UPDATE` de 005**, en lugar de aplazarlo a 008.

- Nueva función hoja `src/modules/proposals/services/proposal-transitions.ts`:

```ts
rejectPendingProposals(executor: Pick<typeof db, "update">, projectId: string): Promise<number>   // nº de filas
// UPDATE proposals SET status = 'rejected' WHERE project_id = ? AND status = 'pending'
```

  Recibe el `tx` por parámetro: no importa `db`, no importa nada de `projects` y no hace `server-only` runtime propio (el `tx` ya viene de un servicio server-only), por lo que es una hoja pura de dependencias y es testeable con PGlite sin mocks.
- `project.service.ts` (`closeProject`, rama `observed === "published"`): el `UPDATE proposals ...` directo se sustituye por `await rejectPendingProposals(tx, projectId)`. Mismo SQL, misma transacción, mismo orden; los tests de 005 no cambian ni se tocan (siguen verificando el comportamiento: solo `pending` -> `rejected`, otras propuestas intactas, otros proyectos intactos).
- Por qué ahora y no en 008: 007 es la spec dueña de la máquina de estados de la propuesta (`state-machines §2`, "Las transiciones entre módulos se hacen mediante funciones de transición expuestas por el módulo dueño"); la nota de `system-design.md §4` y R3/Próximas fases de 005 prometen explícitamente ese reemplazo "cuando exista 007"; el cambio es de una línea y verificable con los tests existentes; y 008 reutiliza el mismo archivo para añadir `pending -> accepted` y el rechazo de las demás en su transacción.
- Dirección de dependencias sin ciclos de archivos: `project.service.ts` -> `proposal-transitions.ts` (hoja, solo importa la tabla `proposals`); `proposal.service.ts` -> tablas de `projects` (nunca `project.service.ts`). `proposal-transitions.ts` nunca importa de `projects` ni de `proposal.service.ts`. A nivel de módulo `projects -> proposals` y `proposals -> projects` coexisten, lo que ya ocurría en el esquema (003/005); se documenta como excepción acotada:
  - Escritura: `projects` solo puede invocar funciones de `proposals/services/proposal-transitions.ts` (hojas). Ya no hace SQL de escritura sobre `proposals`.
  - Lectura: `projects` conserva la lectura de las tablas `proposals`/`payments` para `proposalCount` y `HAS_PROPOSALS` (D3) y el chequeo de pagos (D2); sin servicios.
  - UI (D-H): `projects/components/proposal-cta.tsx` importa la sección del desarrollador de `proposals/components` (el punto de extensión que 006 reservó).
- Impacto en `docs/architecture/system-design.md §4`: reescribir la regla "Excepción de esquema (spec 005, D-B)" para reflejar los tres puntos anteriores (T2). No cambian entidades, estados ni la tabla de dependencias permitidas salvo esa nota. La nota del reviewer: si se rechaza D-E, T2 no toca `project.service.ts` ni `system-design.md` y el `UPDATE` de 005 se traslada tal cual a 008.

### RF5. Server actions (punto 5; decisión D-F)

Decisión: server actions (no route handlers), consistente con 005: los consumidores son formularios y botones de la propia app (`<form action>` + `useActionState`: progressive enhancement, `pending` y errores por campo sin código de red), no hay clientes externos ni API pública de propuestas (YAGNI). Las lecturas de las páginas se hacen en Server Components llamando al servicio. Cuidados heredados de la guía de Next 16 (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `forms.md`, verificados en 005; el developer re-verifica cada firma): un action es un endpoint POST alcanzable directamente, por lo que re-autentica y re-autoriza (`requireRole("developer")`) aunque la UI ya lo haya hecho; `redirect()`/`notFound()` lanzan por diseño y no van dentro de un `try` que los capture.

Archivo `src/modules/proposals/actions/proposal.actions.ts` (`"use server"`, solo exporta funciones async):

```ts
createProposalAction(projectId: string, prev: ProposalFormState, formData: FormData): Promise<ProposalFormState>   // .bind(null, projectId)
updateProposalAction(proposalId: string, prev: ProposalFormState, formData: FormData): Promise<ProposalFormState> // .bind(null, proposalId)
withdrawProposalAction(proposalId: string): Promise<ProposalActionResult>
```

- Todas: `requireRole("developer")` -> validar id como UUID (uno mal formado devuelve el mismo resultado que uno inexistente: `NOT_FOUND`, sin tocar BD) -> `parseProposalForm` -> servicio -> `revalidatePath` -> resultado. Con `AuthError` distinto de `NOT_FOUND`: `handleAuthErrorForPage` (redirige o 404); `NOT_FOUND` -> mensaje en el estado; `ProposalError` -> mensaje en español por código; validación -> `{ status: "error", message, fieldErrors, values }`; otro error -> mensaje genérico sin detalles de BD.
- `revalidatePath` tras éxito: `/dashboard/proposals`, `/projects/<projectId>` (detalle público), `/projects/<projectId>/proposals`, y en crear/retirar también `/dashboard/projects` y `/projects/<projectId>/edit` (el conteo de propuestas gobierna "Despublicar" en 005). `projectId` en update/withdraw sale de la fila devuelta por el servicio.
- Contratos (en `proposal.types.ts`):

```ts
type ProposalFieldName = "priceUsd" | "timelineWeeks" | "description";
type ProposalFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors: Partial<Record<ProposalFieldName, string>>; values: Record<ProposalFieldName, string> };
type ProposalActionResult = { ok: true } | { ok: false; code: ProposalErrorCode | "NOT_FOUND" | "UNKNOWN"; message: string };
```

- Éxito de crear/editar: devuelve `{ status: "success" }` (sin `redirect`: el desarrollador permanece en la página; la revalidación re-renderiza la sección con la propuesta enviada). Mensajes (mapa código -> español en la action): `PROJECT_NOT_OPEN` "Este proyecto ya no admite propuestas."; `ALREADY_PROPOSED` "Ya enviaste una propuesta a este proyecto."; `RESEND_NOT_ALLOWED` "Retiraste tu propuesta a este proyecto y no es posible enviar otra."; `INVALID_STATE` "La propuesta ya no está pendiente y no se puede modificar.".

### RF6. Proyecciones y privacidad (decisión D-G)

Tipos en `src/modules/proposals/types/proposal.types.ts`:

```ts
type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];
type ProposalInput = { priceCents: number; timelineWeeks: number; description: string };   // z.infer
type DeveloperProposal = { id; projectId; status; priceCents; timelineWeeks; description; createdAt; updatedAt; withdrawnAt: Date | null };
type DeveloperProposalListItem = Omit<DeveloperProposal, "description"> & { projectTitle: string; projectStatus: ProjectStatus };
type ClientProposalSummary = { id; developerName: string; priceCents; timelineWeeks; status; createdAt; updatedAt };
type ClientProposalDetail = ClientProposalSummary & { description: string };
type Paged<T> = { items: T[]; total; page; pageSize; totalPages };   // MyProposalsPage, ProjectProposalsPage
const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string>;   // Pendiente | Aceptada | Rechazada | Retirada (state-machines §2)
```

- Vista del cliente (la sensible): `developerName` = `users.display_name` y nada más del usuario. Justificación: el cliente necesita saber con quién compara; el nombre visible es el dato de `users` pensado para listados (`system-design.md §3`) y no es contacto; **nunca** email, `clerkUserId`, `developerId` ni datos del perfil (el externalUrl del perfil es contacto potencial). El contacto del ganador y qué ve el cliente del perfil se definen en 013 (`BRIEF §6.6`). Se usa `join` a `users` con `select({ displayName: users.displayName })` explícito.
- Las propuestas `withdrawn` no se muestran al cliente (una oferta retirada no es una oferta): `WHERE status <> 'withdrawn'` en lista y detalle. `proposalCount` de 005 cuenta todas las filas (D-D de 005) y por eso el enlace "Ver propuestas" no muestra un número.
- Vista del desarrollador: solo filas propias (`developer_id = actor.id`); `join` a `projects` solo para `title` y `status` (el título ya es público). Nunca ve propuestas de otros ni `clientId`.
- `updatedAt` se incluye en `ClientProposalSummary` para que 008 pueda exigir al seleccionar que la propuesta no cambió desde que el cliente la vio (ver Próximas fases: el desarrollador puede editar una `pending` mientras el cliente la compara).
- El catálogo/detalle público (006) no se toca: sigue sin exponer propuestas ni `clientId`.

### RF7. Listados (paginación, filtros, orden)

- `listMyProposals`: filtro `status` (o `all`), orden fijo `created_at desc, id desc` (índice `proposals_developer_created_idx`), 10 por página, paginación por offset con `count(*)::int` aparte (mismo razonamiento que 005 RF6/006 D-B: volumen bajo, UI "Página X de Y").
- `listProjectProposals`: sin filtro de estado (YAGNI); orden `recent` (`created_at desc, id desc`), `price_asc` (`price_cents asc, created_at desc, id desc`), `timeline_asc` (`timeline_weeks asc, price_cents asc, id desc`); 20 por página, offset. Desempate por `id` siempre (orden total estable). Sin índice dedicado (el conjunto es el de un proyecto; `proposals_project_developer_unique` ya cubre el filtro por `project_id`).
- `getProjectProposal` valida que la propuesta pertenezca al proyecto de la URL y no esté `withdrawn`.

### RF8. UI y páginas (punto 6)

Páginas delgadas en `src/app` (solo routing; `params`/`searchParams` son `Promise` en Next 16; se hace `await`), componentes en `src/modules/proposals/components`.

**a) Detalle público `/projects/[id]` (sin modificar `page.tsx` ni `public-project-detail.tsx`).** El contrato de 006 T3 se conserva: `ProposalCta` sigue recibiendo solo `{ projectId, viewer }` y las demás ramas (visitante, sin onboarding, cliente dueño/ajeno, admin) no cambian. Solo la rama `viewer.role === "developer"` deja de mostrar el texto "El envío de propuestas estará disponible pronto" y renderiza `<DeveloperProposalSection projectId={projectId} />`, un Server Component asíncrono de `proposals/components` (se evita así pasar datos por `page.tsx` y no se toca nada más del detalle; D-H).

`DeveloperProposalSection`:

1. `getCurrentUser()` (cacheado, sin consulta extra) y `getMyProposalForProject(actor, projectId)` dentro de `try/catch`: un error inesperado muestra una nota "No pudimos cargar tu propuesta" y no rompe la página pública (misma filosofía que `resolvePublicViewer` en 006).
2. Sin propuesta -> `ProposalForm` de creación (precio USD, plazo en semanas, descripción), con el presupuesto del cliente como ayuda (`getPublicProject`, cacheado) y la nota "Podrás editarla mientras esté pendiente. Si la retiras, no podrás enviar otra a este proyecto."
3. Con propuesta -> `OwnProposalCard`: estado (badge), precio, plazo, fecha de envío, descripción. En `pending`: botones "Editar" (cambia el mismo componente a modo edición con `ProposalForm`) y "Retirar" (`window.confirm` provisional como en 005; la spec 014 lo sustituye). En `withdrawn` (y defensivamente `accepted`/`rejected`): solo lectura con la nota de D5 "Retiraste esta propuesta. No es posible enviar otra a este proyecto." No muestra contacto ni pago.
4. Enlace "Mis propuestas" (`/dashboard/proposals`) bajo el formulario/tarjeta: es el acceso del desarrollador a su panel mientras no exista header por rol.

Estados que pidió el requerimiento: "no autenticado / otro rol" ya los resuelve `ProposalCta` (006); "ya enviada" lo cubre la tarjeta; **"proyecto no publicado" es inalcanzable en esta página** porque 006 RF3 devuelve 404 para todo proyecto no `published`; solo puede ocurrir como carrera al enviar, y se muestra como error de formulario `PROJECT_NOT_OPEN`/`NOT_FOUND` (RF5). En "Mis propuestas" el estado del proyecto sí se muestra (b).

`ProposalForm` (cliente, `useActionState`, mismo patrón que `ProjectForm`): `FormField` compartido, `aria-invalid`/`aria-describedby`, región `aria-live="polite"`, `inputMode="decimal"` para el precio, `disabled` mientras `pending`, valores repoblados tras error. A 390 px una columna, controles >= 40 px.

**b) "Mis propuestas" `/dashboard/proposals`** (D-L): `requireRole("developer")` + `handleAuthErrorForPage`; `listMyProposals`. Cabecera `<h1>`; pestañas por estado como `<nav aria-label="Filtrar por estado">` de enlaces con `aria-current` (Todas, Pendientes, Aceptadas, Rechazadas, Retiradas; patrón de chips de 005, no el rol ARIA `tab` porque navegan); lista (`<ul>`) con, por propuesta: título del proyecto (enlace a `/projects/<id>` solo si `projectStatus === "published"`; si no, texto plano, porque el detalle público respondería 404), badge de estado, precio (`formatUsd`), plazo, fecha de envío (`Intl.DateTimeFormat("es", { dateStyle: "medium" })`), y solo en `pending`: "Editar" (enlace a `/projects/<id>#propuesta`, donde está el formulario; no hay ruta de edición propia, D-I) y "Retirar" (botón cliente). Paginación con `PaginationNav`. `loading.tsx` y `error.tsx` (cliente, "Reintentar") en `src/app/dashboard/proposals/`.

**c) Propuestas recibidas del cliente `/projects/[id]/proposals`** (D-L): `requireRole("client")` + `handleAuthErrorForPage`; `id` validado con `z.uuid()` (si no, `notFound()`); la página llama a `getMyProject` (005, para título/estado y 404 uniforme) y `listProjectProposals`; si hay `?proposal=<uuid>` válido, `getProjectProposal` (si falla con `NOT_FOUND` el panel simplemente no se muestra). Un `admin` o un cliente ajeno reciben 404 (sin UI de admin). Contenido: título del proyecto + estado + enlace "Volver a mis proyectos"; orden como `<nav aria-label="Ordenar">` (Más recientes, Menor precio, Menor plazo); tabla `<table>` comparativa con `<caption>` (columnas Desarrollador, Precio, Plazo, Enviada, y un enlace "Ver detalle" a `?proposal=<id>` conservando orden y página; el estado se muestra como badge si no es `pending`); `<th scope>`; a 390 px el scroll horizontal es interno de la tabla (región con `tabindex="0"` y `aria-label`), nunca de la página (P-5); panel de detalle (`ClientProposalDetail`) con nombre del desarrollador, precio, plazo, fecha, "Editada" si `updatedAt > createdAt`, y descripción con `whitespace-pre-line`; mientras no haya selección el panel invita a elegir una fila. Sin propuestas -> `EmptyState` "Aún no hay propuestas" con la explicación "Cuando un desarrollador envíe una propuesta, la verás aquí". Sin contacto del desarrollador, sin botón de selección, sin pagos. `loading.tsx`/`error.tsx` en `src/app/projects/[id]/proposals/` (por convención afectan solo a ese segmento y sus hijos, no a `/projects/[id]` ni a `/projects/[id]/edit`; 006 RF6 los evitó en el nivel `[id]`, aquí no se crean ahí).

**Punto de extensión de 008:** `src/modules/proposals/components/client-proposal-detail.tsx` es el único archivo que 008 modifica para añadir "Seleccionar esta propuesta" (007 no deja botón, prop ni markup inerte). El estado `accepted`/`rejected` ya se renderiza con el badge.

**d) "Mis proyectos" (`project-list.tsx`):** en la fila de acciones, si `proposalCount > 0` y el estado es `published`, `proposal_selected`, `contracted` o `closed`, un enlace "Ver propuestas" a `/projects/<id>/proposals` (sin número, ver RF6). El resto del componente no cambia.

**e) Piezas compartidas:** `src/components/shared/form-field.tsx` (extraído del `Field` privado de `project-form.tsx`, con la misma API; `project-form.tsx` lo importa) y `src/components/shared/pagination-nav.tsx` (`{ page, totalPages, buildHref }`, mismo markup que 005: `<nav aria-label="Paginación">`, Anterior/Siguiente, "Página X de Y"). `project-list.tsx` y el catálogo público de 006 no se migran a `PaginationNav` (se anota como deuda en Próximas fases; tocarlos no es necesario para 007).

Estilos: tokens hex de 005 (`#183D30`, `#F5F6F2`, `#DCE6DE`, `#202522`, `#535E56`, `#E3E8E3`), `focus-visible:ring-3`, sin sombras pesadas. Texto de usuario siempre como texto de React.

### RF9. Estados vacío / carga / error (punto 6)

- Vacío: "Mis propuestas" sin propuestas -> "Aún no has enviado propuestas" + enlace "Explorar proyectos" (`/projects`); con filtro sin resultados -> "No hay propuestas con este estado" + "Quitar el filtro"; página fuera de rango -> "No hay propuestas en esta página" + "Volver al inicio de la lista". Cliente: ver RF8c.
- Carga: `loading.tsx` de las dos rutas (`ProposalsLoading`, texto con `role="status"` + bloques `animate-pulse motion-reduce:animate-none`); botones `disabled` mientras `pending`.
- Error: `error.tsx` (cliente) con "Reintentar"; errores de action inline (formulario o botón) en región `aria-live`.
- Accesibilidad: un `<h1>` por página, controles etiquetados, foco visible, `aria-current` en filtros/orden/paginación, tabla con `caption` y `scope`.

## 4. Requisitos no funcionales

- Server-only: `proposal.service.ts` (y `proposal-transitions.ts` solo por convención de uso) en servidor; la lógica vive en el servicio, no en actions ni páginas.
- Sin dependencias npm nuevas, sin variables de entorno nuevas, sin migraciones, sin `layout.tsx`/`globals.css`/`next.config.ts`/`proxy.ts`/`package.json` tocados.
- Rendimiento: `listMyProposals` y `listProjectProposals` hacen 2 consultas (count + página); el panel de detalle 1 consulta adicional; la sección del desarrollador 1 consulta (más el presupuesto, ya cacheado).
- Archivos pequeños y por responsabilidad (SETUP §2): schema valida, servicio aplica reglas y persiste, transición hoja solo muta, action traduce, componente renderiza.
- Next 16.3.8 sin `cacheComponents`: render dinámico por petición (las páginas leen sesión); no se cachea nada de propuestas entre peticiones.

## 5. Reglas de negocio

- R1. Solo `developer` crea, edita y retira propuestas (`BRIEF §7` regla 2; `§6`).
- R2. Solo un proyecto `published` admite propuestas nuevas (`BRIEF §7` regla 3; `state-machines §1`); la guarda es atómica (RF3).
- R3. D5: una propuesta por par (desarrollador, proyecto); editable solo en `pending`; retirar solo en `pending`; sin reenvío tras retirar.
- R4. `accepted`, `rejected`, `withdrawn` son terminales; ninguna operación de 007 las modifica. 007 no produce `accepted` (008).
- R5. El cliente solo ve propuestas de proyectos propios; el desarrollador solo las propias (`BRIEF §7` regla 8).
- R6. El contacto del desarrollador no se expone al cliente hasta la selección (fuera de esta spec).
- R7. Invariante `pending => proyecto published`: lo mantienen 005 (cierre rechaza `pending`), 007 (lock al crear) y 008 (selección). Cualquier spec futura que mueva un proyecto fuera de `published` debe resolver sus `pending` en la misma transacción.
- R8. Importes: centavos enteros USD; el servicio no acepta `currency`; ningún texto menciona pagos, custodia, garantías ni dinero real (I5, `BRIEF §6.5`).

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones. `proposals` (spec 003) cubre todos los campos (`price_cents`, `currency`, `timeline_weeks`, `description`, `status`, `withdrawn_at`) y las restricciones (CHECKs, UNIQUE del par, índice parcial de `accepted`, índice por desarrollador). Observación (D-O): `withdrawn_at` no tiene CHECK de consistencia con `status`; se garantiza en el servicio y con el test AC8. Añadir un CHECK exigiría migración y spec propia; queda anotado como mejora opcional.

## 7. Contratos de servidor o API

- Servicio: RF1 y RF4 (`rejectPendingProposals`). Errores: `ProposalError` y `AuthError`.
- Actions: RF5. Sin route handlers ni endpoints nuevos.
- Rutas nuevas (privadas; `proxy.ts` no cambia, solo expone la sesión): `/dashboard/proposals` (`developer`), `/projects/[id]/proposals` (`client` dueño). El segmento estático `proposals` bajo `[id]` no colisiona con `/projects/[id]` ni `/projects/[id]/edit`.
- Autorización por función: tabla de RF1. Capas independientes: guard de página (`requireRole`), guard de action (`requireRole`), `can` + rol + ownership dentro del servicio, filtro por `developer_id`/ownership del proyecto en SQL.

## 8. Permisos y seguridad

- Autorización en servidor en cuatro capas; ninguna depende de la UI ni de `proxy.ts`.
- Recurso ajeno o inexistente -> 404 indistinguible; rol incorrecto -> 403 (en páginas, `notFound()` vía `handleAuthErrorForPage`). Un borrador no revela su existencia a un desarrollador (`NOT_FOUND`).
- El actor y `developerId` nunca vienen de la entrada; `status`, `withdrawnAt`, `projectId` (en update) no son campos del formulario y los campos extra de `FormData` se ignoran.
- Privacidad: proyección explícita por rol (RF6); test que compara `Object.keys` con la lista permitida; ni email ni `clerkUserId` ni `developerId` ni `clientId` en ninguna proyección.
- Admin: lectura de propuestas por servicio (`proposal.read`), nunca crea, edita, retira ni selecciona (D8).
- Texto libre (descripción) solo como texto de React (sin `dangerouslySetInnerHTML`); no se registran descripciones en logs; mensajes genéricos ante fallos inesperados.
- Las actions usan el mecanismo de origen/CSRF de Next; rate limiting y auditoría: spec 015.

## 9. Estados, errores y casos límite

- Proponer a un proyecto que se cierra a la vez: ver RF3; resultado coherente (la propuesta falla o queda `rejected`; nunca `pending` en un proyecto cerrado).
- Doble envío (doble clic/dos pestañas): una inserta, la otra `ALREADY_PROPOSED`; en UI el botón queda `disabled` durante `pending`.
- Proponer tras retirar: `RESEND_NOT_ALLOWED`. Editar/retirar una `withdrawn`/`rejected`/`accepted`: `INVALID_STATE`.
- Editar mientras el cliente selecciona esa propuesta: gana la que confirma primero; la otra recibe `INVALID_STATE` o la selección usa el valor nuevo (ver Próximas fases sobre exigir versión en 008).
- Un desarrollador con propuesta `pending` cuyo proyecto se cierra: la propuesta pasa a `rejected` (005/RF4); el enlace público devuelve 404 (006 RF3) y "Mis propuestas" muestra el proyecto como texto plano.
- Cliente cuyo proyecto solo tiene propuestas `withdrawn`: la página de propuestas muestra el vacío; `proposalCount > 0` sigue impidiendo despublicar (D3/D-D de 005).
- Proyecto en `draft` (sin propuestas): la página de propuestas es válida y muestra el vacío.
- `?proposal=` con UUID de otra propuesta/proyecto/retirada: el panel no se muestra, sin error.
- Precio con 3 decimales, coma, signo, vacío; plazo no entero o fuera de 1-104; descripción corta/larga: error de campo (nunca excepción).
- `page` inválida o fuera de rango: defaults / vacío "No hay propuestas en esta página".
- Fallo de BD: la action devuelve mensaje genérico; las páginas muestran `error.tsx`; la sección pública degrada a una nota.
- Sesión expirada en una action: `AuthError` -> redirect a `/sign-in`; sin onboarding -> `/onboarding`.

## 10. Criterios de aceptación verificables

- AC1. `createProposal` con un proyecto `published` inserta una propuesta `pending` con `developerId = actor.id`, `currency = 'USD'`, `withdrawnAt = null` y los valores enviados. `client` y `admin` reciben `FORBIDDEN` y no escriben.
- AC2. `createProposal` sobre `draft` o un UUID inexistente lanza `AuthError NOT_FOUND`; sobre `proposal_selected`, `contracted` o `closed` lanza `ProposalError PROJECT_NOT_OPEN`; en ningún caso se escribe.
- AC3. Una segunda propuesta del mismo desarrollador al mismo proyecto lanza `ALREADY_PROPOSED`; si la primera estaba `withdrawn` lanza `RESEND_NOT_ALLOWED`; dos desarrolladores distintos pueden proponer al mismo proyecto.
- AC4. Dos `createProposal` simultáneos del mismo desarrollador al mismo proyecto dejan exactamente una fila y un `ALREADY_PROPOSED`. Un `createProposal` simultáneo con `closeProject` o `unpublishProject` del mismo proyecto termina en un estado coherente: ninguna propuesta `pending` en un proyecto `closed`/`draft`, y `unpublishProject` ve la propuesta (`HAS_PROPOSALS`) o `createProposal` falla.
- AC5. `updateProposal` en `pending` cambia precio, plazo y descripción y nunca `status`, `projectId`, `developerId` ni `withdrawnAt`; en `accepted`, `rejected` o `withdrawn` lanza `INVALID_STATE` sin escribir; un desarrollador que no es el autor, o un id inexistente, recibe `NOT_FOUND`; `client`/`admin` reciben `FORBIDDEN`.
- AC6. `withdrawProposal` en `pending` deja `withdrawn` con `withdrawnAt` no nulo; sobre otro estado `INVALID_STATE`; ajena/inexistente `NOT_FOUND`; `client`/`admin` `FORBIDDEN`. `updatedAt` cambia.
- AC7. Un `updateProposal` y un `withdrawProposal` simultáneos sobre la misma propuesta dejan un estado coherente (una gana, la otra `INVALID_STATE` o ambas aplican en orden válido: editar y luego retirar).
- AC8. Consistencia de `withdrawnAt`: toda fila `withdrawn` creada por el servicio tiene `withdrawnAt` no nulo; ninguna fila de otro estado lo tiene.
- AC9. `rejectPendingProposals` pasa a `rejected` solo las `pending` del proyecto indicado (otras propuestas del proyecto y de otros proyectos intactas) y devuelve el número de filas. `closeProject` desde `published` sigue produciendo exactamente el resultado de AC8 de la spec 005 usando esta función; `project.service.test.ts` pasa sin modificaciones.
- AC10. `listMyProposals` devuelve solo propuestas del actor; filtra por `status`; ordena por creación desc con desempate por `id`; pagina de 10 en 10 con `total`/`totalPages` correctos; incluye `projectTitle` y `projectStatus`; `client`/`admin` reciben `FORBIDDEN`; parámetros inválidos caen a defaults. `getMyProposalForProject` devuelve la propuesta propia o `null` y nunca la de otro desarrollador.
- AC11. `listProjectProposals` devuelve solo propuestas del proyecto indicado, excluye `withdrawn`, ordena por `recent`/`price_asc`/`timeline_asc` con desempate estable y pagina de 20 en 20; el cliente dueño y el `admin` leen; un cliente ajeno o un proyecto inexistente dan `NOT_FOUND`; un `developer` recibe `FORBIDDEN`.
- AC12. Privacidad: cada elemento de `listProjectProposals` tiene exactamente las claves de `ClientProposalSummary`, y `getProjectProposal` las de `ClientProposalDetail` (comparación de `Object.keys`); ninguno contiene email, `clerkUserId`, `developerId`, `clientId`, `projectId`, `withdrawnAt` ni datos del perfil; `developerName` es el `display_name`. `getProjectProposal` da `NOT_FOUND` para una propuesta de otro proyecto, inexistente o `withdrawn`. El detalle y el catálogo públicos de 006 siguen sin exponer propuestas (tests de 006 sin cambios).
- AC13. `proposalInputSchema` rechaza precio < 100 o > 100_000_000 centavos o no entero, plazo no entero o fuera de 1-104, descripción < 30 o > 5000 (tras `trim`); acepta los bordes. `parseProposalForm` convierte USD a centavos, re-etiqueta el error a `priceUsd`, rechaza `"10.999"`, `"1,5"`, `"-1"`, `""` sin excepción y devuelve `values`. Los schemas de query caen a defaults ante cualquier entrada inválida.
- AC14. Cada action autentica con `requireRole("developer")` antes de validar; con `AuthError` (salvo `NOT_FOUND`) no llama al servicio; con entrada inválida no llama al servicio y devuelve `fieldErrors` y `values`; un id que no es UUID no llega a BD; `ProposalError` se traduce a mensaje en español sin lanzar; con éxito llama a `revalidatePath` para las rutas de RF5.
- AC15. En `/projects/[id]` (verificación manual): un desarrollador ve el formulario de envío, tras enviar ve su propuesta con "Editar"/"Retirar", tras retirar la ve de solo lectura con la nota de D5; visitante, sin onboarding, cliente dueño, cliente ajeno y admin ven exactamente lo de 006 (sin formulario); `page.tsx` y `public-project-detail.tsx` no cambian y `ProposalCta` conserva la firma `{ projectId, viewer }`; el HTML no contiene `clientId`.
- AC16. `/dashboard/proposals` (verificación manual): redirige a `/sign-in` sin sesión, a `/onboarding` sin fila, y da 404 a `client`/`admin`; pestañas, paginación y vacíos funcionan; "Editar"/"Retirar" aparecen solo en `pending`; el enlace al proyecto aparece solo si está `published`.
- AC17. `/projects/[id]/proposals` (verificación manual): 404 para `developer`, `admin`, cliente ajeno e id inexistente o mal formado; el cliente dueño ve la tabla comparativa, cambia el orden, abre el panel de detalle, ve los vacíos; no hay email, contacto ni botón de selección. "Ver propuestas" aparece en "Mis proyectos" solo con `proposalCount > 0` y estado `published`/`proposal_selected`/`contracted`/`closed`.
- AC18. Responsive y accesibilidad a 390, 768 y 1280 px: sin scroll horizontal de página, un `<h1>` por página, controles etiquetados, foco visible, `aria-current`, tabla con `caption`/`scope`, formulario con `aria-invalid`/`aria-describedby`.
- AC19. `project-form.tsx` sigue comportándose igual tras usar `FormField` (crear/editar proyecto, campos bloqueados en `published`, errores repoblados) y `project.actions.test.ts`/`project.schema.test.ts` pasan sin cambios.
- AC20. `npm run lint`, `npm run test` y `npm run build` pasan; ningún test usa red, Clerk ni Neon reales; `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/proxy.ts` y `drizzle/` no cambian; no se añadieron componentes shadcn; la tabla de rutas del build lista `/dashboard/proposals`, `/projects/[id]/proposals` y conserva `/projects`, `/projects/[id]`, `/projects/new`, `/projects/[id]/edit`.

## 11. Pruebas requeridas

Vitest, junto al archivo, `// @vitest-environment node` donde no haya DOM (SETUP §3).

- `src/modules/proposals/schemas/proposal.schema.test.ts` (AC13): bordes 100/100_000_000, 1/104, 30/5000, `trim`, `parseProposalForm` con `FormData`, re-etiquetado a `priceUsd`, `values`, y los dos schemas de query (defaults por parámetro inválido, `proposal` no UUID).
- `src/modules/proposals/services/proposal-transitions.test.ts` con `createTestDb()` (AC9): solo `pending` del proyecto, otras filas/proyectos intactos, conteo devuelto, funciona dentro de una transacción.
- `src/modules/proposals/services/proposal.service.test.ts` con `createTestDb()` (PGlite con migraciones reales; mock de `@/lib/db/client` con `Proxy` y de `server-only` como en `project.service.test.ts`), sembrando usuarios `client`/`developer`/`admin` y proyectos en cada estado: AC1-AC8, AC10-AC12. Incluye: crear en `published`; rechazo en `draft`/`closed`/`proposal_selected`/`contracted`/inexistente; duplicado y no reenvío tras retirar; `client`/`admin` no crean; editar solo `pending` y solo autor; retirar y `withdrawnAt`; ajeno -> `NOT_FOUND`; privacidad de proyecciones por `Object.keys`; filtros, orden (los tres) y paginación con más de una página y empates de precio/plazo/fecha; concurrencia con `Promise.all` (doble creación, crear vs `closeProject`/`unpublishProject` usando `project.service` real, editar vs retirar). Limitación documentada: PGlite es de una sola conexión y serializa las transacciones, por lo que estos tests prueban resultados coherentes pero no demuestran el comportamiento real del lock `FOR SHARE`; eso lo valida el reviewer por lectura del SQL y el razonamiento de RF3. El caso "desarrollador dueño de proyecto" se siembra solo para documentar que el rol bloquea antes.
- `src/modules/projects/services/project.service.test.ts`: **no se modifica** (AC9, regresión de 005). El reviewer lo ejecuta antes y después de T2.
- `src/modules/proposals/actions/proposal.actions.test.ts` (AC14): `requireRole` de `@/modules/auth/services/current-user.service` mockeado en el borde, y `@/modules/proposals/services/proposal.service`, `next/cache` y `next/navigation` mockeados; casos sin sesión, rol incorrecto, validación, id no UUID, éxito (revalidate), `ProposalError` y `AuthError NOT_FOUND`.
- No requieren test unitario (SETUP §3): páginas, `loading.tsx`/`error.tsx`, componentes presentacionales (`my-proposals-list`, `project-proposals-view`, `client-proposal-detail`, `proposal-status-badge`, `pagination-nav`, `form-field`) y componentes de formulario/acciones que solo cablean actions. Un test RTL de `proposal-form.tsx` o `proposal-cta.tsx` es opcional (el Server Component asíncrono de la sección no se renderiza bien en RTL; si se prueba `ProposalCta`, mockear la sección).
- Verificación manual (humano tras T5): AC15-AC19 con `developer`, `client` dueño, `client` ajeno, `admin` y visitante; flujo completo enviar -> editar -> retirar -> intentar reenviar; cerrar el proyecto con una propuesta `pending` y ver `rejected` en "Mis propuestas"; revisar a 390 px.

## 12. Dependencias y riesgos

- Dependencias npm: **ninguna** (se descarta `react-hook-form`, `react-query`, `@tanstack/react-table`, `axios` por las mismas razones que 005/006: formularios de 3 campos con `useActionState`, lecturas en Server Components, tabla de 20 filas con enlaces y orden en servidor). Componentes shadcn: ninguno nuevo.
- Riesgos:
  1. Ampliación de la excepción de módulos `projects <-> proposals` (escritura por función hoja, lectura de esquema, UI del punto de extensión de 006): documentada en `system-design.md §4` (D-E, D-H). Alternativa para la UI en D-H.
  2. El lock `FOR SHARE` no es demostrable con PGlite (una conexión): validado por revisión; el índice UNIQUE y los `WHERE status = 'pending'` son la red de seguridad independiente del lock.
  3. Un desarrollador puede editar una propuesta `pending` mientras el cliente la compara: 008 debe protegerlo (Próximas fases).
  4. `loading.tsx` con `notFound()` responde 200 + `noindex` en las rutas privadas nuevas (igual que `/dashboard/projects` en 005); aceptable al ser privadas.
  5. El refactor de `FormField` toca un componente ya aprobado (`project-form.tsx`): mitigado por AC19 y verificación manual; se puede descartar con la alternativa de D-K.
  6. Sin acceso a "Mis propuestas" desde el header hasta 013/006b; el enlace del detalle público es el único acceso.
  7. `window.confirm` provisional para retirar (014).
  8. No se pudo abrir el artifact de diseño (instrucción: no abrirlo): detalles visuales por contrastar con el humano.

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. Los archivos de otras specs (`project.service.ts`, `system-design.md`, `proposal-cta.tsx`, `project-form.tsx`, `project-list.tsx`) tienen cada uno una única tarea dueña y las tareas que los tocan van serializadas respecto a quien los importa. Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer corre el build completo al final. No hay T0: no se instala nada ni se tocan `package.json`, `layout.tsx`, `globals.css` ni `src/components/ui`.

### T1 — Contratos y piezas compartidas (serial, primero)

- Archivos: `src/modules/proposals/types/proposal.types.ts`, `src/modules/proposals/schemas/proposal.schema.ts`, `src/modules/proposals/schemas/proposal.schema.test.ts`, `src/modules/proposals/services/proposal-errors.ts`, `src/modules/proposals/components/proposal-status-badge.tsx`, `src/modules/proposals/components/proposals-loading.tsx`, `src/modules/proposals/components/proposals-error.tsx`, `src/components/shared/form-field.tsx`, `src/components/shared/pagination-nav.tsx`.
- Depende de: —
- Paralelizable: no (contrato base de T2-T5)
- Cubre: AC13 y base de AC16-AC19

### T2 — Servicio, transición hoja y refactor de 005 (+ doc de arquitectura)

- Archivos: `src/modules/proposals/services/proposal-transitions.ts`, `src/modules/proposals/services/proposal-transitions.test.ts`, `src/modules/proposals/services/proposal.service.ts`, `src/modules/proposals/services/proposal.service.test.ts`, `src/modules/projects/services/project.service.ts` (solo la rama `published` de `closeProject`, ver RF4), `docs/architecture/system-design.md` (§4: reescribir la excepción D-B según RF4; solo si se aprueba D-E).
- Depende de: T1
- Paralelizable: no (T3-T5 importan su contrato)
- Cubre: AC1-AC12 y AC9 (regresión de 005)

### T3 — Server actions

- Archivos: `src/modules/proposals/actions/proposal.actions.ts`, `src/modules/proposals/actions/proposal.actions.test.ts`.
- Depende de: T1, T2
- Paralelizable: sí (con T4 y T5: archivos disjuntos; T4 importa las firmas fijadas en RF5)
- Cubre: AC14

### T4 — UI del desarrollador y detalle público

- Archivos: `src/modules/proposals/components/proposal-form.tsx`, `src/modules/proposals/components/own-proposal-card.tsx`, `src/modules/proposals/components/withdraw-proposal-button.tsx`, `src/modules/proposals/components/developer-proposal-section.tsx`, `src/modules/proposals/components/my-proposals-list.tsx`, `src/modules/projects/components/proposal-cta.tsx` (solo la rama `developer`), `src/modules/projects/components/project-form.tsx` (solo sustituir el `Field` privado por `FormField`), `src/app/dashboard/proposals/page.tsx`, `src/app/dashboard/proposals/loading.tsx`, `src/app/dashboard/proposals/error.tsx`.
- Depende de: T1, T2, contrato de T3 (RF5)
- Paralelizable: sí (con T3 y T5)
- Cubre: AC15, AC16, AC18, AC19 (verificación manual; sin tests unitarios obligatorios)

### T5 — UI del cliente y enlace desde "Mis proyectos"

- Archivos: `src/modules/proposals/components/project-proposals-view.tsx`, `src/modules/proposals/components/client-proposal-detail.tsx`, `src/modules/projects/components/project-list.tsx` (solo el enlace "Ver propuestas"), `src/app/projects/[id]/proposals/page.tsx`, `src/app/projects/[id]/proposals/loading.tsx`, `src/app/projects/[id]/proposals/error.tsx`.
- Depende de: T1, T2 (solo lectura; no necesita las actions)
- Paralelizable: sí (con T3 y T4)
- Cubre: AC17, AC18, AC20 (verificación manual y build)

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: aprobada por el humano con las recomendaciones por defecto de D-A a D-O y de las preguntas abiertas P1-P6 (la tabla comparativa a 390 px usa scroll horizontal interno).

- D-A. Límites de validación. Recomendación: precio USD 1-1.000.000 (100-100.000.000 centavos, importados de `PROJECT_LIMITS.budgetCents`), plazo 1-104 semanas (de `PROJECT_LIMITS.timelineWeeks`), descripción 30-5000 caracteres. Coherentes con los CHECKs de 003 (más estrictos que `> 0`) y con el rango de `int4`. Alternativa: límites propios independientes (más flexibles, pueden divergir del dominio del proyecto) o descripción mínima mayor (p. ej. 100) para obligar a propuestas más elaboradas.
- D-B. Relación precio de la propuesta vs presupuesto del proyecto. Recomendación: sin restricción (solo ayuda visual con el presupuesto del cliente). Alternativa: exigir que el precio esté dentro de `[budgetMin, budgetMax]` (impide ofertas útiles por encima o por debajo y acopla la validación al proyecto).
- D-C. Códigos de error de elegibilidad. Recomendación: `draft`/inexistente -> `NOT_FOUND` (no revela borradores), `proposal_selected|contracted|closed` -> `PROJECT_NOT_OPEN`. Alternativa: un único `PROJECT_NOT_OPEN` para todo lo no `published` (mensaje uniforme, pero revela que un UUID de borrador existe) o `NOT_FOUND` para todo (mensaje menos útil al desarrollador).
- D-D. Guarda atómica de elegibilidad. Recomendación: transacción con `SELECT ... FOR SHARE` del proyecto + `INSERT ... ON CONFLICT DO NOTHING`. Alternativa: `FOR UPDATE` (serializa a todos los desarrolladores del mismo proyecto sin necesidad) o `INSERT ... SELECT ... WHERE status='published'` sin lock (no cierra la carrera R6 de 005).
- D-E. Función de transición de `proposals` y refactor del `UPDATE` de 005. Recomendación: introducir `rejectPendingProposals` (hoja) en 007 y sustituir el `UPDATE` en `closeProject`, con nota en `system-design.md §4`. Alternativa: aplazar a 008 (deja la excepción de escritura de 005 una spec más; menos cambios en 007, pero 008 tendría que refactorizar un servicio de otra spec mientras implementa la selección).
- D-F. Server actions vs route handlers. Recomendación: server actions (consistente con 005, sin clientes externos). Alternativa: route handlers (solo si se prevé API externa; no hay requisito).
- D-G. Datos del desarrollador visibles al cliente y visibilidad de `withdrawn`. Recomendación: solo `displayName`; nunca email, `clerkUserId`, `developerId` ni datos del perfil; las `withdrawn` no se muestran al cliente. Alternativa: añadir `headline`/tecnologías del perfil (útil para comparar, pero el perfil incluye `externalUrl`, contacto potencial, y su exposición la define 013) o mostrar las retiradas con su badge (más transparente, más ruido y desalineado con el contexto de "ofertas").
- D-H. Cómo se enchufa la UI del desarrollador en el detalle público. Recomendación: `ProposalCta` conserva su firma y su rama `developer` renderiza `DeveloperProposalSection` (Server Component asíncrono de `proposals`); no se tocan `page.tsx` ni `public-project-detail.tsx` y se documenta el import `projects -> proposals` (UI) en `§4`. Alternativa: añadir un prop opcional `developerSlot?: ReactNode` a `ProposalCta`/`PublicProjectDetail` y componerlo en `src/app/projects/[id]/page.tsx` (dirección de módulos limpia, pero toca tres archivos de 006 y amplía el contrato de T3).
- D-I. Superficie de edición. Recomendación: editar en el propio detalle público (`/projects/[id]#propuesta`), sin ruta de edición nueva; "Editar" en "Mis propuestas" enlaza ahí. Alternativa: ruta `/dashboard/proposals/[id]/edit` (un clic menos desde el panel, más superficie y un caso de 404 adicional).
- D-J. Paginación y orden. Recomendación: offset; 10 por página en "Mis propuestas" (orden fijo por más recientes) y 20 por página en las del cliente (orden `recent`/`price_asc`/`timeline_asc`, desempate por `id`). Alternativa: sin paginación en las del cliente (comparar todo de una vez; consulta no acotada) o keyset (sobreingeniería a este volumen).
- D-K. DRY del `Field` del formulario. Recomendación: extraer `FormField` a `src/components/shared/form-field.tsx` y que `project-form.tsx` lo use (segundo uso real, SETUP §2). Alternativa: duplicar ~25 líneas en `proposal-form.tsx` y extraer más tarde (no toca 005; deja duplicación consciente).
- D-L. Rutas. Recomendación: `/dashboard/proposals` (desarrollador) y `/projects/[id]/proposals` (cliente; hermana de `/projects/[id]/edit`, D-I de 005). Alternativa: `/dashboard/projects/[id]/proposals` (agrupa lo privado bajo `/dashboard`; cambia la convención de 005).
- D-M. "Detalle de propuesta propia". Recomendación: por proyecto (`getMyProposalForProject`), porque D5 hace único el par y es lo que consume la sección; no se crea `getMyProposal(id)` sin consumidor (YAGNI). Alternativa: añadirlo ahora para un futuro 013.
- D-N. Sin notificaciones al cliente ni al desarrollador (no están en el MVP; se consulta en los paneles).
- D-O. `withdrawn_at` sin CHECK en BD. Recomendación: garantizarlo en el servicio y con test (sin migración). Alternativa: spec/migración aparte con `CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL))`.

## Preguntas abiertas

- P1. ¿El cliente debe ver algo del perfil del desarrollador (titular, tecnologías) al comparar? Recomendación: no en 007 (D-G); decidirlo en 013 junto con el contacto del ganador.
- P2. ¿Se muestran al cliente las propuestas retiradas? Recomendación: no (D-G). Efecto: puede haber `proposalCount > 0` con la página vacía (solo retiradas).
- P3. ¿Se quiere un acceso a "Mis propuestas" en el header para desarrolladores antes de 013? Requiere conocer el rol en el header (hoy es solo Clerk) y pertenece a la spec de header/landing (006 D-H). Recomendación: esperar; el acceso es el enlace del detalle público.
- P4. ¿El panel del desarrollador debe mostrar también un resumen del resultado (aceptada/rechazada) con texto explicativo? Recomendación: solo el badge en 007; el detalle del resultado, pago y contacto es 013.
- P5. Tabla comparativa a 390 px: scroll horizontal interno de la tabla (recomendado, conserva semántica de tabla) vs filas apiladas como tarjetas (más cómodo en móvil, duplica el markup o pierde semántica). ¿Contrastar con el diseño móvil?
- P6. ¿Retirar necesita motivo opcional? Recomendación: no (no lo pide el requerimiento).

## Próximas fases

- 008: añade en `proposal-transitions.ts` `pending -> accepted` y el rechazo de las demás dentro de su transacción; añade en `project.service.ts` la transición `published -> proposal_selected`; añade el botón "Seleccionar esta propuesta" solo en `client-proposal-detail.tsx`. Debe exigir en la petición de selección la versión vista de la propuesta (`updatedAt` de `ClientProposalSummary`) y fallar si cambió, para que un desarrollador no pueda editar el precio entre la comparación y la selección; y responder `INVALID_STATE`/conflicto ante una retirada simultánea (`state-machines §5`). Actualizar `system-design.md §4` si cambia la dirección de dependencias.
- 012/013: paneles completos (propuesta seleccionada, pago, contacto del ganador, perfil visible al cliente), enlace por rol en el header, y sustitución de la página `/dashboard/proposals` o integración en el panel del desarrollador.
- 014: diálogos de confirmación (retirar), mensajes de éxito/error y accesibilidad ampliada (sustituye `window.confirm`).
- 015: rate limiting de las actions de crear/editar/retirar y revisión de privacidad de las proyecciones.
- Deuda DRY: migrar `project-list.tsx` y el catálogo público de 006 a `PaginationNav`; opcional: CHECK de `withdrawn_at` (D-O).

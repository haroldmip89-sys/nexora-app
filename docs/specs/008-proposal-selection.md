# Selección de la propuesta ganadora (Fase 2 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §5` (Spec 008), `docs/BRIEF.md §6.3` y `§7` (reglas 4, 5, 6, 7, 8). Dominio: `docs/architecture/system-design.md §2` (entidades `proposalSelection` y `paymentAttempt`, invariantes I1-I5), `§4` (módulos; excepción `projects` <-> `proposals` de 005/007; línea "la selección vive en `proposals` y usa una función de transición expuesta por `projects`"), `§6` (permisos: seleccionar solo el cliente dueño; D8: el admin no selecciona), `§7` (el pago no lo toca esta spec); `docs/architecture/state-machines.md §1` (`published -> proposal_selected`, D2: no se reabre la selección), `§2` (`pending -> accepted`, `pending -> rejected`), `§5` (dos selecciones simultáneas; retirada concurrente). Base: spec 003 (restricciones de BD), 004 (auth), 005 (patrón de servicio con `FOR UPDATE`), 007 (punto de extensión y "Próximas fases"). Diseño visual de referencia: no accesible; solo se usan los datos del requerimiento (diálogo "¿Seleccionar la propuesta de <nombre>?", cuatro consecuencias, botones "Confirmar selección" y "Cancelar"). Es referencia, no contrato.

## 1. Objetivo

Que el cliente dueño de un proyecto `published` elija **una sola** propuesta ganadora de forma atómica: la propuesta pasa a `accepted`, las demás `pending` pasan a `rejected`, se registra la selección (`proposal_selections`) y el proyecto pasa a `proposal_selected` ("Con propuesta seleccionada · pendiente de pago"), con lo que deja de admitir propuestas. Todas las reglas se aplican en servidor, también ante solicitudes simultáneas. Entrega:

- Servicio `selectProposal` (`proposals/services/proposal-selection.service.ts`) y errores de dominio nuevos.
- Dos funciones hoja de transición: `acceptPendingProposal` (en `proposal-transitions.ts`) y `markProposalSelected` (archivo hoja nuevo de `projects`).
- Server action `selectProposalAction` y schema Zod de su entrada (incluye la versión vista).
- UI: botón "Seleccionar esta propuesta" con diálogo accesible de confirmación en el detalle de propuesta del cliente, y aviso del siguiente paso en la vista de propuestas.

No define pagos, Stripe, contacto del desarrollador ni paneles (009-013).

## 2. Contexto y alcance

Decisiones humanas ya aprobadas y heredadas: solo el cliente dueño selecciona (`BRIEF §7` regla 7; D8: el admin no); la selección es atómica (regla 5); D2 (tras la selección el proyecto solo se cierra mientras no haya pago `completed_test`; no se reabre la selección en el MVP); recurso ajeno -> 404, rol incorrecto -> 403; autorización siempre en servidor; dinero en centavos USD, estados con los ids exactos de `state-machines`; el contacto del desarrollador sigue sin exponerse (lo define 013); Test Mode siempre, nada se presenta como dinero real (I5); Stripe Connect al final.

- Incluye:
  - `proposal-selection.service.ts` (transacción de selección), `proposal-selection.schema.ts` (entrada de la action), `proposal-selection.actions.ts`.
  - `acceptPendingProposal` (proposals) y `markProposalSelected` (projects), ambas hojas que reciben el `tx`.
  - Dos códigos de `ProposalError` nuevos y el mapa de mensajes de selección.
  - Componente `select-proposal-button.tsx` (diálogo de confirmación), props nuevas en `client-proposal-detail.tsx` y aviso de siguiente paso en `project-proposals-view.tsx`.
  - Componente shadcn `alert-dialog` (T0) si se aprueba D-D.
  - Nota de arquitectura en `system-design.md §4`.
- No incluye:
  - Pago de prueba, Checkout, webhooks, `contracted` (009-010), transferencia (011).
  - Contacto del desarrollador ganador, perfil visible, panel de pago (012/013).
  - Reapertura o cambio de la selección (D2), deshacer una selección, notificaciones.
  - Selección por el admin (D8) ni selección múltiple.
  - Cambios de esquema o migraciones, dependencias npm.
  - Enlace "Continuar al pago de prueba" (ver RF10: se omite hasta 009).
  - Cambios en `project.service.ts`, `project-list.tsx`, `my-proposals-list.tsx`, detalle público de 006, `proposal.actions.ts` (ver RF1 y 13).

### Reutilizar (inventario verificado con Glob/Read)

| Existente | Uso en 008 |
|---|---|
| `proposals/services/proposal-transitions.ts` (`rejectPendingProposals(executor, projectId)`) | **Sin cambio de firma.** Se llama después de aceptar la ganadora: como esa ya no está `pending`, el mismo `UPDATE ... WHERE status = 'pending'` rechaza solo a las demás (no hace falta parámetro de exclusión). Se le añade al archivo `acceptPendingProposal` |
| `projects/services/project.service.ts` (`loadOwned`, patrón `UPDATE ... WHERE status = <observado>`, `closeProject`) | Patrón a imitar; **no se modifica ni se importa** (ver RF1). `loadOwned` es privada: el servicio de selección repite su consulta de 5 líneas con el lock (DRY aceptado: exportarla obligaría a importar `project.service`, que arrastra `db` y todas las operaciones de proyectos) |
| `projects/schema/projects.table.ts`, `proposals/schema/{proposals,proposal-selections}.table.ts`, `payments/schema/payment-attempts.table.ts` | Sin cambios. Restricciones de 003 usadas como red de seguridad: `proposal_selections.project_id` UNIQUE, `proposal_selections.proposal_id` UNIQUE, FK compuesta `(proposal_id, project_id) -> proposals(id, project_id)`, índice parcial `proposals_one_accepted_per_project_idx`. `payment_attempts` no se toca (no existe pago en este estado; solo lo lee `closeProject` de 005) |
| `proposals/services/proposal-errors.ts` | Se añaden dos códigos (T1); mismo estilo y mapa de estado HTTP |
| `proposals/services/proposal.service.ts` | Sin cambios (sus proyecciones `ClientProposalSummary.updatedAt` ya existen y dan la versión vista) |
| `proposals/actions/proposal.actions.ts` | Patrón a imitar (re-auth, UUID, `toResult`, `revalidatePath`). No se modifica: sus helpers son privados (`"use server"` solo exporta funciones async) y su test mockea solo `proposal.service` |
| `proposals/types/proposal.types.ts` (`ProposalActionResult` ya admite cualquier `ProposalErrorCode`) | Tipo de retorno de la action sin cambios; se añaden los tipos de entrada/resultado del servicio |
| `auth/**`: `requireRole`, `requireOwnership`, `can("proposal.select")` (solo `client`, ya en la matriz), `AuthError`, `handleAuthErrorForPage` | Guards en action y servicio; sin acciones nuevas en la matriz |
| `lib/db/client.ts`, `lib/db/test-db.ts` (`createTestDb`), patrón de mock `Proxy` de `proposal.service.test.ts` | Pruebas con PGlite y migraciones reales |
| `src/lib/db/constraints.test.ts` (spec 003) | Ya prueba las restricciones de forma aislada; 008 solo añade pruebas de que el servicio las respeta/convive con ellas |
| `proposals/components/client-proposal-detail.tsx`, `project-proposals-view.tsx`, `proposal-status-badge.tsx`; `projects/components/project-status-badge.tsx` (etiqueta `proposal_selected` ya existe en `PROJECT_STATUS_LABELS`) | UI existente; el badge `accepted`/`rejected` ya se renderiza en tabla y panel |
| `proposals/components/withdraw-proposal-button.tsx`, `projects/components/project-lifecycle-actions.tsx` | Patrón de botón cliente (`useTransition`, error `aria-live`); **mismo patrón, pero la confirmación es diálogo** (RF7) |
| `src/components/ui`: `button`, `badge` instalados; **no hay** `dialog`/`alert-dialog` (verificado con `ls`); registro shadcn: `@shadcn/alert-dialog` existe (verificado con `npx shadcn@latest search`); `@base-ui/react/alert-dialog` presente en `node_modules` | Diálogo (RF7, D-D) |
| `src/components/shared`: `empty-state`, `pagination-nav`, `form-field` | Sin uso nuevo |

No existen `src/hooks` ni stores; no se necesitan.

## 3. Requisitos funcionales

### RF1. Contrato del servicio y dirección de dependencias (punto 1 del requerimiento)

Archivo `src/modules/proposals/services/proposal-selection.service.ts` (`import "server-only"`):

```ts
selectProposal(
  actor: AuthUser,
  input: { projectId: string; proposalId: string; seenUpdatedAt: Date },
): Promise<ProposalSelectionResult>

type ProposalSelectionResult = {
  projectId: string;
  proposalId: string;
  selectedAt: Date;
  alreadySelected: boolean;   // true solo en el reintento idempotente (RF3, paso 2b)
};
```

Dónde vive y por qué (decisión D-A, que **se aparta del texto de 007** "Próximas fases", que sugería la transición en `project.service.ts`):

- El servicio vive en `proposals` (`system-design.md §4`: "la selección vive en `proposals` y usa una función de transición expuesta por `projects`"). `proposals` ya puede depender de `projects`.
- La transición del proyecto es una **hoja nueva** `src/modules/projects/services/project-transitions.ts`:

```ts
markProposalSelected(executor: Pick<PgDatabase<PgQueryResultHKT>, "update">, projectId: string): Promise<boolean>
// UPDATE projects SET status = 'proposal_selected' WHERE id = ? AND status = 'published' RETURNING id  -> true si afectó 1 fila
```

  Recibe el `tx`, no importa `db`, ni `project.service`, ni nada de `proposals` (mismo diseño que `rejectPendingProposals`, 007 RF4).
- Por qué no `project.service.ts`: 007 fijó la regla "`proposals` nunca importa `project.service`; solo las tablas de `projects`". Importarlo desde la selección crearía una dependencia de servicio a servicio en ambos sentidos (`project.service -> proposal-transitions` ya existe) y arrastraría `db` y operaciones ajenas. Con la hoja, el grafo de archivos queda sin ciclos:
  - `proposal-selection.service` -> `project-transitions` (hoja), `proposal-transitions` (hoja), tablas.
  - `project.service` -> `proposal-transitions` (hoja; ya existe).
  - Ninguna hoja importa un servicio. `project.service.ts` **no se modifica** en 008 (se evita tocar un archivo ya aprobado y sus tests).
- `acceptPendingProposal` se añade a `proposal-transitions.ts` (como pedía 007):

```ts
acceptPendingProposal(executor, { proposalId, projectId }): Promise<boolean>
// UPDATE proposals SET status = 'accepted' WHERE id = ? AND project_id = ? AND status = 'pending' RETURNING id  -> true si 1 fila
```

- Nota de arquitectura (T2, `system-design.md §4`): añadir a la excepción acotada que `proposals/services/proposal-selection.service.ts` escribe en `projects` solo mediante `projects/services/project-transitions.ts` (hoja), y que `projects` sigue sin importar servicios de `proposals`. No cambian entidades, estados ni la tabla de dependencias permitidas.
- Mapeo de errores: sin código `ProposalError` para autorización; `AuthError` (`FORBIDDEN`, `NOT_FOUND`) como en 007.

### RF2. Secuencia exacta de la transacción y orden de locks (punto 2)

`selectProposal` ejecuta, en este orden:

0. Fuera de la transacción: `can(actor.role, "proposal.select")` -> si no, `AuthError("FORBIDDEN")` (developer y admin; sin tocar BD).
1. `db.transaction(async (tx) => { ... })`:
   1. **Lock del proyecto (primero):** `SELECT id, clientId, status FROM projects WHERE id = :projectId LIMIT 1 FOR UPDATE`. Inexistente -> `AuthError("NOT_FOUND")`; `requireOwnership(actor, clientId)` **sin** `allowAdmin` (ajeno -> `NOT_FOUND`).
   2. **Decisión por estado del proyecto** (ya bajo lock; ver RF3 para códigos):
      - `published` -> continúa.
      - `proposal_selected` o `contracted` -> leer `proposal_selections` del proyecto: si `proposalId` coincide con el solicitado -> **éxito idempotente** (`alreadySelected: true`, sin escrituras ni comprobar versión); si es otra -> `ProposalError("ALREADY_SELECTED")`.
      - `draft` o `closed` -> `ProposalError("PROJECT_NOT_OPEN")`.
   3. **Lock de la propuesta (segundo):** `SELECT id, status, updatedAt FROM proposals WHERE id = :proposalId AND project_id = :projectId LIMIT 1 FOR UPDATE`. Inexistente o de otro proyecto -> `AuthError("NOT_FOUND")` (el dueño ya está verificado, no se revela nada). `status !== 'pending'` -> `ProposalError("INVALID_STATE")`. `updatedAt.getTime() !== seenUpdatedAt.getTime()` -> `ProposalError("PROPOSAL_CHANGED")`.
   4. `INSERT INTO proposal_selections (project_id, proposal_id, selected_by) VALUES (..., actor.id) ON CONFLICT DO NOTHING RETURNING selected_at`. Sin fila (un UNIQUE de BD disparó: red de seguridad) -> `ProposalError("ALREADY_SELECTED")` (lanzar revierte toda la transacción).
   5. `acceptPendingProposal(tx, { proposalId, projectId })` -> `false` -> `ProposalError("INVALID_STATE")` (revierte).
   6. `rejectPendingProposals(tx, projectId)` (las demás `pending`; la ganadora ya no lo es). Las `withdrawn` no se tocan (RF4).
   7. `markProposalSelected(tx, projectId)` -> `false` -> `ProposalError("INVALID_STATE")` (revierte).
   8. Devolver `{ projectId, proposalId, selectedAt, alreadySelected: false }`.

Por qué este orden de locks (sin deadlock):

- Todo el código que toma más de un lock lo hace **proyecto -> propuesta(s)**: `closeProject` (005: lock del proyecto y luego `UPDATE` de propuestas), `unpublishProject` (lock del proyecto y lectura de propuestas), y ahora `selectProposal`. `createProposal` (007) toma `FOR SHARE` del proyecto y luego inserta (nunca bloquea una propuesta ajena existente). `updateProposal` y `withdrawProposal` toman solo el lock de fila de **una** propuesta (el `UPDATE`) y no piden el del proyecto: no pueden cerrar un ciclo.
- Interacciones (resultado coherente, razonado, no demostrable en PGlite; ver RF5):
  - `selectProposal` vs `selectProposal`: el segundo espera el `FOR UPDATE` del proyecto; al obtenerlo ve `proposal_selected` y responde idempotente (misma propuesta) o `ALREADY_SELECTED`.
  - vs `updateProposal`/`withdrawProposal` de la propuesta elegida: si esos confirman primero, `selectProposal` ve `updatedAt` distinto (`PROPOSAL_CHANGED`) o `withdrawn` (`INVALID_STATE`); si la selección confirma primero, su `UPDATE ... WHERE status = 'pending'` re-evaluado tras el commit encuentra `accepted` y devuelve 0 filas (`INVALID_STATE`). Cumple `state-machines §5`.
  - vs `createProposal`: `FOR SHARE` y `FOR UPDATE` del proyecto se excluyen. Si la propuesta nueva confirma antes, el paso 6 (un `UPDATE` nuevo bajo READ COMMITTED) la ve y la rechaza; si la selección confirma antes, `createProposal` ve `proposal_selected` -> `PROJECT_NOT_OPEN`. Nunca queda una `pending` en un proyecto `proposal_selected` (invariante R7 de 007 mantenida).
  - vs `closeProject` y `unpublishProject`: se serializan por el lock del proyecto; el perdedor ve el estado nuevo (`PROJECT_NOT_OPEN` / `INVALID_STATE` / `HAS_PROPOSALS`).

### RF3. Guardas y errores de dominio por caso (punto 3)

Errores nuevos en `proposal-errors.ts` (T1), ambos `status: 409`, mismo estilo que `ProjectError`/`ProposalError`:

```ts
ProposalErrorCode += "ALREADY_SELECTED"   // el proyecto ya tiene otra ganadora
                  |  "PROPOSAL_CHANGED"   // la propuesta cambió desde la versión que vio el cliente
```

Se reutilizan `PROJECT_NOT_OPEN` e `INVALID_STATE` (007). Los mensajes de usuario de los códigos existentes **no se cambian** (los usa 007 y sus tests); la selección usa su propio mapa `PROPOSAL_SELECTION_ERROR_MESSAGES` (parcial, en el mismo archivo):

| Caso | Resultado | Mensaje (es) en la selección |
|---|---|---|
| Rol `developer` o `admin` | `AuthError FORBIDDEN` (antes de tocar BD) | (redirección/404 por `handleAuthErrorForPage`) |
| Proyecto inexistente, ajeno o `proposalId` mal formado | `AuthError NOT_FOUND` | "No encontramos el proyecto o la propuesta." |
| Propuesta inexistente o de otro proyecto (el cliente es dueño) | `AuthError NOT_FOUND` | ídem |
| Proyecto `draft` o `closed` | `PROJECT_NOT_OPEN` | "Este proyecto ya no está abierto a la selección de propuestas." |
| Proyecto `proposal_selected`/`contracted` y la propuesta pedida **no** es la ganadora | `ALREADY_SELECTED` | "Este proyecto ya tiene una propuesta seleccionada." |
| Proyecto `proposal_selected`/`contracted` y la propuesta pedida **es** la ganadora (doble clic, reintento, dos pestañas) | **Éxito idempotente** (`alreadySelected: true`; la action responde `{ ok: true }`) | — |
| Propuesta `withdrawn`, `rejected` (o `accepted` inconsistente) con proyecto `published` | `INVALID_STATE` | "Esta propuesta ya no está disponible para seleccionar (fue retirada o rechazada)." |
| `updatedAt` de la propuesta distinto de `seenUpdatedAt` | `PROPOSAL_CHANGED` | "El desarrollador modificó la propuesta después de que la viste. Revisa los cambios y vuelve a elegir." |
| Un UNIQUE de BD dispara (condición imposible bajo el lock) | `ALREADY_SELECTED` y rollback total | ídem `ALREADY_SELECTED` |
| `UPDATE` guarda con 0 filas (estado cambió dentro de la ventana) | `INVALID_STATE` y rollback total | ídem `INVALID_STATE` |
| Fallo inesperado de BD | se propaga; la action responde mensaje genérico | "No pudimos completar la acción. Inténtalo de nuevo." |

Notas:

- **Comparación de versión (decisión D-C):** `seenUpdatedAt` es el `updatedAt` de `ClientProposalSummary` que el cliente tenía en pantalla, enviado como ISO-8601 con milisegundos (`Date.toISOString()`) y comparado **en JavaScript** con la fila ya bloqueada (`getTime()`). No se compara en SQL: `updated_at` por defecto lo escribe la BD con microsegundos (`defaultNow()`) y la lectura de drizzle lo trunca a milisegundos; comparar en SQL contra un valor de milisegundos fallaría para propuestas nunca editadas. Como el valor sale de una lectura previa de la misma columna (ambas truncadas a ms) coincide siempre que la fila no cambió. Límite aceptado: dos escrituras del desarrollador dentro del mismo milisegundo que el valor visto no son distinguibles (despreciable; el `UPDATE` de edición escribe `new Date()` de JavaScript).
- El idempotente no exige versión: la propuesta ya está `accepted` y no puede cambiar.
- Orden de evaluación fijo (para respuestas deterministas): rol -> existencia/dueño del proyecto -> estado del proyecto -> existencia de la propuesta -> estado de la propuesta -> versión.
- Proyecto `closed` con selección previa (cerrado tras elegir): `PROJECT_NOT_OPEN` (no se reporta éxito sobre un proyecto cerrado).

### RF4. Efecto sobre las demás propuestas (punto 4)

- Las demás `pending` del proyecto pasan a `rejected` en la misma transacción (`rejectPendingProposals`, sin cambios).
- Las `withdrawn` se quedan `withdrawn` (terminales; no pasan a `rejected` porque `WHERE status = 'pending'`). Las `rejected` previas no cambian.
- `withdrawn_at` no se toca en ninguna transición de la selección.
- `updatedAt` de las rechazadas se actualiza por `$onUpdate` (no importa: esas propuestas ya no son seleccionables).

### RF5. Solicitudes simultáneas y cómo se verifican (punto 5)

Garantías:

1. Lock `FOR UPDATE` del proyecto (serializa selecciones y las transiciones del proyecto) y lock de la propuesta elegida (serializa con edición y retirada del desarrollador).
2. Cada `UPDATE` de transición lleva su guarda de estado en el `WHERE` (`status = 'pending'`, `status = 'published'`), re-evaluada tras el commit del competidor bajo READ COMMITTED.
3. Restricciones de BD como red de seguridad **independiente del lock**: UNIQUE `proposal_selections.project_id` y `proposal_id`, FK compuesta `(proposal_id, project_id)` y el índice parcial de una sola `accepted` por proyecto.

**NOTA (obligatoria para developer y reviewer): PGlite es de una sola conexión y serializa las transacciones, por lo que ninguna prueba con `Promise.allSettled` demuestra el comportamiento real de `FOR UPDATE` bajo concurrencia verdadera en Neon/Postgres.** Esas pruebas solo demuestran que el resultado final es **coherente en cualquier orden de ejecución**. La verificación de los locks se hace así:

- Pruebas de resultado coherente (AC13, AC14): para N solicitudes concurrentes, el estado final cumple los invariantes (como máximo una fila de selección, una `accepted`, proyecto `proposal_selected` si y solo si hay selección, ninguna `pending` si hay selección) y cada solicitud termina en éxito o en un error de dominio de la tabla de RF3, nunca en un error de BD sin traducir.
- Pruebas de la red de seguridad (AC15): se fuerza deterministamente la situación "el lock falló" (se siembra una fila de selección con el proyecto aún `published`) y se verifica que el servicio devuelve `ALREADY_SELECTED` y deja todo intacto; y que los INSERT directos que violarían I1 son rechazados por la BD.
- **Revisión del reviewer por lectura del SQL**: confirmar que (a) el primer sentencia con lock es el `SELECT ... FOR UPDATE` del proyecto, (b) el de la propuesta va después, (c) ningún `UPDATE` de transición carece de guarda de estado en el `WHERE`, (d) no hay lecturas previas a la transacción que decidan el resultado, (e) el orden de locks coincide con RF2.

### RF6. Server action (punto 6)

Archivo **nuevo** `src/modules/proposals/actions/proposal-selection.actions.ts` (`"use server"`, solo exporta funciones async; no se amplía `proposal.actions.ts`, decisión D-G):

```ts
selectProposalAction(
  projectId: string,
  proposalId: string,
  seenUpdatedAt: string,      // ISO-8601 con milisegundos, de ClientProposalSummary.updatedAt
): Promise<ProposalActionResult>   // { ok: true } | { ok: false; code; message }
```

Schema de entrada en `src/modules/proposals/schemas/proposal-selection.schema.ts` (Zod `^4.6.5`):

```ts
selectProposalInputSchema = z.object({
  projectId: z.uuid(),
  proposalId: z.uuid(),
  seenUpdatedAt: z.iso.datetime().transform((value) => new Date(value)),
});
```

Flujo (mismo patrón que 007, `redirect` fuera de `try`):

1. `requireRole("client")` (el `admin` y el `developer` reciben 403/redirect vía `handleAuthErrorForPage`; sin sesión -> `/sign-in`; sin fila -> `/onboarding`). Se autentica **antes** de validar.
2. `selectProposalInputSchema.safeParse`: un `projectId`/`proposalId` que no es UUID devuelve `{ ok: false, code: "NOT_FOUND" }` sin tocar BD (indistinguible de uno inexistente); un `seenUpdatedAt` ausente o mal formado devuelve `{ ok: false, code: "PROPOSAL_CHANGED" }` con su mensaje (la única salida útil es recargar; sin tocar BD).
3. `selectProposal(actor, { projectId, proposalId, seenUpdatedAt })`.
4. `ProposalError` -> `{ ok: false, code, message: PROPOSAL_SELECTION_ERROR_MESSAGES[code] }` (español, ver RF3); `AuthError NOT_FOUND` -> mensaje de no encontrado; otro `AuthError` -> `handleAuthErrorForPage`; cualquier otro error -> `UNKNOWN` con mensaje genérico sin detalles de BD.
5. Éxito (incluido el idempotente): `revalidatePath` de `/projects/<projectId>/proposals`, `/projects/<projectId>`, `/projects/<projectId>/edit`, `/dashboard/projects`, `/dashboard/proposals` y `/projects` (el proyecto sale del catálogo público) y devuelve `{ ok: true }`. No hay `redirect`: el cliente permanece en la página y la revalidación la re-renderiza.

### RF7. UI: botón y diálogo de confirmación (punto 7; decisión D-D)

Mecanismo recomendado: **diálogo accesible con el componente shadcn `alert-dialog`** (T0, serializado), no `window.confirm`.

- Justificación frente a lo instalado: hoy solo hay `button`, `badge`, `input`, `label`, `textarea`, `native-select`; no hay dialog. 005/007 usan `window.confirm` de forma explícitamente provisional (014 lo sustituye), pero aquí la confirmación debe comunicar **cuatro consecuencias estructuradas** de una acción **irreversible** (D2: no se reabre), cosa que un `window.confirm` de texto plano hace mal (no se estiliza, no se puede mantener abierto para mostrar un error del servidor, no permite foco inicial en "Cancelar"). `alert-dialog` es el patrón semántico para confirmar acciones destructivas (rol `alertdialog`, foco atrapado, Escape cancela) y 014 lo reutilizará para retirar/cerrar. El registro lo tiene (`@shadcn/alert-dialog`) y `@base-ui/react/alert-dialog` ya está en `node_modules`: sin dependencias nuevas.
- Alternativa (D-D): `window.confirm` con las cuatro consecuencias en un mensaje (sin T0; menos accesible y sin error inline). Si el humano la elige, T0 desaparece y T4 usa el patrón de `WithdrawProposalButton`.
- T0: `npx shadcn@latest add alert-dialog` (genera `src/components/ui/alert-dialog.tsx` con el estilo `base-nova`). El developer lee el archivo generado para conocer sus partes reales antes de usarlas (no asumir la API de Radix) y verifica que `package.json` no cambie (no debe instalar nada; si el CLI pidiera una dependencia, se detiene y se escala).

`select-proposal-button.tsx` (nuevo, `"use client"`, `proposals/components`):

```tsx
SelectProposalButton({ projectId, proposalId, developerName, seenUpdatedAt }: { projectId: string; proposalId: string; developerName: string; seenUpdatedAt: string })
```

- Botón de apertura "Seleccionar esta propuesta" (estilo primario de 005, `h-10`, objetivo táctil >= 40 px).
- Diálogo controlado (`open`), título "¿Seleccionar la propuesta de {developerName}?" (nombre como texto de React), descripción con las cuatro consecuencias (lista `<ul>`):
  1. Solo una propuesta puede ganar por proyecto.
  2. El proyecto deja de admitir nuevas propuestas.
  3. Las demás propuestas pendientes se marcan como rechazadas.
  4. Después continuarás con el pago de prueba (Test Mode; no se mueve dinero real).
- Botones "Confirmar selección" y "Cancelar"; el foco inicial va a "Cancelar" (acción irreversible). Mientras la action está `pending` (`useTransition`): "Confirmar selección" `disabled` con texto "Seleccionando..." y el diálogo no se cierra con Escape/clic fuera (evita doble envío; el servicio además es idempotente).
- Resultado: `{ ok: true }` -> cierra el diálogo (la revalidación re-renderiza la vista y el botón desaparece). `{ ok: false }` -> el diálogo **permanece abierto** con el mensaje en una región `aria-live="polite"` (`role="alert"`) y, para los códigos que implican datos obsoletos (`PROPOSAL_CHANGED`, `INVALID_STATE`, `ALREADY_SELECTED`, `PROJECT_NOT_OPEN`, `NOT_FOUND`), llama a `router.refresh()` (`next/navigation`) para que la vista cargue la versión actual; el botón de confirmación se deshabilita tras esos errores y solo queda "Cerrar/Cancelar".
- Sin `window.confirm`, sin `dangerouslySetInnerHTML`; teclado completo; texto sin mencionar dinero real, custodia ni garantías (I5).

### RF8. Qué ve el cliente tras seleccionar (punto 8)

Cambios en dos archivos existentes de 007 (T4):

- `client-proposal-detail.tsx`: nuevas props `projectId: string` y `projectStatus: ProjectStatus` (de `projects/types`, solo tipo). Muestra `<SelectProposalButton ... seenUpdatedAt={proposal.updatedAt.toISOString()} />` **solo si** `projectStatus === "published"` y `proposal.status === "pending"`. En cualquier otro caso no hay botón ni markup inerte (tras la selección el botón desaparece en todas las propuestas). Sin cambios en el resto del panel (el badge `accepted`/`rejected` ya se muestra; sigue sin contacto del desarrollador).
- `project-proposals-view.tsx`: pasa `projectId={project.id}` y `projectStatus={project.status}` al panel y, cuando `project.status === "proposal_selected"`, muestra bajo el encabezado un aviso (`role="status"`, sin enlace): "Elegiste una propuesta. Este proyecto ya no admite nuevas propuestas y las demás quedaron rechazadas. El siguiente paso es el pago de prueba (Test Mode), que estará disponible próximamente." El estado del proyecto ya se ve en el `ProjectStatusBadge` de la cabecera ("Con propuesta seleccionada · pendiente de pago"). Las filas conservan su badge (`Aceptada`/`Rechazada`; las `withdrawn` siguen ocultas al cliente, 007 RF6). Para `contracted`/`closed` no hay aviso nuevo.
- La página `src/app/projects/[id]/proposals/page.tsx` **no cambia** (la vista ya recibe el proyecto y el panel).
- "Mis proyectos" (`project-list.tsx`) no cambia: el badge ya dice "pendiente de pago", "Ver propuestas" ya aparece en `proposal_selected` y "Cerrar" sigue disponible con las guardas de 005 (D2, `PAYMENT_IN_PROGRESS`).

### RF9. Qué ve el desarrollador (punto 9)

Solo el estado, sin cambios de código:

- "Mis propuestas" (`/dashboard/proposals`): la propuesta ganadora muestra el badge "Aceptada" y las demás "Rechazada"; el título del proyecto es texto plano porque `projectStatus !== "published"` (el detalle público respondería 404, 006 RF3); "Editar"/"Retirar" no aparecen (solo en `pending`). Las `withdrawn` siguen "Retirada".
- Detalle público `/projects/[id]`: deja de ser accesible al salir de `published` (404 por 006); el desarrollador no ve allí nada de la selección.
- Un intento de editar o retirar una propuesta ya `accepted`/`rejected` devuelve `INVALID_STATE` (007).
- **No** se muestra contacto del cliente ni panel de pago al ganador ni explicación del resultado: lo define 013 (P4 de 007).

### RF10. Enlace "Continuar al pago de prueba" (punto 10; decisión D-F)

Se **omite** en 008. No existe ninguna ruta de pago (la crea 009) y un enlace roto o inerte sería deshonesto. En su lugar, el aviso textual de RF8 indica el siguiente paso como "disponible próximamente" sin enlace, y el badge del proyecto ya dice "pendiente de pago". 009 añadirá el enlace/botón real en el punto que el humano decida (`project-list.tsx` y/o la vista de propuestas, que la 009 modificará asignándolo a una de sus tareas).

## 4. Requisitos no funcionales

- Server-only: `proposal-selection.service.ts`; las hojas no importan `db`; la lógica vive en el servicio, no en la action ni en la UI.
- Sin dependencias npm nuevas, sin variables de entorno nuevas, sin migraciones; no se tocan `package.json`, `package-lock.json`, `layout.tsx`, `globals.css`, `proxy.ts`, `drizzle/`. Único cambio compartido: `src/components/ui/alert-dialog.tsx` (T0).
- Rendimiento: la transacción hace una cantidad fija de sentencias (2 selects con lock, 1 insert, 3 updates), independiente del número de propuestas.
- Archivos pequeños y por responsabilidad (SETUP §2): schema valida, servicio decide y orquesta, hojas mutan, action traduce, componente renderiza.
- Next 16.3.8 sin `cacheComponents`: render dinámico; `params`/`searchParams` ya son `Promise` en la página existente. El developer consulta `node_modules/next/dist/docs/` (server actions, `revalidatePath`, `useRouter().refresh`) antes de fijar firmas.

## 5. Reglas de negocio

- R1. Solo el `client` dueño selecciona (`BRIEF §7` regla 7); el admin no (D8); el desarrollador no.
- R2. Atomicidad (`BRIEF §7` regla 5): selección + aceptación + rechazo de las demás + paso del proyecto a `proposal_selected` ocurren en una sola transacción o no ocurre nada.
- R3. Como máximo una selección y una propuesta `accepted` por proyecto (I1; `BRIEF §7` regla 4).
- R4. Solo se selecciona una propuesta `pending` de un proyecto `published` cuya versión coincide con la vista (`state-machines §1`, `§2`).
- R5. Tras seleccionar, el proyecto no admite propuestas (`BRIEF §7` regla 6): `createProposal` ya responde `PROJECT_NOT_OPEN` (007).
- R6. `withdrawn` es terminal y no pasa a `rejected`; `accepted` no se retira en el MVP (`state-machines §2`).
- R7. No se reabre ni se cambia la selección (D2). La única salida desde `proposal_selected` en 008 es `closeProject` (005), que ya aplica D2.
- R8. `contracted` solo lo alcanza el webhook verificado (010); 008 nunca lo escribe.
- R9. El contacto del desarrollador no se expone en 008 (013). Los importes y moneda de la propuesta ganadora quedan guardados y son los que usará 009 (I2); 008 no copia importes a ninguna parte.
- R10. Invariante `pending => proyecto published` (R7 de 007) se mantiene: la selección resuelve todas las `pending` del proyecto en la misma transacción en que deja `published`.

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones: spec 003 ya define `proposal_selections` (`project_id` UNIQUE, `proposal_id` UNIQUE, `selected_by`, `selected_at`, FK compuesta `(proposal_id, project_id)`) y el índice parcial de una `accepted` por proyecto. `selected_by` = `actor.id` (cliente dueño); `selected_at` = default de BD. Observación: no hay CHECK en BD que ligue `projects.status = 'proposal_selected'` con la existencia de una fila de selección; lo garantizan el servicio (transacción única) y las pruebas (AC1, AC12). No se añade migración (si se quisiera, spec propia).

## 7. Contratos de servidor o API

- Servicio: RF1-RF3 (`selectProposal`), hojas `acceptPendingProposal` y `markProposalSelected`. Errores: `ProposalError` (con `ALREADY_SELECTED`, `PROPOSAL_CHANGED`) y `AuthError`.
- Action: RF6 (`selectProposalAction`). Sin route handlers ni endpoints nuevos ni rutas nuevas; sin cambios en `proxy.ts`.
- Tipos (en `proposal.types.ts`): `SelectProposalInput = { projectId: string; proposalId: string; seenUpdatedAt: Date }` y `ProposalSelectionResult` (RF1). `ProposalActionResult` ya cubre los códigos nuevos por derivar de `ProposalErrorCode`.
- Autorización por capa: guard de action (`requireRole("client")`), `can("proposal.select")` + `requireOwnership` sin admin dentro del servicio, y la consulta del proyecto con el lock como único punto de decisión.

## 8. Permisos y seguridad

- Autorización en servidor en tres capas independientes (guard de action, `can` + ownership en servicio, no confianza en la UI); ni la UI ni `proxy.ts` deciden nada.
- Ajeno o inexistente -> 404 indistinguible (proyecto y propuesta); rol incorrecto -> 403 (en páginas, `handleAuthErrorForPage`). El orden de comprobación impide que un cliente ajeno distinga una propuesta existente de una inexistente.
- El actor y `selectedBy` nunca vienen de la entrada; `projectId`/`proposalId` se validan como UUID; `seenUpdatedAt` como ISO-8601; los campos extra se ignoran.
- Privacidad: `ProposalSelectionResult` no contiene `clientId`, `developerId`, email ni contacto; las proyecciones de 007 no cambian (su test de `Object.keys` debe seguir pasando sin cambios).
- Integridad frente a manipulación: el `seenUpdatedAt` no autoriza nada, solo evita aceptar una oferta distinta a la vista; un token falso solo produce `PROPOSAL_CHANGED`. El precio aceptado es siempre el guardado en servidor, nunca uno enviado por el navegador.
- Texto de usuario (`developerName`) solo como texto de React. Mensajes genéricos ante fallos inesperados; no se registran descripciones. Rate limiting y auditoría: spec 015.

## 9. Estados, errores y casos límite

- Doble clic o dos pestañas sobre la misma propuesta: una escribe; la otra recibe éxito idempotente (`alreadySelected`), sin segundo registro. UI: botón `disabled` durante `pending`.
- Dos propuestas distintas elegidas a la vez (dos pestañas): una gana; la otra recibe `ALREADY_SELECTED` (`state-machines §5`).
- Retirada concurrente de la propuesta elegida: gana la que confirma primero; la otra falla sin dejar estado inconsistente (`INVALID_STATE`); si la retirada gana, el cliente ve el mensaje y la propuesta desaparece de su lista tras `router.refresh()`.
- Edición del desarrollador entre la vista y la selección: `PROPOSAL_CHANGED`; tras `router.refresh()` el cliente ve la versión nueva ("Editada") y puede volver a elegir con la versión actual.
- Nueva propuesta concurrente: se rechaza en la misma selección (si confirmó antes) o recibe `PROJECT_NOT_OPEN` (si confirma después).
- Cierre concurrente (`closeProject`) del proyecto: se serializa; la selección recibe `PROJECT_NOT_OPEN` o el cierre ve `proposal_selected` y aplica las guardas de 005.
- Proyecto `proposal_selected` que luego se cierra por el cliente (D2): las propuestas `accepted`/`rejected` quedan como están; 008 no las modifica.
- Proyecto sin propuestas `pending` (solo `withdrawn`/`rejected`): no hay botón (ningún panel puede abrirse con `pending`); la action rechazaría con `INVALID_STATE`.
- Proyecto con una sola propuesta `pending`: la selección funciona y no hay "demás" que rechazar (`rejectPendingProposals` devuelve 0).
- `seenUpdatedAt` ausente, no ISO o de otro formato: `PROPOSAL_CHANGED` sin consultar BD.
- UUID mal formado: `NOT_FOUND` sin consultar BD.
- Fallo en cualquier paso intermedio: rollback total (ni selección, ni propuesta aceptada, ni demás rechazadas, ni cambio de estado del proyecto).
- Fallo de BD: mensaje genérico en el diálogo (`aria-live`); la página no se rompe.
- Sesión expirada en la action: `AuthError` -> redirect a `/sign-in`; sin onboarding -> `/onboarding`.

## 10. Criterios de aceptación verificables

- AC1. Selección feliz: el cliente dueño selecciona una propuesta `pending` de un proyecto `published` con la versión correcta; resultado: una fila en `proposal_selections` (`project_id`, `proposal_id`, `selected_by = actor.id`), la propuesta `accepted`, todas las demás `pending` del proyecto `rejected`, el proyecto `proposal_selected`, y `ProposalSelectionResult` con `alreadySelected: false`.
- AC2. Una sola ganadora: tras cualquier secuencia de llamadas, un proyecto tiene como máximo una selección y una propuesta `accepted`; si el proyecto está `proposal_selected` existe exactamente una selección y no hay propuestas `pending`.
- AC3. Las `withdrawn` del proyecto permanecen `withdrawn` con su `withdrawnAt` intacto; las `rejected` previas no cambian; propuestas y proyectos de otros clientes no se ven afectados.
- AC4. Versión: si `updatedAt` actual de la propuesta difiere de `seenUpdatedAt` (el desarrollador la editó), lanza `PROPOSAL_CHANGED` y no escribe; con la versión nueva la selección funciona. Una propuesta nunca editada (con `updatedAt` escrito por la BD con microsegundos) se acepta con el valor de milisegundos leído por drizzle.
- AC5. Retirada entre vista y selección: propuesta `withdrawn` -> `INVALID_STATE`, sin escribir. Propuesta `rejected` -> `INVALID_STATE`.
- AC6. Estado del proyecto: `draft` y `closed` -> `PROJECT_NOT_OPEN`; `proposal_selected`/`contracted` con otra propuesta -> `ALREADY_SELECTED`; sin escribir en ningún caso.
- AC7. Autorización: cliente ajeno, proyecto inexistente, propuesta inexistente y propuesta de otro proyecto -> `AuthError NOT_FOUND`; `developer` y `admin` -> `AuthError FORBIDDEN` sin tocar BD (incluso siendo "dueño" sembrado para documentar que el rol bloquea antes).
- AC8. Idempotencia: repetir `selectProposal` sobre la propuesta ya ganadora (proyecto `proposal_selected`) devuelve éxito con `alreadySelected: true`, sin nuevas filas ni cambios (`selected_at` igual) y sin comprobar la versión; sobre otra propuesta del proyecto -> `ALREADY_SELECTED`; con el proyecto `closed` -> `PROJECT_NOT_OPEN`.
- AC9. Atomicidad: si falla cualquier paso intermedio (se fuerza que `markProposalSelected` lance o devuelva `false`), no queda ninguna fila de selección, la propuesta sigue `pending`, las demás siguen `pending` y el proyecto sigue `published`.
- AC10. Red de seguridad de BD: con el proyecto `published` y una fila de selección sembrada (lock "perdido"), `selectProposal` devuelve `ALREADY_SELECTED` y no cambia nada; los INSERT directos de una segunda selección para el mismo proyecto, de una segunda `accepted` en el mismo proyecto y de una selección con una propuesta de otro proyecto son rechazados por la BD.
- AC11. Hojas: `acceptPendingProposal` acepta solo si la propuesta es del proyecto indicado y está `pending` (devuelve `true`; en otro caso `false` sin escribir); `markProposalSelected` mueve solo `published -> proposal_selected` (otros estados y otros proyectos intactos, `false`); `rejectPendingProposals` no cambia y tras aceptar a la ganadora rechaza solo a las demás.
- AC12. Consistencia del estado: toda ejecución que termina en éxito deja las cuatro escrituras (selección, ganadora, rechazo de las demás, proyecto) y ninguna que termina en error deja alguna.
- AC13. Concurrencia: dos `selectProposal` simultáneos de **propuestas distintas** del mismo proyecto (`Promise.allSettled`) terminan con exactamente un éxito y un `ALREADY_SELECTED`, y estado coherente (AC2); dos simultáneos de la **misma** propuesta terminan ambos con éxito (uno con `alreadySelected: true`) y una sola selección. (Ver NOTA de RF5: prueba de coherencia, no demostración del lock.)
- AC14. Concurrencia con otras operaciones: `selectProposal` simultáneo con `withdrawProposal`, con `updateProposal`, con `createProposal` y con `closeProject` (de 005, servicio real) de la misma propuesta/proyecto termina siempre en un estado coherente con los invariantes (AC2, R10) y cada operación en éxito o en un error de dominio de su tabla; nunca una `pending` en un proyecto `proposal_selected`, nunca una `accepted` retirada.
- AC15. Dependencias de módulos: `project.service.ts`, `proposal.service.ts` y `proposal.actions.ts` no cambian; `project-transitions.ts` y `proposal-transitions.ts` no importan `db`, `server-only`, ni ningún servicio; `proposal-selection.service.ts` no importa `project.service`.
- AC16. Action: autentica con `requireRole("client")` antes de validar; con `AuthError` (salvo `NOT_FOUND`) no llama al servicio; UUID inválido -> `{ ok: false, code: "NOT_FOUND" }` sin llamar al servicio; `seenUpdatedAt` inválido -> `PROPOSAL_CHANGED` sin llamar al servicio; cada `ProposalError` (los 6 códigos) se traduce al mensaje en español de RF3; éxito -> `{ ok: true }` y `revalidatePath` de las seis rutas de RF6; error desconocido -> `UNKNOWN` genérico.
- AC17. Schema: `selectProposalInputSchema` acepta UUIDs válidos y el ISO de `Date.toISOString()` (convertido a `Date`); rechaza UUID inválido, fecha vacía, no ISO y números.
- AC18. UI (verificación manual, tras T4, con `client` dueño con dos propuestas `pending` y una `withdrawn`): el panel de detalle muestra "Seleccionar esta propuesta" solo con proyecto `published` y propuesta `pending`; el diálogo muestra el título con el nombre y las cuatro consecuencias, foco inicial en "Cancelar", Escape cancela; "Confirmar selección" cierra el diálogo; el botón desaparece en todas las propuestas; el badge del proyecto dice "Con propuesta seleccionada · pendiente de pago"; la elegida muestra "Aceptada" y la otra "Rechazada"; la `withdrawn` sigue oculta; aparece el aviso de siguiente paso sin enlace; sin contacto ni email en el HTML. Un error del servidor (p. ej. versión cambiada) deja el diálogo abierto con el mensaje y refresca los datos.
- AC19. Desarrollador (manual): en "Mis propuestas" ve "Aceptada"/"Rechazada" y el título del proyecto como texto plano; "Editar"/"Retirar" ausentes; el detalle público responde 404.
- AC20. Responsive y accesibilidad a 390, 768 y 1280 px: diálogo sin desbordar (con scroll interno si el contenido es largo), objetivos táctiles >= 40 px, `aria-live` para errores, foco visible, un `<h1>` por página.
- AC21. Regresión: `npm run lint`, `npm run test` y `npm run build` pasan; `project.service.test.ts`, `proposal.service.test.ts`, `proposal-transitions.test.ts`, `proposal.actions.test.ts`, `proposal.schema.test.ts` y los tests de 006 pasan **sin modificaciones**; ningún test usa red, Clerk ni Neon reales; `package.json`, `package-lock.json`, `layout.tsx`, `proxy.ts` y `drizzle/` no cambian; el único componente shadcn añadido es `alert-dialog` (si se aprueba D-D); la tabla de rutas del build no cambia.

## 11. Pruebas requeridas

Vitest, junto al archivo, `// @vitest-environment node` donde no haya DOM (SETUP §3). Los tests existentes de 005/006/007 **no se modifican**; las pruebas nuevas van en archivos nuevos.

- `src/modules/proposals/schemas/proposal-selection.schema.test.ts` (AC17).
- `src/modules/projects/services/project-transitions.test.ts` con `createTestDb()` (AC11): solo `published -> proposal_selected`; `draft`/`closed`/`contracted`/`proposal_selected` devuelven `false` sin cambio; otros proyectos intactos; dentro de una transacción.
- `src/modules/proposals/services/proposal-accept.test.ts` con `createTestDb()` (AC11): `acceptPendingProposal` (pending del proyecto correcto -> `true`; `withdrawn`/`rejected`/otro proyecto -> `false`), y secuencia accept + `rejectPendingProposals` rechaza solo a las demás y deja `withdrawn`. (Archivo nuevo para no tocar `proposal-transitions.test.ts`.)
- `src/modules/proposals/services/proposal-selection.service.test.ts` con `createTestDb()` y el mismo patrón de mock (`server-only` y `@/lib/db/client` con `Proxy` + `holder`) que `proposal.service.test.ts`; siembra `client`/`otherClient`/`developer` x3/`admin` y proyectos en cada estado. Cubre AC1-AC10, AC12-AC14:
  - selección feliz, una sola ganadora, demás `pending -> rejected`, `withdrawn` y `rejected` previas intactas, otros proyectos intactos;
  - versión cambiada (editar con `proposal.service.updateProposal` real y luego seleccionar con la versión vieja y con la nueva), propuesta nunca editada (precisión ms/µs), retirada entre vista y selección;
  - proyecto `draft`/`closed`/`proposal_selected`/`contracted`; ajeno, inexistente, propuesta de otro proyecto -> `NOT_FOUND`; `admin` y `developer` -> `FORBIDDEN`;
  - idempotencia (misma propuesta, otra propuesta, proyecto cerrado);
  - atomicidad: `vi.mock` del módulo `project-transitions` con un envoltorio de `vi.hoisted` que delega en el original salvo cuando una bandera hace lanzar a `markProposalSelected`; tras el fallo se verifica el estado completo sin cambios;
  - red de seguridad: selección sembrada con el proyecto `published` -> `ALREADY_SELECTED` y nada cambia; INSERT directos que violan los UNIQUE / el índice parcial / la FK compuesta fallan (se hace un test de convivencia; la cobertura aislada de restricciones sigue en `constraints.test.ts` de 003);
  - concurrencia con `Promise.allSettled`: dos propuestas distintas, la misma propuesta dos veces, selección vs `withdrawProposal`, vs `updateProposal`, vs `createProposal`, vs `closeProject` (servicio real de `project.service`), verificando invariantes (AC2, R10) y que cada resultado es éxito o error de dominio permitido.
  - **Limitación documentada en el archivo de prueba**: PGlite es de una sola conexión y serializa las transacciones; estas pruebas demuestran coherencia, no el comportamiento real de `FOR UPDATE` (ver RF5). El reviewer valida el lock leyendo el SQL.
- `src/modules/proposals/actions/proposal-selection.actions.test.ts` (AC16): mismo patrón que `proposal.actions.test.ts` (mock de `requireRole`, de `proposal-selection.service`, de `next/cache` y `next/navigation`): sin sesión, rol incorrecto (admin/developer), UUID inválido, token inválido, éxito con las seis rutas revalidadas, los seis `ProposalError` -> mensaje, `AuthError NOT_FOUND`, error desconocido.
- Regresión: `project.service.test.ts`, `proposal.service.test.ts`, `proposal-transitions.test.ts`, `proposal.actions.test.ts`, `proposal.schema.test.ts` y tests de 006 se ejecutan y pasan sin cambios (el reviewer los ejecuta antes y después).
- No requieren test unitario (SETUP §3): `client-proposal-detail.tsx`, `project-proposals-view.tsx` (presentacionales) y `alert-dialog.tsx` (shadcn). `select-proposal-button.tsx`: test RTL opcional (abre/cancela/confirma con la action mockeada y muestra el error); no obligatorio.
- Verificación manual (humano tras T4): AC18-AC20 con `client` dueño, `client` ajeno, `developer` y `admin`; dos pestañas del cliente seleccionando propuestas distintas; el desarrollador editando mientras el cliente tiene abierto el diálogo; revisar a 390 px.

## 12. Dependencias y riesgos

- Dependencias npm: **ninguna**. Componente shadcn: `alert-dialog` (T0), solo si se aprueba D-D; usa `@base-ui/react` ya instalado.
- Riesgos:
  1. El lock real no es demostrable con PGlite (RF5): se valida por revisión del SQL y por las restricciones de BD como red de seguridad; es el riesgo principal de la spec.
  2. Desvío respecto a 007 ("transición del proyecto en `project.service.ts`"): se resuelve con una hoja en `projects` (D-A); alternativa documentada.
  3. Precisión de `updatedAt` (µs en BD vs ms en JS): resuelta comparando en JS sobre la fila bloqueada (RF3); un test lo cubre (AC4).
  4. Acción irreversible: el diálogo con foco inicial en "Cancelar" y la ausencia de cambio de selección (D2) hacen que un clic erróneo no tenga deshacer en el MVP; mitigación: cierre del proyecto (005) y mensaje claro. Se anota para 012/014.
  5. El proyecto sale del catálogo y el detalle público al seleccionarse (006 solo muestra `published`): un desarrollador con el enlace ve 404 (comportamiento correcto).
  6. El CLI de shadcn puede generar un componente con una API distinta de la esperada (base-nova): el developer lee el archivo generado.
  7. Un cliente puede quedar en `proposal_selected` sin ruta de pago hasta 009: aceptable en el desarrollo por fases; el aviso textual lo explica y "Cerrar" sigue disponible.
  8. No se pudo abrir el artifact de diseño: detalles visuales por contrastar con el humano.

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. Archivos de otras specs: `proposal-transitions.ts` y `proposal-errors.ts` y `proposal.types.ts` -> T1; `system-design.md` -> T2; `client-proposal-detail.tsx` y `project-proposals-view.tsx` -> T4; `project.service.ts`, `project-list.tsx`, `proposal.actions.ts`, `proposal.service.ts`, `my-proposals-list.tsx`, páginas de `src/app` **no se tocan**. Durante el bloque paralelo (T3, T4) nadie corre `npm install` ni `npm run build`; el reviewer corre el build completo al final.

### T0 — Componente shadcn `alert-dialog` (serial, primero; solo si se aprueba D-D)

- Archivos: `src/components/ui/alert-dialog.tsx` (generado con `npx shadcn@latest add alert-dialog`; sin editarlo a mano).
- Depende de: —
- Paralelizable: no (cambio compartido en `src/components/ui`)
- Cubre: base de AC18, AC20 y AC21 (`package.json` sin cambios)

### T1 — Contratos y hojas de transición (serial)

- Archivos: `src/modules/proposals/services/proposal-errors.ts` (añadir `ALREADY_SELECTED`, `PROPOSAL_CHANGED`, sus estados 409, sus mensajes en `PROPOSAL_ERROR_MESSAGES` y el mapa `PROPOSAL_SELECTION_ERROR_MESSAGES`), `src/modules/proposals/types/proposal.types.ts` (añadir `SelectProposalInput`, `ProposalSelectionResult`), `src/modules/proposals/schemas/proposal-selection.schema.ts`, `src/modules/proposals/schemas/proposal-selection.schema.test.ts`, `src/modules/proposals/services/proposal-transitions.ts` (añadir `acceptPendingProposal`; `rejectPendingProposals` sin cambios), `src/modules/proposals/services/proposal-accept.test.ts`, `src/modules/projects/services/project-transitions.ts`, `src/modules/projects/services/project-transitions.test.ts`.
- Depende de: —
- Paralelizable: no (contrato base de T2-T4)
- Cubre: AC11, AC15 (hojas), AC17

### T2 — Servicio de selección y nota de arquitectura

- Archivos: `src/modules/proposals/services/proposal-selection.service.ts`, `src/modules/proposals/services/proposal-selection.service.test.ts`, `docs/architecture/system-design.md` (solo §4: ampliar la excepción `projects` <-> `proposals` según RF1).
- Depende de: T1
- Paralelizable: no (T3 importa su firma; T4 depende del contrato de T3)
- Cubre: AC1-AC10, AC12-AC15

### T3 — Server action

- Archivos: `src/modules/proposals/actions/proposal-selection.actions.ts`, `src/modules/proposals/actions/proposal-selection.actions.test.ts`.
- Depende de: T1, T2
- Paralelizable: sí (con T4: archivos disjuntos; T4 importa la firma fijada en RF6)
- Cubre: AC16

### T4 — UI de selección

- Archivos: `src/modules/proposals/components/select-proposal-button.tsx`, `src/modules/proposals/components/client-proposal-detail.tsx` (props `projectId`/`projectStatus` y el botón, RF8), `src/modules/proposals/components/project-proposals-view.tsx` (pasar props al panel y aviso de siguiente paso, RF8).
- Depende de: T0 (si se aprueba D-D), T1, contrato de T3 (RF6)
- Paralelizable: sí (con T3)
- Cubre: AC18, AC19, AC20 (verificación manual; sin tests unitarios obligatorios)

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: **aprobada** por el humano con las recomendaciones por defecto de D-A a D-J y de las preguntas abiertas P1-P5.

- D-A. Dónde vive la transición del proyecto. Recomendación: servicio de selección en `proposals` y hoja nueva `projects/services/project-transitions.ts` (`markProposalSelected`), `project.service.ts` sin cambios. Alternativa (la sugerida por 007): exportar la transición desde `project.service.ts` (una dependencia servicio -> servicio de `proposals` hacia `projects`, que arrastra `db` y contradice la regla de 007 "`proposals` nunca importa `project.service`").
- D-B. Reintento sobre la misma propuesta ya ganadora. Recomendación: éxito idempotente (`alreadySelected: true`, sin escribir), solo con el proyecto `proposal_selected`/`contracted`. Alternativa: `ALREADY_SELECTED` también para la misma propuesta (más simple, pero un doble clic mostraría un error aunque la selección haya funcionado).
- D-C. Versión vista. Recomendación: `updatedAt` en ISO con milisegundos, comparado en JS bajo lock (RF3). Alternativa: columna `version` incremental (requiere migración y spec propia) o comparar en SQL con `date_trunc('milliseconds', ...)` (más complejo y atado a la zona de truncado).
- D-D. Mecanismo de confirmación. Recomendación: `alert-dialog` de shadcn (T0). Alternativa: `window.confirm` con las cuatro consecuencias (sin T0; 014 lo sustituiría después; peor accesibilidad y sin error inline).
- D-E. Rechazo de las demás. Recomendación: aceptar primero y reutilizar `rejectPendingProposals` sin cambiar su firma. Alternativa: añadirle un parámetro `exceptProposalId` y rechazar antes de aceptar (cambia la firma de una hoja ya aprobada y usada por 005).
- D-F. Enlace "Continuar al pago de prueba". Recomendación: omitirlo hasta 009 y mostrar un aviso textual. Alternativa: botón deshabilitado con "Próximamente" (ruido; ofrece un control que no hace nada).
- D-G. Ubicación de la action. Recomendación: archivo nuevo `proposal-selection.actions.ts` (mantiene intacto `proposal.actions.ts` y su test, cuyo mock de `proposal.service` rompería al importar el servicio de selección). Alternativa: añadirla a `proposal.actions.ts` (menos archivos, pero obliga a modificar su test y repetir mocks).
- D-H. Códigos de error. Recomendación: dos códigos nuevos (`ALREADY_SELECTED`, `PROPOSAL_CHANGED`) y mapa de mensajes propio de la selección (no se cambia el texto de `INVALID_STATE`/`PROJECT_NOT_OPEN` de 007). Alternativa: reutilizar solo `INVALID_STATE` para todo (menos código; mensajes engañosos y la UI no distingue "recarga" de "ya elegida").
- D-I. Alcance de UI fuera de la vista del cliente. Recomendación: sin cambios en "Mis proyectos", "Mis propuestas" ni el detalle público (los estados ya se reflejan por los badges existentes). Alternativa: añadir textos explicativos de resultado al desarrollador (corresponde a 013).
- D-J. Rutas a revalidar. Recomendación: las seis de RF6 (incluye `/projects`, porque el proyecto sale del catálogo). Alternativa: solo las dos de la vista del cliente (más barato; el catálogo mostraría el proyecto hasta su siguiente render dinámico).

## Preguntas abiertas

- P1. ¿El aviso de la vista del cliente debe nombrar a la propuesta ganadora (nombre y precio) o se mantiene genérico? Recomendación: genérico en 008 (la ganadora puede estar en otra página de la tabla); 012/013 definen el panel completo.
- P2. ¿Se necesita un motivo o comentario opcional al rechazar a las demás propuestas? Recomendación: no (el requerimiento no lo pide).
- P3. ¿Debe permitirse "cambiar de propuesta" antes de pagar? Recomendación: no en el MVP (D2); la salida es cerrar el proyecto y publicar otro.
- P4. ¿El texto "Test Mode; no se mueve dinero real" debe aparecer ya en el diálogo? Recomendación: sí (I5), con la redacción de RF7; confirmar con el diseño.
- P5. Detalles visuales (ancho, posición, jerarquía del diálogo): por contrastar con el diseño de referencia, que no fue accesible.

## Próximas fases

- 009: añade el enlace/botón real "Continuar al pago de prueba" (modificando el archivo que el humano decida, asignado a una tarea suya), el intento de pago con importe y moneda tomados de la propuesta `accepted` guardada en servidor (I2) y la lectura de `proposal_selections`.
- 010: webhook verificado, `proposal_selected -> contracted` mediante una función hoja de `projects/services/project-transitions.ts` (el archivo creado aquí), sin SQL directo desde `payments`.
- 012/013: paneles (propuesta seleccionada, estado de pago, contacto del ganador, perfil visible, texto del resultado para el desarrollador).
- 014: sustituir el resto de `window.confirm` (retirar, cerrar, despublicar) por `alert-dialog`; mensajes de éxito.
- 015: rate limiting de la action de selección y revisión de privacidad.
- Mejora opcional: CHECK o disparador que ligue `projects.status = 'proposal_selected'` con la existencia de una fila de selección (spec y migración propias).

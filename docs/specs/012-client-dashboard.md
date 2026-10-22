# Dashboard del cliente: resumen, estado de pago y transferencia, acciones pendientes y cancelación de un pago pendiente

Estado: done

Spec 012 de `docs/SDD-PLAN.md §7` (Fase 4). Depende de specs `done`: 005 (proyectos), 007 (propuestas), 008 (selección), 009 (checkout), 009b (navegación), 010 (estado y webhooks), 011a/b/c (cuentas conectadas y transferencias), 019 (perfil) y 020 (valoraciones). Cierra el pendiente anotado en `docs/MANUAL-TESTS.md §10` y en `state-machines.md §5` / `system-design.md §8 D2`: la **cancelación explícita** de un pago de prueba atascado en `pending`, que hoy bloquea cerrar el proyecto con `PAYMENT_IN_PROGRESS`. El panel del desarrollador es la spec 013 y no se toca.

## Objetivo

Que el cliente vea en un solo lugar (`/dashboard`): (1) cuántos proyectos tiene por estado; (2) para sus proyectos en contratación (`proposal_selected`) y contratados (`contracted`), el estado del pago de prueba y de la transferencia al desarrollador; (3) un acceso rápido a lo que tiene pendiente (elegir propuesta, pagar o continuar el pago, valorar); y (4) pueda **cancelar** un pago de prueba `pending` abandonado, sin esperar al webhook `checkout.session.expired`, de modo que el proyecto pueda reintentar el pago o cerrarse.

Arquitectura que aplica (solo estas secciones): `system-design.md §2` (I1 a I5), `§4` (módulos; un módulo nuevo `dashboard` de solo lectura), `§6` (permisos: el cliente ve y gestiona solo lo propio), `§7` (pagos: solo un evento verificado o una lectura autenticada del servidor transiciona; sin regresiones), `§8` (D2). `state-machines.md §3` (intento de pago: `pending -> canceled` por "cancelación explícita del servidor al abandonar la sesión"), `§4` (la transferencia es independiente del pago), `§5` (casos límite). Guías de Next 16 a consultar al implementar: `node_modules/next/dist/docs/` (server actions, `revalidatePath`, `redirect`; `staleTimes` para la caché de navegación de páginas dinámicas).

## Hechos verificados (código del repo y SDK, 2026-10-22)

| Hecho | Fuente |
|---|---|
| `/dashboard/projects` es la lista paginada (10 por página) y filtrada por estado/orden del cliente, con acciones de ciclo de vida por fila (editar, cerrar, publicar), y es el destino del enlace "Mis proyectos" del header (009b) | `src/app/dashboard/projects/page.tsx`, `project-list.tsx`, `dashboard-link.ts` |
| No existe `src/app/dashboard/page.tsx`: `/dashboard` hoy da 404 | `ls src/app/dashboard` (`account`, `payouts`, `projects`, `proposals`) |
| `closeProject` lanza `PAYMENT_IN_PROGRESS` desde `proposal_selected` si hay intento `pending` o `completed_test`; no se modifica en esta spec | `project.service.ts:184-207` |
| `getProjectPaymentOverview` (009/011) es por proyecto y lanza si no hay propuesta ganadora; calcula `canStart`/`canResume`/`developerPayoutsReady`/`transfer` con consultas por proyecto (no sirve en lista: N+1) | `payment-overview.service.ts` |
| `applySessionOutcome(tx, { outcome, session })` es el único núcleo que convierte la lectura de una sesión en `completed_test`/`failed`/`canceled`: bloquea proyecto y luego intento (`FOR UPDATE`), valida referencias contra la BD y tiene la guarda `status = 'pending'` en el `WHERE`; lo usan el webhook y `reconcileProjectPayment` | `payment-session-effects.ts` |
| `reconcileProjectPayment(actor, projectId)` ya lee la sesión (`retrieve`) y aplica `completed`/`expired`; devuelve `completed \| canceled \| unchanged \| none` | `payment-reconciliation.service.ts` |
| `cancelAttempt(..., { withoutSession })` de 009 es privado y cubre el intento sin session id; `RESUME_WINDOW_SECONDS` (600) ya está exportado | `payment-checkout.service.ts:21, 343` |
| `stripe.checkout.sessions.expire(id, params?, options?)` existe en el SDK instalado | `node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts:42` |
| Una sesión `expired` ya está cerrada para siempre: no puede completarse. Stripe solo expira sesiones `open` (para una `complete` el `expire` devuelve error de petición inválida) | Comportamiento documentado de Checkout; **a verificar manualmente** (ver Pruebas manuales) |
| Si el webhook `checkout.session.expired` llega después de que el servidor canceló el intento, `applySessionOutcome` lo ignora (`attempt_not_pending`) | `payment-session-effects.ts:81-89` y contrato de 009 §7 |
| Permiso `payment.start` (solo `client`) ya cubre iniciar, reanudar y refrescar pagos; el cancelar usa el mismo | `permissions.ts`, `payment-reconciliation.service.ts:29` |
| Índices existentes que sirven al dashboard: `projects (client_id, created_at DESC)`, `payment_attempts (project_id, created_at DESC)`, `developer_transfers.payment_attempt_id` UNIQUE, `developer_ratings.project_id` UNIQUE | spec 003, `payment-attempts.table.ts`, `developer-transfers.table.ts`, spec 020 |
| La página de pago ya pinta el panel "pendiente" con "Continuar en Stripe" y "Actualizar estado" (`canResume`) | `payment-page-view.tsx:213-217` |
| `drizzle/` llega a `0008_developer_transfers`. **Esta spec no necesita migración** | `ls drizzle` |

## Decisiones (con recomendación por defecto)

- **D-A. Ruta: se crea `/dashboard` (panel de resumen) y `/dashboard/projects` se queda como está.** Justificación: `/dashboard/projects` es una lista paginada y filtrada (spec 005, `done`); un resumen por estado necesita contar **todos** los proyectos con independencia del filtro y la página, y las acciones pendientes cruzan proyectos, pagos, transferencias y valoraciones (más de un dominio). Mezclarlo en la lista rompería la responsabilidad única de `ProjectList` y obligaría a reescribir un archivo `done` con muchas ramas. Alternativa descartada: extender `/dashboard/projects` (menos rutas, pero la lista y el resumen compartirían `searchParams` y paginación sin relación). El panel enlaza a la lista (`?status=`) para el detalle y las acciones de ciclo de vida.
- **D-B. Navegación (009b).** El enlace del cliente en `getDashboardLink` pasa de `{ /dashboard/projects, "Mis proyectos" }` a `{ /dashboard, "Mi panel" }`. `isActivePath` ya resalta por prefijo con frontera de segmento, así que "Mi panel" queda activo en `/dashboard` y en `/dashboard/projects` (misma sección). La lista sigue accesible desde el panel ("Ver todos mis proyectos") y desde "Nuevo proyecto". Developer (`/dashboard/proposals`), `needs_onboarding` y `admin` no cambian. Es una modificación explícita de 009b (`done`) y de su test; se documenta en MANUAL-TESTS 7b. Alternativa descartada: dejar el header intacto y que `/dashboard` quede huérfano (nadie lo encuentra).
- **D-C. Nuevo módulo `src/modules/dashboard` de solo lectura.** El resumen cruza `projects`, `proposals`, `payments` y `ratings`; no pertenece a ninguno. Lee **tablas Drizzle** (no servicios) de esos módulos, igual que ya hacen `profile` y `ratings` (`system-design.md §4`); nadie depende de `dashboard` salvo `src/app`. No escribe nada. La **cancelación** sí escribe `payment_attempts`, así que vive en `payments` (dueño de esa tabla), no en `dashboard`.
- **D-D. Acceso a `/dashboard` solo para `client`.** `requireRole("client")`; un `developer` o `admin` que escriba la URL recibe 404 (mismo criterio que `/dashboard/projects`); sin sesión, `/sign-in`. El panel del desarrollador es la 013. Alternativa: redirigir al developer a `/dashboard/proposals` (ver P3).
  - Resuelta por la spec 013: `/dashboard` es role-aware, el developer ve su panel; el guard del servicio no cambia.
- **D-E. Cancelación: Stripe decide, nunca el navegador ni una suposición local.** Un intento `pending` con sesión solo pasa a `canceled` si (a) `stripe.checkout.sessions.expire` devuelve la sesión `expired`, o (b) tras un fallo de `expire`, la lectura autenticada (`reconcileProjectPayment`, patrón de 009/010) la devuelve `expired`. Nunca se cancela localmente "porque `expire` falló". La transición local reutiliza `applySessionOutcome(tx, { outcome: "expired", ... })` (mismo núcleo que el webhook: locks, validación de referencias, guarda `pending`).
- **D-F. Carrera con un pago que se completa a la vez (riesgo central; ver R1).** El árbitro es Stripe: `expire` solo tiene éxito si la sesión sigue `open`, y una sesión `expired` no puede completarse. Si el cliente completa el pago a la vez, ocurre una de dos cosas, ambas seguras: (1) `expire` gana: la sesión queda `expired`, el cliente ve la página de Stripe vencida y no se cobra nada; el intento pasa a `canceled`. (2) El pago gana: `expire` falla; el servicio no cancela, delega en `reconcileProjectPayment`, que lee la sesión `complete`/`paid` y aplica `completed_test` + fila de transferencia + `contracted` (más la transferencia post-commit); el resultado al usuario es `completed` ("el pago se completó antes de poder cancelarlo"), no un error. En la BD, el webhook y la cancelación se serializan por el lock de proyecto -> intento y la guarda `status = 'pending'`, de modo que no hay un `completed_test` revertido ni un `canceled` sobre un pago pagado (R1 detalla el resto).
- **D-G. Intento `pending` sin session id** (ventana entre la Fase A y la Fase C de 009). Si tiene más de `RESUME_WINDOW_SECONDS` se cancela con la guarda `stripe_checkout_session_id IS NULL` en el `WHERE` (mismo criterio que 009: nadie recibió nunca la URL). Si es más reciente, hay un checkout en vuelo: `PAYMENT_NOT_CANCELABLE` ("inténtalo de nuevo en unos minutos"), sin cambios.
- **D-H. Sin llamadas a Stripe en lecturas del dashboard.** `getClientDashboard` solo usa la BD. El estado mostrado es el último que el servidor confirmó; si puede estar desfasado, la UI ofrece el enlace a la página de pago, donde ya existe "Actualizar estado" (010). Stripe solo se llama en la acción de cancelar.
- **D-I. El cierre del proyecto no cancela solo.** `closeProject` no se modifica (sigue lanzando `PAYMENT_IN_PROGRESS`): la cancelación es una acción explícita y separada, y el cliente decide después reintentar el pago o cerrar el proyecto. Alternativa descartada: que `closeProject` cancele el intento (mezcla Stripe dentro de la transacción de cierre y de un servicio `done`).
- **D-J. Dónde se ofrece "Cancelar pago de prueba":** en el panel (fila de un proyecto con pago `pending`) y en la página de pago (junto a "Continuar en Stripe"/"Actualizar estado"). No se añade a `project-list.tsx`. Se confirma con `AlertDialog` (mismo patrón que `select-proposal-button.tsx`, foco inicial en "Volver"), porque no tiene deshacer más que iniciar un intento nuevo.
- **D-K. Alcance de listas.** Máximo 20 proyectos en contratación y 20 acciones pendientes; si hay más, un enlace "Ver todos" a `/dashboard/projects?status=proposal_selected` o `?status=contracted`. Sin paginación en el panel (YAGNI).
- **D-L. Acciones pendientes, derivadas en una función pura** (`deriveProjectActions`) para poder probarla sin BD:

| Condición del proyecto | Acción | Destino |
|---|---|---|
| `published` con al menos una propuesta `pending` | `choose_proposal` "Elegir propuesta" (con el número de propuestas pendientes) | `/projects/[id]/proposals` |
| `proposal_selected`, desarrollador con cobros activos, sin intento o último `canceled`/`failed` | `start_payment` "Pagar (prueba)" | `/projects/[id]/payment` |
| `proposal_selected` con intento `pending` | `resume_payment` "Continuar o cancelar el pago" | `/projects/[id]/payment` (y botón de cancelar en la fila) |
| `proposal_selected`, desarrollador sin cobros activos y sin intento activo | Sin acción; nota "Esperando que el desarrollador configure sus cobros de prueba" (coincide con `DEVELOPER_PAYOUTS_NOT_READY` de 011c) | enlace "Ver pago" |
| `contracted` sin valoración en `developer_ratings` | `rate` "Valorar al desarrollador" | `/projects/[id]/rate` |
| `contracted` ya valorado | Sin acción; enlace "Ver tu valoración" | `/projects/[id]/rate` |

- **D-M. Textos de dinero.** Todo el bloque de pagos lleva el aviso "Modo de prueba · No se mueve dinero real" (`role="note"`), la transferencia se muestra con `TRANSFER_TEST_NOTICE` ("Transferencia de prueba, no es dinero real") y nunca como "recibido" ni "garantizado" (I3, I5; `BRIEF §7` reglas 14 y 15). Si no hay fila de transferencia: "Sin transferencia todavía".

## Alcance

- Incluye:
  - Página `/dashboard` (+ `loading.tsx`, `error.tsx`) y módulo `dashboard`: servicio de lectura `getClientDashboard`, función pura `deriveProjectActions`, componentes (resumen por estado, acciones pendientes, proyectos en contratación con pago y transferencia).
  - Cancelación explícita de un pago `pending`: servicio `cancelPendingPayment`, server action `cancelPendingPaymentAction`, hoja de transición para el intento sin sesión, código de error `PAYMENT_NOT_CANCELABLE`, botón con confirmación en panel y en la página de pago.
  - Cambio del enlace del header del cliente a `/dashboard` ("Mi panel").
  - Documentación: `MANUAL-TESTS.md` (sección de 012, ajuste de 7b y del pendiente de §10), `system-design.md` (módulo `dashboard`, D2 resuelta), `state-machines.md` (§3 y §5, solo adiciones).
- No incluye:
  - Panel del desarrollador y datos de contacto del ganador (013). Dashboard de admin.
  - Cambios en `closeProject`, `listMyProjects`, `ProjectList`, `project-list.tsx`, `ProjectLifecycleActions`, la matriz de permisos, el esquema o migraciones (`payment_attempts`, `developer_transfers`, `developer_ratings` ya traen todo).
  - Reabrir o cambiar la selección (D2), reembolsos, cancelar un pago `completed_test`, cancelar transferencias.
  - Llamadas a Stripe desde lecturas; polling o tiempo real; notificaciones; gráficos; paginación o filtros propios del panel; propuestas recibidas por proyecto en el panel (ya en `/projects/[id]/proposals`).
  - Rate limiting de la acción (015) y sustitución de `window.confirm` en el ciclo de vida (014).
  - `npm install` y componentes shadcn nuevos.

## Reutilizar

Inventario verificado con Glob, Grep y Read en `src/modules/*`, `src/components`, `src/lib`.

| Existente | Uso |
|---|---|
| `payments/services/payment-session-effects.ts` (`applySessionOutcome`) y `payment-reconciliation.service.ts` (`reconcileProjectPayment`) | **Núcleo único de transición** y lectura autenticada de la sesión. La cancelación los llama; no se reescribe ninguna regla de transición |
| `payments/services/payment-transitions.ts` (`cancelPendingAttempt`) | Se **añade una hoja hermana** `cancelPendingAttemptWithoutSession` (guarda de sesión nula en el `WHERE`) para el intento sin sesión; el `cancelAttempt` privado de 009 no se toca |
| `payments/services/payment-checkout.service.ts` (`RESUME_WINDOW_SECONDS`, ya exportado) | Ventana de reanudación; **solo se importa** |
| `payments/services/payment-errors.ts` (`PaymentError`, mapas de estado y mensajes) | Se añade un código; patrón de errores |
| `payments/types/payment.types.ts` (`PaymentAttemptStatus`, `PAYMENT_ATTEMPT_STATUS_LABELS`, `PaymentActionResult`, `ReconcileResult`, `RefreshActionResult`) y `developer-transfer.types.ts` (`DeveloperTransferStatus`, `DEVELOPER_TRANSFER_STATUS_LABELS`, `TRANSFER_TEST_NOTICE`) | Tipos y etiquetas; no se redeclaran |
| `payments/actions/payment-reconciliation.actions.ts` y `refresh-payment-button.tsx` | **Patrón exacto** de action (`requireRole` primero, `startCheckoutInputSchema` para validar el UUID, `toResult`, `revalidatePath`) y de botón (`useTransition`, `aria-live`, `router.refresh()`) |
| `payments/schemas/payment.schema.ts` (`startCheckoutInputSchema`) | Validación de `projectId` |
| `payments/services/payment-overview.service.ts` | **No se reutiliza** (por proyecto y lanza); se usa como oráculo en un test de coherencia con el servicio del panel |
| `proposals/components/select-proposal-button.tsx` (`alert-dialog`) | Patrón de confirmación del botón de cancelar |
| `projects/schema/projects.table.ts`, `proposals/schema/{proposals,proposal-selections}.table.ts`, `payments/schema/{payment-attempts,developer-transfers,connected-accounts}.table.ts`, `ratings/schema/developer-ratings.table.ts`, `users/schema/users.table.ts` | Lectura Drizzle del servicio del panel (sin importar servicios ajenos) |
| `projects/components/project-status-badge.tsx`, `projects/types/project.types.ts` (`ProjectStatus`, `PROJECT_STATUS_LABELS`), `projects/schemas/project.schema.ts` (`PROJECT_LIST_STATUSES`) | Etiquetas y estados; enlaces `?status=` a la lista |
| `auth`: `requireRole`, `can`, `handleAuthErrorForPage`, `AuthError`, `requireOwnership` | Guards |
| `src/lib/money.ts` (`formatUsd`), `src/lib/stripe.ts` (`getStripe`, `StripeConfigError`; helpers de errores de Stripe) | Importes y frontera de Stripe (mockeable) |
| `src/components/shared/empty-state.tsx`, `ui/button`, `ui/badge`, `ui/alert-dialog`; `payments/components/payments-loading.tsx` y `payments-error.tsx` (aceptan `label`/`title`) | UI y `loading.tsx`/`error.tsx` de la ruta nueva sin componentes nuevos |
| `src/lib/db/test-db.ts` (`createTestDb`), patrón `Proxy` + `holder`, `vi.mock("server-only")`, y mock de `@/lib/stripe` de `payment-reconciliation.service.test.ts` | Pruebas con PGlite y Stripe falso |
| `auth/services/dashboard-link.ts` y su test; `lib/is-active-path.ts` | Cambio de ruta del cliente; el resaltado por prefijo ya sirve |

No existe un módulo `dashboard`, ni servicio que agregue por cliente ni acción de cancelación (Grep de `cancelAttempt`, `sessions.expire`, `getClientDashboard`): se crean. No hay `src/hooks` ni stores y no se necesitan. Verificado con `ls src/components/ui` (`alert-dialog`, `badge`, `button`, `input`, `label`, `native-select`, `textarea`): no hace falta ningún componente shadcn nuevo.

## Archivos

Nuevos (N) y modificados (M). Cada archivo pertenece a una sola tarea. Hay cambios sin commitear en el árbol: en los archivos M **solo se añade o se reemplaza lo indicado**; no se reformatea ni se toca nada ajeno.

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/payments/services/payment-errors.ts` (añadir `PAYMENT_NOT_CANCELABLE`) | M | T0 |
| `src/modules/payments/types/payment.types.ts` (añadir `CancelPaymentResult`, `CancelPaymentActionResult`) | M | T0 |
| `src/modules/payments/services/payment-transitions.ts` (añadir `cancelPendingAttemptWithoutSession`) | M | T0 |
| `src/modules/dashboard/types/dashboard.types.ts` | N | T0 |
| `src/modules/payments/services/payment-cancellation.service.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/actions/payment-cancellation.actions.ts` + `.test.ts` | N | T1 |
| `src/modules/dashboard/services/dashboard-actions.ts` + `.test.ts` | N | T2 |
| `src/modules/dashboard/services/client-dashboard.service.ts` + `.test.ts` | N | T2 |
| `src/modules/payments/components/cancel-payment-button.tsx` | N | T3 |
| `src/modules/payments/components/payment-page-view.tsx` (solo añadir el botón junto a `RefreshPaymentButton`) | M | T3 |
| `src/modules/dashboard/components/client-dashboard-view.tsx`, `dashboard-status-summary.tsx`, `dashboard-pending-actions.tsx`, `dashboard-contracting-list.tsx` | N | T3 |
| `src/app/dashboard/page.tsx`, `src/app/dashboard/loading.tsx`, `src/app/dashboard/error.tsx` | N | T3 |
| `src/modules/auth/services/dashboard-link.ts` + `dashboard-link.test.ts` (enlace del cliente) | M | T3 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md` | M | T4 |

No cambian: `package.json`, `package-lock.json`, `.env.example`, `drizzle/**`, `src/app/layout.tsx`, `globals.css`, `src/components/ui/**`, `proxy.ts`, `project.service.ts`, `project-list.tsx`, `permissions.ts`, `docs/SETUP.md`.

## Contratos

### 1. Errores y tipos de pagos (T0)

`payment-errors.ts`: se añade `PAYMENT_NOT_CANCELABLE` a `PaymentErrorCode` (estado HTTP **409**, que ya es un valor de `PaymentErrorStatus`):

| Código | Mensaje (es) | Cuándo |
|---|---|---|
| `PAYMENT_NOT_CANCELABLE` | "El pago de prueba no se puede cancelar en este momento. Inténtalo de nuevo en unos minutos." | Intento sin sesión todavía en la ventana de reanudación; o Stripe no permitió expirar la sesión y la relectura no la devuelve `expired` ni `complete` (p. ej. método de pago asíncrono en proceso) |

`payment.types.ts`:

```ts
export type CancelPaymentResult = { outcome: "canceled" | "completed" | "none" };
// canceled : el intento quedó canceled (por esta llamada o porque ya lo estaba tras ser expirado en Stripe)
// completed: el pago se completó antes (carrera perdida, o ya estaba completed_test); NO se canceló nada
// none     : no había intento pending (ninguno, o ya failed/canceled)
export type CancelPaymentActionResult =
  | { ok: true; outcome: CancelPaymentResult["outcome"] }
  | PaymentActionResult;
```

`payment-transitions.ts` (hoja; recibe el executor, no importa `db`, igual que las demás):

```ts
cancelPendingAttemptWithoutSession(executor, attemptId: string): Promise<boolean>
// UPDATE ... SET status = 'canceled' WHERE id = :id AND status = 'pending' AND stripe_checkout_session_id IS NULL RETURNING id
```

### 2. Tipos del panel (T0) — `src/modules/dashboard/types/dashboard.types.ts`

```ts
import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import type { DeveloperTransferStatus } from "@/modules/payments/types/developer-transfer.types";
import type { ProjectStatus } from "@/modules/projects/types/project.types";

export const DASHBOARD_LIST_LIMIT = 20;

export type DashboardActionKind = "choose_proposal" | "start_payment" | "resume_payment" | "rate";

export type DashboardAction = {
  kind: DashboardActionKind;
  projectId: string;
  projectTitle: string;
  pendingProposals?: number;       // solo en choose_proposal
};

export type DashboardProjectPayment = {
  projectId: string;
  title: string;
  status: "proposal_selected" | "contracted";
  developerName: string;           // users.display_name del ganador (ya visible al cliente en 009); sin email ni id
  amountCents: number;             // de la propuesta aceptada
  payment: { status: PaymentAttemptStatus; updatedAt: Date } | null;   // último intento; null = no iniciado
  transfer: { status: DeveloperTransferStatus; completedAt: Date | null } | null; // del último intento completed_test
  developerPayoutsReady: boolean;
  rated: boolean;                  // existe fila en developer_ratings (solo relevante en contracted)
};

export type ClientDashboard = {
  counts: { total: number; byStatus: Record<ProjectStatus, number> };   // todas las claves presentes, 0 si no hay
  pendingActions: DashboardAction[];
  contracting: DashboardProjectPayment[];       // proposal_selected | contracted, updated_at desc, máx. DASHBOARD_LIST_LIMIT
  contractingTotal: number;                     // total real, para decidir "Ver todos"
};
```

Sin ids de Stripe, sin `clientId`/`developerId`, sin email ni contacto, sin `checkoutUrl`, sin `reason` de la transferencia (el motivo detallado sigue siendo del desarrollador, 011b).

### 3. Función pura (T2) — `dashboard/services/dashboard-actions.ts` (sin `server-only`)

```ts
deriveProjectActions(item: DashboardProjectPayment): DashboardAction[]
```

Implementa las filas `proposal_selected`/`contracted` de la tabla de D-L (devuelve `[]` si no hay acción). `choose_proposal` no sale de aquí: lo arma el servicio con su consulta propia. La tabla es un `switch` exhaustivo.

### 4. Servicio del panel (T2) — `client-dashboard.service.ts` (`import "server-only"`)

```ts
getClientDashboard(actor: AuthUser): Promise<ClientDashboard>
```

- `can(actor.role, "project.readPrivate")` -> si no, `AuthError("FORBIDDEN")` **antes** de tocar la BD (admin también cumple el permiso a nivel de matriz, pero el panel es del cliente: se exige `actor.role === "client"`; admin -> `FORBIDDEN`. La página ya filtra con `requireRole("client")`).
- Todo se filtra por `projects.client_id = actor.id` (nunca por un id de la entrada; el servicio no recibe ids). Cero escrituras, **cero llamadas a Stripe**.
- Consultas acotadas (sin N+1; constantes respecto al número de proyectos), ejecutables en `Promise.all`:
  1. Conteo por estado: `GROUP BY status` -> `counts` (se rellenan con 0 los estados ausentes).
  2. `published` con propuestas `pending`: id, título y conteo de propuestas `pending`, orden por la propuesta pendiente más antigua primero, máx. `DASHBOARD_LIST_LIMIT` -> acciones `choose_proposal`.
  3. Proyectos `proposal_selected | contracted` + propuesta `accepted` + nombre del desarrollador (join `proposal_selections` -> `proposals` por `(id, project_id)` -> `users`), `updated_at desc, id desc`, límite; más el total real (`contractingTotal`).
  4. Para los ids de (3), en lotes: intentos (último por `created_at desc, id desc`), transferencias de intentos `completed_test` (último), `connected_accounts.status` de los desarrolladores ganadores (`developerPayoutsReady = status === 'active'`, igual que 009/011c) y filas de `developer_ratings` (`rated`).
- `pendingActions` = `choose_proposal` (2) + `deriveProjectActions` sobre cada fila de (3); orden: `resume_payment`, `start_payment`, `choose_proposal`, `rate`; recorte a `DASHBOARD_LIST_LIMIT`.
- Un proyecto en `proposal_selected | contracted` sin propuesta aceptada (inconsistencia) se omite de `contracting` sin lanzar (el resto del panel sigue funcionando).
- Logs: ninguno con títulos, nombres ni importes.

### 5. Servicio de cancelación (T1) — `payments/services/payment-cancellation.service.ts` (`import "server-only"`)

```ts
cancelPendingPayment(actor: AuthUser, projectId: string): Promise<CancelPaymentResult>
```

Secuencia (ninguna llamada a Stripe dentro de una transacción que retenga locks):

0. `can(actor.role, "payment.start")` -> si no, `AuthError("FORBIDDEN")`, antes de BD y de Stripe. `getStripe()`: `StripeConfigError` -> `PaymentError("STRIPE_NOT_CONFIGURED")` (log solo del mensaje, como 010).
1. Proyecto por id (lectura, sin lock): inexistente -> `AuthError("NOT_FOUND")`; `requireOwnership(actor, clientId)` **sin** `allowAdmin` (ajeno -> `NOT_FOUND`; admin no cancela pagos).
2. Último intento del proyecto (`created_at desc, id desc`):
   - ninguno, `failed` o `canceled` -> `{ outcome: "none" }` (idempotente: un doble clic o una pestaña vieja no falla).
   - `completed_test` -> `{ outcome: "completed" }` (sin cambios).
   - `pending` sin `stripe_checkout_session_id`: si `now - createdAt > RESUME_WINDOW_SECONDS` -> `db.transaction` con `cancelPendingAttemptWithoutSession`; devuelve `canceled` si actualizó una fila, y si no (otra petición guardó la sesión, o cambió el estado) **relee** y reinicia el análisis desde este paso, una sola vez; si sigue ambiguo, `PAYMENT_NOT_CANCELABLE`. Si es más reciente -> `PAYMENT_NOT_CANCELABLE`.
   - `pending` con sesión -> paso 3.
3. `stripe.checkout.sessions.expire(sessionId)` (fuera de transacción):
   - Respuesta válida: `session.livemode === false` y `session.status === "expired"` -> `db.transaction((tx) => applySessionOutcome(tx, { outcome: "expired", session }))`:
     - `applied` (`canceled`) -> `{ outcome: "canceled" }`.
     - `ignored` con `attempt_not_pending` (el webhook o un refresh se adelantaron): se **relee** el intento y se devuelve `canceled` (si quedó `canceled`) o `completed` (si quedó `completed_test`); `failed` se informa como `none`.
     - cualquier otro `ignored` (referencias no coinciden, intento no encontrado) -> `PAYMENT_NOT_CANCELABLE`, sin cambios.
   - `livemode` distinto de `false` -> `PaymentError("STRIPE_NOT_CONFIGURED")`, sin cambios.
   - **Error de `expire`** (sesión ya `complete`, ya `expired`, ambigüedad de red, etc.): **no se cancela localmente**. Se delega en `reconcileProjectPayment(actor, projectId)`, que relee la sesión de la API y aplica el mismo núcleo:
     - `canceled` -> `{ outcome: "canceled" }` (la sesión ya estaba `expired`).
     - `completed` -> `{ outcome: "completed" }` (la carrera la ganó el pago; la reconciliación ya creó la fila de transferencia y disparó la transferencia).
     - `none` -> `{ outcome: "none" }`.
     - `unchanged` (sesión aún `open` pese al error, o `complete` con `payment_status` distinto de `paid`) -> `PAYMENT_NOT_CANCELABLE`; el intento sigue `pending`.
     - Si la propia relectura lanza (`STRIPE_UNAVAILABLE`), se propaga.
- Logs: solo `error.type`, `code`, `statusCode`, `requestId` (helpers de `@/lib/stripe`), nunca claves, URLs de Checkout ni mensajes completos.

### 6. Server action (T1) — `payment-cancellation.actions.ts` (`"use server"`)

```ts
cancelPendingPaymentAction(projectId: string): Promise<CancelPaymentActionResult>
```

Patrón idéntico a `refreshPaymentStatusAction`: `requireRole("client")` en `try` (el `catch` llama a `handleAuthErrorForPage`) **antes** de validar; `startCheckoutInputSchema.safeParse({ projectId })` (no UUID -> `{ ok: false, code: "NOT_FOUND", message: "No encontramos el proyecto." }` sin servicio); `PaymentError` -> `{ ok: false, code, message: PAYMENT_ERROR_MESSAGES[code] }`; `AuthError("NOT_FOUND")` -> mensaje de no encontrado; otro `AuthError` -> `handleAuthErrorForPage`; el resto -> `UNKNOWN` con "No pudimos completar la acción. Inténtalo de nuevo.". Éxito: `revalidatePath("/projects/${projectId}/payment")`, `revalidatePath("/dashboard")` y `revalidatePath("/dashboard/projects")`; devuelve `{ ok: true, outcome }`. El resultado nunca lleva ids de Stripe ni URLs.

### 7. UI (T3)

- `src/app/dashboard/page.tsx` (fina): metadata "Mi panel | Nexora"; `requireRole("client")` + `getClientDashboard` en `try`, `handleAuthErrorForPage` en el `catch`; compone `<ClientDashboardView data={...} />`. `loading.tsx` con `PaymentsLoading` (label "Cargando tu panel...") y `error.tsx` con `PaymentsError` (title "No pudimos cargar tu panel").
- `client-dashboard-view.tsx` (servidor, presentacional): un solo `<h1>` "Mi panel"; botón "Nuevo proyecto" (`/projects/new`) y enlace "Ver todos mis proyectos" (`/dashboard/projects`); secciones en este orden: `DashboardPendingActions` ("Pendiente de ti"), `DashboardStatusSummary` ("Tus proyectos por estado"), `DashboardContractingList` ("Pagos y contratación"). Estado vacío total (`counts.total === 0`): `EmptyState` "Aún no tienes proyectos" con "Crear tu primer proyecto" (mismo texto que la lista).
- `dashboard-status-summary.tsx`: un enlace por estado (`PROJECT_LIST_STATUSES` salvo `all`; etiqueta de `PROJECT_STATUS_LABELS`, conteo) a `/dashboard/projects?status=<estado>`; "Todos (N)" a `/dashboard/projects`. Estados con 0 se muestran atenuados pero siguen siendo enlaces. `aria-label` por enlace "{etiqueta}: {n} proyectos".
- `dashboard-pending-actions.tsx`: lista de acciones con título del proyecto y un enlace de acción (`buttonVariants`, `h-9`/objetivo >= 40 px, foco visible); sin acciones: texto "No tienes nada pendiente." (no un `EmptyState` grande).
- `dashboard-contracting-list.tsx`: por proyecto, título, `ProjectStatusBadge`, desarrollador, importe (`formatUsd`), "Pago de prueba: {etiqueta}" (`PAYMENT_ATTEMPT_STATUS_LABELS` o "No iniciado"), "Transferencia: {etiqueta}" + `TRANSFER_TEST_NOTICE` (o "Sin transferencia todavía"), nota de cobros del desarrollador cuando corresponda, enlace "Ver pago" y, si `payment.status === "pending"`, `<CancelPaymentButton>`; si `contractingTotal > contracting.length`, enlace "Ver todos" a la lista filtrada. Aviso de Modo de prueba `role="note"` una vez por sección. Fechas con `Intl.DateTimeFormat("es", { dateStyle: "medium" })`.
- `cancel-payment-button.tsx` (`"use client"`, en `payments/components`): `CancelPaymentButton({ projectId })`; `AlertDialog` con título "¿Cancelar el pago de prueba?", texto "Cerraremos la sesión de pago en Stripe. Si ya pagaste, la cancelación no se aplicará y el pago se confirmará. Después podrás reintentar el pago o cerrar el proyecto.", acciones "Volver" (foco inicial) y "Cancelar pago de prueba"; `useTransition`; mientras corre `disabled` y "Cancelando..."; mensajes `aria-live="polite"` por `outcome` (`canceled`: "Pago de prueba cancelado. Ya puedes reintentar el pago o cerrar el proyecto."; `completed`: "El pago se completó antes de poder cancelarlo. Ya está confirmado."; `none`: "No hay un pago pendiente que cancelar."); `{ ok: false }` en `role="alert"`; `router.refresh()` en todos los resultados salvo error de red. Objetivo táctil >= 40 px.
- `payment-page-view.tsx` (M): dentro del bloque `canResume` (donde hoy está `RefreshPaymentButton`) se añade `<CancelPaymentButton projectId={project.id} />`; nada más cambia.
- `dashboard-link.ts` (M): el caso `client` devuelve `{ href: "/dashboard", label: "Mi panel" }`; `dashboard-link.test.ts` actualiza esa fila.

## Seguridad

- **Autorización en capas:** `requireRole("client")` en página y action; `can(…, "payment.start")` y `requireOwnership` sin admin en el servicio de cancelación antes de actuar; el panel filtra siempre por `actor.id` y no recibe ids de la entrada. Ajeno = 404 indistinguible; rol incorrecto = 403/404 por `handleAuthErrorForPage`.
- **Nada de confianza en el cliente:** el actor, el intento y la sesión salen de la BD y la sesión de Clerk; `projectId` se valida con `z.uuid()`; el navegador no aporta estado (I4).
- **Proyecciones explícitas:** el panel solo expone lo listado en `ClientDashboard` (sin ids de Stripe, sin ids de usuarios, sin email, sin `checkoutUrl`, sin `last_error_code`). Un test comprueba `Object.keys` exactos de cada DTO. El nombre del desarrollador es el mismo `displayName` que el cliente ya ve en 007/009.
- **Stripe solo Test Mode:** `getStripe()` rechaza claves live; la respuesta de `expire` se rechaza si `livemode !== false`. Ninguna lectura del panel llama a Stripe (D-H).
- **Sin cancelaciones por suposición:** el intento solo se cancela con confirmación de Stripe (`expired`) o con el intento sin sesión fuera de la ventana de reanudación, con la guarda en el `WHERE` (D-E, D-G).
- **Logs sin secretos ni PII.** **Abuso:** sin rate limiting (015); mitigado por rol, propiedad e idempotencia (cancelar dos veces devuelve `none`/`canceled` sin efecto).

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Cliente sin proyectos | Panel con `EmptyState` y "Crear tu primer proyecto"; conteos en 0 |
| `published` con propuestas `pending` | Acción "Elegir propuesta (N)" |
| `proposal_selected`, sin intento, cobros del desarrollador activos | Acción "Pagar (prueba)" |
| `proposal_selected`, desarrollador sin cobros activos | Sin acción, nota de espera, "Ver pago" |
| `proposal_selected` con intento `pending` | Acción "Continuar o cancelar el pago" + botón cancelar |
| Intento `canceled`/`failed` | Pago "Cancelado"/"Fallido"; acción "Pagar (prueba)" si los cobros están activos |
| `contracted`, pago `completed_test`, transferencia `pending` | "Completado en Test Mode" + "Pendiente" (nunca como recibido) |
| `contracted`, sin valorar | Acción "Valorar al desarrollador" |
| `closed` | Solo cuenta en el resumen; sin fila de contratación ni acciones |
| Más de 20 en contratación | Se listan 20 y aparece "Ver todos" |
| Cancelar: sesión `open` | `expire` -> `expired` -> intento `canceled`; proyecto sigue `proposal_selected`; ya se puede reintentar pago o cerrar |
| Cancelar: el cliente completa el pago a la vez | Gana Stripe (ver D-F y R1); `expire` falla -> reconciliación -> `completed`, sin cancelar |
| Cancelar: webhook `expired` se adelantó | `applySessionOutcome` ignora (`attempt_not_pending`); se relee y se devuelve `canceled` |
| Cancelar: `expire` tuvo éxito en Stripe pero falló la BD | El intento sigue `pending` con sesión `expired` en Stripe; reintentar la cancelación (el `expire` falla, la relectura ve `expired` -> `canceled`), "Actualizar estado" o el webhook lo cierran. Sin pérdida |
| Cancelar: Stripe caído en `expire` y en la relectura | `STRIPE_UNAVAILABLE`, sin cambios; reintentable |
| Cancelar: método asíncrono en proceso (`complete` sin `paid`) | `PAYMENT_NOT_CANCELABLE`, el intento sigue `pending` |
| Cancelar: intento sin sesión y reciente (< 10 min) | `PAYMENT_NOT_CANCELABLE` |
| Cancelar: sin intento / `canceled` / `failed` | `{ outcome: "none" }` |
| Cancelar: intento ya `completed_test` | `{ outcome: "completed" }`, sin cambios |
| Cancelar: doble clic o dos pestañas | Una cancelación efectiva; la otra recibe `none` o `canceled` |
| Developer, admin o cliente ajeno | `FORBIDDEN` / `FORBIDDEN` / `NOT_FOUND`, sin BD ni Stripe en los dos primeros |

## Criterios de aceptación

Base (T0):

- AC1. `PAYMENT_NOT_CANCELABLE` existe en `PaymentErrorCode`, `PAYMENT_ERROR_STATUS` (409) y `PAYMENT_ERROR_MESSAGES` con el texto de este contrato; los tests y el tipado de los demás usos de `Record<PaymentErrorCode, …>` siguen pasando.
- AC2. `cancelPendingAttemptWithoutSession` cancela solo un intento `pending` **sin** `stripe_checkout_session_id`: devuelve `true` y deja `canceled`; devuelve `false` y no cambia nada si el intento tiene sesión o no está `pending`.

Cancelación (T1):

- AC3. Sesión `open`: con el Stripe falso devolviendo la sesión `expired` en `expire`, el intento pasa a `canceled`, el proyecto sigue `proposal_selected`, no se inserta `developer_transfers` y se devuelve `canceled`. Se llama a `expire` con el session id del intento y a ningún otro método que cree sesiones o transferencias.
- AC4. Carrera, el pago gana: `expire` rechaza y la sesión leída está `complete`/`paid`; el servicio **no** cancela, el intento queda `completed_test`, el proyecto `contracted`, existe una fila de transferencia y se devuelve `completed`.
- AC5. Carrera, el webhook se adelantó: si el intento ya está `canceled` (por `checkout.session.expired`) o `completed_test` cuando se aplica el resultado, no se escribe nada más y el resultado es `canceled` o `completed` respectivamente.
- AC6. `expire` falla y la relectura devuelve `expired`: el intento queda `canceled` (`canceled`). Si la relectura devuelve `open` o `complete` sin `paid`: `PAYMENT_NOT_CANCELABLE` y el intento sigue `pending`. Si la relectura lanza: `STRIPE_UNAVAILABLE` y sin cambios. **Nunca** queda `canceled` sin que Stripe haya reportado `expired`.
- AC7. Intento `pending` sin sesión: con más de `RESUME_WINDOW_SECONDS` se cancela; con menos, `PAYMENT_NOT_CANCELABLE` sin cambios; si otra petición le guarda la sesión entre la lectura y la actualización, la guarda `IS NULL` impide cancelarlo con una sesión viva.
- AC8. Idempotencia: sin intento, con `failed` o `canceled` devuelve `none`; con `completed_test` devuelve `completed`; una segunda cancelación seguida de la primera devuelve `none` o `canceled` sin error; ninguna de estas ramas llama a Stripe.
- AC9. Permisos: `developer` y `admin` reciben `FORBIDDEN` sin tocar BD ni Stripe; cliente ajeno o proyecto inexistente `NOT_FOUND` sin Stripe; `StripeConfigError` (clave ausente o live) -> `STRIPE_NOT_CONFIGURED` sin escribir; `livemode` verdadero en la respuesta -> `STRIPE_NOT_CONFIGURED` sin cambios.
- AC10. Action: `requireRole("client")` antes que el servicio y un `AuthError` no lo invoca; UUID inválido -> `NOT_FOUND` sin servicio; cada `PaymentError` devuelve su mensaje; error desconocido -> mensaje genérico; el éxito llama a `revalidatePath` con `/projects/${projectId}/payment`, `/dashboard` y `/dashboard/projects`, y devuelve `{ ok: true, outcome }`; el resultado no contiene ids de Stripe ni URLs.
- AC11. Tras cancelar, `closeProject` desde `proposal_selected` ya **no** responde `PAYMENT_IN_PROGRESS` y `createCheckoutForProject` crea un intento nuevo (prueba de integración en el test del servicio con las funciones reales sobre PGlite).

Panel (T2):

- AC12. `getClientDashboard`: `counts.byStatus` trae las cinco claves (0 si no hay) y suma `total`; cuenta solo proyectos del actor (otro cliente con proyectos no altera nada).
- AC13. `pendingActions`: `choose_proposal` solo para `published` con al menos una propuesta `pending` (con el conteo correcto; propuestas `rejected`/`withdrawn` no cuentan); `start_payment`, `resume_payment` y `rate` según la tabla D-L, incluidos los bordes: último intento `canceled`/`failed`, desarrollador sin cuenta o con cuenta no `active` (sin acción de pago y `developerPayoutsReady = false`), `contracted` valorado (sin `rate`) y `closed` (nada).
- AC14. `contracting`: solo `proposal_selected | contracted`, orden `updated_at desc, id desc`, máximo 20, con `contractingTotal` real; muestra el último intento y la transferencia del intento `completed_test`; sin intento `payment = null`; sin transferencia `transfer = null`. Un proyecto sin propuesta aceptada se omite sin lanzar.
- AC15. **Coherencia:** para los mismos datos, `payment.status`, `transfer.status` y `developerPayoutsReady` del panel coinciden con `attempt.status`, `transfer.status` y `developerPayoutsReady` de `getProjectPaymentOverview` (test de contraste con casos: sin intento, `pending`, `canceled`, `completed_test` con transferencia `pending`).
- AC16. Privacidad: `Object.keys` exactos de `ClientDashboard`, de cada `DashboardAction` y de cada `DashboardProjectPayment` (sin ids de Stripe, `clientId`, `developerId`, email, `last_error_code`); ningún dato de otro cliente. `developer`/`admin` -> `FORBIDDEN` sin BD.
- AC17. `getClientDashboard` no importa ni invoca `@/lib/stripe`: el test mockea `getStripe` para que lance y el panel igualmente se calcula.
- AC18. `deriveProjectActions` cumple la tabla D-L con tests table-driven (todas las combinaciones de estado del proyecto x último intento x cobros listos x valorado).

UI y navegación (T3):

- AC19. `/dashboard` (manual): con sesión cliente muestra el resumen por estado con enlaces `?status=`, "Pendiente de ti" con acciones que llevan a las rutas correctas, y "Pagos y contratación" con pago y transferencia; `developer` y `admin` reciben 404; sin sesión redirige a `/sign-in`.
- AC20. El header del cliente muestra "Mi panel" -> `/dashboard`, resaltado en `/dashboard` y en `/dashboard/projects`; developer, admin, visitante y onboarding no cambian (`dashboard-link.test.ts` actualizado; el resto de tests de 009b pasan sin cambios).
- AC21. Cancelar (manual): con un pago `pending`, el botón del panel y de la página de pago abre la confirmación con foco en "Volver"; confirmar cancela el intento, anuncia el resultado y la fila pasa a "Cancelado" con acción "Pagar (prueba)"; después "Cerrar proyecto" en `/dashboard/projects` funciona sin `PAYMENT_IN_PROGRESS`.
- AC22. Textos y accesibilidad: aviso "Modo de prueba · No se mueve dinero real" visible en el bloque de pagos; la transferencia nunca aparece como "recibida"; un `<h1>`, foco visible, objetivos táctiles >= 40 px, `aria-live` en el botón, sin desbordes a 390 px.

Regresión y documentación (T0 a T4):

- AC23. Sin cambios en `project.service.ts`, `project-list.tsx`, `permissions.ts`, `drizzle/**`, `package.json`, `.env.example`, `src/app/layout.tsx`, `globals.css` y `src/components/ui/**`; ninguna migración nueva; `npm run lint`, `npm run test` y `npm run build` pasan; los tests existentes pasan sin modificaciones salvo la fila del cliente en `dashboard-link.test.ts`; ningún test usa red, Clerk, Stripe ni Neon reales. El build añade solo la ruta `/dashboard`.
- AC24. Documentación (solo adiciones/ajustes puntuales): `system-design.md §4` (módulo `dashboard`: lee tablas de `projects`, `proposals`, `payments`, `ratings` y `users`, nadie depende de él salvo `src/app`; y `payments` -> `dashboard` ausente) y `§8` (D2 resuelta: cancelación explícita en 012; D-A a D-M); `state-machines.md §3` (la fila `pending -> canceled` menciona la cancelación explícita del cliente: solo con `expired` confirmado por Stripe) y `§5` (se reemplaza la frase "llega con la spec 012 (D2)" por la descripción real y se añade el caso de la carrera); `MANUAL-TESTS.md` (sección "Spec 012", ajuste de 7b y del primer pendiente de §10 sobre `PAYMENT_IN_PROGRESS`).

## Tests requeridos

Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM; BD con PGlite y migraciones reales (`createTestDb`, patrón `Proxy` + `holder` y `vi.mock("server-only")`); **Stripe falso** con `vi.mock("@/lib/stripe")` (cliente con `checkout.sessions.expire`/`retrieve` configurables, contador de llamadas y `getStripe` que puede lanzar `StripeConfigError`); `runTransferForAttempt` mockeado como en `payment-reconciliation.service.test.ts`. Sin temporizadores falsos globales (la antigüedad del intento se fija con `created_at` sembrado).

- `src/modules/payments/services/payment-cancellation.service.test.ts` (T1): AC2 (hoja, vía servicio o directa sobre `db`), AC3 a AC9 y AC11. Casos: sesión `open` -> `expired`; carrera con pago `complete`/`paid` tras fallo de `expire`; webhook adelantado (`checkout.session.expired` ya aplicado con `handleStripeEvent`); relectura `expired`/`open`/`complete` sin `paid`/lanzando; sin sesión por encima y por debajo de la ventana, y con sesión guardada entre la lectura y el `UPDATE`; idempotencia; permisos; `StripeConfigError`; `livemode`; integración con `closeProject` y `createCheckoutForProject`. Limitación documentada: PGlite serializa; la carrera demuestra coherencia de estado final, no bloqueos reales de Neon (validados leyendo el SQL, como en 008 a 011).
- `src/modules/payments/actions/payment-cancellation.actions.test.ts` (T1): AC10 (mocks de `requireRole`, servicio y `next/cache`).
- `src/modules/dashboard/services/dashboard-actions.test.ts` (T2): AC18.
- `src/modules/dashboard/services/client-dashboard.service.test.ts` (T2): AC12 a AC17.
- `src/modules/auth/services/dashboard-link.test.ts` (T3): fila `client` -> `/dashboard`, "Mi panel"; las demás filas intactas (AC20).
- Sin test unitario obligatorio (`SETUP §3`): componentes presentacionales del panel y páginas de `src/app`. `cancel-payment-button.tsx` admite un test RTL opcional (mock de la action, `alert-dialog`).

### Pruebas manuales (con claves reales; texto para `MANUAL-TESTS.md`, sección "8g. Spec 012")

- (a) **Cancelar sesión abierta:** con `proposal_selected`, inicia el pago y vuelve a `/dashboard` sin pagar; la fila muestra "Pendiente" y "Continuar o cancelar el pago". Cancela: queda "Cancelado", en Stripe la sesión aparece `expired`, y "Cerrar proyecto" ya no devuelve `PAYMENT_IN_PROGRESS`; también se puede reintentar el pago (intento nuevo).
- (b) **Carrera, pago ya completado:** paga en Stripe con `4242…` **sin** `stripe listen` (el intento sigue `pending` en Neon) y pulsa "Cancelar pago de prueba" en el panel: debe responder "El pago se completó antes de poder cancelarlo", el pago pasa a "Completado en Test Mode" y el proyecto a "En contratación"; nunca queda "Cancelado" sobre un pago pagado.
- (c) **Sesión ya expirada:** expira la sesión con `stripe checkout sessions expire <cs_test_...>` y cancela desde la app sin esperar al webhook: queda "Cancelado" (el `expire` de la app falla; la relectura la ve `expired`).
- (d) **Verificar el supuesto de Stripe:** con la sesión abierta en otra pestaña, cancela desde la app y confirma en la pestaña de Stripe que ya no se puede pagar.
- (e) Doble clic o dos pestañas: una cancelación efectiva, la otra informa que no hay pago pendiente.
- (f) Cuentas: developer y admin reciben 404 en `/dashboard`; otro cliente no ve ni cancela pagos ajenos.
- (g) Header del cliente: "Mi panel" lleva a `/dashboard` y queda resaltado también en `/dashboard/projects`.
- (h) Transferencia: con un proyecto contratado y transferencia `Pendiente`/`Completada en Test Mode`, el panel muestra el estado con "Transferencia de prueba, no es dinero real" y nunca "recibida".
- (i) Responsive a 390 px, teclado/foco, lector de pantalla en el botón de cancelar y en el diálogo.

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Durante el bloque paralelo nadie ejecuta `npm install`, `npm run build`, `drizzle-kit` ni `db:migrate` (no hay migración en esta spec); el reviewer corre lint, test y build al final.

### T0 — Base compartida: errores, tipos y hoja de transición (serial)

- Archivos: `src/modules/payments/services/payment-errors.ts`, `src/modules/payments/types/payment.types.ts`, `src/modules/payments/services/payment-transitions.ts`, `src/modules/dashboard/types/dashboard.types.ts`
- Depende de: —
- Paralelizable: no
- Cubre: AC1, AC2 (la hoja se prueba con la BD en T1)

### T1 — Cancelación del pago pendiente: servicio y action

- Archivos: `src/modules/payments/services/payment-cancellation.service.ts`, `src/modules/payments/services/payment-cancellation.service.test.ts`, `src/modules/payments/actions/payment-cancellation.actions.ts`, `src/modules/payments/actions/payment-cancellation.actions.test.ts`
- Depende de: T0
- Paralelizable: sí (con T2; archivos disjuntos)
- Cubre: AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11

### T2 — Servicio de lectura del panel y función pura de acciones

- Archivos: `src/modules/dashboard/services/dashboard-actions.ts`, `src/modules/dashboard/services/dashboard-actions.test.ts`, `src/modules/dashboard/services/client-dashboard.service.ts`, `src/modules/dashboard/services/client-dashboard.service.test.ts`
- Depende de: T0
- Paralelizable: sí (con T1; archivos disjuntos)
- Cubre: AC12, AC13, AC14, AC15, AC16, AC17, AC18

### T3 — Interfaz del panel, botón de cancelar y navegación

- Archivos: `src/modules/payments/components/cancel-payment-button.tsx`, `src/modules/payments/components/payment-page-view.tsx` (solo añadir el botón), `src/modules/dashboard/components/client-dashboard-view.tsx`, `src/modules/dashboard/components/dashboard-status-summary.tsx`, `src/modules/dashboard/components/dashboard-pending-actions.tsx`, `src/modules/dashboard/components/dashboard-contracting-list.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/loading.tsx`, `src/app/dashboard/error.tsx`, `src/modules/auth/services/dashboard-link.ts`, `src/modules/auth/services/dashboard-link.test.ts`
- Depende de: T1, T2
- Paralelizable: no (integra T1 y T2; el enlace del header solo se activa cuando existe la página)
- Cubre: AC19, AC20, AC21, AC22, AC23

### T4 — Documentación y pruebas manuales

- Archivos: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md`
- Depende de: T3
- Paralelizable: no
- Cubre: AC24 (y la verificación manual de AC19 a AC22)
- Detalle: en `MANUAL-TESTS.md` añadir "8g. Spec 012 — Dashboard del cliente y cancelación de pago" con las pruebas manuales de arriba (casillas `- [ ]`); actualizar la línea `**Cubre:**`; en 7b cambiar "Mis proyectos" por "Mi panel" (-> `/dashboard`) para el cliente; en §10 sustituir el punto de `PAYMENT_IN_PROGRESS` por una nota de que la cancelación explícita existe (spec 012) y cómo usarla. Solo añadir o reemplazar esas líneas; no tocar lo ajeno.

## Riesgos

- R1. **Carrera entre cancelar y un pago que se completa a la vez.** Mitigación (D-F): (1) el árbitro es Stripe, no la BD: `expire` solo tiene éxito sobre una sesión `open` y una sesión `expired` no puede completarse, así que "cancelado en la app" y "cobrado en Stripe" son excluyentes cuando el servidor solo cancela tras ver `expired`; (2) si `expire` falla, **no se cancela**: se relee y se aplica el resultado real (`completed` o `canceled`); (3) en la BD, `applySessionOutcome` y la cancelación se serializan por el lock proyecto -> intento y la guarda `status = 'pending'`; un `completed` posterior sobre un intento `canceled` se ignora y se registra (nunca se reabre), y un `canceled` sobre un `completed_test` es imposible (la guarda no coincide). Riesgo residual aceptado: ventana de milisegundos en la que el cliente ve la página de Stripe vencida justo cuando pulsaba "Pagar" (no se cobra; reintenta). Por PGlite, los tests demuestran coherencia, no bloqueos reales; se valida con las pruebas manuales (b) y (d).
- R2. `sessions.expire` sobre una sesión con un pago asíncrono en proceso falla (`complete` sin `paid`): se informa `PAYMENT_NOT_CANCELABLE` y el intento sigue `pending` hasta que llegue el evento asíncrono. Correcto y poco frecuente en Test Mode.
- R3. El panel muestra el último estado **confirmado por el servidor**: un pago hecho en Stripe sin webhook (sin `stripe listen`) puede verse `pending` hasta pulsar "Actualizar estado" en la página de pago (D-H; heredado de 010). Se anota en la UI con el enlace "Ver pago".
- R4. Lógica de "último intento / transferencia / cobros listos" duplicada entre el panel (por lotes) y `getProjectPaymentOverview` (por proyecto). Se acepta para no modificar un servicio `done`; el test de coherencia (AC15) detecta divergencias. Si aparece un tercer consumidor, extraer un helper compartido en `payments`.
- R5. Listas acotadas a 20 (D-K): un cliente con muchos proyectos en contratación no verá todas las acciones en el panel; el enlace "Ver todos" lleva a la lista completa.
- R6. Cambiar el enlace del header a `/dashboard` modifica una spec `done` (009b); el riesgo es de regresión de navegación, cubierto por AC20 y la prueba manual (g).
- R7. `window.confirm` sigue en el ciclo de vida del proyecto (014); el cancelar usa `AlertDialog` y puede verse inconsistente hasta entonces.
- R8. Next 16: `/dashboard` es dinámica por la sesión; no se esperan datos obsoletos por la caché de navegación (por defecto las páginas dinámicas no se cachean en el cliente), pero **a verificar** en `node_modules/next/dist/docs/` (`staleTimes`); la action igualmente invalida `/dashboard`.

## Preguntas abiertas

- P1. ¿`/dashboard` nuevo y `/dashboard/projects` intacto (recomendado, D-A) o extender `/dashboard/projects`? Recomendación: ruta nueva.
- P2. Etiqueta y destino del header del cliente (D-B): ¿"Mi panel" -> `/dashboard` (recomendado) o conservar "Mis proyectos" -> `/dashboard/projects` y dejar `/dashboard` enlazado solo desde otras pantallas? Recomendación: "Mi panel".
- P3. ¿Qué pasa si un `developer` entra a `/dashboard`? Recomendación: 404 (D-D); la 013 decidirá. Alternativa: redirigir a `/dashboard/proposals`.
  - Resuelta por la spec 013: `/dashboard` es role-aware, el developer ve su panel; el guard del servicio no cambia.
- P4. ¿La cancelación debe ofrecerse también como parte del flujo de "Cerrar proyecto" (p. ej. cambiar el mensaje de `PAYMENT_IN_PROGRESS` para indicar "cancela el pago desde tu panel")? Recomendación: **no** en esta spec (tocaría `project-errors.ts` de 005); basta el botón en panel y página de pago. Alternativa: añadir esa frase al mensaje en una tarea extra.
- P5. ¿Mostrar el botón de cancelar también en `project-list.tsx`? Recomendación: no (D-J, YAGNI).
- P6. Límite de 20 filas y 20 acciones sin paginación (D-K): ¿aceptable? Recomendación: sí.
- P7. Texto de la confirmación y del resultado `completed` ("El pago se completó antes de poder cancelarlo"): ¿se aprueba tal cual? Recomendación: sí.
- P8. Ventana para cancelar un intento sin sesión: se reutiliza `RESUME_WINDOW_SECONDS` (10 min, D-G). Recomendación: sí; no se añade una constante nueva.
- P9. El panel solo cubre al cliente; ¿se quiere un panel mínimo para admin (solo lectura)? Recomendación: no (sigue sin existir, 009b D-C).

## Próximas fases

- 013: panel del desarrollador (propuestas, resultado, estado del pago y transferencia, datos de contacto permitidos); entonces `/dashboard` podría volverse role-aware (sustituyendo el 404 del developer).
- 014: sustituir `window.confirm` por diálogos accesibles en el ciclo de vida y revisión transversal de accesibilidad del panel y estados de carga/error.
- 015: rate limiting de `cancelPendingPaymentAction` y de las acciones de pagos; registro de eventos.
- 016: pruebas de la carrera cancelar/pagar contra una rama real de Neon y Stripe en Test Mode.
- Barrido automático de intentos `pending` abandonados (cron o `checkout.session.expired` garantizado en despliegue, spec 017).
- Panel de admin de solo lectura, si el producto lo pide (un solo archivo en `getDashboardLink`).

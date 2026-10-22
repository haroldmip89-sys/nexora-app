# Dashboard del desarrollador: propuestas por estado, proyectos ganados con pago y transferencia, cuenta de cobros, acciones pendientes y valoraciones

Estado: done

Spec 013 de `docs/SDD-PLAN.md §7` (Fase 4). Es el **espejo de la spec 012** (`docs/specs/012-client-dashboard.md`, `done`): mismo módulo `src/modules/dashboard`, servicio de solo lectura con consultas en lote, misma ruta `/dashboard`, mismos `loading.tsx`/`error.tsx` y mismo estilo de tests de proyecciones. Depende de specs `done`: 007 (propuestas), 008 (selección), 009/010 (pago y estado), 011a/b/c (cuentas conectadas y transferencias), 009b (navegación), 012 (panel del cliente), 019 (cuenta del desarrollador) y 020 (valoraciones). Resuelve la **P3 de 012** (qué ve un `developer` en `/dashboard`).

## Objetivo

Que el desarrollador vea en un solo lugar (`/dashboard`): (1) cuántas propuestas tiene por estado; (2) sus proyectos ganados (propuesta `accepted`) con el estado del pago de prueba del cliente y de su transferencia de prueba; (3) si su cuenta de cobros de prueba está activa, con enlace para configurarla; (4) sus acciones pendientes (configurar cobros, propuestas aceptadas esperando pago, transferencia pendiente o fallida con enlace para reintentar en `/dashboard/payouts`); y (5) su promedio y cantidad de valoraciones.

Arquitectura que aplica (solo estas secciones): `system-design.md §2` (I1 a I5), `§4` (módulo `dashboard` de solo lectura), `§5.5` (cuenta conectada), `§6` (permisos: el desarrollador ve solo lo propio), `§7` (pagos), `§8` (D2). `state-machines.md §3` (intento de pago), `§4` (la transferencia es independiente del pago y nunca es dinero recibido), `§6` (cuenta conectada). Esta spec no usa APIs nuevas de Next 16 (solo `page.tsx`, `loading.tsx`, `error.tsx` y los guards ya existentes).

## Hechos verificados (código del repo, 2026-10-22)

| Hecho | Fuente |
|---|---|
| `/dashboard` hoy es solo `client`: `requireRole("client")` y `getClientDashboard`; un `developer` recibe 404 por la decisión D-D/P3 de 012 | `src/app/dashboard/page.tsx` |
| `getClientDashboard` ya exige `actor.role === "client"` dentro del servicio (guard en capas) y su test comprueba `FORBIDDEN` para `developer`/`admin`; **ese guard y su test no cambian** | `client-dashboard.service.ts:39`, `client-dashboard.service.test.ts` |
| `getDashboardLink` devuelve para `developer` `{ /dashboard/proposals, "Mis propuestas" }`; el header añade "Proyectos" y, para developer, "Mi cuenta" (`getAccountLink`, `/dashboard/account`). `isActivePath` resalta por prefijo con frontera de segmento | `dashboard-link.ts`, `dashboard-link.test.ts`, `site-header.tsx`, `src/lib/is-active-path.ts` |
| `listMyProposals(actor, { status, page })` es paginado (por estado) y devuelve `total` solo del filtro; no da conteos por estado | `proposal.service.ts:174` |
| `getDeveloperTransfers(actor)` devuelve todas las transferencias propias (`DeveloperTransferItem`: `projectTitle`, `status`, `reason`, importes), sin `projectId`; permiso `payout.manage` | `developer-transfer-overview.service.ts` |
| `getConnectedAccountOverview(actor)` es de solo BD (una fila `connected_accounts` por `user_id`; sin fila -> `not_started`); su archivo importa `@/lib/stripe`, aunque esta función no llama a Stripe | `connected-account.service.ts:254` |
| `getDeveloperRatingSummary(developerId)` devuelve `{ average, count }` (promedio redondeado a 1 decimal en SQL; `null` si `count = 0`), solo BD | `rating.service.ts:150` |
| `RatingSummary` (componente) pinta el promedio, las estrellas y el enlace "Ver valoraciones recibidas" a `/developers/{id}#valoraciones`; hoy solo lo usa "Mi cuenta" | `ratings/components/rating-summary.tsx` |
| Un desarrollador con cuenta no `active` no puede enviar propuestas (`PAYOUTS_NOT_READY`) y el cliente no puede pagar si el ganador no tiene cobros activos (`DEVELOPER_PAYOUTS_NOT_READY`, 011c) | specs 007/011c |
| Un proyecto en `proposal_selected` o `contracted` no es público: el desarrollador no tiene página de proyecto a la que enlazar (006); el detalle está en `/dashboard/proposals` | spec 006, `own-proposal-card.tsx` |
| `/dashboard/payouts` ya muestra la cuenta, el inicio del onboarding y las transferencias con "Reintentar transferencia" (011b/011c) | `payouts-page-view.tsx` |
| `abbreviateClientName` ("Maria G.", "Cliente" si no parece un nombre) es el nombre público del cliente ya usado en valoraciones | `ratings/services/client-name.ts` |
| `/dashboard/proposals?status=` acepta `all`, `pending`, `accepted`, `rejected`, `withdrawn` | `MY_PROPOSALS_STATUSES` en `proposal.schema.ts:37` |
| `drizzle/` llega a `0008_developer_transfers`. **Esta spec no necesita migración**; los índices de 012 y `proposals (developer_id, created_at DESC)` (003) sirven a las consultas | `ls drizzle`, spec 003 |

## Decisiones (con recomendación por defecto)

- **D-A. Misma ruta `/dashboard` con vista por rol (no redirección).** `page.tsx` hace `requireRole("client", "developer")` y compone `ClientDashboardView` o `DeveloperDashboardView` según `user.role`; `admin` sigue recibiendo 404. Justificación: (1) un solo "Mi panel" para todos los roles, el mismo enlace y el mismo nombre en el header; (2) la redirección a `/dashboard/proposals` (alternativa descartada) mostraría solo una lista de propuestas y dejaría sin hogar el resumen, los cobros y las valoraciones, y haría que `/dashboard` "parpadee" entre rutas; (3) es la solución de menor cambio sobre 012: **no cambia ningún servicio ni test de 012** (el guard `actor.role !== "client"` de `getClientDashboard` y su test se conservan; la separación por rol ocurre en la página, que es composición sin lógica y no lleva test). El único cambio sobre un archivo de 012 es `page.tsx` (rama por rol) y una nota en la spec 012.
- **D-B. Navegación.** Para `developer`, `getDashboardLink` pasa de `{ /dashboard/proposals, "Mis propuestas" }` a `{ /dashboard, "Mi panel" }` (simétrico al cliente; no se añade un cuarto enlace, para no romper el header de tres enlaces a 390 px de 019). "Mis propuestas" deja de estar en el header, pero queda a un clic desde el panel (resumen con enlaces `?status=` y "Ver todas mis propuestas"). Consecuencia a aceptar: "Mi panel" queda resaltado por prefijo en todo `/dashboard/*` (propuestas, cobros, cuenta); en `/dashboard/account` también lo está "Mi cuenta" (dos `aria-current="page"`). Alternativa descartada: añadir una opción `exact` a `isActivePath`/`SiteNav` (toca archivos compartidos `done` sin otro consumidor, YAGNI); ver P2. Cambio mínimo: una línea en `dashboard-link.ts` y una fila en `dashboard-link.test.ts`.
- **D-C. Mismo módulo `dashboard`, servicio nuevo de solo lectura `getDeveloperDashboard`.** Lee tablas Drizzle propias del desarrollador (propuestas, proyectos, intentos, transferencias, usuarios) y **reutiliza solo dos funciones de lectura ya existentes**: `getConnectedAccountOverview` y `getDeveloperRatingSummary` (pedido explícito de reutilizar y sin SQL duplicado de cuentas ni de promedios). Ambas son de solo BD; ni `payments` ni `ratings` dependen de `dashboard`. Esto matiza la fila `dashboard` de `system-design.md §4` ("no sus servicios"): se documenta la excepción (T4).
- **D-D. Conteo de propuestas con una consulta propia (`GROUP BY status`), no con `listMyProposals`.** `listMyProposals` es una página filtrada por un estado: obtener los cuatro conteos exigiría cuatro llamadas y traería filas innecesarias. El panel muestra solo conteos y enlaza a `/dashboard/proposals?status=` donde sigue viviendo la lista (que se reutiliza tal cual).
- **D-E. Proyectos ganados.** Propuestas del desarrollador con `status = 'accepted'` cuyo proyecto está en `proposal_selected` o `contracted`, `projects.updated_at desc, projects.id desc`, máximo `DASHBOARD_LIST_LIMIT` (20) más el total real (si hay más, enlace "Ver todas" a `/dashboard/proposals?status=accepted`). Por cada uno: título, estado del proyecto, importe de **su** propuesta, nombre abreviado del cliente (`abbreviateClientName`), último intento de pago (estado + fecha) y la transferencia del intento `completed_test` (estado, fecha, motivo). Consultas en lote (constantes respecto al número de proyectos). No se calcula nada con Stripe.
- **D-F. Transferencia: reutilizar tipos y textos, no la lista.** Se reutilizan `DeveloperTransferStatus`, `DEVELOPER_TRANSFER_STATUS_LABELS`, `TransferReason`, `TRANSFER_REASON_MESSAGES` y `TRANSFER_TEST_NOTICE`. No se llama a `getDeveloperTransfers` en el servicio porque no trae `projectId` (no se puede casar con cada proyecto sin repetir el join) y no está acotada; sirve como **oráculo** en un test de coherencia (mismo criterio que 012 con `getProjectPaymentOverview`). Riesgo R2.
- **D-G. Cuenta de cobros.** El panel muestra `ConnectedAccountOverview` tal cual (`status`, `hasStripeAccount`, `statusSyncedAt`; sin id de Stripe, ya es así) con la etiqueta `CONNECTED_ACCOUNT_STATUS_LABELS`. Si no está `active`, enlace "Configurar cobros de prueba" (o "Continuar configuración" si `hasStripeAccount`) a `/dashboard/payouts`, y la nota "Sin cobros activos no puedes enviar propuestas ni recibir la transferencia de prueba." (coincide con `PAYOUTS_NOT_READY`/`DEVELOPER_PAYOUTS_NOT_READY`). El estado mostrado es el último sincronizado; el botón "Actualizar estado" vive en `/dashboard/payouts` (no se llama a Stripe desde el panel).
- **D-H. Acciones pendientes, derivadas en una función pura** (`deriveDeveloperActions`):

| Condición | Acción | Destino |
|---|---|---|
| Cuenta de cobros con `status !== 'active'` | `setup_payouts` "Configurar cobros de prueba" (texto según estado: `not_started` "Configura", `pending` "Continúa/revisa", `restricted` "Requiere acción") | `/dashboard/payouts` |
| Proyecto ganado con transferencia `pending` o `failed` | `retry_transfer` "Reintentar transferencia" (muestra el estado y `TRANSFER_REASON_MESSAGES` del motivo si existe) | `/dashboard/payouts` |
| Proyecto ganado en `proposal_selected` con pago sin intento, `pending`, `canceled` o `failed` | `awaiting_payment` "Esperando el pago de prueba del cliente" (informativa; si la cuenta no está activa, la nota aclara que el cliente no puede pagar hasta que configures tus cobros) | `/dashboard/proposals?status=accepted` |
| Proyecto ganado `contracted` con transferencia `completed_test` o pago `completed_test` y sin fila de transferencia aún | Sin acción (el estado se muestra en la fila; sin fila de transferencia: "Sin transferencia todavía") | — |

  Orden: `setup_payouts`, `retry_transfer`, `awaiting_payment`; recorte a `DASHBOARD_LIST_LIMIT`.
- **D-I. Valoraciones.** `RatingSummary` se reutiliza **sin modificarlo** con `summary` de `getDeveloperRatingSummary(actor.id)` y `developerId` pasado por la página (el id propio no entra en el DTO). Con 0 valoraciones muestra "Aún sin valoraciones". El enlace "Ver valoraciones recibidas" ya lleva al perfil público.
- **D-J. Privacidad y "comunicación externa".** Del cliente solo se muestra el nombre abreviado ya público (`abbreviateClientName`); **no** se expone email, enlaces ni contacto del cliente. El punto de `SDD-PLAN §7` "datos permitidos para continuar la comunicación externa" no se resuelve aquí: hoy el modelo no tiene un contacto del cliente con visibilidad definida (019 solo cubre el contacto del desarrollador hacia el cliente) y exponerlo exigiría una decisión de producto y de migración. Ver P4.
- **D-K. Textos de dinero.** Todo el bloque de proyectos ganados lleva "Modo de prueba · No se mueve dinero real" (`role="note"`); la transferencia siempre con su etiqueta y `TRANSFER_TEST_NOTICE`, **nunca** como "recibido", "cobrado" ni "garantizado" (I3, I5; `BRIEF §7` reglas 14 y 15). El pago se muestra como lo ve el desarrollador: "Pago de prueba del cliente: {etiqueta}".
- **D-L. Sin Stripe en lecturas.** `getDeveloperDashboard` solo usa la BD (y las dos funciones reutilizadas, que son de solo BD). El test mockea `getStripe` para que lance y comprueba que nunca se invoca.

## Alcance

- Incluye:
  - Rama `developer` en `/dashboard`; servicio `getDeveloperDashboard`, función pura `deriveDeveloperActions`, tipos y componentes del panel (resumen de propuestas, estado de cobros, acciones pendientes, proyectos ganados, valoraciones con `RatingSummary`).
  - Cambio del enlace del header del desarrollador a `/dashboard` ("Mi panel").
  - Documentación: `MANUAL-TESTS.md` (sección de 013 y ajuste de 7b y de las filas que citan "Mis propuestas" en el header), `system-design.md` (módulo `dashboard`, decisiones 013) y nota en la spec 012.
- No incluye:
  - Datos de contacto del cliente (D-J), proyectos disponibles para proponer (ya en `/projects`, 006), paginación o filtros propios del panel, gráficos, notificaciones, polling.
  - Cambios en `getClientDashboard`, sus tipos o componentes, `listMyProposals`, `getDeveloperTransfers`, `getConnectedAccountOverview`, `RatingSummary`, `SiteNav`, `isActivePath`, la matriz de permisos, el esquema o migraciones.
  - Panel de admin. Reintentar transferencias desde el panel (el botón vive en `/dashboard/payouts`; aquí solo se enlaza).
  - Llamadas a Stripe; `npm install` y componentes shadcn nuevos.

## Reutilizar

Inventario verificado con Glob, Grep y Read en `src/modules/*`, `src/components`, `src/lib`.

| Existente | Uso |
|---|---|
| `payments/services/connected-account.service.ts` (`getConnectedAccountOverview`) y `payments/types/connected-account.types.ts` (`ConnectedAccountOverview`, `CONNECTED_ACCOUNT_STATUS_LABELS`) | Estado de la cuenta de cobros; tipo y etiquetas sin redeclarar |
| `ratings/services/rating.service.ts` (`getDeveloperRatingSummary`), `ratings/components/rating-summary.tsx` (`RatingSummary`), `profile/types/developer-profile.types.ts` (`DeveloperRatingSummary`) | Promedio y cantidad de valoraciones; el componente se usa tal cual |
| `payments/services/developer-transfer-overview.service.ts` (`getDeveloperTransfers`) | **Oráculo en el test de coherencia** (D-F); no se llama en producción desde el panel |
| `payments/types/developer-transfer.types.ts` (`DeveloperTransferStatus`, `DEVELOPER_TRANSFER_STATUS_LABELS`, `TransferReason`, `TRANSFER_REASON_MESSAGES`, `TRANSFER_TEST_NOTICE`) y `payments/types/payment.types.ts` (`PaymentAttemptStatus`, `PAYMENT_ATTEMPT_STATUS_LABELS`) | Tipos y textos |
| `proposals/services/proposal.service.ts` (`listMyProposals`), `proposals/schemas/proposal.schema.ts` (`MY_PROPOSALS_STATUSES`), `proposals/components/my-proposals-list.tsx`, `proposals/components/proposal-status-badge.tsx`, `proposals/types/proposal.types.ts` (`ProposalStatus`, `PROPOSAL_STATUS_LABELS`) | La lista sigue siendo `/dashboard/proposals` (enlaces `?status=`); badge y etiquetas para el resumen |
| `projects/components/project-status-badge.tsx`, `projects/types/project.types.ts` (`ProjectStatus`) | Estado del proyecto en cada fila |
| `ratings/services/client-name.ts` (`abbreviateClientName`) | Nombre público abreviado del cliente |
| `dashboard/types/dashboard.types.ts` (`DASHBOARD_LIST_LIMIT`), `dashboard/services/client-dashboard.service.ts` (patrón de consultas en lote, `selectDistinctOn`) | Constante compartida; patrón de referencia (no se importa ni se modifica) |
| `dashboard/components/dashboard-contracting-list.tsx` | Referencia de estilo/estructura de fila, aviso de Modo de prueba y formato de fechas (no se importa; los textos difieren) |
| `auth`: `requireRole`, `can`, `handleAuthErrorForPage`, `AuthError` | Guards |
| `src/lib/money.ts` (`formatUsd`), `src/components/shared/empty-state.tsx`, `ui/button` (`buttonVariants`), `ui/badge` | Importes y UI |
| `payments/components/payments-loading.tsx`, `payments-error.tsx`; `src/app/dashboard/loading.tsx` y `error.tsx` | **Se reutilizan sin cambios** (los textos "Cargando tu panel..." / "No pudimos cargar tu panel" sirven a ambos roles) |
| `src/lib/db/test-db.ts` (`createTestDb`), patrón `Proxy` + `holder` y `vi.mock("server-only")` de `client-dashboard.service.test.ts` | Tests con PGlite |
| `auth/services/dashboard-link.ts` y su test | Cambio de una línea y de una fila |

No existe un servicio que agregue por desarrollador (Grep de `getDeveloperDashboard`): se crea. No hay `src/hooks` ni stores y no se necesitan. Verificado con `ls src/components/ui` (`alert-dialog`, `badge`, `button`, `input`, `label`, `native-select`, `textarea`): no hace falta ningún componente shadcn nuevo.

## Archivos

Nuevos (N) y modificados (M). Cada archivo pertenece a una sola tarea. Hay cambios sin commitear en el árbol: en los archivos M **solo se añade o se reemplaza lo indicado**; no se reformatea ni se toca nada ajeno.

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/dashboard/types/developer-dashboard.types.ts` | N | T0 |
| `src/modules/dashboard/services/developer-dashboard-actions.ts` + `.test.ts` | N | T1 |
| `src/modules/dashboard/services/developer-dashboard.service.ts` + `.test.ts` | N | T1 |
| `src/modules/dashboard/components/developer-dashboard-view.tsx`, `developer-proposals-summary.tsx`, `developer-payout-status.tsx`, `developer-pending-actions.tsx`, `developer-won-projects.tsx` | N | T2 |
| `src/app/dashboard/page.tsx` (rama por rol) | M | T3 |
| `src/modules/auth/services/dashboard-link.ts` + `dashboard-link.test.ts` (enlace del developer) | M | T3 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/specs/012-client-dashboard.md` (solo nota) | M | T4 |

No cambian: `package.json`, `package-lock.json`, `.env.example`, `drizzle/**`, `src/app/layout.tsx`, `globals.css`, `src/components/ui/**`, `proxy.ts`, `src/app/dashboard/loading.tsx`, `src/app/dashboard/error.tsx`, `client-dashboard.service.ts` y su test, `dashboard.types.ts`, los componentes del cliente, `permissions.ts`, `docs/SETUP.md`, `state-machines.md`.

## Contratos

### 1. Tipos (T0) — `src/modules/dashboard/types/developer-dashboard.types.ts`

```ts
import type { ConnectedAccountOverview } from "@/modules/payments/types/connected-account.types";
import type { DeveloperTransferStatus, TransferReason } from "@/modules/payments/types/developer-transfer.types";
import type { PaymentAttemptStatus } from "@/modules/payments/types/payment.types";
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types";
import type { ProposalStatus } from "@/modules/proposals/types/proposal.types";

export type DeveloperActionKind = "setup_payouts" | "retry_transfer" | "awaiting_payment";

export type DeveloperAction =
  | { kind: "setup_payouts"; payoutsStatus: ConnectedAccountOverview["status"]; hasStripeAccount: boolean }
  | { kind: "retry_transfer"; projectId: string; projectTitle: string; transferStatus: "pending" | "failed"; reason: TransferReason | null }
  | { kind: "awaiting_payment"; projectId: string; projectTitle: string; payoutsReady: boolean };

export type DeveloperWonProject = {
  projectId: string;              // propio: ya lo ve en /dashboard/proposals (DeveloperProposal.projectId)
  title: string;
  status: "proposal_selected" | "contracted";
  clientName: string;             // abbreviateClientName(users.display_name); sin email ni id
  amountCents: number;            // de su propuesta aceptada
  payment: { status: PaymentAttemptStatus; updatedAt: Date } | null;     // último intento; null = no iniciado
  transfer: { status: DeveloperTransferStatus; completedAt: Date | null; reason: TransferReason | null } | null; // del intento completed_test
};

export type DeveloperDashboard = {
  proposals: { total: number; byStatus: Record<ProposalStatus, number> };  // todas las claves, 0 si no hay
  payouts: ConnectedAccountOverview;                                        // reutilizado tal cual
  ratings: DeveloperRatingSummary;                                          // reutilizado tal cual
  pendingActions: DeveloperAction[];
  won: DeveloperWonProject[];     // updated_at desc, máx. DASHBOARD_LIST_LIMIT
  wonTotal: number;               // total real, para decidir "Ver todas"
};
```

Sin ids de Stripe (`acct_`, `tr_`, `cs_`, `pi_`), sin `developerId`/`clientId`/`paymentAttemptId`, sin email ni contacto del cliente, sin `checkoutUrl`, sin `last_error_code` crudo de pagos (el `reason` de la transferencia es el código ya mostrado al desarrollador en 011b, tipado como `TransferReason`).

### 2. Función pura (T1) — `developer-dashboard-actions.ts` (sin `server-only`)

```ts
deriveDeveloperActions(input: { payouts: ConnectedAccountOverview; won: DeveloperWonProject[] }): DeveloperAction[]
```

Implementa la tabla D-H con orden `setup_payouts`, `retry_transfer`, `awaiting_payment` y recorte a `DASHBOARD_LIST_LIMIT`. `switch` exhaustivo sobre estados.

### 3. Servicio (T1) — `developer-dashboard.service.ts` (`import "server-only"`)

```ts
getDeveloperDashboard(actor: AuthUser): Promise<DeveloperDashboard>
```

- `actor.role !== "developer"` o `!can(actor.role, "payout.manage")` -> `AuthError("FORBIDDEN")` **antes** de tocar la BD (client y admin -> `FORBIDDEN`).
- Todo se filtra por `proposals.developer_id = actor.id` (el servicio no recibe ids). Cero escrituras, **cero llamadas a Stripe**.
- Consultas acotadas (constantes respecto al número de proyectos), en `Promise.all`:
  1. Conteo de propuestas `GROUP BY status` -> `proposals` (rellenar con 0).
  2. Ganados: `proposals` (`accepted`, del actor) `INNER JOIN projects` (estado `proposal_selected | contracted`) `INNER JOIN users` (cliente, solo `display_name`), `projects.updated_at desc, projects.id desc`, límite `DASHBOARD_LIST_LIMIT`; y el total real.
  3. `getConnectedAccountOverview(actor)` y `getDeveloperRatingSummary(actor.id)`.
- Para los ids de (2), en lote: último intento por proyecto (`selectDistinctOn`, `created_at desc, id desc`) y transferencia del intento `completed_test` filtrada además por `developer_transfers.developer_id = actor.id` (mismo patrón que `client-dashboard.service.ts`).
- `pendingActions = deriveDeveloperActions({ payouts, won })`.
- Un proyecto ganado sin cliente resoluble no existe (FK); no hay rama de omisión. Logs: ninguno con títulos, nombres ni importes.

### 4. UI (T2 y T3)

- `src/app/dashboard/page.tsx` (T3, fina): `requireRole("client", "developer")` en `try` (`handleAuthErrorForPage` en el `catch`); si `user.role === "client"` -> `getClientDashboard` + `ClientDashboardView` (igual que hoy); si `developer` -> `getDeveloperDashboard` + `<DeveloperDashboardView data={...} developerId={user.id} />`. Metadata "Mi panel | Nexora" para ambos. `admin` -> 404 (el guard lanza `FORBIDDEN`). Sin lógica de negocio.
- `developer-dashboard-view.tsx` (T2, servidor, presentacional): un solo `<h1>` "Mi panel"; secciones en este orden: `DeveloperPendingActions` ("Pendiente de ti"), `DeveloperPayoutStatus` ("Cobros de prueba"), `DeveloperProposalsSummary` ("Tus propuestas"), `DeveloperWonProjects` ("Proyectos ganados"), y "Tus valoraciones" con `RatingSummary`. Estado vacío total (`proposals.total === 0`): bloque "Aún no has enviado propuestas" con enlace "Explorar proyectos" (`/projects`); la sección de cobros y valoraciones se muestran siempre (la cuenta debe configurarse antes de proponer).
- `developer-proposals-summary.tsx`: un enlace por estado (`pending`, `accepted`, `rejected`, `withdrawn`; etiqueta de `PROPOSAL_STATUS_LABELS`, conteo) a `/dashboard/proposals?status=<estado>`; "Todas (N)" a `/dashboard/proposals`; estados en 0 atenuados pero enlazables; `aria-label` "{etiqueta}: {n} propuestas".
- `developer-payout-status.tsx`: etiqueta `CONNECTED_ACCOUNT_STATUS_LABELS[status]`, nota de D-G y enlace (`buttonVariants`, objetivo >= 40 px) a `/dashboard/payouts`: "Configurar cobros de prueba" / "Continuar configuración" / "Ver cobros" si está activa. No muestra ids de Stripe.
- `developer-pending-actions.tsx`: lista de acciones; `retry_transfer` con el estado, el motivo amigable y el enlace "Reintentar en Cobros de prueba"; `awaiting_payment` informativa con enlace "Ver propuesta aceptada"; sin acciones: "No tienes nada pendiente.".
- `developer-won-projects.tsx`: por proyecto, título, `ProjectStatusBadge`, cliente abreviado, importe (`formatUsd`), "Pago de prueba del cliente: {etiqueta}" (`PAYMENT_ATTEMPT_STATUS_LABELS` o "No iniciado"), "Transferencia: {etiqueta}" + `TRANSFER_TEST_NOTICE` (o "Sin transferencia todavía") con motivo amigable si `pending`/`failed`, enlace "Ver en Cobros de prueba" cuando hay transferencia; si `wonTotal > won.length`, "Ver todas" a `/dashboard/proposals?status=accepted`. Aviso "Modo de prueba · No se mueve dinero real" (`role="note"`) una vez. Fechas con `Intl.DateTimeFormat("es", { dateStyle: "medium" })`. Sin ganados: "Aún no tienes propuestas aceptadas.".
- `dashboard-link.ts` (T3): caso `developer` -> `{ href: "/dashboard", label: "Mi panel" }`; `dashboard-link.test.ts` actualiza esa fila.

## Seguridad

- **Autorización en capas:** `requireRole("client", "developer")` en la página (admin y visitantes no llegan); `getDeveloperDashboard` exige `developer` + `payout.manage` antes de la BD; `getClientDashboard` mantiene su guard `client` (un developer nunca puede invocarlo aunque la página cambiara). Todo filtra por `actor.id`; el servicio no recibe ids de la entrada.
- **Proyecciones explícitas:** solo lo listado en `DeveloperDashboard`; test de `Object.keys` exactos.
- **Privacidad del cliente:** solo `abbreviateClientName`; sin email ni contacto (D-J).
- **Stripe solo Test Mode:** ninguna lectura llama a Stripe; no hay acciones nuevas que escriban. La etiqueta de transferencia nunca sugiere dinero real (D-K).
- **Logs sin PII.** **Abuso:** solo lectura; sin rate limiting nuevo (015).

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Desarrollador sin propuestas ni cuenta | Acción "Configurar cobros de prueba"; resumen en 0; estado vacío con enlace a `/projects` |
| Cuenta `not_started`/`pending`/`restricted` | Acción `setup_payouts` y enlace a `/dashboard/payouts` |
| Cuenta `active` | Sin acción de cobros; "Lista para recibir transferencias de prueba" |
| Propuesta aceptada, proyecto `proposal_selected`, sin intento / `pending` / `canceled` / `failed` | Fila ganada con "No iniciado"/etiqueta; acción informativa `awaiting_payment` |
| Pago `completed_test`, sin fila de transferencia aún | "Sin transferencia todavía" (sin acción) |
| Transferencia `pending` o `failed` | Acción `retry_transfer` + motivo amigable + enlace a `/dashboard/payouts` |
| Transferencia `completed_test` | "Completada en Test Mode" + `TRANSFER_TEST_NOTICE`; nunca "recibida" |
| Propuestas `rejected`/`withdrawn` o proyectos `closed` | Solo cuentan en el resumen; sin fila ganada ni acción |
| 0 valoraciones | "Aún sin valoraciones" (`RatingSummary`) |
| Más de 20 ganados | Se listan 20 y aparece "Ver todas" |
| Cliente o admin llama al servicio | `FORBIDDEN` sin BD; en la página, admin 404, sin sesión `/sign-in` |
| Otro desarrollador | Sus propuestas, pagos y transferencias no aparecen |

## Criterios de aceptación

Base (T0):

- AC1. `developer-dashboard.types.ts` exporta los tipos del contrato reutilizando (importando, sin redeclarar) `ConnectedAccountOverview`, `DeveloperRatingSummary`, `DeveloperTransferStatus`, `TransferReason`, `PaymentAttemptStatus` y `ProposalStatus`; `tsc` pasa.

Servicio y función pura (T1):

- AC2. `getDeveloperDashboard`: `proposals.byStatus` trae las cuatro claves (0 si no hay) y suma `total`; cuenta solo propuestas del actor (otro desarrollador con propuestas no altera nada).
- AC3. `won`: solo propuestas `accepted` del actor con proyecto `proposal_selected | contracted`, orden `updated_at desc, id desc`, máximo 20 con `wonTotal` real; muestra el último intento (`payment`) y la transferencia del intento `completed_test` (con `reason`); sin intento `payment = null`; sin transferencia `transfer = null`; `clientName` es el nombre abreviado (con "Cliente" cuando no parece un nombre).
- AC4. `payouts` y `ratings` coinciden con `getConnectedAccountOverview(actor)` y `getDeveloperRatingSummary(actor.id)` para los mismos datos (sin cuenta -> `not_started`; sin valoraciones -> `{ average: null, count: 0 }`; con valoraciones -> promedio y cantidad correctos).
- AC5. `deriveDeveloperActions` cumple la tabla D-H con tests table-driven (estado de cuenta x estado del proyecto x último intento x transferencia): `setup_payouts` solo si no `active`; `retry_transfer` solo con transferencia `pending`/`failed`; `awaiting_payment` solo en `proposal_selected` sin pago completado; orden `setup_payouts`, `retry_transfer`, `awaiting_payment`; recorte a 20.
- AC6. **Coherencia:** para los mismos datos, el estado de cada transferencia de `won` y de `retry_transfer` coincide con `getDeveloperTransfers` (test de contraste con casos: sin transferencia, `pending`, `failed`, `completed_test`).
- AC7. Privacidad: `Object.keys` exactos de `DeveloperDashboard`, de cada `DeveloperAction` (por `kind`) y de cada `DeveloperWonProject`; ningún dato de otro desarrollador; ninguna cadena `acct_`, `tr_`, `cs_` ni `pi_` en el JSON serializado del resultado sembrando esos ids en la BD; sin email del cliente.
- AC8. `client`/`admin` -> `FORBIDDEN` sin BD (el test comprueba que no hubo consultas). `getStripe` mockeado para lanzar no se invoca y el panel se calcula igualmente.

UI y navegación (T2 y T3):

- AC9. `/dashboard` (manual): con sesión `developer` muestra "Pendiente de ti", "Cobros de prueba" (con enlace a `/dashboard/payouts` si no está activa), "Tus propuestas" con enlaces `?status=`, "Proyectos ganados" con pago y transferencia, y "Tus valoraciones"; con sesión `client` sigue igual que en 012; `admin` recibe 404; sin sesión redirige a `/sign-in`.
- AC10. El header del desarrollador muestra "Mi panel" -> `/dashboard` (en lugar de "Mis propuestas"), resaltado en `/dashboard` y en `/dashboard/*`; "Proyectos" y "Mi cuenta" siguen; cliente, admin, visitante y onboarding no cambian (`dashboard-link.test.ts` actualizado: solo la fila `developer`; el resto de tests pasa sin cambios).
- AC11. Textos y accesibilidad: aviso "Modo de prueba · No se mueve dinero real" visible en el bloque de ganados; la transferencia nunca aparece como "recibida" ni "cobrada"; un `<h1>`, foco visible, objetivos táctiles >= 40 px, estado no solo por color, sin desbordes a 390 px.

Regresión y documentación (T0 a T4):

- AC12. Sin cambios en `client-dashboard.service.ts` (+ test), `dashboard.types.ts`, componentes del cliente, `loading.tsx`, `error.tsx`, `project.service.ts`, `permissions.ts`, `drizzle/**`, `package.json`, `.env.example`, `src/app/layout.tsx`, `globals.css` y `src/components/ui/**`; ninguna migración nueva; `npm run lint`, `npm run test` y `npm run build` pasan; los tests existentes pasan sin modificaciones salvo la fila `developer` de `dashboard-link.test.ts`; ningún test usa red, Clerk, Stripe ni Neon reales. El build no añade rutas.
- AC13. Documentación (solo adiciones/ajustes puntuales): `system-design.md §4` (la fila `dashboard` admite leer `getConnectedAccountOverview` y `getDeveloperRatingSummary`, solo lectura y sin Stripe) y `§8` (decisiones 013-D-A a D-L); `MANUAL-TESTS.md` (sección "Spec 013", ajuste de 7b y de las filas que dicen que el header del desarrollador muestra "Mis propuestas", y de la fila (f) de 8g sobre el 404 del developer); nota en `docs/specs/012-client-dashboard.md` que remite a 013 para P3/D-D/AC19.

## Tests requeridos

Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM; BD con PGlite y migraciones reales (`createTestDb`, patrón `Proxy` + `holder` y `vi.mock("server-only")`); `vi.mock("@/lib/stripe")` con `getStripe` que lanza (el módulo de cuentas conectadas lo importa; nunca debe invocarse). Sin temporizadores falsos.

- `src/modules/dashboard/services/developer-dashboard-actions.test.ts` (T1): AC5.
- `src/modules/dashboard/services/developer-dashboard.service.test.ts` (T1): AC2, AC3, AC4, AC6 (usa `getDeveloperTransfers` y `getConnectedAccountOverview` como oráculos), AC7, AC8. Siembra: dos desarrolladores y dos clientes; propuestas en los cuatro estados; proyectos `proposal_selected`/`contracted`/`closed`; intentos `pending`/`canceled`/`failed`/`completed_test`; transferencias `pending`/`failed`/`completed_test`; cuenta conectada en cada estado con ids `acct_...`/`tr_...` sembrados; valoraciones de dos clientes.
- `src/modules/auth/services/dashboard-link.test.ts` (T3): fila `developer` -> `/dashboard`, "Mi panel"; las demás intactas (AC10).
- Sin test unitario obligatorio (`SETUP §3`): componentes presentacionales del panel y la página de `src/app`.

### Pruebas manuales (texto para `MANUAL-TESTS.md`, sección "8h. Spec 013")

- (a) Desarrollador A sin cuenta de cobros: `/dashboard` muestra "Configurar cobros de prueba" y el enlace lleva a `/dashboard/payouts`; tras activar la cuenta y pulsar "Actualizar estado", el panel muestra "Lista para recibir transferencias de prueba" y desaparece la acción.
- (b) Con propuestas en los cuatro estados, los conteos coinciden con `/dashboard/proposals` y cada enlace `?status=` abre la lista filtrada.
- (c) Propuesta aceptada con el cliente sin pagar: aparece en "Proyectos ganados" con "Pago de prueba del cliente: No iniciado" y la acción informativa "Esperando el pago de prueba del cliente".
- (d) Pago completado con transferencia `pending`/`failed`: el panel muestra el estado con "Transferencia de prueba, no es dinero real" y la acción "Reintentar" enlaza a `/dashboard/payouts`, donde "Reintentar transferencia" funciona; completada: "Completada en Test Mode", nunca "recibida".
- (e) Valoraciones: sin ninguna, "Aún sin valoraciones"; tras valorar el cliente, promedio y cantidad coinciden con "Mi cuenta" y el enlace lleva al perfil público.
- (f) Cuentas: cliente ve su panel de 012 sin cambios; admin recibe 404 en `/dashboard`; el Desarrollador B no ve nada del A.
- (g) Header del desarrollador: "Mi panel" -> `/dashboard`, "Proyectos" y "Mi cuenta"; resaltado en `/dashboard/*` (en `/dashboard/account` también "Mi cuenta", ver P2).
- (h) Sin red de Stripe: con la clave de Stripe inválida o ausente el panel carga igual (solo BD).
- (i) Responsive a 390 px (header de tres enlaces), teclado/foco y lector de pantalla.

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Durante el bloque paralelo nadie ejecuta `npm install`, `npm run build`, `drizzle-kit` ni `db:migrate` (no hay migración); el reviewer corre lint, test y build al final.

### T0 — Base compartida: tipos (serial)

- Archivos: `src/modules/dashboard/types/developer-dashboard.types.ts`
- Depende de: —
- Paralelizable: no
- Cubre: AC1

### T1 — Servicio de lectura y función pura de acciones

- Archivos: `src/modules/dashboard/services/developer-dashboard-actions.ts`, `src/modules/dashboard/services/developer-dashboard-actions.test.ts`, `src/modules/dashboard/services/developer-dashboard.service.ts`, `src/modules/dashboard/services/developer-dashboard.service.test.ts`
- Depende de: T0
- Paralelizable: sí (con T2; archivos disjuntos)
- Cubre: AC2, AC3, AC4, AC5, AC6, AC7, AC8

### T2 — Componentes del panel del desarrollador

- Archivos: `src/modules/dashboard/components/developer-dashboard-view.tsx`, `src/modules/dashboard/components/developer-proposals-summary.tsx`, `src/modules/dashboard/components/developer-payout-status.tsx`, `src/modules/dashboard/components/developer-pending-actions.tsx`, `src/modules/dashboard/components/developer-won-projects.tsx`
- Depende de: T0
- Paralelizable: sí (con T1; solo importa tipos de T0)
- Cubre: AC11 (parte de AC9)

### T3 — Integración: rama por rol en `/dashboard` y navegación

- Archivos: `src/app/dashboard/page.tsx`, `src/modules/auth/services/dashboard-link.ts`, `src/modules/auth/services/dashboard-link.test.ts`
- Depende de: T1, T2
- Paralelizable: no (integra T1 y T2; el enlace del header solo se activa cuando la vista existe)
- Cubre: AC9, AC10, AC12

### T4 — Documentación y pruebas manuales

- Archivos: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/specs/012-client-dashboard.md`
- Depende de: T3
- Paralelizable: no
- Cubre: AC13 (y la verificación manual de AC9 a AC11)
- Detalle: en `MANUAL-TESTS.md` añadir "8h. Spec 013 — Dashboard del desarrollador" con las pruebas manuales de arriba (casillas `- [ ]`) y actualizar la línea `**Cubre:**`; en 7b (cuenta Desarrollador) y en las filas de 8a/8d/8e que dicen que el header muestra "Mis propuestas" (líneas con esa frase), cambiar a "Mi panel" (-> `/dashboard`); en 8g la prueba (f) pasa a "developer ve su panel (013); admin recibe 404". En `system-design.md` ajustar la fila `dashboard` de §4 y añadir filas `013-D-*` en §8 (formato de `012-D-*`). En la spec 012 añadir **solo** una línea bajo P3 y D-D ("Resuelta por la spec 013: `/dashboard` es role-aware, el developer ve su panel; el guard del servicio no cambia"). Solo añadir o reemplazar esas líneas.

## Riesgos

- R1. **Modifica specs `done` (009b y la nota en 012).** El header del desarrollador pierde "Mis propuestas" (queda a un clic desde el panel). Regresión de navegación cubierta por AC10 y la prueba manual (g).
- R2. **Lógica de "último intento/transferencia" repetida** entre este servicio, el del cliente y `getProjectPaymentOverview`. Se acepta para no tocar servicios `done`; el test de coherencia (AC6) detecta divergencias. Con un tercer consumidor real, extraer un helper compartido en `payments`.
- R3. El panel muestra el último estado **confirmado por el servidor**: un pago hecho sin webhook puede verse `pending` hasta que el cliente pulse "Actualizar estado"; el desarrollador no puede refrescarlo (solo la cuenta de cobros en `/dashboard/payouts`). Heredado de 010.
- R4. Doble `aria-current="page"` en `/dashboard/account` ("Mi panel" y "Mi cuenta") por el resaltado por prefijo (D-B, P2).
- R5. Importar `connected-account.service.ts` arrastra `@/lib/stripe` al grafo del panel (sin llamarlo). Mitigación: test con `getStripe` que lanza (AC8). Alternativa si molesta: leer `connected_accounts` directamente (duplica ~6 líneas); ver P5.
- R6. Listas acotadas a 20 (como 012): un desarrollador con más de 20 proyectos ganados no los verá todos en el panel; el enlace "Ver todas" lleva a la lista.
- R7. Se muestra al desarrollador el estado del pago del cliente (`payment.read` ya lo permite al rol): solo estado y fecha, sin importes ajenos ni datos de Stripe.

## Preguntas abiertas

- P1. Ruta: ¿misma `/dashboard` con vista por rol (recomendado, D-A) o redirección del developer a `/dashboard/proposals`? Recomendación: misma ruta con vista por rol.
- P2. Header del desarrollador: ¿reemplazar "Mis propuestas" por "Mi panel" (recomendado, D-B; tres enlaces) o añadir "Mi panel" como cuarto enlace, o usar `exact` en `isActivePath` para evitar el doble resaltado en `/dashboard/account`? Recomendación: reemplazar y aceptar el doble resaltado; si el equipo lo considera una falla de accesibilidad, abordarlo en 014.
- P3. **Specs `done` modificadas:** (a) `docs/specs/012-client-dashboard.md`: solo una nota bajo P3 y D-D, que escribe T4 tras la aprobación (esta redacción no toca 012); (b) el comportamiento de 009b (enlace del developer) cambia por D-B. Recomendación: aceptar ambos como cambios mínimos.
- P4. "Datos permitidos para continuar la comunicación externa" (`SDD-PLAN §7`): ¿se difiere? Recomendación: sí, diferir; hoy no existe un contacto del cliente con visibilidad definida y exponerlo requiere decisión de producto (y probablemente migración). El panel solo muestra el nombre abreviado.
- P5. Reutilizar `getConnectedAccountOverview` (arrastra `@/lib/stripe` al import, sin llamarlo) frente a leer `connected_accounts` directamente. Recomendación: reutilizar (pedido de no duplicar).
- P6. Excepción en `system-design.md §4`: el panel llama a dos funciones de servicio de `payments` y `ratings` (solo lectura) en lugar de solo leer tablas. Recomendación: aprobar y documentarla.
- P7. `awaiting_payment` es informativa (el desarrollador no puede hacer nada salvo tener la cuenta activa). ¿Se mantiene como acción pendiente? Recomendación: sí, con la nota condicional de cobros.
- P8. Límite de 20 filas/acciones sin paginación (D-E). Recomendación: aceptable.

## Próximas fases

- 014: revisión transversal de accesibilidad (incl. el doble `aria-current` de P2), estados de carga/error y vacío de ambos paneles.
- Spec futura (si el producto lo pide): contacto del cliente visible para el desarrollador ganador, con campo, visibilidad y migración definidos.
- 015: rate limiting y registro de eventos (el panel es de solo lectura).
- Panel de admin de solo lectura, si el producto lo pide (un solo archivo en `getDashboardLink`).

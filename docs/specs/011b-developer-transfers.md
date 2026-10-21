# Transferencias de prueba al desarrollador ganador (Stripe Connect, Test Mode)

Estado: done

Segunda parte de la spec 011 (`docs/SDD-PLAN.md §6`). 011a (cuenta conectada, `done`) y 011c (Accounts v2, `done`) dejaron el destino; 010 (`done`) confirma el pago por webhook. 011b registra y ejecuta la **transferencia de prueba** al desarrollador ganador. Es el último paso del MVP de pagos: nada es dinero real (`BRIEF §6.4`, `§6.5`, `§7` reglas 13 a 15).

## Objetivo

Cuando un pago pasa a `completed_test` (webhook verificado de 010 o reconciliación "Actualizar estado"), Nexora crea **una** transferencia por pago, en la misma transacción, y después la ejecuta contra Stripe (`stripe.transfers.create` v1, `destination` = cuenta v2 `recipient` del desarrollador, importe completo, USD, sin comisión). La transferencia es reintentable e idempotente. Cliente y desarrollador ven su estado con la etiqueta "Transferencia de prueba, no es dinero real".

Decisiones ya aprobadas y heredadas (no se reabren): transferencia automática al confirmarse el pago, importe completo sin comisión, onboarding alojado, USD, Separate charges and transfers; `transfer_group`/transferencia pertenecen a 011b (011a D1 a D8, `system-design.md §8` D12).

Arquitectura que aplica (solo estas secciones): `system-design.md §2` (entidades; I3, I4, I5), `§3` (propiedad de datos: Stripe guarda la transferencia, Neon su id y estado), `§4` (`payments` escribe `developer_transfers`; depende de `projects`/`proposals`/`users` solo por lectura), `§5.4` y `state-machines.md §4` (transferencia; hoy "derivada", se vuelve almacenada), `§6` (permisos), `§7` (pagos y webhooks), `§8` (decisiones). `state-machines.md §3`, `§6` y `§5` (casos límite) se citan, no cambian salvo una nota.

## Hechos verificados (código y SDK, 2026-10-21)

| Hecho | Fuente |
|---|---|
| Prueba real del humano: `transfers.create({ amount, currency, destination: <acct_ v2> })` v1 devolvió `tr_...` y `destination_payment`; dejó `transfer_group` y `source_transaction` en null. No hace falta `accounts.retrieve` v1 | MANUAL-TESTS 8b (g), marcado `[x]` |
| `Transfers.CreateParams`: `source_transaction?: string`, `transfer_group?: string`; la respuesta trae `livemode: boolean`, `source_transaction: string \| Charge \| null` | `node_modules/stripe/esm/resources/Transfers.d.ts` |
| `PaymentIntent.latest_charge: string \| Charge \| null` (id del cargo del pago) | `esm/resources/PaymentIntents.d.ts:250` |
| 010 ya guarda `payment_attempts.stripe_payment_intent_id` al completar el pago; no guarda el id del cargo | `payment-transitions.ts` (`completePendingAttempt`) |
| Checkout (009) crea la sesión con clave de idempotencia `nexora:checkout:<attemptId>` y parámetros derivados solo de filas; **no** envía `transfer_group` | `payment-checkout.service.ts:238, 266-295` |
| Un intento `pending` solo recrea la sesión (`create` con la misma clave) si no guardó el session id y está dentro de `RESUME_WINDOW_SECONDS` (600 s); en el resto de casos relee la sesión (`retrieve`) | `payment-checkout.service.ts:177-190` |
| `src/lib/stripe.ts` ya exporta `isDefinitiveStripeRejection`, `stripeErrorLogFields` (con `message` saneado solo para `StripeInvalidRequestError`), `isStripeHostedUrl`, `getStripe` (rechaza claves live) | `src/lib/stripe.ts` |
| `syncConnectedAccount(actor)` relee la cuenta v2 con `include` y escribe `status`; exige actor `developer` y usa `actor.id` | `connected-account.service.ts:194-239` |
| `applySessionOutcome(tx, ...)` es el único punto que completa el pago y contrata el proyecto; lo usan el webhook y la reconciliación; no hace llamadas a Stripe | `payment-session-effects.ts` |
| `next/server` expone `after()` (Next 16), pero no se usa aquí (D-H, P4) | `node_modules/next/dist/docs/.../after.md` |
| Estado de BD: `drizzle/` llega a `0007_developer_bio_5000` (de 019, sin commitear). Esta migración será la siguiente del journal (`0008`) | `ls drizzle` |

### A verificar manualmente (no comprobable sin red; T4 lo pasa a MANUAL-TESTS y el humano lo cierra)

- (a) Que `transfers.create` con `source_transaction` (cargo del PaymentIntent) y `destination` = cuenta v2 se acepta. La prueba verificada fue sin `source_transaction`.
- (b) Que con `source_transaction` la transferencia no falla por saldo insuficiente aunque el cargo aún no esté disponible (comportamiento documentado de Stripe; sin él la prueba depende del saldo de prueba de la plataforma, p. ej. tarjeta `4000 0000 0000 0077`).
- (c) Que la transferencia hereda el `transfer_group` del PaymentIntent (`group_pi_...`) y que Stripe la acepta sin enviarlo explícitamente.
- (d) Que repetir `transfers.create` con la misma clave devuelve el mismo `tr_...`, y que tras un rechazo 4xx la misma clave **repite el error** (base de D-C: la clave incluye una generación).
- (e) La ventana real de la clave de idempotencia de `transfers.create` (se asume al menos 24 h; R3).
- (f) Latencia del webhook con la transferencia en línea (tres llamadas a Stripe; D-H, R5).
- (g) Que el Dashboard de Stripe muestra la transferencia con su `destination_payment` en la cuenta del desarrollador.

## Decisiones propuestas (recomendación por defecto; requieren aprobación humana, ver "Preguntas abiertas")

- **D-A. `source_transaction` en la transferencia, sin tocar el Checkout.** La transferencia se liga al cargo del pago (`PaymentIntent.latest_charge`, leído con `paymentIntents.retrieve` justo antes de transferir). Stripe hereda el `transfer_group` del cargo, y la transferencia no depende del saldo disponible. **Se descarta** añadir `payment_intent_data.transfer_group` al Checkout (opción de 011a D6): cambiaría el cuerpo de las peticiones con la clave `nexora:checkout:<attemptId>`; un intento `pending` creado antes del despliegue y recreado dentro de la ventana de 600 s recibiría `StripeIdempotencyError` (ambiguo, se queda `pending` y a los 10 min se cancela y se reinicia; autocurable pero molesto). Sin cambios en 009 no hay problema de idempotencia que resolver. Alternativa solo si (a) o (c) fallan: `transfer_group` en Checkout con un shim de compatibilidad para intentos antiguos (spec nueva).
- **D-B. La fila de transferencia nace en la misma transacción que el pago.** `applySessionOutcome` inserta la fila `pending` al pasar el intento a `completed_test` (y se revierte junto con él si falla). Si el proceso muere tras el commit, la fila existe y es reintentable: nunca hay un pago completado sin transferencia registrada. Una transferencia por pago (`UNIQUE payment_attempt_id`). **Sin llamadas a Stripe dentro de ninguna transacción.**
- **D-C. Clave de idempotencia determinista con generación:** `nexora:transfer:<transferId>:<retryGeneration>`. Mientras el resultado sea ambiguo o "pendiente" se reutiliza la misma clave (Stripe devuelve el mismo `tr_...` si la primera llamada sí llegó). Solo un reintento manual tras `failed` incrementa `retry_generation`, porque Stripe repite el error 4xx para una misma clave (a verificar (d)). Parámetros constantes por fila (importe y moneda de la BD; destino y cargo).
- **D-D. Estados `pending`, `completed_test`, `failed`.** `failed` = rechazo definitivo de Stripe (`isDefinitiveStripeRejection`, igual que 009). Ambiguo/transitorio o precondición no cumplida (cuenta no activa, pago sin liquidar) = `pending`, reintentable. `completed_test` es terminal. El pago y la transferencia siguen siendo independientes (I3).
- **D-E. Releer la cuenta conectada antes de transferir** (la caché `status` puede estar desfasada; `state-machines.md §6` ya lo advertía). Si no está `active`, la fila queda `pending` con motivo `ACCOUNT_NOT_ACTIVE`. Sin cuenta o sin `acct_`: igual.
- **D-F. Reintento.** Automático (sin cron ni infraestructura nueva): al confirmarse el pago (post-commit del webhook y de la reconciliación), y cuando el desarrollador vuelve del onboarding o pulsa "Actualizar estado" y su cuenta queda `active` (reintenta sus `pending`). Manual: botón "Reintentar transferencia" del desarrollador, que reintenta sus `pending` y `failed` (estas últimas con nueva generación). No hay barrido global (YAGNI; 015/017).
- **D-G. Anomalía "pago completado con proyecto no `proposal_selected`"** (010 RF6): la transferencia se crea igual, porque el cobro de prueba ya ocurrió y el ganador es el de la propuesta aceptada del intento.
- **D-H. Ejecución en línea, no en `after()`.** `handleStripeEvent` y la reconciliación esperan a la transferencia (con `try/catch` que nunca lanza) tras el commit. Motivo: probar `after()` en Vitest exige simular el contexto de petición. Una falla de la transferencia **nunca** hace fallar el webhook: el pago ya está confirmado y un reintento de Stripe entraría como `duplicate` y no volvería a disparar nada; la fila `pending` es la red de seguridad. Ver R5 y P4.
- **D-I. Los motivos de fallo se guardan como códigos propios** (`last_error_code`), nunca el `message` ni el `code` de Stripe (esos solo van a logs vía `stripeErrorLogFields`).

## Alcance

- Incluye:
  - Tabla `developer_transfers` y migración generada por drizzle-kit (solo el humano corre `npm run db:migrate`).
  - Acción de permisos `transfer.retry` (solo `developer`).
  - Servicio de ejecución y reintento de transferencias; hoja de inserción atómica con el pago.
  - Integración post-commit en el webhook (010) y en la reconciliación (010).
  - Estado de la transferencia en la página de pago del cliente (paso 4) y lista "Transferencias de prueba" con reintento en `/dashboard/payouts` del desarrollador.
  - Pruebas automáticas (Vitest, PGlite, Stripe falso) y manuales; documentación (`MANUAL-TESTS`, `system-design`, `state-machines`).
- No incluye:
  - Cambios en el Checkout de 009 (`transfer_group`; D-A), en la ruta del webhook, en `proxy.ts`, `layout.tsx`, `globals.css`, `package.json`, `.env.example` (sin variables nuevas).
  - Comisión, reembolsos, reversión de transferencias, payouts a banco, cuentas en otras monedas, webhooks de Connect (`transfer.*`, `account.updated`).
  - Cron, cola, barrido global de pendientes, `after()` (D-F, D-H).
  - Vistas de admin, notificaciones, rate limiting (015), dinero real.
  - Editar specs 009, 010, 011a, 011c.

## Reutilizar

| Existente | Uso |
|---|---|
| `src/lib/stripe.ts`: `getStripe`, `StripeConfigError`, `isDefinitiveStripeRejection`, `stripeErrorLogFields` | Cliente de prueba, clasificación definitivo/ambiguo y logs seguros. **Sin cambios** |
| `payment-session-effects.ts` (`applySessionOutcome`), `payment-event.service.ts` (`handleStripeEvent`), `payment-reconciliation.service.ts` (`reconcileProjectPayment`) | Se **extienden** (insertar la fila; disparar post-commit). Sin duplicar sus reglas |
| `payment-transitions.ts` (patrón de hojas con `executor` y guarda en el `WHERE`) | Patrón de las hojas de `developer_transfers` |
| `connected-account.service.ts`: `syncConnectedAccount` (lógica de relectura, defensas de `id`, `metadata.nexora_user_id`, `livemode`) | Se extrae su núcleo a `syncConnectedAccountForUser(userId)` (sin actor; reutilizado por el servicio de transferencias) y `syncConnectedAccount(actor)` delega. Mismo comportamiento y mensajes |
| `connected-account-errors.ts`, `payment-errors.ts` | Patrón de mensajes por código en español (no se modifican; los motivos de transferencia viven en `developer-transfer.types.ts`) |
| `connected-account.actions.ts` (`requireDeveloper`, `toResult`), return route de 011a | Patrón de la action nueva; hooks de reintento automático (D-F) |
| `payment-overview.service.ts` / `payment.types.ts` (`ProjectPaymentOverview`) | Se añade el campo `transfer` (solo estado y fecha) |
| `payment-page-view.tsx`, `payment-progress.tsx` (paso 4 hoy fijo "Pendiente de implementación") | El paso 4 pasa a mostrar el estado real |
| `payouts-page-view.tsx`, `src/app/dashboard/payouts/page.tsx`, `refresh-connected-account-button.tsx` | Sección de transferencias en la página existente de desarrollador; patrón del botón de reintento |
| `auth/services/permissions.ts` (+ test de matriz exhaustiva), `can`, `requireRole`, `AuthError`, `handleAuthErrorForPage` | Permisos y guards. Acción nueva `transfer.retry`; lectura con `payout.manage` |
| `lib/db/test-db.ts` (`createTestDb`, PGlite con migraciones reales), tests de restricciones (`connected-accounts-constraints.test.ts`), fake de Stripe de `connected-account.service.test.ts` y `payment-event.service.test.ts` | Patrones de pruebas |
| `lib/money.ts` (`formatUsd`), `components/ui/badge`, `button` | UI. Sin componentes shadcn nuevos (`npx shadcn@latest search` no es necesario: se compone con `Badge` y `Button`) |

No existe ningún código de transferencias: se crea.

## Modelo de datos (T0)

`src/modules/payments/schema/developer-transfers.table.ts` (estilo de `payment-attempts.table.ts` y `connected-accounts.table.ts`):

```ts
export const developerTransferStatusEnum = pgEnum("developer_transfer_status", [
  "pending", "completed_test", "failed",
]);

export const developerTransfers = pgTable("developer_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentAttemptId: uuid("payment_attempt_id").notNull().unique()
    .references(() => paymentAttempts.id, { onDelete: "restrict" }),
  developerId: uuid("developer_id").notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),            // copied from the attempt (full amount, no fee)
  currency: text("currency").notNull().default("USD"),
  status: developerTransferStatusEnum("status").notNull().default("pending"),
  stripeTransferId: text("stripe_transfer_id").unique(),     // NULL until Stripe creates it
  retryGeneration: integer("retry_generation").notNull().default(0),   // part of the idempotency key (D-C)
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),                    // own code (D-I); never Stripe's message
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: ..., updatedAt: ...,
}, (t) => [
  check("developer_transfers_amount_positive", sql`${t.amountCents} > 0`),
  check("developer_transfers_currency_usd", sql`${t.currency} = 'USD'`),
  check("developer_transfers_counters_non_negative", sql`${t.retryGeneration} >= 0 AND ${t.attemptCount} >= 0`),
  check("developer_transfers_stripe_id_consistent",
    sql`(${t.status} = 'completed_test') = (${t.stripeTransferId} IS NOT NULL)`),
  check("developer_transfers_stripe_id_format", sql`${t.stripeTransferId} IS NULL OR ${t.stripeTransferId} LIKE 'tr\\_%'`),
  check("developer_transfers_completed_at_consistent",
    sql`(${t.status} = 'completed_test') = (${t.completedAt} IS NOT NULL)`),
  index("developer_transfers_developer_status_idx").on(t.developerId, t.status),
]);
```

- Sin `acct_` ni cargo en la fila: el destino se resuelve de `connected_accounts` al ejecutar (Stripe es la fuente de verdad, `system-design §3`); sin PII.
- Sin columna `livemode`: la garantía es `getStripe()` más el rechazo de objetos con `livemode !== false` (RF3 paso 4 y 6).
- Que `developer_id` sea el ganador lo garantiza la hoja de inserción (lo lee de la propuesta del intento, nunca de un parámetro) y su test.
- Migración: `npx drizzle-kit generate --name developer_transfers` produce `drizzle/0008_developer_transfers.sql` (número según el journal en ese momento), el snapshot y actualiza `_journal.json`. **Prohibido `npm run db:migrate`.** Si drizzle-kit escapa distinto el patrón `tr\\_%`, el developer ajusta el `sql` hasta que aplique en PGlite. `migrations.test.ts` no cambia.

## Contratos

### Tipos y errores (T0)

`src/modules/payments/types/developer-transfer.types.ts`:

```ts
export type DeveloperTransferStatus = "pending" | "completed_test" | "failed";
export const DEVELOPER_TRANSFER_STATUS_LABELS: Record<DeveloperTransferStatus, string> = {
  pending: "Pendiente", completed_test: "Completada en Test Mode", failed: "Fallida",
};
export const TRANSFER_TEST_NOTICE = "Transferencia de prueba, no es dinero real";

export type TransferReason =   // code stored in last_error_code
  | "ACCOUNT_NOT_ACTIVE" | "ACCOUNT_SYNC_FAILED" | "PAYMENT_NOT_SETTLED"
  | "STRIPE_UNAVAILABLE" | "STRIPE_NOT_CONFIGURED" | "INVALID_RESPONSE"   // -> pending
  | "STRIPE_REJECTED" | "LIVEMODE_REJECTED";                              // -> failed
export const TRANSFER_REASON_MESSAGES: Record<TransferReason, string>;     // es, user-facing, no technical detail

export type TransferExecutionResult =
  | { status: "completed_test" }
  | { status: "pending"; reason: TransferReason }
  | { status: "failed"; reason: TransferReason }
  | { status: "noop" };           // already completed_test, or row not found/not processable

export type RetryTransfersResult = { attempted: number; completed: number; pending: number; failed: number };

/** Client view: status only. No ids, no amounts beyond the payment's, no developer data. */
export type ProjectTransferSummary = { status: DeveloperTransferStatus; completedAt: Date | null; reason: TransferReason | null };

/** Developer view (own transfers only). */
export type DeveloperTransferItem = {
  id: string; projectTitle: string; amountCents: number; status: DeveloperTransferStatus;
  reason: TransferReason | null; createdAt: Date; completedAt: Date | null;
};
export type TransferActionResult = { ok: false; code: "UNKNOWN"; message: string };   // authorization failures go through handleAuthErrorForPage
export type RetryTransfersActionResult = ({ ok: true } & RetryTransfersResult) | TransferActionResult;
```

`ProjectPaymentOverview` (en `payment.types.ts`) gana `transfer: ProjectTransferSummary | null`. `Action` gana `"transfer.retry"` (`permissions.ts`: `["developer"]`; fila `[false, false, true, false]` en el test de la matriz).

### RF1. Hoja de inserción atómica (T1, `developer-transfer-records.ts`)

`insertPendingTransfer(executor, { attemptId }): Promise<boolean>`: lee `developer_id` de la propuesta del intento y copia `amount_cents`/`currency` del intento; `INSERT ... ON CONFLICT (payment_attempt_id) DO NOTHING`; `true` solo si insertó. No importa `db`. Más hojas de estado con la guarda en el `WHERE` (patrón de `payment-transitions.ts`): `markTransferAttempted` (`attempt_count + 1`, `last_attempt_at`), `markTransferPending(reason)`, `markTransferFailed(reason)`, `markTransferCompleted(stripeTransferId)`, `reopenFailedTransfer` (`failed -> pending`, `retry_generation + 1`, solo dueño).

### RF2. Integración con el pago (T2)

- `applySessionOutcome`: tras `completePendingAttempt` correcto, y **también** en el caso `completed_project_not_selected` (D-G), llama a `insertPendingTransfer(tx, { attemptId })` en la misma transacción. Un error de inserción revierte todo (500 en el webhook; Stripe reintenta).
- `handleStripeEvent`: después de que la transacción hizo commit, si el resultado fue `applied` con razón `completed` o `completed_project_not_selected`, llama `await runTransferForAttempt(attemptId)`. **No** se llama dentro de la transacción ni para `duplicate`, `ignored` o `unhandled`. El tipo `StripeEventOutcome` y la respuesta de la ruta no cambian.
- `reconcileProjectPayment`: ídem tras su transacción cuando el resultado es `completed`.
- `runTransferForAttempt` nunca lanza (RF3).

### RF3. Ejecución (`developer-transfer.service.ts`, T1, `import "server-only"`)

```ts
executeTransfer(transferId: string): Promise<TransferExecutionResult>          // internal, no actor
runTransferForAttempt(attemptId: string): Promise<void>                        // never throws; logs the error name only
retryDeveloperTransfers(actor: AuthUser, opts?: { includeFailed?: boolean }): Promise<RetryTransfersResult>
```

`executeTransfer`, en orden (ninguna llamada a Stripe dentro de una transacción):

1. `getStripe()`; `StripeConfigError` -> `pending` / `STRIPE_NOT_CONFIGURED` (log del mensaje de configuración, sin valor).
2. Leer fila + intento (payment attempt `completed_test`, importe, PaymentIntent id, desarrollador). Fila inexistente, ya `completed_test` o intento no `completed_test` -> `noop`. Si es `failed` y no se reabrió -> `noop`. `markTransferAttempted`.
3. **Releer la cuenta**: `syncConnectedAccountForUser(developerId)`. `ConnectedAccountError` -> `pending` / `ACCOUNT_SYNC_FAILED`. Estado distinto de `active`, o sin `stripe_account_id` -> `pending` / `ACCOUNT_NOT_ACTIVE`, **sin** llamar a `transfers.create`.
4. **Cargo**: `stripe.paymentIntents.retrieve(paymentIntentId)`. Rechazo definitivo -> `failed` / `STRIPE_REJECTED`; ambiguo -> `pending` / `STRIPE_UNAVAILABLE`. `livemode !== false` -> `failed` / `LIVEMODE_REJECTED`. `status !== "succeeded"` o sin `latest_charge` -> `pending` / `PAYMENT_NOT_SETTLED`.
5. **Transferir**: `stripe.transfers.create({ amount, currency: "usd", destination, source_transaction: chargeId, metadata: { nexora_transfer_id, nexora_payment_attempt_id } }, { idempotencyKey: \`nexora:transfer:${id}:${retryGeneration}\` })`. `amount` sale de la fila (nunca de entrada) y debe ser entero seguro positivo. **Sin** `transfer_group` explícito (D-A, a verificar (c)). Error: definitivo -> `failed` / `STRIPE_REJECTED`; ambiguo (incluidos conexión, timeout, `StripeIdempotencyError`, límite de tasa) -> `pending` / `STRIPE_UNAVAILABLE`. Log: `console.error("[payments] Stripe transfer failed:", { transferId, ...stripeErrorLogFields(e) })`.
6. **Validar respuesta**: `id` empieza por `tr_` y `livemode === false`; si no, `pending` / `INVALID_RESPONSE` (y `failed` / `LIVEMODE_REJECTED` si `livemode === true`). Nunca se guarda ni se loguea el objeto.
7. **Persistir**: `markTransferCompleted` con guarda `status = 'pending'` (`completed_test`, `stripe_transfer_id`, `completed_at`, `last_error_code = NULL`). Si el `UPDATE` o la BD fallan tras haber creado la transferencia, la fila sigue `pending` y el siguiente reintento (misma clave) devuelve el mismo `tr_...`: no se duplica.
8. Cada salida a `pending`/`failed` actualiza `status` y `last_error_code` en una escritura corta. Log de una línea `console.info("[payments] transfer", { transferId, status, reason })`.

Concurrencia: no hay lock de larga duración. Dos ejecuciones simultáneas de la misma fila usan la misma clave de Stripe (devuelve el mismo `tr_...` o `StripeIdempotencyError` = `pending`) y la guarda del `UPDATE` final evita doble transición. `UNIQUE stripe_transfer_id` es la red de seguridad.

`retryDeveloperTransfers(actor, opts)`: `can(actor.role, "transfer.retry")` o `AuthError("FORBIDDEN")`. Selecciona **solo** filas con `developer_id = actor.id` en `pending` (y en `failed` si `includeFailed`; estas pasan por `reopenFailedTransfer` primero), máximo 10, en orden de creación, secuencial; devuelve contadores. Nunca recibe ids desde el cliente.

### RF4. Lectura (T3)

- `getDeveloperTransfers(actor): Promise<DeveloperTransferItem[]>` (`developer-transfer-overview.service.ts`): `can(actor.role, "payout.manage")`; solo filas propias; proyección explícita (título del proyecto, importe, estado, motivo, fechas); sin Stripe, sin escritura, sin ids de Stripe ni cliente.
- `getProjectPaymentOverview` añade `transfer` (`status`, `completedAt`, `reason`) del intento más reciente `completed_test`; `null` si no existe fila. Sigue siendo de solo lectura y sin Stripe.

### RF5. Server actions y hooks automáticos (T3)

- `retryTransfersAction(): Promise<RetryTransfersActionResult>` (`developer-transfer.actions.ts`, `"use server"`): `requireRole("developer")` (patrón de `connected-account.actions.ts`), `retryDeveloperTransfers(actor, { includeFailed: true })` en `try`, `revalidatePath("/dashboard/payouts")`. Errores no controlados -> mensaje genérico. No recibe entrada.
- Reintento automático (D-F), solo si el estado resultante es `active`: `refreshConnectedAccountAction` y el `GET` de return del onboarding llaman, tras `syncConnectedAccount`, a `retryDeveloperTransfers(actor)` (solo `pending`) dentro de un `try/catch` que nunca cambia el resultado ni el redirect. Cambios mínimos en esas dos funciones.

### RF6. UI (T4)

- **Cliente (`/projects/[id]/payment`)**: `payment-progress.tsx` recibe `transferStep` y `transferNote` (el paso 4 deja de ser fijo): sin transferencia o pago no completado -> "Pendiente"; `pending` -> "En curso" con nota "Transferencia de prueba pendiente"; `completed_test` -> "Completado" con nota "Transferencia de prueba completada"; `failed` -> nota "Transferencia de prueba fallida; el desarrollador puede reintentarla". `payment-page-view.tsx`: en `completed_test`, el texto sustituye "la transferencia al desarrollador sigue pendiente de implementación" por el estado real y muestra la etiqueta `TRANSFER_TEST_NOTICE` ("Transferencia de prueba, no es dinero real"). Nunca se muestra como dinero recibido ni se exponen ids de Stripe ni datos del desarrollador. El cliente no tiene botón de reintento.
- **Desarrollador (`/dashboard/payouts`)**: nueva sección "Transferencias de prueba" (componente `developer-transfers-list.tsx` y `retry-transfers-button.tsx`) bajo el estado de la cuenta; lista cada transferencia: proyecto, importe `formatUsd`, `Badge` con la etiqueta de estado, motivo amigable si `pending`/`failed` (`TRANSFER_REASON_MESSAGES`), fecha y la etiqueta `TRANSFER_TEST_NOTICE` visible. Botón "Reintentar transferencia" solo si hay alguna `pending` o `failed`; `useTransition`, `aria-live`, `router.refresh()`, objetivo táctil >= 40 px (patrón de `refresh-connected-account-button.tsx`). Sin transferencias: "Aún no tienes transferencias de prueba.". Nada de `acct_`, `tr_` ni URLs.
- `payouts/page.tsx` sigue fino: carga `getConnectedAccountOverview` y `getDeveloperTransfers`.

## Permisos y seguridad

- Capas: guard de action/ruta, `can()` en cada servicio, y consulta por `developer_id = actor.id` como único punto de propiedad. Ningún id de transferencia, cuenta o usuario llega desde el cliente. Cliente: solo el estado de su propio pago (la lectura ya pasa por `requireOwnership`). Admin: sin vista nueva.
- `executeTransfer` y `runTransferForAttempt` son **internos** (sin actor); solo los llaman el webhook verificado, la reconciliación del cliente dueño y `retryDeveloperTransfers`. No hay endpoint ni action que los exponga con un id.
- Test Mode: `getStripe()` rechaza claves live; además se rechazan `paymentIntent.livemode`, `transfer.livemode` y cuenta v2 `livemode === true`.
- Importe: siempre el de la BD (copiado del intento, que viene de la propuesta; I2), nunca de entrada ni del evento.
- Logs: solo `transferId`, `status`, `reason`, `attemptId` y `stripeErrorLogFields(e)`. **Nunca** `acct_`, `tr_`, `pi_`, `ch_`, URLs, correos, importes ni el objeto de Stripe. El `message` de Stripe solo aparece, saneado, para `StripeInvalidRequestError` (comportamiento de `stripeErrorLogFields`).
- Sin rate limiting (015). Mitigación: solo el desarrollador dueño, máximo 10 filas por pulsación, claves de idempotencia deterministas.

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Webhook repetido (`duplicate`) | No inserta ni transfiere; la fila ya existe |
| Dos webhooks/reconciliación simultáneos del mismo pago | Una fila (UNIQUE); una sola transferencia en Stripe (misma clave) |
| Cuenta del desarrollador no `active` (o sin cuenta) al pagar | Fila `pending` / `ACCOUNT_NOT_ACTIVE`; se envía sola al volver del onboarding o al "Actualizar estado" con cuenta `active` |
| Error de red tras crear la transferencia en Stripe | Fila `pending`; el reintento (misma clave) devuelve el mismo `tr_...` |
| Rechazo definitivo (p. ej. cuenta inválida) | `failed` / `STRIPE_REJECTED`; "Reintentar transferencia" sube la generación y llama de nuevo |
| Webhook cae tras el commit del pago | Pago `completed_test` con fila `pending`; reintentable por el desarrollador |
| Fallo en BD al crear la fila | Todo el evento revierte (500); Stripe reintenta (010) |
| Pago confirmado con proyecto no `proposal_selected` (010 RF6) | Se crea y ejecuta la transferencia (D-G) |
| Ventana de idempotencia vencida con un resultado ambiguo anterior | Riesgo de transferencia duplicada en Test Mode (R3) |
| Cuenta del desarrollador reseteada y recreada entre reintentos | Misma clave con otro `destination`: `StripeIdempotencyError` -> `pending`; se resuelve con el reintento manual (R4) |
| Desarrollador borra la cuenta en Stripe | `ACCOUNT_SYNC_FAILED`; fila `pending`; reseteo manual documentado (011a) |

## Archivos

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/payments/schema/developer-transfers.table.ts` | N | T0 |
| `drizzle/0008_developer_transfers.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json` | N/N/M (generados) | T0 |
| `src/lib/db/developer-transfers-constraints.test.ts` | N | T0 |
| `src/modules/payments/types/developer-transfer.types.ts` | N | T0 |
| `src/modules/payments/types/payment.types.ts` (solo `ProjectPaymentOverview.transfer`) | M | T0 |
| `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts` | M | T0 |
| `src/modules/payments/services/developer-transfer-records.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/services/developer-transfer.service.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/services/connected-account.service.ts` + `.test.ts` (extraer `syncConnectedAccountForUser`) | M | T1 |
| `src/modules/payments/services/payment-session-effects.ts` | M | T2 |
| `src/modules/payments/services/payment-event.service.ts`, `payment-event.service.test.ts` | M | T2 |
| `src/modules/payments/services/payment-reconciliation.service.ts`, `payment-reconciliation.service.test.ts` | M | T2 |
| `src/modules/payments/services/developer-transfer-overview.service.ts` + `.test.ts` | N | T3 |
| `src/modules/payments/services/payment-overview.service.ts`, `payment-overview.service.test.ts` | M | T3 |
| `src/modules/payments/actions/developer-transfer.actions.ts` + `.test.ts` | N | T3 |
| `src/modules/payments/actions/connected-account.actions.ts`, `connected-account.actions.test.ts` | M | T3 |
| `src/app/dashboard/payouts/onboarding/return/route.ts`, `route.test.ts` | M | T3 |
| `src/modules/payments/components/payment-progress.tsx`, `payment-page-view.tsx` | M | T4 |
| `src/modules/payments/components/developer-transfers-list.tsx`, `retry-transfers-button.tsx` | N | T4 |
| `src/modules/payments/components/payouts-page-view.tsx`, `src/app/dashboard/payouts/page.tsx` | M | T4 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md` | M | T4 |

Cada archivo pertenece a una sola tarea. `docs/SETUP.md §4` no cambia (`state-machines.md §4` ya figura). Hay cambios de 019 y 011c sin commitear en el árbol (`system-design.md`, `state-machines.md`, `MANUAL-TESTS.md`, `connected-account.*`, `stripe.ts`): **solo se añade o reemplaza lo obsoleto; no se reformatea el resto**.

## Criterios de aceptación

Base (T0):

- AC1. La migración la generó drizzle-kit y crea el enum `developer_transfer_status('pending','completed_test','failed')` y la tabla `developer_transfers` con los `CHECK` y `UNIQUE` del modelo; el journal tiene una entrada más; no se ejecutó `db:migrate`; `migrations.test.ts` pasa sin cambios.
- AC2. En PGlite: una segunda transferencia con el mismo `payment_attempt_id` falla; dos filas con el mismo `stripe_transfer_id` fallan; `completed_test` sin `stripe_transfer_id` o sin `completed_at` falla; `pending` con `stripe_transfer_id` falla; id sin prefijo `tr_` falla; importe <= 0, moneda distinta de USD y contadores negativos fallan; borrar el intento o el usuario referenciado falla (`restrict`).
- AC3. `can(role, "transfer.retry")` es `true` solo para `developer`; la matriz de `permissions.test.ts` incluye la fila.

Ejecución (T1):

- AC4. `insertPendingTransfer` crea la fila con el `developer_id` de la propuesta del intento y el importe/moneda del intento; una segunda llamada no inserta (devuelve `false`) y deja una sola fila.
- AC5. Camino feliz: con cuenta `active`, PaymentIntent `succeeded` con `latest_charge` y Stripe aceptando, `executeTransfer` llama **una vez** a `transfers.create` con `amount` = importe del intento, `currency: "usd"`, `destination`, `source_transaction`, `metadata` con ids internos y `idempotencyKey` `nexora:transfer:<id>:0`, y deja `completed_test` con `stripe_transfer_id` y `completed_at`. Una segunda llamada es `noop` sin llamar a Stripe.
- AC6. La cuenta se relee antes de transferir: con la caché `active` pero Stripe respondiendo `pending`/`restricted`, no se llama a `transfers.create` y la fila queda `pending` / `ACCOUNT_NOT_ACTIVE`; sin fila o sin `acct_` igual; `ConnectedAccountError` al releer -> `pending` / `ACCOUNT_SYNC_FAILED`.
- AC7. Clasificación como en 009: rechazo definitivo (`StripeInvalidRequestError`, `StripeAuthenticationError`, `StripePermissionError`) en `paymentIntents.retrieve` o `transfers.create` -> `failed` / `STRIPE_REJECTED`; error ambiguo (conexión, API, límite de tasa, idempotencia) -> `pending` / `STRIPE_UNAVAILABLE`, sin `stripe_transfer_id`. `livemode` verdadero en el PaymentIntent o la transferencia -> `failed` / `LIVEMODE_REJECTED` y nunca `completed_test`. `id` sin `tr_` -> `pending` / `INVALID_RESPONSE`. PaymentIntent no `succeeded` o sin cargo -> `pending` / `PAYMENT_NOT_SETTLED`. Clave live o ausente -> `pending` / `STRIPE_NOT_CONFIGURED`.
- AC8. Idempotencia: dos `executeTransfer` simultáneos (`Promise.allSettled`) o un reintento tras fallo ambiguo usan la **misma** clave y dejan una sola transferencia en el fake de Stripe y una fila `completed_test`. Si la BD falla al persistir tras crear la transferencia, la fila sigue `pending` y el reintento (misma clave) completa sin crear otra. Tras `failed`, `retryDeveloperTransfers(..., { includeFailed: true })` incrementa `retry_generation` y usa la clave `...:1`.
- AC9. `retryDeveloperTransfers`: `FORBIDDEN` para cliente o admin; procesa solo filas propias (un desarrollador no toca las de otro); sin `includeFailed` ignora las `failed`; máximo 10 por llamada; devuelve contadores correctos. `runTransferForAttempt` nunca lanza (ni con error de BD ni de Stripe).
- AC10. Ninguna llamada a Stripe ocurre dentro de una transacción (el fake falla si se invoca con una transacción abierta o el test comprueba el orden). `syncConnectedAccountForUser` conserva el comportamiento y los mensajes de `syncConnectedAccount` (los tests existentes de 011a/011c siguen pasando).

Integración (T2):

- AC11. Al completarse un pago por webhook o por reconciliación, existe exactamente una fila `developer_transfers` `pending` creada en la misma transacción: si la transacción revierte (p. ej. fallo forzado), no queda fila ni cambia el pago. El caso `completed_project_not_selected` también la crea.
- AC12. Después del commit se llama a `runTransferForAttempt`; no se llama en `duplicate`, `ignored`, `unhandled`, `discarded`, `failed` ni `canceled`. Si la transferencia falla o lanza, `handleStripeEvent` y la reconciliación siguen devolviendo su resultado normal (la ruta responde 200).
- AC13. Los tests de 010 siguen pasando (idempotencia por `event.id`, orden de locks, importes, livemode) sin cambiar sus aserciones.

Lectura y acciones (T3):

- AC14. `getDeveloperTransfers` devuelve solo las filas del actor, con las claves exactas de `DeveloperTransferItem`; `FORBIDDEN` para otros roles. `getProjectPaymentOverview` devuelve `transfer` con las claves exactas `status`, `completedAt`, `reason` (o `null`); sin ids de Stripe, ni `developerId`, ni importes adicionales.
- AC15. `retryTransfersAction`: sin sesión redirige a `/sign-in`; cliente/admin -> 404 (patrón de 011a); éxito devuelve contadores y revalida `/dashboard/payouts`; error genérico sin detalles.
- AC16. `refreshConnectedAccountAction` y el `GET` de return reintentan solo las `pending` cuando el estado queda `active`; un fallo del reintento no cambia el resultado/redirect de la sincronización. Con estado distinto de `active` no se llama al reintento.

UI y docs (T4):

- AC17. La página de pago muestra el paso 4 según el estado real (pendiente / en curso / completado / fallido) y la etiqueta "Transferencia de prueba, no es dinero real"; ya no dice "pendiente de implementación". El HTML no contiene ids de Stripe.
- AC18. `/dashboard/payouts` lista las transferencias propias con estado, importe y la etiqueta de prueba; muestra "Reintentar transferencia" solo con `pending`/`failed`; la sección vacía tiene texto; sin `acct_`, `tr_` ni URLs.
- AC19. Documentación: `state-machines.md §4` con la nueva máquina `pending`/`completed_test`/`failed` y sus transiciones (sustituye la derivada `not_applicable`/`pending_implementation`/`simulated`; `§3` solo recibe una nota de enlace y `§5` los casos límite de la tabla anterior); `system-design.md` con la entidad `developerTransfer` (reemplaza `simulatedTransfer`), la nota de D6 como cumplida, `§5.4`, `§7` y las decisiones 011b-D-A a D-I en `§8`; `MANUAL-TESTS.md` con la sección 8f (precondición: migración `0008` aplicada por el humano; pruebas (a) a (g); pasos de cuenta no activa -> activa, reintento, `failed`, idempotencia, permisos y privacidad de logs). Solo adiciones o reemplazo de lo obsoleto.
- AC20. Regresión global: `npm run lint`, `npm run test` y `npm run build` pasan; sin cambios en `package.json`, `.env.example`, `payment-checkout.service.ts`, la ruta del webhook, `proxy.ts`, `layout.tsx`, `globals.css` ni `src/components/ui`. Ningún test usa Stripe, red, Clerk ni Neon reales; los secretos de los tests son ficticios (`sk_test_fake...`, `whsec_fake...`).

## Tests requeridos

Vitest, junto al archivo, `// @vitest-environment node` en los de servicio. PGlite con `createTestDb` (migraciones reales). Stripe se simula en la frontera (`vi.mock("@/lib/stripe")` con `getStripe` devolviendo un fake en memoria) con `paymentIntents.retrieve`, `transfers.create` (guarda un mapa clave -> transferencia para reproducir la idempotencia, y puede lanzar errores con `type` ficticio) y `v2.core.accounts.retrieve`. Ningún test contra Stripe real.

- `developer-transfers-constraints.test.ts` (T0): AC2.
- `permissions.test.ts` (T0): AC3.
- `developer-transfer-records.test.ts` (T1): AC4 y las guardas de las hojas.
- `developer-transfer.service.test.ts` (T1): AC5 a AC10 (table-driven para la clasificación de errores y motivos; concurrencia con `Promise.allSettled`; permisos y propiedad en `retryDeveloperTransfers`).
- `connected-account.service.test.ts` (T1): regresión de `syncConnectedAccount` y cobertura de `syncConnectedAccountForUser`.
- `payment-event.service.test.ts` y `payment-reconciliation.service.test.ts` (T2): AC11 a AC13 (mock de `runTransferForAttempt`; el insert se verifica con la BD real).
- `developer-transfer-overview.service.test.ts` y `payment-overview.service.test.ts` (T3): AC14.
- `developer-transfer.actions.test.ts`, `connected-account.actions.test.ts`, `return/route.test.ts` (T3): AC15 y AC16.
- Componentes presentacionales (T4): sin test obligatorio (SETUP §3); el reviewer comprueba AC17 y AC18 revisando el JSX y la prueba manual.

## Tareas

Máximo 5. Archivos disjuntos. Durante bloques paralelos nadie ejecuta `npm install`, `npm run build` ni `drizzle-kit`; el reviewer ejecuta lint, test y build al final. **Nadie ejecuta `npm run db:migrate`** (lo hace el humano).

### T0 — Base: esquema, migración, tipos y permiso

- Archivos: `developer-transfers.table.ts`, `drizzle/0008_*`, `developer-transfers-constraints.test.ts`, `developer-transfer.types.ts`, `payment.types.ts` (solo `transfer`), `auth.types.ts`, `permissions.ts`, `permissions.test.ts`
- Depende de: —
- Paralelizable: no (contratos compartidos y migración; va primero)
- Cubre: AC1, AC2, AC3

### T1 — Servicio de transferencias y relectura de cuenta

- Archivos: `developer-transfer-records.ts` + test, `developer-transfer.service.ts` + test, `connected-account.service.ts` + test
- Depende de: T0
- Paralelizable: no con T2 y T3 (ambos consumen sus funciones)
- Cubre: AC4 a AC10

### T2 — Integración con el pago (webhook y reconciliación)

- Archivos: `payment-session-effects.ts`, `payment-event.service.ts` + test, `payment-reconciliation.service.ts` + test
- Depende de: T0, T1
- Paralelizable: sí, con T3 (archivos disjuntos)
- Cubre: AC11, AC12, AC13

### T3 — Lecturas, actions y reintento automático

- Archivos: `developer-transfer-overview.service.ts` + test, `payment-overview.service.ts` + test, `developer-transfer.actions.ts` + test, `connected-account.actions.ts` + test, `return/route.ts` + test
- Depende de: T0, T1
- Paralelizable: sí, con T2
- Cubre: AC14, AC15, AC16

### T4 — UI y documentación

- Archivos: `payment-progress.tsx`, `payment-page-view.tsx`, `developer-transfers-list.tsx`, `retry-transfers-button.tsx`, `payouts-page-view.tsx`, `src/app/dashboard/payouts/page.tsx`, `docs/MANUAL-TESTS.md`, `system-design.md`, `state-machines.md`
- Depende de: T0, T3 (consume actions y lecturas)
- Paralelizable: no (va tras T3; puede solaparse con T2)
- Cubre: AC17, AC18, AC19, AC20 (con el reviewer)

Orden: T0 -> T1 -> (T2 || T3) -> T4 -> reviewer.

## Riesgos

- R1. **`source_transaction` + destino v2 sin verificar** (a, b, c): un rechazo definitivo dejaría las transferencias en `failed` / `STRIPE_REJECTED`. Mitigación: el log con el `message` saneado de `StripeInvalidRequestError`; la alternativa de D-A (`transfer_group` en Checkout) se especificaría aparte.
- R2. **Stripe repite el error 4xx con la misma clave** (d): cubierto por la generación en la clave. Si no lo hiciera, la generación es inofensiva.
- R3. **Ventana de idempotencia** (e): un resultado ambiguo reintentado pasada la ventana podría crear una segunda transferencia. Aceptado en Test Mode (sin dinero real); el humano puede revisar duplicados en el Dashboard.
- R4. **Destino cambiado con la misma clave** (cuenta reseteada): `StripeIdempotencyError` -> `pending`; el reintento manual desde `failed` no aplica. Queda anotado; se resuelve a mano (reseteo de la fila o SQL) y no justifica más infraestructura.
- R5. **Latencia del webhook** (f): tres llamadas a Stripe en línea; si Stripe agota el tiempo, reintenta el evento (entra `duplicate`, sin efectos) y la transferencia ya está registrada. Alternativa: `after()` (P4).
- R6. **Sin barrido global**: una fila `pending` cuyo desarrollador no vuelve a la app no se reintenta sola. Aceptado (015/017).
- R7. **Dependencia circular**: `developer-transfer.service` importa `connected-account.service`; este no importa de aquel (los hooks automáticos viven en las actions y la ruta, T3).
- R8. **Archivos con cambios sin commitear de 019/011c** en el árbol: T1, T3 y T4 los editan; solo se añade o reemplaza lo necesario.

## Preguntas abiertas (con recomendación por defecto)

- P1. ¿`source_transaction` sin tocar el Checkout (D-A) o `transfer_group` en Checkout? Recomendación: `source_transaction`; evita el choque con la clave `nexora:checkout:<attemptId>` y no toca 009. Depende de las verificaciones (a) y (c).
- P2. ¿Quién puede reintentar? Recomendación: solo el desarrollador dueño (`transfer.retry`), sin botón para cliente ni admin. Alternativa: dar al admin un reintento de soporte (spec 012/013).
- P3. ¿Se crea la transferencia también en la anomalía "pago completado con proyecto no `proposal_selected`" (D-G)? Recomendación: sí.
- P4. ¿Ejecución en línea (D-H) o `after()` de Next 16? Recomendación: en línea, por simplicidad y testabilidad; revisar si (f) muestra latencia problemática.
- P5. ¿Reintento automático solo con los hooks de D-F (sin cron)? Recomendación: sí; el barrido global queda para 015/017.
- P6. ¿Se numera la migración `0008`? Depende de que la migración `0007` (019, sin commitear) siga siendo la última del journal al generar. Recomendación: confirmar con `ls drizzle` en T0.
- P7. ¿Se guarda el cargo (`ch_...`) en la fila para evitar el `paymentIntents.retrieve` en cada reintento? Recomendación: no (YAGNI; una llamada extra solo al transferir).
- P8. ¿El texto exacto "Transferencia de prueba, no es dinero real" y los textos de motivo (`TRANSFER_REASON_MESSAGES`) son los definitivos? Recomendación: sí; el diseño de referencia no es accesible desde este agente.

## Próximas fases

- Barrido/cron de transferencias `pending`, `after()` y webhooks de Connect (`transfer.*`, `account.updated`): 015/017.
- Vista del desarrollador ganador en el detalle del proyecto y vista de admin (012/013).
- Unificar los helpers de errores de 009/010 con `src/lib/stripe.ts`.
- Reversión de transferencias, reembolsos y comisión: fuera del MVP.

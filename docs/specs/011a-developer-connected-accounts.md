# Cuentas conectadas de Stripe Connect (modo de prueba) y onboarding del desarrollador (Fase 3 de Nexora, parte 3a)

Estado: done

Primera de dos partes de la spec 011 de `docs/SDD-PLAN.md §6` (`developer-payment-routing-test-model`). **011a** cubre solo la cuenta conectada del desarrollador y su onboarding en Stripe (modo de prueba). **011b** (no se escribe aquí) cubrirá el registro, la ejecución y la UI de la transferencia. Cumple `docs/SDD-PLAN.md §2` regla 12 (línea 28): no se avanza a transferencias sin revisar antes el modelo de Stripe Connect. Esta spec es esa revisión y no mueve dinero.

Sigue la plantilla del agente spec. Las secciones extra (decisiones, verificación del SDK, modelo de datos, contratos, seguridad, riesgos) cubren los 14 puntos de `docs/SDD-PLAN.md §10`. Formato y patrones de referencia: specs 009 y 010 (ambas `done`).

## Objetivo

Que un usuario con rol `developer` cree **una sola** cuenta conectada de Stripe en modo de prueba, complete el onboarding alojado por Stripe y vea en Nexora el estado de esa cuenta: "Sin configurar", "En revisión por Stripe", "Requiere acción" o "Lista para recibir transferencias de prueba". El estado se sincroniza releyendo la cuenta servidor a servidor al volver del onboarding y con un botón "Actualizar estado". Así 011b tendrá un destino válido para la transferencia automática que se dispara al confirmarse el pago.

No se mueve dinero, no se crean transferencias, no se cobra comisión y nada se presenta como dinero real (`BRIEF §6.4`, `§6.5`, `§7` reglas 13 a 15, `§10`: sin custodia ni escrow).

Secciones de arquitectura que aplican (leer solo estas):

- `system-design.md §2` (entidades e invariantes I3 e I5): se añade la entidad `connectedAccount`.
- `system-design.md §3` (propiedad de datos): la fila "Cuenta conectada del desarrollador" pasa de "fuera de alcance" a un id y un estado derivado guardados en Neon.
- `system-design.md §4` (módulos): `payments` escribe además `connected_accounts`.
- `system-design.md §6` (permisos): acción nueva `payout.manage`.
- `system-design.md §7` (pagos y webhooks): Connect solo en modo de prueba; `account.updated` queda diferido.
- `system-design.md §8` (decisiones): se registran D1 a D8 de esta spec.
- `state-machines.md §3` (intento de pago): no cambia. `state-machines.md §4` (transferencia): no cambia en 011a, solo una nota. `state-machines.md §5` (casos límite) y una sección nueva §6 (cuenta conectada).

## Verificación del SDK de Stripe instalado (lectura de `node_modules/stripe`, 2026-10-18)

| Comprobación | Resultado | Fuente |
|---|---|---|
| Versión del paquete | `stripe@23.0.0`, ya instalado (`package.json`: `^23.0.0`). **Sin dependencias nuevas** | `node_modules/stripe/package.json` |
| apiVersion fijada por el SDK | `2026-09-30.endive` (major `endive`). `src/lib/stripe.ts` no pasa `apiVersion` y se mantiene así | `node_modules/stripe/esm/apiVersion.d.ts` |
| Accounts v1 en el cliente | `stripe.accounts: AccountResource` con `create(params?, options?)` y `retrieve(id, params?, options?)`. `options` es `RequestOptions` y admite `idempotencyKey` (mismo patrón que 009) | `esm/stripe.core.d.ts:168`, `esm/resources/Accounts.d.ts:24,57` |
| `type: 'express'` en v1 | **Obsoleto en estos tipos**: "The `type` parameter is deprecated. Use `controller` instead…". Se descarta | `esm/resources/Accounts.d.ts:1418-1422` |
| `controller` en v1 | `AccountCreateParams.Controller`: `fees.payer` (`'account' \| 'application'`), `losses.payments` (`'application' \| 'stripe'`), `requirement_collection` (`'application' \| 'stripe'`) y `stripe_dashboard.type` (`'express' \| 'full' \| 'none'`) | `Accounts.d.ts:1862-1879, 2626-2655` |
| Capacidad `transfers` | `AccountCreateParams.capabilities.transfers` (`{ requested?: boolean }`). En el objeto `Account`, `capabilities.transfers` vale `'active' \| 'inactive' \| 'pending'` | `Accounts.d.ts:1732, 866` |
| Campos de estado del `Account` v1 | `charges_enabled`, `details_submitted`, `payouts_enabled` (boolean); `requirements.currently_due`, `past_due`, `eventually_due`, `pending_verification` (`string[] \| null`); `requirements.disabled_reason` (enum: `requirements.past_due`, `requirements.pending_verification`, `under_review`, `rejected.*`, `action_required.requested_capabilities`, `listed`, `platform_paused`, `other`) | `Accounts.d.ts:159-211, 716-742, 1089` |
| `livemode` en el `Account` v1 | **No existe**. La garantía de modo de prueba es la clave `sk_test_`/`rk_test_` que exige `getStripe()` | `grep livemode Accounts.d.ts`: sin resultados |
| Account Links v1 | `stripe.accountLinks.create({ account, type: 'account_onboarding' \| 'account_update', refresh_url?, return_url?, collection_options?: { fields?: 'currently_due' \| 'eventually_due', future_requirements? } })`. Devuelve `{ object: 'account_link', created, expires_at, url }`. `collect` está obsoleto | `esm/resources/AccountLinks.d.ts`, `stripe.core.d.ts:166` |
| Accounts v2 | Existe: `stripe.v2.core.accounts.create/retrieve` y `stripe.v2.core.accountLinks.create`. Parámetros: `configuration.{customer, merchant, recipient}`, `dashboard` (`'express' \| 'full' \| 'none'`), `defaults.responsibilities`, `identity.country`, `include[]`. El `Account` v2 tiene `livemode`. La capacidad `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status` vale `'active' \| 'pending' \| 'rejected' \| 'restricted' \| 'unsupported'`. El Account Link v2 usa `use_case.{type, account_onboarding.{refresh_url, return_url}}` | `esm/resources/V2/Core/Accounts.d.ts:22,27,51,95,2160-2175,3600-3698`; `V2/Core/AccountLinks.d.ts`; `V2/Core/index.d.ts:18-19` |
| Evento `account.updated` | Existe en `Event.Type` | `esm/resources/Events.d.ts:78` |
| `payment_intent_data.transfer_group` en Checkout | Existe (`SessionCreateParams.PaymentIntentData.transfer_group?: string`), lo usará 011b (D6) | `esm/resources/Checkout/Sessions.d.ts:2689` |
| Clases de error | `StripeInvalidRequestError`, `StripeAuthenticationError`, `StripePermissionError`, `StripeRateLimitError`, `StripeConnectionError`, `StripeAPIError`, `StripeIdempotencyError` (mismos `type` que clasifica 009) | `esm/Error.d.ts:104-159` |

**API elegida (D4): Accounts v1 + `controller` + Account Links v1 (`account_onboarding`).** Accounts v2 con `configuration.recipient` queda como alternativa (D4, P2).

**A verificar manualmente** (no se puede comprobar en los `.d.ts`; T4 lo pasa a `docs/MANUAL-TESTS.md`):

- (a) Que la combinación `stripe_dashboard.type = 'express'` + `fees.payer = 'application'` + `losses.payments = 'application'` + `requirement_collection = 'stripe'` + solo `capabilities.transfers.requested` se acepta para `country: 'US'` en modo de prueba.
- (b) Que la cuenta de plataforma del humano tiene Connect activado en modo de prueba y que su país admite una plataforma con cuentas `US` (P1).
- (c) Que los datos de prueba del onboarding alojado (código de verificación `000000`, SSN `000-00-0000`, routing `110000000`, cuenta `000123456789`) dejan `capabilities.transfers = 'active'`.
- (d) La ventana real de la clave de idempotencia en `accounts.create`. Se asume ≥ 24 h, igual que en 009.
- (e) Que la cookie de sesión de Clerk llega a las URLs de return y refresh tras la redirección top-level desde `connect.stripe.com` (SameSite=Lax).
- (f) Que la URL del Account Link es `https://*.stripe.com`.
- (g) El código y tipo de error de Stripe cuando la cuenta guardada no existe en la cuenta de plataforma actual (esperado: `StripeInvalidRequestError` o `StripePermissionError` con `code` `account_invalid` o `resource_missing`).

## Decisiones aprobadas por el humano (registradas; no se reabren)

- **D1. Modelo: Separate charges and transfers.** El Checkout de 009 sigue cobrando en la cuenta de plataforma (sin `transfer_data`, sin `on_behalf_of`, sin `application_fee_amount`). 011b transferirá a la cuenta conectada.
- **D2. Disparo automático** de la transferencia al confirmarse el pago (`pending -> completed_test` de 010). Lo implementa 011b; 011a solo deja la cuenta lista.
- **D3. Importe completo de la propuesta, sin comisión** (011b). 011a no toca importes.
- **D4. Cuenta conectada con onboarding alojado por Stripe.** API verificada arriba. **Recomendación: Accounts v1 con `controller` (equivalente a Express, sin el `type` obsoleto) + `accountLinks.create({ type: 'account_onboarding' })`.** Motivos:
  1. Es la ruta documentada y estable para Separate charges and transfers con `transfers.create({ destination })` de v1, que usará 011b.
  2. El estado se deriva de campos simples (`capabilities.transfers`, `details_submitted`, `requirements`).
  3. Los tests con un Stripe falso son triviales.
  4. Evita mezclar v2 (cuerpos y eventos "thin" distintos) con el resto del código, que es v1.

  Alternativa: Accounts v2 (`configuration.recipient` + `stripe_balance.stripe_transfers` + `dashboard: 'express'`). Gana `livemode` en la cuenta, pero hay que verificar la interoperabilidad con transferencias v1. Ver P2. Solo modo de prueba: `getStripe()` ya rechaza claves live (`src/lib/stripe.ts`) y 011a no añade otra vía de cliente.
- **D5. Moneda USD.** País de la cuenta de prueba **"a verificar"** (P1). Recomendación por defecto: `US`, como constante `CONNECTED_ACCOUNT_COUNTRY = "US"` en el servicio, no como variable de entorno (YAGNI). Si la plataforma no puede usar cuentas `US`, se ajusta la constante antes de aprobar.
- **D6. `payment_intent_data.transfer_group` (id del proyecto) en el Checkout de 009: va en 011b, no en 011a.** Justificación:
  1. Solo lo consume la transferencia (011b). En 011a no tendría lector, lo que viola YAGNI.
  2. Con esto 011a no toca el flujo de pago (`payment-checkout.service.ts` ni sus tests de regresión) y se puede revisar y desplegar sin riesgo para 009 y 010.
  3. Cambiar los parámetros del Checkout cambia el cuerpo de las peticiones con clave de idempotencia `nexora:checkout:<attemptId>`. Un intento `pending` creado antes del cambio y reanudado después recibiría `StripeIdempotencyError` (parámetros distintos con la misma clave). 011b debe tratar esa transición junto con el resto de su diseño (p. ej. aceptar que esos intentos se reanuden sin `transfer_group`, o usar `source_transaction` en la transferencia). Es mejor que lo decida quien diseña la transferencia.
- **D7. Sincronización por relectura servidor a servidor.** `stripe.accounts.retrieve` se llama en la URL de return, en la de refresh (que regenera el enlace) y en el botón "Actualizar estado" (acción POST). El webhook `account.updated` queda **diferido**: exigiría `stripe listen --forward-connect-to` y un endpoint Connect aparte. El endpoint de 010 no recibe eventos de cuentas conectadas y, si recibiera `account.updated`, ya lo responde como `unhandled` (200, sin fila).
- **D8. Partición 011a / 011b.** Ver "Alcance" y "Próximas fases".

## Alcance

- Incluye:
  - Tabla `connected_accounts` (1:0..1 con `users` de rol `developer`) y su migración Drizzle generada (**sin** `db:migrate`; la aplica el humano).
  - Helpers transversales en `src/lib/stripe.ts`: clasificación de errores de Stripe, campos de log seguros y validación de URL alojada por Stripe. Solo se añaden; el resto del archivo no cambia.
  - Acción de permisos `payout.manage` (solo `developer`).
  - Función pura de derivación del estado y servicios: crear la cuenta de forma idempotente, generar el enlace de onboarding, sincronizar el estado y leer el resumen para la página.
  - Server actions "Configurar / continuar" y "Actualizar estado". Route handlers `GET` de return y refresh del onboarding.
  - Página `/dashboard/payouts` ("Cobros de prueba · no es dinero real") y un enlace en el header para el desarrollador.
  - Pruebas automáticas (PGlite + Stripe simulado en la frontera `@/lib/stripe`) y pasos manuales.
  - Documentación: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md` y la tabla de `docs/SETUP.md §4`.
- No incluye:
  - Transferencias, `transfers.create`, registro de transferencia, `transferStatus` almacenado, cambios en el paso 4 de la página de pago, `transfer_group` en el Checkout (todo 011b, D6).
  - Webhook `account.updated` / `capability.updated` y `stripe listen --forward-connect-to` (D7, diferido).
  - Embedded components, login link al Express Dashboard, `account_update` links, payouts a banco, cuentas en otras monedas o países, borrar o desconectar la cuenta desde la app, reseteo automático de una cuenta que ya no existe en Stripe (D-C).
  - Vista de admin o del cliente sobre cuentas conectadas (012/013).
  - Cambios en `src/app/layout.tsx`, `proxy.ts`, `globals.css`, `package.json`, `.env.example` (no hay variables nuevas: se reutilizan `STRIPE_SECRET_KEY` y `APP_URL`), `payment-checkout.service.ts`, servicios de 010, `payment-page-view.tsx`, `payment.types.ts`.
  - Rate limiting de las acciones y rutas nuevas (015).

## Reutilizar

Inventario verificado con Glob, Grep y Read:

| Existente | Uso en 011a |
|---|---|
| `src/lib/stripe.ts`: `getStripe()` (singleton `server-only`, **rechaza `sk_live_`/`rk_live_`** y formatos inesperados con `StripeConfigError` sin mostrar la clave), `getAppUrl()` (origen de `APP_URL`), `StripeConfigError` | Cliente único para `accounts.*` y `accountLinks.*`. Las URLs de return y refresh se arman con `getAppUrl()`. **Se añaden** helpers de error y URL (T0) sin tocar lo existente ni las adiciones de 010 sin commitear |
| `payment-checkout.service.ts`: `DEFINITIVE_REJECTION_TYPES`, `logStripeError`, `isStripeCheckoutUrl` (privados) | **Patrón** de la clasificación de errores de 009: rechazo definitivo = `StripeInvalidRequestError` \| `StripeAuthenticationError` \| `StripePermissionError`, clasificado por `type` sin `instanceof`; el resto es ambiguo o transitorio. Logs solo con `type`, `code`, `statusCode` y `requestId`. Se **generaliza** en `src/lib/stripe.ts` (DRY para 011a y 011b). **No se refactoriza** 009 para no tocar su regresión; queda una duplicación aceptada, igual que en 010 D-L |
| `auth`: `requireRole`, `requireOwnership`, `can`, `AuthError`, `handleAuthErrorForPage` (sirve en páginas, actions y route handlers: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md` y `redirect.md`) | Guards. La cuenta se busca siempre por `actor.id`; nunca llega un id de cuenta desde el cliente |
| `auth/services/permissions.ts` + `permissions.test.ts` (matriz exhaustiva `Record<Action, …>`) | Se añade `payout.manage` (T0); el test exige la fila nueva |
| `auth/services/dashboard-link.ts` (`NavLinkItem`), `auth/components/site-header.tsx`, `components/shared/site-nav.tsx` (spec 009b), `lib/is-active-path.ts` | Enlace "Cobros de prueba" en el header del desarrollador. `SiteNav` ya acepta una lista de enlaces: **no cambia**. `/dashboard/payouts` y `/dashboard/proposals` no se solapan en `isActivePath` |
| `users/schema/users.table.ts` | FK `connected_accounts.user_id -> users.id` |
| `payments/schema/*.table.ts`, `drizzle.config.ts` (`schema: ./src/modules/*/schema/*.table.ts`, `out: ./drizzle`), `drizzle/0000..0003` | Patrón de tabla; la migración `0004` se genera con drizzle-kit |
| `lib/db/test-db.ts` (`createTestDb`), patrón de mock `Proxy` + `holder` y `vi.mock("server-only")` de `payment-event.service.test.ts` y `payment-reconciliation.service.test.ts` (Stripe falso en memoria) | Pruebas con PGlite y migraciones reales |
| `payments/actions/payment.actions.ts` y `payment-reconciliation.actions.ts` | Patrón de action (`requireRole` antes de todo, `toResult`, `redirect` fuera de `try`, `revalidatePath`) |
| `payments/components/start-checkout-button.tsx`, `refresh-payment-button.tsx` | Patrón de los dos botones nuevos (`useTransition`, `aria-live`, `router.refresh()`) |
| `payments/components/payments-loading.tsx`, `payments-error.tsx` (aceptan `label` y `title`) | `loading.tsx` y `error.tsx` de la ruta nueva **sin componentes nuevos** |
| `components/ui/button` (`buttonVariants`), `components/ui/badge` | UI. `@shadcn/alert` existe en el registro (`npx shadcn@latest search @shadcn -q alert`), pero **no se añade**: el aviso de modo de prueba sigue el patrón `role="note"` de la página de pago (consistencia; sin cambios en `src/components/ui`) |
| `src/app/dashboard/proposals/page.tsx` | Patrón de página fina con `requireRole("developer")` |

No existen `src/hooks` ni stores y no se necesitan. No hay ningún código de Connect: se crea.

## Archivos

Nuevos (N) y modificados (M). Cada archivo pertenece a una sola tarea.

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/payments/schema/connected-accounts.table.ts` | N | T0 |
| `drizzle/0004_connected_accounts.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` | N/N/M (generados) | T0 |
| `src/lib/db/connected-accounts-constraints.test.ts` | N | T0 |
| `src/lib/stripe.ts` (añadir al final) | M | T0 |
| `src/lib/stripe-errors.test.ts` | N | T0 |
| `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts` | M | T0 |
| `src/modules/payments/types/connected-account.types.ts` | N | T1 |
| `src/modules/payments/services/connected-account-errors.ts` | N | T1 |
| `src/modules/payments/services/connected-account-status.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/services/connected-account.service.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/schemas/connected-account.schema.ts` + `.test.ts` | N | T1 |
| `src/modules/payments/actions/connected-account.actions.ts` + `.test.ts` | N | T2 |
| `src/app/dashboard/payouts/onboarding/return/route.ts` + `route.test.ts` | N | T2 |
| `src/app/dashboard/payouts/onboarding/refresh/route.ts` + `route.test.ts` | N | T2 |
| `src/app/dashboard/payouts/page.tsx`, `loading.tsx`, `error.tsx` | N | T3 |
| `src/modules/payments/components/payouts-page-view.tsx` | N | T3 |
| `src/modules/payments/components/start-payout-onboarding-button.tsx` | N | T3 |
| `src/modules/payments/components/refresh-connected-account-button.tsx` | N | T3 |
| `src/modules/auth/services/dashboard-link.ts`, `dashboard-link.test.ts`, `src/modules/auth/components/site-header.tsx` | M | T3 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md`, `docs/SETUP.md` | M | T4 |

Archivos con cambios de 010 aún sin commitear (`src/lib/stripe.ts`, `docs/MANUAL-TESTS.md`, `docs/architecture/*`): **solo se añade**. No se reescribe, reordena ni reformatea su contenido actual.

### 1. Modelo de datos (T0)

`src/modules/payments/schema/connected-accounts.table.ts` (estilo de `payment-attempts.table.ts`):

```ts
export const connectedAccountStatusEnum = pgEnum("connected_account_status", [
  "not_started", "pending", "active", "restricted",
]);

export const connectedAccounts = pgTable("connected_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "restrict" }),
  stripeAccountId: text("stripe_account_id").unique(),            // NULL hasta que Stripe la crea
  status: connectedAccountStatusEnum("status").notNull().default("not_started"),
  statusSyncedAt: timestamp("status_synced_at", { withTimezone: true }),   // última lectura de Stripe
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check("connected_accounts_status_requires_account",
    sql`${t.stripeAccountId} IS NOT NULL OR ${t.status} = 'not_started'`),
  check("connected_accounts_stripe_id_format",
    sql`${t.stripeAccountId} IS NULL OR ${t.stripeAccountId} LIKE 'acct\\_%'`),
]);
```

- **Unicidad** (requisito central): `user_id UNIQUE` evita dos filas por desarrollador y `stripe_account_id UNIQUE` evita compartir una cuenta. Las dos actúan como red de seguridad ante carreras (RF2).
- El rol `developer` no se puede expresar con un CHECK entre tablas: lo garantizan el servicio (`can("payout.manage")`) y sus pruebas.
- **Sin** `livemode`: el `Account` v1 no lo expone (verificado). La garantía es la clave de prueba. **Sin** columnas de requirements, email, país ni nombre: PII mínima; Stripe es la fuente de verdad (`system-design §3`).
- `status` es una **caché derivada** de Stripe (RF1). 011b decidirá si relee la cuenta antes de transferir.
- Migración: `npx drizzle-kit generate --name connected_accounts` (equivalente a `npm run db:generate -- --name connected_accounts`) produce `drizzle/0004_connected_accounts.sql`, `meta/0004_snapshot.json` y actualiza `meta/_journal.json`. No hace falta `DATABASE_URL` para generar. Si drizzle-kit escapa distinto el patrón del CHECK de formato, el developer ajusta el `sql` hasta que la migración aplique en PGlite. **Prohibido `npm run db:migrate`**; la migración en Neon es un paso manual del humano (MANUAL-TESTS). `src/lib/db/migrations.test.ts` no cambia: usa `arrayContaining` y cuenta archivos por entrada del journal.

### 2. Frontera Stripe: adiciones a `src/lib/stripe.ts` (T0)

Al final del archivo, sin modificar `getStripe`, `getAppUrl`, `StripeConfigError`, `WEBHOOK_TOLERANCE_SECONDS`, `getWebhookSecret` ni `constructStripeEvent`:

```ts
/** Stripe certainly did not perform the operation (spec 009 RF4 classification). Everything else is ambiguous. */
export function isDefinitiveStripeRejection(error: unknown): boolean
// true si (error as {type?}).type ∈ {"StripeInvalidRequestError","StripeAuthenticationError","StripePermissionError"}

/** Only safe fields for logs: never messages, keys, URLs, account ids or emails. */
export function stripeErrorLogFields(error: unknown): { type: unknown; code: unknown; statusCode: unknown; requestId: unknown }

/** true only for https URLs whose host ends in ".stripe.com" (Checkout, Connect onboarding). */
export function isStripeHostedUrl(value: string | null | undefined): value is string
```

Las tres son puras y no leen el entorno. 009 conserva sus copias privadas (duplicación aceptada; se unificará en una limpieza posterior).

### 3. Permiso (T0)

`auth.types.ts`: `Action` añade `"payout.manage"`. `permissions.ts`: `"payout.manage": ["developer"]`. `permissions.test.ts`: fila `"payout.manage": [false, false, true, false]`. Nada más cambia en `auth`.

### 4. Contratos del módulo (T1)

`src/modules/payments/types/connected-account.types.ts`:

```ts
export type ConnectedAccountStatus = (typeof connectedAccountStatusEnum.enumValues)[number];
export const CONNECTED_ACCOUNT_STATUS_LABELS: Record<ConnectedAccountStatus, string> = {
  not_started: "Sin configurar",
  pending: "En revisión por Stripe",
  active: "Lista para recibir transferencias de prueba",
  restricted: "Requiere acción",
};
/** Minimal Stripe snapshot used by the pure derivation (decoupled from the SDK type). */
export type ConnectedAccountSnapshot = {
  detailsSubmitted: boolean;
  transfersCapability: "active" | "inactive" | "pending" | string | undefined;
  currentlyDue: string[];        // null -> []
  pastDue: string[];             // null -> []
  disabledReason: string | null;
};
export type ConnectedAccountOverview = {
  status: ConnectedAccountStatus;
  hasStripeAccount: boolean;
  statusSyncedAt: Date | null;
};                               // without stripeAccountId, email or any Stripe data
export type ConnectedAccountActionResult =
  { ok: false; code: ConnectedAccountErrorCode | "UNKNOWN"; message: string };
export type RefreshConnectedAccountResult =
  { ok: true; status: ConnectedAccountStatus } | ConnectedAccountActionResult;
```

`src/modules/payments/services/connected-account-errors.ts` (estilo de `payment-errors.ts`; las fallas de autorización siguen siendo `AuthError`):

| Código | HTTP | Mensaje (es) | Cuándo |
|---|---|---|---|
| `STRIPE_NOT_CONFIGURED` | 503 | "Los cobros de prueba no están disponibles en este entorno." | `StripeConfigError` (falta la clave, es live o tiene otro formato, o falta `APP_URL`) o rechazo definitivo de Stripe al crear la cuenta o el enlace (p. ej. Connect sin activar) |
| `STRIPE_UNAVAILABLE` | 502 | "No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos." | Error ambiguo o transitorio, o respuesta inválida (URL no alojada por Stripe, id sin `acct_`) |
| `ACCOUNT_ALREADY_ACTIVE` | 409 | "Tu cuenta de cobros de prueba ya está activa." | Se pide onboarding con `status = 'active'` |
| `ACCOUNT_UNAVAILABLE` | 409 | "No encontramos tu cuenta de cobros de prueba en Stripe. Contacta con el administrador." | `retrieve`/`accountLinks.create` con rechazo definitivo sobre una cuenta ya guardada (cuenta borrada, o la clave pertenece a otra cuenta de plataforma; D-C) |

### RF1. Derivación pura del estado (`connected-account-status.ts`, T1)

```ts
export function toConnectedAccountSnapshot(account: Stripe.Account): ConnectedAccountSnapshot
export function deriveConnectedAccountStatus(s: ConnectedAccountSnapshot): ConnectedAccountStatus
```

Reglas en orden de precedencia:

1. `transfersCapability === "active"` -> `active` (puede recibir transferencias de 011b, aunque haya requisitos futuros o `payouts_enabled = false`; D-D).
2. `!detailsSubmitted` -> `not_started` (cuenta creada, onboarding sin completar).
3. `pastDue.length > 0` o `currentlyDue.length > 0`, o `disabledReason` no nulo y distinto de `requirements.pending_verification` y `under_review` -> `restricted` (incluye `rejected.*`, `requirements.past_due`, `action_required.*`, `listed`, `platform_paused`, `other`).
4. En otro caso -> `pending` (datos enviados, Stripe verificando o capacidad `pending`/`inactive` sin requisitos).

Sin cuenta en Stripe (`stripe_account_id` NULL) el estado es `not_started` sin llamar a la función. `toConnectedAccountSnapshot` normaliza `null` -> `[]` y lee `account.capabilities?.transfers`.

### RF2. Crear la cuenta de forma idempotente (`connected-account.service.ts`, T1, `import "server-only"`)

```ts
ensureConnectedAccount(actor: AuthUser): Promise<{ rowId: string; stripeAccountId: string; status: ConnectedAccountStatus }>
```

Uso interno de `startOnboarding`; se exporta para pruebas y para 011b. Secuencia en tres fases (patrón de 009). **Ninguna llamada a Stripe ocurre dentro de una transacción.**

0. `can(actor.role, "payout.manage")` o `AuthError("FORBIDDEN")`, sin BD ni Stripe. Después `getStripe()`: un `StripeConfigError` (incluida la clave live) se convierte en `ConnectedAccountError("STRIPE_NOT_CONFIGURED")` y solo se registra `e.message`.
1. **Fase A:** `INSERT INTO connected_accounts (user_id) VALUES (actor.id) ON CONFLICT (user_id) DO NOTHING` y luego `SELECT id, stripe_account_id, status WHERE user_id = actor.id`. Dos peticiones simultáneas terminan con **una** fila (UNIQUE).
2. Si la fila ya tiene `stripe_account_id`, se devuelve sin llamar a Stripe.
3. **Fase B:** `stripe.accounts.create(params, { idempotencyKey: \`nexora:connect-account:${row.id}\` })`. La clave es **determinista por fila** (1:1 con el usuario por el UNIQUE; D-B). `params` son constantes salvo el id interno, para que sean idénticos en cada reintento:

   ```ts
   {
     country: CONNECTED_ACCOUNT_COUNTRY,            // "US" (D5, a verificar)
     controller: {
       stripe_dashboard: { type: "express" },
       fees: { payer: "application" },
       losses: { payments: "application" },
       requirement_collection: "stripe",
     },
     capabilities: { transfers: { requested: true } },
     metadata: { nexora_user_id: actor.id },         // only the internal UUID; no email or name (no PII)
   }
   ```

   No se envían `type` (obsoleto), `email`, `business_type`, `card_payments` (los cobros los hace la plataforma, D1) ni `default_currency` (USD por defecto en `US`).
   - Rechazo definitivo (`isDefinitiveStripeRejection`): `STRIPE_NOT_CONFIGURED`. La fila queda sin cuenta y `not_started`. No hay nada que compensar porque Stripe no creó nada.
   - Ambiguo o transitorio (conexión, timeout, `StripeAPIError`, `StripeRateLimitError`, `StripeIdempotencyError` por clave en uso concurrente): `STRIPE_UNAVAILABLE`. El siguiente clic reintenta con la **misma clave** y Stripe devuelve la misma cuenta si llegó a crearse.
   - Respuesta sin `id` que empiece por `acct_`: `STRIPE_UNAVAILABLE`.
   - Logs: `console.error("[payments] Stripe account create failed:", stripeErrorLogFields(e))`. Nunca el id de cuenta, el email ni el mensaje.
4. **Fase C:** `UPDATE connected_accounts SET stripe_account_id = :acct, status = :derived, status_synced_at = now WHERE id = :rowId AND stripe_account_id IS NULL RETURNING id`. `:derived` = `deriveConnectedAccountStatus(toConnectedAccountSnapshot(account))`, normalmente `not_started`. Con 0 filas se relee: si tiene **el mismo** `acct` (otra petición con la misma clave lo guardó antes), es éxito. Si tiene **otro** (solo posible si venció la ventana de idempotencia), se devuelve el guardado y se registra la anomalía con `rowId` (sin ids de Stripe). La otra cuenta queda huérfana en modo de prueba (riesgo R3). Un error de BD en la Fase C da `STRIPE_UNAVAILABLE` y la fila sigue sin cuenta (el reintento usa la misma clave).

### RF3. Enlace de onboarding (`startOnboarding`, T1)

```ts
startOnboarding(actor: AuthUser): Promise<{ onboardingUrl: string }>
```

1. `ensureConnectedAccount(actor)` (RF2).
2. Si `status === "active"`: `ConnectedAccountError("ACCOUNT_ALREADY_ACTIVE")`. El estado guardado basta; no se relee (el botón no se muestra en `active` y "Actualizar estado" lo corrige si quedó desfasado).
3. `getAppUrl()`: un `StripeConfigError` da `STRIPE_NOT_CONFIGURED`.
4. `stripe.accountLinks.create({ account: stripeAccountId, type: "account_onboarding", refresh_url: \`${appUrl}/dashboard/payouts/onboarding/refresh\`, return_url: \`${appUrl}/dashboard/payouts/onboarding/return\`, collection_options: { fields: "currently_due" } })`. **Sin** clave de idempotencia: cada enlace es de un solo uso y caduca (`expires_at`); se crea uno por clic. **No se persiste** la URL.
5. Error de Stripe: un rechazo definitivo da `ACCOUNT_UNAVAILABLE` (la cuenta guardada no es válida para esta plataforma; D-C); cualquier otro, `STRIPE_UNAVAILABLE`.
6. `isStripeHostedUrl(link.url)` o `STRIPE_UNAVAILABLE`. Devuelve `{ onboardingUrl }`. La URL solo viaja como destino de redirect: nunca se registra, se guarda ni se devuelve como dato al cliente.

Las URLs de return y refresh **no llevan** el id de la cuenta ni del usuario: el servidor siempre resuelve la cuenta por la sesión.

### RF4. Sincronizar el estado (`syncConnectedAccount`, T1)

```ts
syncConnectedAccount(actor: AuthUser): Promise<{ status: ConnectedAccountStatus }>
```

1. `can("payout.manage")` (o `FORBIDDEN`) y `getStripe()` (o `STRIPE_NOT_CONFIGURED`).
2. Fila por `user_id = actor.id`. Si no hay fila o no tiene `stripe_account_id`, devuelve `{ status: "not_started" }` **sin llamar a Stripe ni escribir**.
3. `stripe.accounts.retrieve(stripeAccountId)` fuera de transacción. Un rechazo definitivo da `ACCOUNT_UNAVAILABLE`; cualquier otro error, `STRIPE_UNAVAILABLE`. En ambos casos no se escribe.
4. Defensa: si `account.id !== stripeAccountId`, o si `account.metadata?.nexora_user_id` existe y es distinto de `actor.id`, se registra la anomalía (`rowId`) y se lanza `ACCOUNT_UNAVAILABLE` sin escribir.
5. `UPDATE connected_accounts SET status = :derived, status_synced_at = now WHERE id = :rowId AND stripe_account_id = :acct`. Es idempotente: releer dos veces deja el mismo resultado. **Cualquier** transición entre los cuatro estados está permitida, porque el estado es un reflejo de Stripe (`state-machines §6`, T4).
6. Log de una línea: `console.info("[payments] connected account synced", { rowId, status })`.

### RF5. Lectura para la página (`getConnectedAccountOverview`, T1)

`getConnectedAccountOverview(actor): Promise<ConnectedAccountOverview>`. Primero `can("payout.manage")` o `FORBIDDEN`. Después solo lee la BD (sin fila: `{ status: "not_started", hasStripeAccount: false, statusSyncedAt: null }`). **No llama a Stripe ni escribe** (un render no cambia estados). Un test comprueba los `Object.keys` exactos.

### RF6. Schema (`connected-account.schema.ts`, T1)

`payoutsPageQuerySchema = z.object({ onboarding: z.enum(["returned", "link_failed", "sync_failed"]).optional().catch(undefined) })`. Las actions no reciben entrada, así que no hay más schemas.

### RF7. Server actions (`connected-account.actions.ts`, T2, `"use server"`)

- `startPayoutOnboardingAction(): Promise<ConnectedAccountActionResult>`:
  1. `requireRole("developer")` en `try`; el `catch` llama a `handleAuthErrorForPage`.
  2. `startOnboarding(actor)` en `try` con `toResult`: `ConnectedAccountError` da su mensaje; otro `AuthError` va a `handleAuthErrorForPage`; cualquier otro error da `UNKNOWN` con "No pudimos completar la acción. Inténtalo de nuevo.".
  3. Éxito: `revalidatePath("/dashboard/payouts")` y **fuera de todo `try`**, `redirect(onboardingUrl)` (URL absoluta admitida; `redirect.md`: llamar fuera del `try`).
- `refreshConnectedAccountAction(): Promise<RefreshConnectedAccountResult>`: mismo guard; `syncConnectedAccount`; si va bien, `revalidatePath("/dashboard/payouts")` y `{ ok: true, status }`. Nunca devuelve ids ni URLs de Stripe.

### RF8. Route handlers de return y refresh (T2)

Solo componen (`SETUP §1.2`). `runtime` por defecto `nodejs`. Los `GET` son dinámicos por defecto en Next 16 (`route.md`, cambio v15).

- `src/app/dashboard/payouts/onboarding/return/route.ts`, `GET`:
  1. `requireRole("developer")`. Un `AuthError` va a `handleAuthErrorForPage` (sin sesión: `/sign-in`; sin fila: `/onboarding`; rol incorrecto: 404).
  2. `syncConnectedAccount(actor)` en `try`.
  3. `redirect("/dashboard/payouts?onboarding=returned")` si va bien, o `redirect("/dashboard/payouts?onboarding=sync_failed")` ante `ConnectedAccountError`. Los demás errores se propagan. `redirect` siempre fuera del `try`.
  4. El `GET` escribe solo la caché derivada de Stripe. Es idempotente, no es una transición de negocio y Stripe exige esta URL (D7). La página `/dashboard/payouts` en sí no escribe.
- `src/app/dashboard/payouts/onboarding/refresh/route.ts`, `GET`: Stripe llama aquí cuando el enlace caducó o ya se usó. Mismo guard; `startOnboarding(actor)` en `try`. Si va bien, `redirect(onboardingUrl)` (nuevo enlace). Con `ACCOUNT_ALREADY_ACTIVE`, `redirect("/dashboard/payouts?onboarding=returned")`. Con otro `ConnectedAccountError`, `redirect("/dashboard/payouts?onboarding=link_failed")`. Crear un enlace no escribe en la BD. Un GET forzado desde otro sitio (CSRF) solo llevaría al propio desarrollador a su propio onboarding.
- `proxy.ts` no cambia: estas rutas no son públicas y la autorización vive en el handler.

### RF9. UI (T3)

**Ruta (D-A): `/dashboard/payouts`.** Es coherente con `/dashboard/projects` y `/dashboard/proposals`: cada `dashboard/*` corresponde a un rol. Se descarta `/account/payouts` porque no existe ningún `/account` y crearía una sección "Mi cuenta" que no se pide. Referencia de diseño: sección "Cobros de prueba" del panel "Mi cuenta" del canvas (**no accesible** desde este agente; textos por contrastar, P7).

- `src/app/dashboard/payouts/page.tsx`: metadata "Cobros de prueba | Nexora". Parsea `searchParams` con `payoutsPageQuerySchema`. `requireRole("developer")` + `getConnectedAccountOverview` en `try`, con `handleAuthErrorForPage` en el `catch`. Compone `<PayoutsPageView overview={…} notice={onboarding} />`.
- `loading.tsx`: `<PaymentsLoading label="Cargando cobros de prueba..." />`. `error.tsx`: `<PaymentsError reset={reset} title="No pudimos cargar tus cobros de prueba" />`.
- `payouts-page-view.tsx` (servidor, presentacional):
  - Un `<h1>` "Cobros de prueba".
  - Aviso permanente `role="note"`: **"Cobros de prueba · no es dinero real."** y "Nexora usa Stripe en modo de prueba. Esta cuenta solo podrá recibir transferencias de prueba; nunca se mueve dinero real. Nexora no cobra comisiones ni custodia fondos."
  - `Badge` con `CONNECTED_ACCOUNT_STATUS_LABELS[status]`.
  - Texto y acción por estado (tabla abajo).
  - Aviso por `notice` en `role="status"`: `returned` = "Volviste desde Stripe. Mostramos el estado que Stripe reporta ahora."; `link_failed` = "No pudimos abrir Stripe. Inténtalo de nuevo."; `sync_failed` = "No pudimos consultar el estado en Stripe. Usa «Actualizar estado»." El parámetro es manipulable, así que ningún texto afirma que la cuenta esté activa.
  - Fecha de `statusSyncedAt` ("Última consulta a Stripe: …") si existe.
  - Nunca muestra ids de Stripe, email ni URLs.

| Estado | Texto | Acción |
|---|---|---|
| `not_started` sin cuenta | "Configura tu cuenta de cobros de prueba en Stripe para recibir transferencias de prueba cuando un cliente confirme un pago." | `StartPayoutOnboardingButton` "Configurar cobros de prueba" |
| `not_started` con cuenta | "Aún no completas el registro en Stripe." | "Continuar configuración en Stripe" + `RefreshConnectedAccountButton` |
| `pending` | "Stripe está revisando tus datos. Puede tardar unos minutos en modo de prueba." | `RefreshConnectedAccountButton` |
| `restricted` | "Stripe necesita más datos para habilitar tu cuenta." | "Completar datos en Stripe" + `RefreshConnectedAccountButton` |
| `active` | "Tu cuenta puede recibir transferencias de prueba. Ninguna transferencia representa dinero real." | `RefreshConnectedAccountButton` |

- `start-payout-onboarding-button.tsx` (`"use client"`):
  - Props: `{ label: string }`.
  - `useTransition`; llama a `startPayoutOnboardingAction()`. Mientras corre: `disabled` y "Redirigiendo a Stripe...".
  - Si responde `{ ok: false }`: mensaje en `role="alert"` dentro de `aria-live="polite"` y `router.refresh()`.
  - Objetivo táctil ≥ 40 px. Patrón de `start-checkout-button.tsx`.
- `refresh-connected-account-button.tsx` (`"use client"`): "Actualizar estado". `useTransition`; llama a `refreshConnectedAccountAction()`. Mientras corre: "Actualizando...". Al terminar, `router.refresh()`. El error va en `role="alert"`. Patrón de `refresh-payment-button.tsx`.
- **Enlace (D-A):** en `dashboard-link.ts` se añade `getPayoutsLink(viewer: NavViewer): NavLinkItem | null`. Devuelve `{ href: "/dashboard/payouts", label: "Cobros de prueba" }` solo para `{ kind: "user", role: "developer" }` y `null` en los demás casos. `getDashboardLink` no cambia. `site-header.tsx` empuja ese enlace después del dashboard si no es `null`. `dashboard-link.test.ts` añade casos (sin modificar los existentes). `SiteNav` y `src/app/layout.tsx` **no cambian**.
- Qué ve el cliente: **nada nuevo**. El paso 4 de la página de pago sigue "Pendiente de implementación" hasta 011b.

## Permisos y seguridad

- Capas: guard de action o ruta (`requireRole("developer")`), `can("payout.manage")` dentro de cada servicio, y la consulta por `user_id = actor.id` como único punto de decisión de propiedad. **Ningún** id de cuenta, de fila ni de usuario llega desde el cliente, la URL o la metadata de Stripe. Un desarrollador no puede leer, sincronizar ni generar enlaces de la cuenta de otro.
- Cliente o admin: `FORBIDDEN` (404 en página y ruta vía `handleAuthErrorForPage`). Sin sesión: `/sign-in`. Sin fila interna: `/onboarding`.
- Solo modo de prueba: todas las llamadas usan `getStripe()`, que rechaza claves live. No se añade otra variable ni otro cliente.
- Logs: solo `rowId`, `status`, `stripeErrorLogFields` y `StripeConfigError.message`. **Nunca** `acct_…`, URLs de enlace, email, nombre, `requirements` ni el objeto `Account`.
- PII hacia Stripe: solo `metadata.nexora_user_id` (UUID interno). Los datos personales los introduce el desarrollador directamente en Stripe; Nexora no los guarda ni los ve.
- Sin rate limiting en las acciones ni en las rutas nuevas (cada clic llama a Stripe). Se anota para 015. Mitigación: solo usuarios `developer` autenticados, sobre su propia cuenta.

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Doble clic o dos pestañas en "Configurar" | Una fila (UNIQUE `user_id`), una cuenta en Stripe (misma clave de idempotencia); ambas redirigen o una recibe `STRIPE_UNAVAILABLE` por clave en uso y reintenta |
| Fallo de red tras crear la cuenta en Stripe | Fila sin `acct`; el reintento con la misma clave devuelve la misma cuenta |
| Fase C pierde la carrera con otra cuenta (ventana vencida) | Se conserva la guardada; anomalía en el log; la otra queda huérfana en modo de prueba |
| Connect no activado en la plataforma | `STRIPE_NOT_CONFIGURED` (rechazo definitivo); la fila sigue `not_started` |
| Clave live o ausente, o `APP_URL` ausente | `STRIPE_NOT_CONFIGURED` sin escribir (crear) o sin llamar a Stripe |
| Enlace caducado o reutilizado | Stripe redirige a `/refresh`, que genera un enlace nuevo |
| El desarrollador vuelve sin completar | `/return` sincroniza: `not_started` con cuenta, "Continuar configuración" |
| Cuenta borrada en Stripe o clave de otra plataforma | `ACCOUNT_UNAVAILABLE`; sin escribir; reseteo manual documentado (D-C) |
| Requisitos nuevos tras estar `active` | Si `transfers` sigue `active`, el estado sigue `active`; si Stripe la desactiva, pasa a `restricted` en la siguiente lectura |
| `?onboarding=returned` escrito a mano | Solo muestra el aviso; el estado sale de la BD |
| Cliente o admin abre `/dashboard/payouts` o `/return` | 404 |

## Criterios de aceptación

Base (T0):

- AC1. La migración `drizzle/0004_connected_accounts.sql` existe, la generó drizzle-kit y crea el enum `connected_account_status('not_started','pending','active','restricted')` y la tabla `connected_accounts` con `user_id` UNIQUE NOT NULL (FK a `users`, `restrict`), `stripe_account_id` UNIQUE nullable y los CHECK `connected_accounts_status_requires_account` y `connected_accounts_stripe_id_format`. El journal tiene una entrada más. No se ejecutó `db:migrate`. `migrations.test.ts` pasa sin cambios.
- AC2. En PGlite: una segunda fila con el mismo `user_id` falla; dos usuarios con el mismo `stripe_account_id` falla; `status = 'active'` con `stripe_account_id` NULL falla; un `stripe_account_id` sin el prefijo `acct_` falla; borrar un usuario con fila falla (`restrict`).
- AC3. `isDefinitiveStripeRejection` es `true` solo para los tres tipos definitivos y `false` para conexión, API, límite de tasa, idempotencia, `null` y objetos sin `type`. `stripeErrorLogFields` devuelve exactamente `type`, `code`, `statusCode` y `requestId`, sin `message`. `isStripeHostedUrl` acepta `https://connect.stripe.com/...` y rechaza `http:`, otros hosts (`stripe.com.evil.io`), cadenas inválidas, vacías y `null`. Las funciones existentes de `src/lib/stripe.ts` y sus tests (`stripe.test.ts`, `stripe-webhook.test.ts`) no cambian y pasan.
- AC4. `can(role, "payout.manage")` es `true` solo para `developer`. La matriz de `permissions.test.ts` incluye la fila y pasa.

Servicios (T1, PGlite + Stripe falso):

- AC5. `deriveConnectedAccountStatus` cumple la tabla de RF1, con al menos un caso por regla y por precedencia: `transfers` activo con `currentlyDue` no vacío da `active`; sin `details_submitted` con `pastDue` da `not_started`; `disabledReason = 'requirements.pending_verification'` sin requisitos da `pending`; `rejected.fraud` da `restricted`; `capabilities` ausente da `pending` o `not_started` según `details_submitted`. `toConnectedAccountSnapshot` convierte `null` en `[]`.
- AC6. Idempotencia: llamar dos veces a `ensureConnectedAccount` crea **una** fila y llama **una** vez a `accounts.create`. Con `Promise.allSettled` simultáneo hay una fila y un `acct`, y el Stripe falso recibe la misma `idempotencyKey` (`nexora:connect-account:<rowId>`) y parámetros idénticos. Los parámetros son exactamente los de RF2 (`controller` express/application/application/stripe, `capabilities.transfers.requested`, `country`, `metadata.nexora_user_id`), sin `type`, `email` ni `card_payments`.
- AC7. Fallos al crear: un error ambiguo deja la fila sin `acct` y lanza `STRIPE_UNAVAILABLE`, y el reintento usa la misma clave. Un rechazo definitivo lanza `STRIPE_NOT_CONFIGURED` sin `acct`. Si la Fase C pierde la carrera, se devuelve el `acct` guardado y se registra la anomalía sin ids de Stripe. Una respuesta sin `acct_` da `STRIPE_UNAVAILABLE`.
- AC8. Autorización: `client` y `admin` reciben `FORBIDDEN` en los cuatro servicios **sin** tocar la BD ni llamar a Stripe. Con dos desarrolladores, cada uno solo crea, sincroniza y ve su fila; no hay ninguna firma que acepte un id de cuenta o de usuario ajeno.
- AC9. Clave live: si `getStripe` lanza `StripeConfigError` (simulado con el mensaje de clave live), `ensureConnectedAccount`, `startOnboarding` y `syncConnectedAccount` lanzan `STRIPE_NOT_CONFIGURED` sin escribir, y el log no contiene la clave.
- AC10. `startOnboarding`: llama a `accountLinks.create` con `type: "account_onboarding"`, `refresh_url` y `return_url` basadas en `APP_URL` (`/dashboard/payouts/onboarding/refresh|return`, sin ids) y `collection_options.fields: "currently_due"`. Una URL no alojada por Stripe da `STRIPE_UNAVAILABLE`. Con `status = 'active'` da `ACCOUNT_ALREADY_ACTIVE` sin llamar a `accountLinks`. Un rechazo definitivo de `accountLinks` da `ACCOUNT_UNAVAILABLE`; uno ambiguo, `STRIPE_UNAVAILABLE`. La URL no se persiste ni aparece en ningún log.
- AC11. `syncConnectedAccount`: sin fila o sin `acct` da `not_started` sin llamar a Stripe. Con cuenta, actualiza `status` y `status_synced_at` según RF1 para los cuatro estados, y releer es idempotente. Un rechazo definitivo de `retrieve` da `ACCOUNT_UNAVAILABLE` sin escribir; uno ambiguo, `STRIPE_UNAVAILABLE` sin escribir. Con `metadata.nexora_user_id` distinto, `ACCOUNT_UNAVAILABLE` sin escribir.
- AC12. `getConnectedAccountOverview` devuelve exactamente `status`, `hasStripeAccount` y `statusSyncedAt`, sin llamar a Stripe.
- AC13. Logs: con `console` espiado, ningún caso imprime `acct_`, URLs de enlace, emails ni la clave.

Actions, rutas y UI (T2, T3):

- AC14. Actions: `requireRole("developer")` se ejecuta antes que el servicio, y un `AuthError` no llama al servicio. Cada `ConnectedAccountError` da su mensaje; un error desconocido da `UNKNOWN` genérico. `startPayoutOnboardingAction` llama a `revalidatePath` y luego a `redirect` con la URL, fuera del `try`, y nunca la devuelve como dato. `refreshConnectedAccountAction` devuelve `{ ok: true, status }`.
- AC15. `GET /dashboard/payouts/onboarding/return`: sincroniza y redirige a `?onboarding=returned`, o a `?onboarding=sync_failed` ante `ConnectedAccountError`. `GET …/refresh`: redirige a la URL nueva de Stripe; con `ACCOUNT_ALREADY_ACTIVE` va a `?onboarding=returned`; con otro error, a `?onboarding=link_failed`. Ambas: sin sesión, `/sign-in`; rol `client`, 404. Solo componen (sin SQL ni SDK de Stripe).
- AC16. Página (verificación manual): `/dashboard/payouts` muestra el h1 "Cobros de prueba", el aviso "Cobros de prueba · no es dinero real.", la etiqueta y la acción de la tabla de RF9 para cada estado, y el aviso de `?onboarding`. El HTML no contiene `acct_`, URLs de Stripe ni el email. Ningún texto afirma dinero real, comisiones, custodia ni transferencias hechas.
- AC17. Navegación: `getPayoutsLink` devuelve el enlace solo para `developer` (casos nuevos en `dashboard-link.test.ts`; los existentes no cambian). El header del desarrollador muestra "Mis propuestas" y "Cobros de prueba"; los de cliente, admin y visitante no cambian. `src/app/layout.tsx`, `site-nav.tsx` y `proxy.ts` no cambian.

Regresión y docs:

- AC18. `payment-checkout.service.ts`, los servicios, rutas y componentes de 009 y 010, `payment.types.ts`, `package.json` y `.env.example` no cambian (D6). `npm run lint`, `npm run test` y `npm run build` pasan. Los tests de 004 a 010 pasan sin modificaciones (salvo la fila de `permissions.test.ts` y los casos añadidos a `dashboard-link.test.ts`). Ningún test usa red, Stripe, Clerk ni Neon reales. El build añade solo `/dashboard/payouts` y sus dos rutas de onboarding.
- AC19. Documentación (T4): `system-design.md` §2 (entidad y diagrama), §3, §4, §5.5, §6, §7 y §8; `state-machines.md` §6 nueva y nota en §4; tabla de `SETUP.md §4`; sección "Spec 011a" en `MANUAL-TESTS.md`. En los archivos con cambios de 010 sin commitear solo hay adiciones.

## Tests requeridos

Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM. Stripe se sustituye en la frontera `vi.mock("@/lib/stripe")` con un falso en memoria (`accounts.create` que honra `idempotencyKey`, `accounts.retrieve` y `accountLinks.create`, todos configurables). La BD es PGlite con las migraciones reales (`createTestDb`, patrón `Proxy` + `holder`). **Ningún test contra Stripe real.**

- `src/lib/db/connected-accounts-constraints.test.ts` (T0): AC2.
- `src/lib/stripe-errors.test.ts` (T0): AC3. Funciones puras; mock de `server-only`.
- `src/modules/auth/services/permissions.test.ts` (T0): fila nueva (AC4).
- `src/modules/payments/services/connected-account-status.test.ts` (T1): AC5, table-driven.
- `src/modules/payments/services/connected-account.service.test.ts` (T1): AC6 a AC13. **Limitación documentada en el archivo:** PGlite serializa las transacciones, así que la simultaneidad demuestra coherencia (UNIQUE + `ON CONFLICT`), no bloqueos reales de Neon.
- `src/modules/payments/schemas/connected-account.schema.test.ts` (T1): valores válidos, inválidos (que caen en `undefined`) y ausentes.
- `src/modules/payments/actions/connected-account.actions.test.ts` (T2): AC14 (mocks de `requireRole`, del servicio, de `next/cache` y de `next/navigation`).
- `src/app/dashboard/payouts/onboarding/return/route.test.ts` y `refresh/route.test.ts` (T2): AC15 (servicio y auth mockeados; se comprueba el destino del redirect).
- `src/modules/auth/services/dashboard-link.test.ts` (T3): casos de `getPayoutsLink` (AC17).
- Sin test unitario obligatorio (`SETUP §3`): `payouts-page-view.tsx` y las páginas de `src/app`. Los dos botones admiten un test RTL opcional.
- Regresión sin cambios: `stripe.test.ts`, `stripe-webhook.test.ts`, `migrations.test.ts`, `constraints.test.ts`, `payment-checkout.service.test.ts`, `payment-event.service.test.ts`, `payment-reconciliation.service.test.ts`, `site-nav.test.tsx`.

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Durante el bloque paralelo (T2, T3, T4) nadie ejecuta `npm install`, `npm run build`, `drizzle-kit` ni `db:migrate`. El reviewer ejecuta lint, test y build al final.

### T0 — Base compartida: tabla, migración, frontera Stripe y permiso

- Archivos: `src/modules/payments/schema/connected-accounts.table.ts`, `drizzle/0004_connected_accounts.sql`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/_journal.json` (generados con `npx drizzle-kit generate --name connected_accounts`; **sin** `db:migrate`), `src/lib/db/connected-accounts-constraints.test.ts`, `src/lib/stripe.ts` (solo añadir al final: `isDefinitiveStripeRejection`, `stripeErrorLogFields`, `isStripeHostedUrl`), `src/lib/stripe-errors.test.ts`, `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts`
- Depende de: —
- Paralelizable: no (esquema, migración, `src/lib/**` y contrato de `auth`, compartidos)
- Cubre: AC1, AC2, AC3, AC4
- Nota: antes de escribir, T0 confirma en los `.d.ts` que los parámetros de RF2 y RF3 compilan contra `Stripe.AccountCreateParams` y `Stripe.AccountLinkCreateParams`. Si algo difiere, lo escala (la spec vuelve a `borrador`).

### T1 — Contratos y servicios de cuentas conectadas

- Archivos: `src/modules/payments/types/connected-account.types.ts`, `src/modules/payments/services/connected-account-errors.ts`, `src/modules/payments/services/connected-account-status.ts`, `src/modules/payments/services/connected-account-status.test.ts`, `src/modules/payments/services/connected-account.service.ts`, `src/modules/payments/services/connected-account.service.test.ts`, `src/modules/payments/schemas/connected-account.schema.ts`, `src/modules/payments/schemas/connected-account.schema.test.ts`
- Depende de: T0
- Paralelizable: no (contrato base de T2, T3 y T4)
- Cubre: AC5 a AC13

### T2 — Server actions y rutas de return y refresh

- Archivos: `src/modules/payments/actions/connected-account.actions.ts`, `src/modules/payments/actions/connected-account.actions.test.ts`, `src/app/dashboard/payouts/onboarding/return/route.ts`, `src/app/dashboard/payouts/onboarding/return/route.test.ts`, `src/app/dashboard/payouts/onboarding/refresh/route.ts`, `src/app/dashboard/payouts/onboarding/refresh/route.test.ts`
- Depende de: T1
- Paralelizable: sí (con T3 y T4; archivos disjuntos)
- Cubre: AC14, AC15

### T3 — UI: página `/dashboard/payouts`, botones y enlace del header

- Archivos: `src/app/dashboard/payouts/page.tsx`, `src/app/dashboard/payouts/loading.tsx`, `src/app/dashboard/payouts/error.tsx`, `src/modules/payments/components/payouts-page-view.tsx`, `src/modules/payments/components/start-payout-onboarding-button.tsx`, `src/modules/payments/components/refresh-connected-account-button.tsx`, `src/modules/auth/services/dashboard-link.ts`, `src/modules/auth/services/dashboard-link.test.ts`, `src/modules/auth/components/site-header.tsx`
- Depende de: T1 y el contrato de T2 (firmas de RF7, fijadas en esta spec)
- Paralelizable: sí (con T2 y T4)
- Cubre: AC16, AC17

### T4 — Documentación de arquitectura y pruebas manuales

- Archivos: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md`, `docs/SETUP.md`
- Depende de: T1 (contratos finales)
- Paralelizable: sí (con T2 y T3; solo documentación)
- Cubre: AC19
- Contenido (solo adiciones; no reescribir el texto de 010 sin commitear):
  - `system-design.md`:
    - §2: fila `connectedAccount` ("cuenta conectada de Stripe Connect del desarrollador, modo de prueba"; campos: usuario, id de cuenta Stripe único, estado derivado, fecha de última sincronización; 1:0..1 con usuario de rol `developer`) y `user ||--o| connectedAccount : "cobra en (rol developer)"` en el diagrama.
    - §3: la fila "Cuenta conectada" pasa a "Stripe (fuente de verdad: datos personales, requisitos, capacidades) / Neon: `stripe_account_id` único y estado derivado como caché (spec 011a)".
    - §4: "`payments` escribe además `connected_accounts` (011a)".
    - §5.5 nueva: resumen de `connectedAccount.status`.
    - §6: fila "Configurar cobros de prueba (cuenta conectada propia)": solo desarrollador.
    - §7: viñetas "Connect solo en modo de prueba; Separate charges and transfers; sincronización por relectura; `account.updated` diferido".
    - §8: D12 a D14 (modelo SCT con disparo automático e importe completo sin comisión, para 011b; Accounts v1 con `controller` + Account Links; relectura y webhook diferido) y actualización de la línea "Confirmadas" sobre 011.
  - `state-machines.md`: §6 nueva "Cuenta conectada (`connectedAccount.status`)" con ids, etiquetas, la tabla de derivación de RF1, el diagrama (cualquier estado puede pasar a cualquier otro por relectura; `not_started` inicial) y los casos límite de esta spec. En §4, una nota: "011a crea la cuenta de destino; la transferencia y su máquina de estados formal llegan con 011b". Las secciones §1 a §5 no se renumeran.
  - `SETUP.md §4`: añadir `state-machines.md §6` (cuenta conectada) y `system-design.md §5.5` en las filas correspondientes.
  - `MANUAL-TESTS.md`: cabecera "Cubre: specs 003 a 011a"; sección nueva "8b. Spec 011a — Cuentas conectadas (Stripe Connect, modo de prueba)" antes de "9. Revisión visual transversal" (sin renumerar 9 y 10), con los pasos de la lista siguiente; y en "Pendientes", una línea sobre `account.updated` diferido y el rate limiting (015).

Pasos manuales que T4 documenta, cada uno como casilla:

1. **Preparación:**
   - En el Dashboard de Stripe, **en modo de prueba**, activar Connect (Settings > Connect; completar el perfil de plataforma si lo pide) y anotar el país de la cuenta de plataforma (P1).
   - No hay variables nuevas: valen `STRIPE_SECRET_KEY` (`sk_test_…`) y `APP_URL`.
   - Aplicar la migración en Neon con `npm run db:migrate` (lo hace el humano).
2. **Onboarding completo:** con la cuenta Desarrollador A, ir a "Cobros de prueba", pulsar "Configurar cobros de prueba", completar en Stripe con datos de prueba (teléfono de prueba, código `000000`, SSN `000-00-0000`, dirección `address_full_match`, routing `110000000`, cuenta `000123456789`; **a verificar** según el formulario vigente) y volver. La página muestra "Lista para recibir transferencias de prueba" y el aviso "Volviste desde Stripe…". En Neon hay una sola fila con `acct_…` y `status = 'active'`. En el Dashboard (Connect > Accounts) aparece una sola cuenta.
3. **Idempotencia:** antes de completar, pulsar "Configurar" dos veces o en dos pestañas: una sola fila y una sola cuenta en Stripe.
4. **Abandono y continuación:** salir del onboarding a mitad. La página muestra "Sin configurar" con "Continuar configuración en Stripe", que reanuda la misma cuenta.
5. **Enlace caducado:** reabrir una URL de onboarding ya usada. Stripe redirige a `/dashboard/payouts/onboarding/refresh` y se abre un enlace nuevo.
6. **Requiere acción y revisión:** con los datos de prueba que fuerzan verificación pendiente o fallida (**a verificar** en la documentación de pruebas de Connect), comprobar "En revisión por Stripe" o "Requiere acción" y que "Completar datos en Stripe" abre el onboarding.
7. **Actualizar estado:** cambiar algo en el Dashboard (p. ej. rechazar la cuenta de prueba) y pulsar "Actualizar estado": la etiqueta cambia.
8. **Permisos:** con la cuenta Cliente, `/dashboard/payouts`, `/dashboard/payouts/onboarding/return` y `/refresh` dan 404 y el header no muestra "Cobros de prueba". Sin sesión, redirigen a `/sign-in`. El Desarrollador B no ve la cuenta de A.
9. **Configuración:** con `STRIPE_SECRET_KEY` live (`sk_live_…` ficticia) o sin ella, "Configurar" muestra "Los cobros de prueba no están disponibles en este entorno." y no escribe en Neon. Restaurar después.
10. **Cuenta inexistente (D-C):** borrar la cuenta de prueba en el Dashboard y pulsar "Actualizar estado": aparece el mensaje de `ACCOUNT_UNAVAILABLE`. Reseteo manual: `DELETE FROM connected_accounts WHERE user_id = '<id>';` (solo modo de prueba).
11. **Privacidad y logs:** el log del servidor y el HTML no contienen `acct_`, URLs de onboarding, emails ni claves.
12. **Responsive y accesibilidad** a 390 px: botones operables con teclado, foco visible, mensajes en `aria-live`, aviso "no es dinero real" visible.

## Riesgos

- R1. **País y activación de Connect de la plataforma** sin verificar (P1). Si la plataforma no admite cuentas `US`, `accounts.create` dará un rechazo definitivo (`STRIPE_NOT_CONFIGURED`) y habrá que cambiar `CONNECTED_ACCOUNT_COUNTRY` (y posiblemente `tos_acceptance.service_agreement = 'recipient'` para cuentas transfronterizas) antes de aprobar.
- R2. **Combinación de `controller` sin verificar en red** (a verificar (a)). La alternativa es Accounts v2 (P2).
- R3. **Cuentas huérfanas en Stripe** si la Fase C falla y se reintenta pasada la ventana de idempotencia. Es raro, solo ocurre en modo de prueba y queda registrado en el log.
- R4. **Estado desfasado:** sin `account.updated`, un cambio hecho por Stripe después de volver solo se refleja con "Actualizar estado" o con un nuevo retorno. 011b no debe fiarse de la caché sin decidir si relee antes de transferir.
- R5. **GET con escritura** en `/return`: solo refresca una caché derivada; es idempotente y lo exige el diseño de Account Links (D7).
- R6. **Cambio de cuenta de plataforma** (otra `sk_test_`): las filas guardadas apuntan a cuentas inaccesibles y dan `ACCOUNT_UNAVAILABLE`, con reseteo manual (D-C).
- R7. **PGlite no demuestra concurrencia real**; se valida por UNIQUE + `ON CONFLICT` y por lectura del código.
- R8. **Rate limiting ausente** (015).
- R9. **Canvas de diseño no accesible**: textos y ubicación por contrastar (P7).
- R10. **Duplicación aceptada** de la clasificación de errores entre 009 (privada) y `src/lib/stripe.ts`.

## Decisiones de esta spec (con recomendación por defecto)

- D-A. Ruta y enlace. Recomendación: `/dashboard/payouts` + enlace "Cobros de prueba" en el header solo para `developer`, vía `getPayoutsLink`. Alternativas: `/account/payouts` (crea una sección "Mi cuenta" que no existe) o el enlace solo dentro de "Mis propuestas" (menos visible; toca `my-proposals-list.tsx` de 007).
- D-B. Clave de idempotencia. Recomendación: `nexora:connect-account:<connected_accounts.id>` (determinista y 1:1 con el usuario por el UNIQUE; tras un reseteo manual cambia y evita que Stripe devuelva una cuenta borrada). Alternativa: derivada del `user.id` (tras un reseteo, en menos de 24 h devolvería la cuenta anterior).
- D-C. Cuenta inaccesible en Stripe. Recomendación: `ACCOUNT_UNAVAILABLE` sin escribir y reseteo manual documentado. Alternativa: reseteo automático de la fila (más cómodo, pero borra estado ante un error que podría no ser permanente).
- D-D. Criterio de `active`. Recomendación: `capabilities.transfers === 'active'` (lo que necesita 011b). Alternativa: exigir además `payouts_enabled` (más estricto; los payouts a banco no forman parte de este alcance).
- D-E. Permiso. Recomendación: acción nueva `payout.manage` en la matriz (coherente con `can(...)` en 009 y 010). Alternativa: solo `requireRole("developer")` sin tocar `auth` (rompe la coherencia de la matriz de `system-design §6`).
- D-F. Estados. Recomendación: cuatro estados (`not_started`, `pending`, `active`, `restricted`), con `rejected.*` dentro de `restricted`. Alternativa: un quinto `rejected` terminal (YAGNI hasta que haya un caso que lo distinga en la UX).

## Preguntas abiertas (resueltas por el humano, 2026-10-18)

Resolución: P1 = cuentas conectadas `US` en USD; el humano no sabe aún si Connect está activado en su cuenta de Stripe (precondición manual, ver T4 y R1; no bloquea la implementación porque los tests usan Stripe falso). P2 = Accounts v1 con `controller`. P3–P8 = se aceptan las recomendaciones por defecto (P7: ajustar textos al implementar la spec de perfil; P8: admin en 012).

- P1. ¿Cuál es el país de la cuenta de plataforma de Stripe del humano y tiene Connect activado en modo de prueba? ¿Se confirma `US` para las cuentas conectadas (D5)?
- P2. ¿Se aprueba Accounts v1 con `controller` + Account Links v1 (D4) frente a Accounts v2 con `configuration.recipient`?
- P3. ¿Se aprueba `/dashboard/payouts` con el enlace en el header (D-A)?
- P4. ¿Se aprueba la acción `payout.manage` (D-E), que modifica tres archivos de la spec 004?
- P5. ¿Basta el reseteo manual ante `ACCOUNT_UNAVAILABLE` (D-C)?
- P6. ¿`active` solo con `transfers` activo (D-D), sin exigir `payouts_enabled`?
- P7. Textos ("Cobros de prueba · no es dinero real", etiquetas de estado, aviso de no custodia) y ubicación por contrastar con el panel "Mi cuenta" del canvas, que no fue accesible.
- P8. ¿El admin necesita ver en algún momento las cuentas conectadas? En 011a no las ve; se propone dejarlo para 012.

## Próximas fases

- **011b** (`developer-transfers`): registro de transferencia (tabla y estados), ejecución automática al confirmarse el pago (D2) por el importe completo sin comisión (D3) hacia la cuenta `active` del desarrollador ganador; `payment_intent_data.transfer_group` en el Checkout (D6, con el tratamiento de idempotencia de los intentos `pending` previos) o `source_transaction`; relectura de la cuenta antes de transferir (R4); UI del paso 4 y del desarrollador; actualización de `state-machines §4` (`transferStatus`).
- Webhooks de Connect (`account.updated`, `capability.updated`) con `stripe listen --forward-connect-to` y su endpoint (posterior a 011b o en 017).
- 012/013: vistas de admin y paneles; 015: rate limiting de las acciones y rutas nuevas; 017: Connect por entorno.

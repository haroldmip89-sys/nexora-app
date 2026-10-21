# Cuentas conectadas con Accounts v2 (migración de la capa Stripe de 011a)

Estado: done

Corrección de **011a** (`done`). 011a creó las cuentas con Accounts v1 (`stripe.accounts.create` con `controller`, solo `transfers`) y Account Links v1. Stripe rechaza esa llamada en la plataforma del humano con HTTP 400 `invalid_request_error`: "Stripe no longer recommends Accounts v1 for new Connect integrations. Create connected accounts with POST /v2/core/accounts instead ... enable Accounts v1 support in the Dashboard". El humano activó esa opción y siguió fallando, y **decidió migrar a Accounts v2**. 011a no se edita (volvería a borrador); esta spec lo sustituye en la capa Stripe y lo supera en `system-design.md §8` (D13).

## Objetivo

Que "Configurar cobros de prueba" funcione de nuevo: crear la cuenta conectada del desarrollador con `POST /v2/core/accounts` (configuración `recipient`, capacidad `stripe_balance.stripe_transfers`), abrir el onboarding alojado con Account Links v2 y derivar `not_started | pending | active | restricted` desde la respuesta v2. Todo lo demás de 011a (tabla `connected_accounts`, rutas de return y refresh, actions, página, permisos `payout.manage`, textos y errores) **no cambia**.

Además, mejorar los logs de errores `invalid_request` añadiendo el `message` que genera Stripe (saneado), para poder depurar rechazos como el de este incidente.

Arquitectura que aplica (solo estas secciones): `system-design.md §3` (Neon guarda `stripe_account_id` y estado derivado), `§5.5` y `state-machines.md §6` (estado de la cuenta conectada), `§7` (Connect solo en modo de prueba), `§8` (D13 queda superada por 011c-D1). `§2`, `§4` y `§6` no cambian.

## Verificación del SDK instalado (`node_modules/stripe`, `stripe@23.0.0`, apiVersion `2026-09-30.endive`, 2026-10-18)

| Comprobación | Resultado | Fuente |
|---|---|---|
| Recursos v2 | `stripe.v2.core.accounts` (`create`, `retrieve(id, params?, options?)`, `update`, `close`, `list`) y `stripe.v2.core.accountLinks.create(params, options?)`. `options` admite `idempotencyKey` | `esm/resources/V2/Core/Accounts.d.ts:22-32`, `AccountLinks.d.ts` |
| `AccountCreateParams` v2 | `configuration?.{customer,merchant,recipient}`, `contact_email`, `contact_phone`, `dashboard?: 'express' \| 'full' \| 'none'`, `defaults?.{currency, locales, profile, responsibilities}`, `display_name`, `identity?.{country, entity_type, individual, ...}`, `include?[]`, `metadata?` | `Accounts.d.ts:3600-3640` |
| Capacidad solicitada | `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested: boolean` (sustituye a v1 `capabilities.transfers`) | `Accounts.d.ts:4557-4580` |
| Responsabilidades al crear | `defaults.responsibilities.{fees_collector: 'application' \| 'application_custom' \| 'application_express' \| 'stripe', losses_collector: 'application' \| 'stripe'}`, ambos obligatorios en el tipo de creación. No hay `requirements_collector` en la creación (sí aparece en la respuesta) | `Accounts.d.ts:4597-4610` |
| `include` | `'configuration.customer' \| 'configuration.merchant' \| 'configuration.recipient' \| 'defaults' \| 'future_requirements' \| 'identity' \| 'requirements'`. Existe en `create`, `retrieve` y `update`. Sin `include`, esos campos pueden no venir en la respuesta (a verificar) | `Accounts.d.ts:3600-3640, 5621-5632` |
| Estado de la capacidad | `account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status`: `'active' \| 'pending' \| 'rejected' \| 'restricted' \| 'unsupported'`, más `status_details[]` (`code`, `resolution`) | `Accounts.d.ts:2151-2230` |
| Requisitos v2 | `account.requirements.entries[]` con `awaiting_action_from: 'user' \| 'stripe'`, `minimum_deadline.status: 'currently_due' \| 'eventually_due' \| 'past_due'`, `errors[]`, `impact.restricts_capabilities`; `requirements.summary.minimum_deadline.status`. **No existen** `details_submitted`, `currently_due[]` ni `disabled_reason` | `Accounts.d.ts:176-180, 3457-3530, 2294-2392` |
| `livemode` | Existe en el `Account` v2 y en el Account Link v2 (útil para una defensa extra de modo de prueba) | `Accounts.d.ts:95`, `AccountLinks.d.ts` |
| `closed` | `account.closed?: boolean` | `Accounts.d.ts:55` |
| `metadata` | Acepta y devuelve `metadata` (ya se usa `nexora_user_id`) | `Accounts.d.ts` |
| Account Link v2 | `stripe.v2.core.accountLinks.create({ account, use_case: { type: 'account_onboarding', account_onboarding: { refresh_url, return_url?, collection_options?: { fields?: 'currently_due' \| 'eventually_due', future_requirements? } } } })`. Respuesta `{ object: 'v2.core.account_link', url, expires_at, livemode, use_case }`. **El tipo no tiene `configurations`**: no hace falta indicar qué configuraciones recopilar en este SDK | `AccountLinks.d.ts:1-214` |
| Mapeo de errores v2 | `generateV2Error`: `idempotency_error` da `StripeIdempotencyError`; `rate_limit` da `RateLimitError`; `temporary_session_expired` da `TemporarySessionExpiredError`; código `invalid_fields` da `StripeInvalidRequestError`; **todo lo demás cae en `generateV1Error`**: 400 o 404 dan `StripeInvalidRequestError`, 401 `StripeAuthenticationError`, 403 `StripePermissionError`, el resto `StripeAPIError`. Por tanto `isDefinitiveStripeRejection` (clasifica por `type`) **sigue valiendo sin cambios** para v2. `RateLimitError`/`TemporarySessionExpiredError` no son definitivos (ambiguos), igual que antes | `esm/Error.js:1-66`, `Error.d.ts:212-215` |
| `apiVersion` | `src/lib/stripe.ts` no fija `apiVersion` y se mantiene. Las llamadas v2 usan la versión del SDK | `src/lib/stripe.ts:47` |

### A verificar (no comprobable sin red; T3 lo pasa a MANUAL-TESTS y el humano lo cierra)

- (a) Que `POST /v2/core/accounts` con `dashboard: 'express'`, `fees_collector: 'application'`, `losses_collector: 'application'` y solo `stripe_transfers` se acepta para `identity.country` US en modo de prueba. Alternativa si exige otro valor: `fees_collector: 'application_express'`.
- (b) Grafía de `identity.country` (`'us'` o `'US'`) y de `defaults.currency` (`'usd'`). Se asume minúscula según la convención v2; se ajusta con el mensaje de Stripe (ahora visible en el log).
- (c) Que sin `include` la respuesta omite `configuration.recipient` y `requirements`, y que con `include: ['configuration.recipient', 'requirements']` los devuelve (lo que usa la derivación).
- (d) Que un Account Link v2 `account_onboarding` sin `configurations` abre el onboarding de la configuración `recipient` ya aplicada, y que la URL es `https://*.stripe.com` (`isStripeHostedUrl`).
- (e) Que tras completar el onboarding con datos de prueba (`000000`, SSN `000-00-0000`, routing `110000000`, cuenta `000123456789`) `stripe_transfers.status` pasa a `active`.
- (f) Que, antes de completar el onboarding, `requirements.entries` trae entradas con `awaiting_action_from: 'user'` (base de la regla `not_started`) y que tras enviar los datos desaparecen mientras Stripe verifica (`pending`).
- (g) Que un ID de cuenta v2 (`acct_...`) acepta `stripe.transfers.create({ destination })` v1 (soporte humano; lo consume 011b, no esta spec) y que **la API v1 `accounts.retrieve` ya no es necesaria**.
- (h) Código y tipo de error de `v2.core.accounts.retrieve` / `accountLinks.create` cuando la cuenta no existe o es de otra plataforma. Esperado: 404 mapeado a `StripeInvalidRequestError` (código p. ej. `account_not_found`); un 400/403 equivalente también es definitivo. Con la regla actual da `ACCOUNT_UNAVAILABLE`, sin cambios.
- (i) La ventana real de la clave de idempotencia de `v2.core.accounts.create` (se asume ≥ 24 h).
- (j) Que `account.closed === true` es una señal fiable de cuenta cerrada (ver P3).
- (k) Que el Account Link v2 admite `return_url` con el comportamiento de redirección de 011a (cookie de Clerk `SameSite=Lax` en la vuelta desde `connect.stripe.com`; sin cambios respecto a 011a (e)).

## Alcance

- Incluye:
  - Reemplazar en `connected-account.service.ts` las tres llamadas: `accounts.create` por `v2.core.accounts.create`, `accountLinks.create` por `v2.core.accountLinks.create` y `accounts.retrieve` por `v2.core.accounts.retrieve` con `include`.
  - Reescribir `toConnectedAccountSnapshot` y `deriveConnectedAccountStatus` para el objeto v2 y adaptar `ConnectedAccountSnapshot`.
  - Clave de idempotencia nueva (`nexora:connect-account-v2:<rowId>`).
  - Log de errores `invalid_request` con el `message` de Stripe saneado.
  - Actualizar los tests afectados y la documentación (system-design §8 y §5.5, state-machines §6, MANUAL-TESTS 8b).
- No incluye:
  - Cambios de esquema, de migraciones, de permisos, de rutas, de actions, de UI, de `connected-account-errors.ts`, de `src/app/**`, de `package.json` o de `.env.example`.
  - Transferencias (011b) ni `account_update` links, webhooks (`v2.core.account[...]` thin events), `update`, `close`, cuentas `customer`/`merchant`.
  - Migrar cuentas v1 existentes (se espera que no haya; ver "Esquema").
  - Editar `011a-developer-connected-accounts.md` (queda como histórico superado).

## Reutilizar

| Existente | Uso |
|---|---|
| `src/lib/stripe.ts`: `getStripe`, `getAppUrl`, `StripeConfigError`, `isDefinitiveStripeRejection`, `isStripeHostedUrl`, `stripeErrorLogFields` | Sin cambios salvo `stripeErrorLogFields` (T0). Clasificación de errores intacta (verificado arriba) |
| `connected-account.service.ts` (fases A/B/C, `assertCanManage`, `resolveStripe`, `startOnboarding`, `syncConnectedAccount`, `getConnectedAccountOverview`) | Se conserva la estructura; solo cambian las llamadas a Stripe, la clave de idempotencia y qué se lee de la respuesta |
| `connected-account-status.ts` y `.test.ts` | Misma API pública (`toConnectedAccountSnapshot`, `deriveConnectedAccountStatus`), nueva entrada y nueva lógica |
| `connected-account.types.ts` (`ConnectedAccountSnapshot`) | Cambia solo el tipo del snapshot. `ConnectedAccountStatus`, etiquetas, `Overview` y resultados no cambian |
| `connected-account-errors.ts`, actions, rutas, UI, `dashboard-link`, `payout.manage` | **Sin cambios** |
| Fake de Stripe en `connected-account.service.test.ts` | Se adapta a `v2.core.accounts.*` y `v2.core.accountLinks.create` |

## Esquema, migraciones y filas existentes (verificado)

- **Sin cambios de esquema.** `drizzle/0004_connected_accounts.sql` (tabla, enum y CHECK de formato `acct\_%`) sirve igual: las IDs de cuenta v2 también empiezan por `acct_` y el estado sigue siendo uno de los cuatro valores. No hay migración nueva (`0005` y `0006` son de otras specs).
- **No deberían existir filas con `stripe_account_id` v1**: en `ensureConnectedAccount` la Fase C (que escribe `stripe_account_id`) solo corre si `accounts.create` devolvió un `acct_`; la llamada fallaba con 400 en cada intento (informe del humano), así que solo pudo quedar la fila de la Fase A (`user_id`, `stripe_account_id` NULL, `status = 'not_started'`), que es válida y reutilizable. Comprobación manual obligatoria antes de probar (T3, MANUAL-TESTS): `SELECT user_id, stripe_account_id FROM connected_accounts WHERE stripe_account_id IS NOT NULL;` debe devolver 0 filas. Si devuelve alguna, se resetea (`DELETE ... WHERE user_id = '<id>'`, solo modo de prueba) o se sigue P2.
- **Clave de idempotencia**: 011a usó `nexora:connect-account:<rowId>`. Se cambia a `nexora:connect-account-v2:<rowId>` para no reutilizar una clave ya vista por otro endpoint y parámetros (Stripe podría responder `StripeIdempotencyError`). Sigue siendo determinista por fila.

## Archivos

| Archivo | N/M | Tarea |
|---|---|---|
| `src/lib/stripe.ts` (solo `stripeErrorLogFields` y un helper privado de saneado) | M | T0 |
| `src/lib/stripe-errors.test.ts` | M | T0 |
| `src/modules/payments/types/connected-account.types.ts` (solo `ConnectedAccountSnapshot`) | M | T1 |
| `src/modules/payments/services/connected-account-status.ts` | M | T1 |
| `src/modules/payments/services/connected-account-status.test.ts` | M | T1 |
| `src/modules/payments/services/connected-account.service.ts` | M | T2 |
| `src/modules/payments/services/connected-account.service.test.ts` | M | T2 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md` | M | T3 |

Ningún otro archivo cambia. `docs/SETUP.md §4` no cambia (no hay secciones nuevas).

## Contratos

### 1. Snapshot (T1)

```ts
export type ConnectedAccountSnapshot = {
  closed: boolean;                         // account.closed === true
  transfersStatus: "active" | "pending" | "rejected" | "restricted" | "unsupported" | string | undefined;
  userActionRequired: boolean;             // some requirements.entries[] with awaiting_action_from === "user"
  pastDue: boolean;                        // some entry with minimum_deadline.status === "past_due" (summary also counts)
};
```

`toConnectedAccountSnapshot(account: Stripe.V2.Core.Account)`: `transfersStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status`; `entries = account.requirements?.entries ?? []`. Sin `include` o con campos ausentes, no revienta: `transfersStatus` queda `undefined` y los booleanos `false`.

### 2. Derivación (T1, orden de precedencia)

1. `closed` -> `restricted`.
2. `transfersStatus === "active"` -> `active` (D-D de 011a se mantiene: basta transferencias).
3. `transfersStatus` en `rejected | restricted | unsupported` -> `restricted`.
4. `pastDue` -> `restricted`.
5. `userActionRequired` -> `not_started` (onboarding sin completar; la UI ofrece "Continuar configuración", igual que en 011a).
6. En otro caso (capacidad `pending` o ausente, sin acciones del usuario, Stripe verificando) -> `pending`.

Sustituye a la tabla RF1 de 011a (`details_submitted` y `requirements.*` v1 ya no existen). Es una heurística: v2 no tiene `details_submitted`; ver P1 y riesgo R2.

### 3. Servicio (T2)

Firmas públicas **idénticas** a 011a (`ensureConnectedAccount`, `startOnboarding`, `syncConnectedAccount`, `getConnectedAccountOverview`). Cambios:

- **Crear cuenta (Fase B)** `stripe.v2.core.accounts.create(params, { idempotencyKey: \`nexora:connect-account-v2:${row.id}\` })` con parámetros constantes salvo el id interno:

  ```ts
  {
    identity: { country: CONNECTED_ACCOUNT_COUNTRY },         // US (a verificar b)
    dashboard: "express",                                     // a verificar a
    defaults: {
      currency: CONNECTED_ACCOUNT_CURRENCY,                   // "usd" (a verificar b)
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    configuration: {
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    include: ["configuration.recipient", "requirements"],
    metadata: { nexora_user_id: actor.id },                   // solo el UUID interno, sin PII
  }
  ```

  No se envían `contact_email`, `display_name`, `configuration.customer|merchant`, `payouts` ni `card_payments`. Rechazo definitivo -> `STRIPE_NOT_CONFIGURED`; ambiguo -> `STRIPE_UNAVAILABLE`; `id` sin `acct_` -> `STRIPE_UNAVAILABLE`. Fases A y C, `ON CONFLICT`, carrera y manejo de BD como en 011a RF2.
- **Enlace (`startOnboarding`)**: `stripe.v2.core.accountLinks.create({ account, use_case: { type: "account_onboarding", account_onboarding: { refresh_url, return_url, collection_options: { fields: "currently_due" } } } })`. Mismas URLs de 011a (`/dashboard/payouts/onboarding/refresh|return`, sin ids). Sin clave de idempotencia. `isStripeHostedUrl(link.url)` o `STRIPE_UNAVAILABLE`. Rechazo definitivo -> `ACCOUNT_UNAVAILABLE`.
- **Sincronizar**: `stripe.v2.core.accounts.retrieve(id, { include: ["configuration.recipient", "requirements"] })`. Mismas defensas de `id` y `metadata.nexora_user_id`. Rechazo definitivo (cuenta inexistente u de otra plataforma, a verificar h) -> `ACCOUNT_UNAVAILABLE`, sin escribir; ambiguo -> `STRIPE_UNAVAILABLE`.
- **Defensa extra de modo de prueba**: si `account.livemode === true`, se trata como anomalía: log con `rowId` y `ACCOUNT_UNAVAILABLE` sin escribir (el cliente ya rechaza claves live; esto es cinturón y tirantes y no cuesta nada con el campo disponible).
- Constantes nuevas: `CONNECTED_ACCOUNT_CURRENCY = "usd"`. `CONNECTED_ACCOUNT_COUNTRY` pasa a la grafía a verificar (b).
- Los logs conservan las reglas de 011a: nunca `acct_`, URLs de onboarding, emails ni el objeto `Account`.

### 4. Log de errores con `message` (T0)

`stripeErrorLogFields(error)` devuelve `{ type, code, statusCode, requestId }` y, **solo si** `type === "StripeInvalidRequestError"` y `message` es un string no vacío, añade `message`: el texto de Stripe **saneado** (reemplaza por `[redacted]` cualquier token `\b(acct|cus|cs|pi|pm|ch|evt|sk|rk|pk|whsec|tr|po|ba|card)_[A-Za-z0-9_]+`, cualquier cosa con forma de email `\S+@\S+` y cualquier URL `https?://\S+`; luego recorta a 300 caracteres). Para el resto de tipos la forma exacta no cambia (sin `message`). Esto se aplica a los tres usos actuales (`connected-account.service.ts`) y a los que añada 011b. 009 y 010 conservan sus helpers privados y no cambian.

Justificación: el `message` de un `invalid_request_error` lo genera Stripe sobre la forma de la petición (parámetros, suscripción de producto) y es la pista para depurar; los demás tipos pueden incluir datos de la operación y siguen sin loguearse.

## Permisos y seguridad

Sin cambios respecto a 011a: `requireRole("developer")` + `can("payout.manage")`, cuenta buscada por `actor.id`, ningún id desde el cliente, solo claves de prueba (`getStripe`), URLs de onboarding solo como destino de redirect, nada de PII ni `acct_` en logs. El `message` saneado de T0 es la única adición a los logs.

## Criterios de aceptación

- AC1. `ensureConnectedAccount` llama a `stripe.v2.core.accounts.create` (no a `stripe.accounts`) con exactamente los parámetros de §3, sin `controller`, `type`, `capabilities`, `email` ni `country` en la raíz, y con la `idempotencyKey` `nexora:connect-account-v2:<rowId>`. Dos llamadas (o `Promise.allSettled` simultáneo) dejan una fila, una cuenta y la misma clave.
- AC2. Fallos al crear: error ambiguo -> `STRIPE_UNAVAILABLE` sin `acct` y reintento con la misma clave; rechazo definitivo -> `STRIPE_NOT_CONFIGURED`; respuesta sin `acct_` -> `STRIPE_UNAVAILABLE`; Fase C perdida: se conserva la cuenta guardada. (Igual que 011a AC7 con la llamada v2.)
- AC3. `startOnboarding` llama a `stripe.v2.core.accountLinks.create` con `account`, `use_case.type = "account_onboarding"`, `refresh_url`, `return_url` basadas en `APP_URL` (sin ids) y `collection_options.fields = "currently_due"`. URL no alojada por Stripe -> `STRIPE_UNAVAILABLE`; `status = "active"` -> `ACCOUNT_ALREADY_ACTIVE` sin llamar a Stripe; rechazo definitivo -> `ACCOUNT_UNAVAILABLE`; ambiguo -> `STRIPE_UNAVAILABLE`.
- AC4. `syncConnectedAccount` llama a `stripe.v2.core.accounts.retrieve(id, { include: ["configuration.recipient", "requirements"] })`. Sin fila o sin `acct` -> `not_started` sin llamar a Stripe. Actualiza `status` y `status_synced_at` para los cuatro estados y es idempotente. Rechazo definitivo -> `ACCOUNT_UNAVAILABLE` sin escribir; ambiguo -> `STRIPE_UNAVAILABLE` sin escribir; `id` distinto, `metadata.nexora_user_id` ajeno o `livemode === true` -> `ACCOUNT_UNAVAILABLE` sin escribir.
- AC5. `deriveConnectedAccountStatus` cumple §2, con al menos un caso por regla y por precedencia: `closed` con `active` da `restricted`; `stripe_transfers` `active` con entradas del usuario pendientes da `active`; `restricted`/`rejected`/`unsupported` dan `restricted`; `pending` con entrada `past_due` da `restricted`; `pending` con entrada `awaiting_action_from: "user"` da `not_started`; `pending` sin entradas del usuario (solo `stripe`) da `pending`; objeto sin `configuration` ni `requirements` da `pending`. `toConnectedAccountSnapshot` no lanza con campos ausentes.
- AC6. Autorización, clave live (`StripeConfigError` -> `STRIPE_NOT_CONFIGURED`), `getConnectedAccountOverview` (claves exactas `status`, `hasStripeAccount`, `statusSyncedAt`, sin llamar a Stripe) y logs sin `acct_`/URLs/emails/clave: los tests existentes de 011a siguen pasando contra el fake v2 (AC8, AC9, AC12, AC13 de 011a).
- AC7. `stripeErrorLogFields`: para `StripeInvalidRequestError` incluye `message` saneado (ids `acct_...`, `sk_...`, emails y URLs reemplazados por `[redacted]`, máximo 300 caracteres); para `StripeAPIError`, `StripeConnectionError`, `StripeIdempotencyError`, `null` y objetos sin `type` mantiene exactamente `type`, `code`, `statusCode`, `requestId` sin `message`. El log del servicio ante un 400 incluye el `message` de Stripe.
- AC8. Regresión: sin cambios en `connected-account-errors.ts`, actions, rutas, UI, `permissions`, `schema/`, `drizzle/`, `package.json`, `.env.example`, `payment-*`. Tests de actions, rutas y `dashboard-link` pasan sin modificaciones. `npm run lint`, `npm run test` y `npm run build` pasan. Ningún test usa Stripe, red, Clerk ni Neon reales.
- AC9. Documentación (T3): `system-design.md §8` con la decisión 011c-D1 (Accounts v2 sustituye a D13; D13 queda "superada") y `§5.5` sin referencias a campos v1; `state-machines.md §6` con la nueva tabla de derivación; `MANUAL-TESTS.md 8b` con la comprobación SQL de filas, los puntos "a verificar" (a) a (k) y los pasos de onboarding revisados. Solo adiciones o reemplazo de lo que quedó obsoleto de 011a; sin tocar otras secciones.

## Tests requeridos

Vitest, junto al archivo, `// @vitest-environment node`. Stripe se simula en la frontera (`vi.mock("@/lib/stripe")` como hoy) con un fake en memoria que expone `v2.core.accounts.create/retrieve` y `v2.core.accountLinks.create`. PGlite con migraciones reales. **Ningún test contra Stripe real.**

- `src/lib/stripe-errors.test.ts` (T0): actualizar el caso "sin message" (hoy exige exactamente 4 campos para cualquier error) y añadir AC7: con y sin `message`, por tipo, saneado y recorte.
- `src/modules/payments/services/connected-account-status.test.ts` (T1): reescribir table-driven con objetos v2 (AC5).
- `src/modules/payments/services/connected-account.service.test.ts` (T2): reemplazar el fake v1 por el v2 y ajustar las aserciones de parámetros y clave (AC1 a AC4, AC6); caso nuevo `livemode: true`; caso de log con `message` de Stripe.
- Sin cambios: `permissions.test.ts`, `connected-accounts-constraints.test.ts`, `connected-account.actions.test.ts`, `route.test.ts` (return y refresh), `connected-account.schema.test.ts`, `dashboard-link.test.ts`, `migrations.test.ts`, `stripe.test.ts`, `stripe-webhook.test.ts`.

## Tareas

Máximo 5. Archivos disjuntos. Durante el bloque paralelo nadie ejecuta `npm install`, `npm run build` ni `drizzle-kit`. El reviewer ejecuta lint, test y build al final.

### T0 — Log de errores con `message` saneado

- Archivos: `src/lib/stripe.ts`, `src/lib/stripe-errors.test.ts`
- Depende de: —
- Paralelizable: sí (con T1; archivos disjuntos)
- Cubre: AC7 (parte de funciones)

### T1 — Snapshot y derivación del estado para v2

- Archivos: `src/modules/payments/types/connected-account.types.ts`, `src/modules/payments/services/connected-account-status.ts`, `src/modules/payments/services/connected-account-status.test.ts`
- Depende de: —
- Paralelizable: sí (con T0)
- Cubre: AC5
- Nota: el tipo `Stripe.V2.Core.Account` se importa del SDK; si el espacio de nombres difiere, usar `import("stripe").Stripe.V2.Core.Account` o el tipo que exporte `esm/resources/V2/Core/Accounts.d.ts`, y avisar.

### T2 — Servicio de cuentas conectadas sobre Accounts v2

- Archivos: `src/modules/payments/services/connected-account.service.ts`, `src/modules/payments/services/connected-account.service.test.ts`
- Depende de: T0, T1
- Paralelizable: no (consume ambos contratos); sí con T3
- Cubre: AC1, AC2, AC3, AC4, AC6, AC7 (log del servicio), AC8

### T3 — Documentación y pruebas manuales

- Archivos: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`, `docs/architecture/state-machines.md`
- Depende de: T1 (contratos fijados en esta spec)
- Paralelizable: sí (con T2; solo documentación)
- Cubre: AC9
- Contenido (la 011a ya está en `done`; reemplazar solo lo que quedó obsoleto):
  - `system-design.md`: §8, fila nueva `011c-D1` ("Accounts v2 con `configuration.recipient` + `stripe_balance.stripe_transfers`, `dashboard: 'express'` y Account Links v2; sustituye a D13 por rechazo de Stripe a Accounts v1 en esta plataforma") y marca de "superada por 011c-D1" en D13; §5.5 con los criterios v2; §7 con la mención de v2.
  - `state-machines.md`: §6 con la tabla de derivación de §2 (sustituye la v1) y los casos límite (`closed`, `pending` sin acciones del usuario, objeto sin `include`).
  - `MANUAL-TESTS.md 8b`: precondición SQL de 0 filas con `stripe_account_id`, lista "a verificar" (a) a (k), paso de onboarding revisado (datos de prueba, `stripe_transfers.status = active`), y verificación del log con el `message` de Stripe en un 400 provocado (p. ej. país inválido temporal) sin ids ni emails.

## Riesgos

- R1. **Parámetros v2 sin verificar contra Stripe real** (a, b, d): un rechazo definitivo daría `STRIPE_NOT_CONFIGURED`. Mitigación: el log con `message` (T0) muestra qué rechaza Stripe; se ajusta una constante. Probar T0 + T2 primero.
- R2. **No hay `details_submitted` en v2**: `not_started` vs `pending` se infiere de `requirements.entries` (a verificar f). Si Stripe devolviera entradas del usuario también durante la verificación, un desarrollador "en revisión" vería "Continuar configuración". Impacto bajo (solo etiqueta; `active` no depende de esto).
- R3. **`include` obligatorio** para ver capacidad y requisitos (a verificar c); sin él la cuenta nunca llegaría a `active`. Un test lo fija.
- R4. **Mezcla de v2 (cuentas) con v1 (transferencias de 011b)**: soportado según el humano; a verificar (g) antes de 011b.
- R5. **Cuentas v1 existentes**: no se espera ninguna (ver "Esquema"); la comprobación SQL es previa a la prueba manual.
- R6. **Cuentas huérfanas** en modo de prueba si falla la Fase C (igual que 011a R3).
- R7. **Webhooks v2** (eventos thin) siguen diferidos (no se añaden).
- R8. **El SDK puede cambiar tipos v2** (open enums): la derivación usa `string` abierto y valores desconocidos caen en `pending`.

## Preguntas abiertas (con recomendación por defecto)

- P1. ¿`not_started` se infiere de entradas `awaiting_action_from: "user"` sin `past_due` (§2)? Recomendación: sí; es lo más cercano a `details_submitted` que expone v2. Alternativa: una columna local `onboarding_started_at` (cambio de esquema; descartado por YAGNI).
- P2. ¿Se resetean a mano filas con `stripe_account_id` no nulo si la consulta SQL devuelve alguna? Recomendación: sí, `DELETE` manual en modo de prueba, igual que 011a D-C.
- P3. ¿`closed === true` se trata como `restricted` o como `ACCOUNT_UNAVAILABLE`? Recomendación: `restricted` (no borra estado y la UI pide acción); si Stripe la elimina de verdad, el `retrieve` ya devolverá `ACCOUNT_UNAVAILABLE`.
- P4. ¿`fees_collector: "application"` o `"application_express"` con `dashboard: "express"`? Recomendación: empezar con `application` y cambiar solo si Stripe lo rechaza (a verificar a).
- P5. ¿País en minúscula (`us`) o mayúscula? Recomendación: minúscula `us` y `usd`, convención de v2; confirmar con el mensaje de Stripe.
- P6. ¿Se añade el `message` también a los helpers privados de 009 y 010? Recomendación: no en esta spec (no se tocan sus servicios ni tests); sí en una limpieza posterior que los unifique con `stripeErrorLogFields`.
- P7. ¿Se aplica el saneado a más prefijos de ids de Stripe (`seti_`, `price_`, ...)? Recomendación: la lista de T0 es suficiente por ahora; el recorte a 300 caracteres limita el resto.

## Próximas fases

- 011b (`developer-transfers`): transferencias v1 con `destination` = id de cuenta v2 (comprobar a verificar g antes), `transfer_group`, relectura antes de transferir. Debe leer esta spec, no la 011a, para la forma de la cuenta.
- Webhooks de Connect v2 (`v2.core.account[configuration.recipient].capability_status_updated`, thin events): diferidos (017).
- Unificar los helpers de errores de 009/010 con `src/lib/stripe.ts`.

## Corrección posterior (2026-10-18, modo BUILD, decidida por el humano)

Al probar contra Stripe real, `POST /v2/core/accounts` respondió 400 `invalid_fields`: "If configuration.recipient is supplied, the Account must have a contact email". Esto corrige §3 y AC1, que decían no enviar `contact_email`. El humano eligió enviar el correo de acceso del desarrollador (`actor.email`) como `contact_email` al crear la cuenta. El correo sigue sin loguearse (AC6 se mantiene). Cambio: `connected-account.service.ts` (un parámetro) y su test.

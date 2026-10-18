# Estado del pago y webhooks de Stripe: confirmación del pago de prueba (Fase 3 de Nexora, parte 2)

Estado: done. Aprobada por el humano con las recomendaciones por defecto en las decisiones D-A a D-L y las preguntas abiertas P1–P5. Cualquier edición posterior a la aprobación devuelve la spec a `borrador`.

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10` (mismo orden y mismas secciones que la spec 009; la sección 13 agrupa tareas y archivos como en 009). Requisitos de origen: `docs/SDD-PLAN.md §6` (Spec 010), `docs/BRIEF.md §6.4`, `§6.5`, `§7` (reglas 9 a 15), `§9`. Dominio: `docs/architecture/system-design.md §2` (entidades `paymentAttempt` y `processedPaymentEvent`, invariantes I1 a I5), `§3` (propiedad de datos), `§4` (módulos; regla "Pagos (spec 009)"; "la transición `proposal_selected -> contracted` la ejecuta el servicio de `payments` llamando a la función de transición de `projects`"), `§7` (pagos y webhooks), `§8` (D2, D10); `docs/architecture/state-machines.md §1` (`proposal_selected -> contracted` solo tras webhook verificado), `§3` (intento de pago), `§4` (transferencia independiente), `§5` (casos límite). Base: spec 003 (restricciones de `payment_attempts` y `processed_payment_events`), 004 (patrón del webhook de Clerk, `/api/webhooks/stripe` ya declarada pública), 005 (`closeProject`, `PAYMENT_IN_PROGRESS`), 008 (patrón de transacción y transición hoja), 009 (checkout y "Próximas fases"). Diseño visual de referencia (no accesible, no contractual): progreso de 4 pasos con el paso 3 "Confirmado por el servidor", estados pendiente/completado/cancelado/fallido y la leyenda de que volver desde Stripe no confirma el pago.

## Hallazgos verificados antes de escribir esta spec (lectura de `node_modules/stripe` v23.0.0 y de `node_modules/next/dist/docs`)

- `stripe@23.0.0` ya está instalado (`package.json`: `^23.0.0`). **No hace falta ninguna dependencia nueva.**
- `Stripe.webhooks` existe **estático** (`stripe.core.d.ts`: `static webhooks`) y en la instancia, con `constructEvent(payload, header, secret, tolerance?, cryptoProvider?, receivedAt?)`, `constructEventAsync`, `constructEventWithoutVerification`, **`generateTestHeaderString({ payload, secret, timestamp?, ... })`** y `generateTestHeaderStringAsync` (`Webhooks.d.ts`). Por tanto se puede probar la firma real sin red. `DEFAULT_TOLERANCE = 300` segundos (`Webhooks.js`); `tolerance = 0` desactiva la comprobación de timestamp (no se usa).
- Verificar con el método estático no necesita `STRIPE_SECRET_KEY` ni crear un cliente. `constructEvent` (síncrono) es válido en runtime Node; `constructEventAsync` es para Web Crypto (edge), que no se usa.
- Los cuatro tipos de evento existen en `Events.d.ts`: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. `Checkout.Session` expone `payment_status` (`'no_payment_required' | 'paid' | 'unpaid'`), `amount_total`, `currency`, `payment_intent` (`string | PaymentIntent | null`), `client_reference_id`, `metadata`, `livemode`, `status`.
- Next 16: `runtime` por defecto es `'nodejs'` (`route-segment-config/runtime.md`); `await request.text()` es el patrón documentado para el cuerpo crudo (`route.md`). Con `proxy.ts` presente, Next clona y bufferiza el cuerpo (límite 10 MB) para poder leerlo en el proxy y en el handler: el cuerpo llega íntegro; un evento de Stripe pesa muy por debajo del límite. `proxy.ts` (`clerkMiddleware()` sin `protect`) no cambia y `/api/(.*)` ya pasa por él sin bloquear.
- No pude abrir el artifact de diseño ni las skills/MCP de Stripe: lo relativo a eventos y reintentos de Stripe se basa en los tipos del SDK y en conocimiento general, y se marca **"a verificar manualmente"** donde hace falta (sección 11.3).

## 1. Objetivo

Que el servidor de Nexora reciba y verifique los eventos de Stripe y que **solo a partir de un evento verificado (o de una lectura autenticada de la API de Stripe, ver D-F)** el intento de pago pase de `pending` a `completed_test`, `failed` o `canceled`, y el proyecto de `proposal_selected` a `contracted` ("En contratación"), de forma atómica, idempotente y sin regresiones. La página de retorno del navegador sigue sin confirmar nada (reglas 9 y 10 de `BRIEF §7`).

Entrega:

- Ruta pública `POST /api/webhooks/stripe` fina (cuerpo crudo, firma, delega) y `STRIPE_WEBHOOK_SECRET`.
- Servicio de procesamiento `handleStripeEvent(event)` con idempotencia por `event.id` en `processed_payment_events`, en la misma transacción que los efectos.
- Núcleo de aplicación de efectos compartido (`applySessionOutcome`) y hojas de transición: `markContracted` en `projects` y `completePendingAttempt` / `failPendingAttempt` / `cancelPendingAttempt` en `payments`.
- Reconciliación mínima bajo demanda: el botón "Actualizar estado" de la página de pago relee la sesión en Stripe y aplica **el mismo núcleo**; sin cron, sin polling, sin infraestructura nueva.
- Cambios mínimos de UI para mostrar `completed_test` / "En contratación" con la leyenda correcta, sin prometer transferencia ni dinero recibido.
- Pruebas automáticas (PGlite, firma real con `generateTestHeaderString`, Stripe simulado en la frontera) y pruebas manuales con Stripe CLI.

## 2. Contexto y alcance

### 2.1 Alcance 009 vs 010 vs 011 (punto 1 del requerimiento)

| Capacidad | 009 (hecha) | 010 (esta spec) | 011 / posteriores |
|---|---|---|---|
| Cliente Stripe, checkout, intento `pending`, idempotency key, compensación | Sí | Reutiliza sin cambios | |
| Reconciliar sesión `expired` al reintentar (`Continuar en Stripe`) | Sí | Sin cambios | |
| Ruta `POST /api/webhooks/stripe`, firma, `STRIPE_WEBHOOK_SECRET` | No | **Sí** | |
| `processed_payment_events` (idempotencia por `event.id`) | No | **Sí** | |
| `pending -> completed_test` (+ `stripe_payment_intent_id`, `completed_at`) | No | **Sí** | |
| `pending -> failed` | No | **Sí** (solo por `checkout.session.async_payment_failed`, D-B) | |
| `pending -> canceled` por `checkout.session.expired` | No | **Sí** | |
| `proposal_selected -> contracted` (`markContracted`) | No | **Sí** | |
| Eventos fuera de orden, repetidos, importe/moneda distintos, `livemode` | No | **Sí** | |
| Reconciliación BD vs Stripe bajo demanda (botón "Actualizar estado") | No | **Sí** (mínima, D-F) | |
| Página de pago: mostrar `completed_test` / "En contratación" | Renderiza el estado sin romperse | Ajusta textos y reemplaza el enlace "Actualizar estado" por un botón | |
| "Mis proyectos": estado "En contratación" | Etiqueta ya existe | Añade enlace "Ver pago de prueba" | |
| Cancelación explícita iniciada por el cliente, política D2 completa | No | No (la expiración sí) | 012 |
| Rate limiting del endpoint público y de la action de refresco, auditoría | No | **No** (se anota) | 015 |
| Qué ve el desarrollador del pago | No (D-I de 009) | **No** (se mantiene fuera) | 013 |
| Paneles de cliente/admin, vista de pago para admin | No | No | 012 / 013 |
| Stripe Connect, transferencia, `simulatedTransfer`, `transferStatus` formal | No | **No**: el paso 4 sigue "Pendiente de implementación" | 011 (último paso) |

### 2.2 Decisiones humanas ya aprobadas y heredadas (no se reabren)

Solo Test Mode (eventos `livemode = true` se descartan sin procesar). El webhook es la fuente de verdad **de push** de `completed_test`/`failed` y de `proposal_selected -> contracted`; el navegador solo informa. Firma verificada con el cuerpo crudo (`await req.text()`) y `STRIPE_WEBHOOK_SECRET` antes de tocar nada; firma inválida o ausente -> 400 sin efectos. Idempotencia por `event.id` con `processed_payment_events` (`INSERT ... ON CONFLICT DO NOTHING` en la **misma** transacción que los efectos; repetido -> 2xx sin efectos). Nunca se regresa un `completed_test` a `failed`/`canceled` ni se reabre un estado terminal; `expired` sobre un intento ya `canceled` por 009 se ignora. `amount_total` y `currency` del evento deben coincidir con `payment_attempts`. El intento se localiza validando contra la BD, nunca confiando ciegamente en la metadata. 2xx solo si el efecto quedó persistido o el evento es legítimamente ignorable; 5xx ante fallo transitorio de BD. Locks coherentes con el orden existente (proyecto `FOR UPDATE` primero, luego propuesta/intento). La transferencia sigue "Pendiente de implementación" y nada muestra dinero recibido. Logs sin payloads, PII ni secretos. Stripe Connect no entra.

- Incluye:
  - T0 serial: `STRIPE_WEBHOOK_SECRET` activo en `.env.example`; `getWebhookSecret()` y `constructStripeEvent()` en `src/lib/stripe.ts`; `markContracted` en `projects/services/project-transitions.ts`; sus pruebas en archivos nuevos.
  - Servicios de `payments`: hojas de transición, núcleo `applySessionOutcome`, `handleStripeEvent`, `reconcileProjectPayment`, y los tipos nuevos.
  - Ruta `src/app/api/webhooks/stripe/route.ts` y action `refreshPaymentStatusAction` con sus pruebas.
  - UI mínima: `payment-page-view.tsx`, botón `refresh-payment-button.tsx`, enlace en `project-list.tsx`.
  - Documentación: sección "Spec 010" y actualizaciones en `docs/MANUAL-TESTS.md`; notas en `system-design.md` y `state-machines.md` (solo lo que esta spec justifica).
- No incluye:
  - Cancelación explícita del cliente y política de cierre completa (012); rate limiting del endpoint público y de la action de refresco (015, anotado en sección 8); vistas del desarrollador/admin (013/012).
  - Stripe Connect, transferencias, reembolsos, comisiones (011 y fuera del MVP); `payment_intent.payment_failed` y cualquier otro evento (D-B).
  - Cambios de esquema o migraciones, dependencias npm, cambios en `proxy.ts`, `layout.tsx`, `globals.css`, `payment-checkout.service.ts`, `payment-overview.service.ts`, `payment-errors.ts`, `payment.actions.ts`, `start-checkout-button.tsx`, `payment-progress.tsx`, `project.service.ts`, servicios de `proposals`.
  - Polling o recarga automática de la página; cron o jobs de reconciliación.
  - Tests automáticos contra Stripe real. **No los hay**: la verificación con claves reales es manual (sección 11.3).

### 2.3 Reutilizar (inventario verificado con Glob/Read/Grep; nada nuevo si ya existe)

| Existente | Uso en 010 |
|---|---|
| `src/lib/stripe.ts` (`getStripe`, `getAppUrl`, `StripeConfigError`; singleton `server-only`, frontera inyectable con `vi.mock`) | Se **extiende** con `getWebhookSecret()` y `constructStripeEvent()` (T0). Los servicios de `payments` solo importan de `@/lib/stripe` |
| `payments/schema/payment-attempts.table.ts` | **Sin cambios.** CHECK `completed_at` coherente con `completed_test`, UNIQUE de `stripe_checkout_session_id` y `stripe_payment_intent_id`, índice parcial único `pending`/`completed_test`, FK compuesta |
| `payments/schema/processed-payment-events.table.ts` | **Sin cambios.** PK `stripe_event_id`, `type`, `payment_attempt_id` nullable, `result` (`applied`/`ignored`), `received_at`. Primer uso real (010) |
| `projects/services/project-transitions.ts` (`markProposalSelected`, hoja que recibe el `executor`) | Patrón exacto para `markContracted` (se añade al mismo archivo, T0); ya tiene `project-transitions.test.ts` que **no se modifica** |
| `projects/schema/projects.table.ts` (`status`, `contracted_at`, sin CHECK que ligue `contracted_at`) | Lectura y escritura de `contracted_at` solo vía `markContracted` |
| `projects/services/project.service.ts` (`closeProject`, `hasActivePayment`) | **No se modifica ni se importa.** Contrato: bloquea el cierre con intento `pending`/`completed_test` solo en `proposal_selected`; `contracted -> closed` queda permitido |
| `payments/services/payment-checkout.service.ts`, `payment-overview.service.ts`, `payment-errors.ts` | **Sin cambios.** `createCheckoutForProject` ya responde `PAYMENT_NOT_ALLOWED` en `contracted` y `PAYMENT_ALREADY_ACTIVE` ante `completed_test`; `getProjectPaymentOverview` ya devuelve `completed_test` y `canStart/canResume` correctos. `payment-checkout.service.ts` tiene un `cancelAttempt` privado (usa `db`, no `tx`): no se refactoriza para no tocar 009 (ver D-L) |
| `proposals/services/proposal-selection.service.ts` y `payment-checkout.service.ts` | Patrón de transacción: lock del proyecto primero, guardas de estado en el `WHERE`, cualquier error revierte todo |
| `app/api/webhooks/clerk/route.ts` y `route.test.ts` | **Patrón a imitar**: 400 firma inválida, 500 ante fallo, sin PII en logs, handler solo compone; mismas formas de test (`NextRequest`, mocks) |
| `auth/**`: `requireRole`, `requireOwnership`, `can("payment.start")`, `AuthError`, `handleAuthErrorForPage` | Solo para la action de refresco (cliente dueño). La ruta del webhook es pública y no usa `auth()` |
| `payments/actions/payment.actions.ts` (patrón de action) | Patrón para `refreshPaymentStatusAction`; no se modifica (su `toResult` es privado y un archivo `"use server"` solo exporta async: duplicación pequeña aceptada, D-L) |
| `payments/components/payment-page-view.tsx`, `start-checkout-button.tsx`, `payment-progress.tsx` | La vista ya renderiza `completed_test` (paso 3 completo, paso 4 "Pendiente de implementación"); `deriveProgress` ya lo contempla: `payment-progress.tsx` **no cambia**. `start-checkout-button.tsx` es el patrón del botón nuevo |
| `projects/components/project-list.tsx`, `project-status-badge.tsx`, `PROJECT_STATUS_LABELS` (`contracted` = "En contratación") | Etiqueta y badge ya existen; solo se añade un enlace |
| `lib/db/test-db.ts` (`createTestDb`), patrón de mock `Proxy` + `holder` y `vi.mock("server-only")` de `payment-checkout.service.test.ts` | Pruebas con PGlite y migraciones reales |
| `src/components/ui` (`button`, `badge`), `buttonVariants` | UI. Ningún componente shadcn nuevo (verificado con `ls src/components/ui`) |
| `src/lib/money.ts` | Sin uso nuevo |

No existen `src/hooks` ni stores; no se necesitan. No existe ningún servicio de eventos de pago: se crea.

## 3. Requisitos funcionales

### RF1. Eventos manejados y mapeo exacto (punto 2)

Solo cuatro tipos tienen efectos. Cualquier otro tipo -> 200 sin escribir nada (D-C).

| Evento | Condición | Efecto sobre el intento | Efecto sobre el proyecto | Resultado registrado |
|---|---|---|---|---|
| `checkout.session.completed` | `payment_status = 'paid'` y validaciones OK | `pending -> completed_test` + `stripe_payment_intent_id` + `completed_at` | `proposal_selected -> contracted` (+ `contracted_at`) | `applied` |
| `checkout.session.completed` | `payment_status` distinto de `'paid'` (`unpaid`: método asíncrono; `no_payment_required`) | Ninguno (sigue `pending`) | Ninguno | `ignored` / `payment_not_paid` |
| `checkout.session.async_payment_succeeded` | igual que `completed` con `paid` | igual | igual | igual |
| `checkout.session.async_payment_failed` | intento `pending` | `pending -> failed` | Ninguno (sigue `proposal_selected`; se puede reintentar) | `applied` |
| `checkout.session.expired` | intento `pending` | `pending -> canceled` | Ninguno | `applied` |
| los cuatro | intento no `pending` | Ninguno (nunca regresa ni reabre) | Ninguno | `ignored` / `attempt_not_pending` |
| los cuatro | intento no encontrado, `client_reference_id` o metadata no coinciden, importe/moneda distintos, sin PaymentIntent | Ninguno | Ninguno | `ignored` / motivo (RF4) |
| `payment_intent.payment_failed` y todo otro tipo | -- | Ninguno | Ninguno | sin fila; 200 |

Justificación:

- **Pagos asíncronos (`unpaid`)**: en Test Mode con tarjeta (`4242...`) siempre llega `paid`. Pero la sesión se creó con métodos de pago dinámicos (009 no fija `payment_method_types`), así que si la cuenta de Stripe habilita un método de cobro diferido (débito bancario), `completed` llega `unpaid` y el resultado llega después con `async_payment_succeeded`/`async_payment_failed`. Tratar `unpaid` como pago completo violaría la regla 10; ignorarlo sin manejar los eventos asíncronos dejaría el intento `pending` para siempre (bloquea el cierre). Manejar los dos eventos asíncronos cuesta casi nada (mismo núcleo, otra etiqueta de resultado) y cierra ese hueco.
- **`failed` solo por `async_payment_failed`**: en Checkout, un rechazo de tarjeta (`4000 0000 0000 0002`) **no termina la sesión**: el cliente puede reintentar con otra tarjeta en la misma página de Stripe y cada rechazo emite `payment_intent.payment_failed`. Mapear ese evento a `failed` (estado terminal) dejaría el intento cerrado mientras la sesión sigue pagable, y un pago posterior correcto llegaría sobre un intento `failed` que no se puede reabrir (I4 vs "nunca regresar un terminal"). Por eso `payment_intent.payment_failed` **no se maneja**: una sesión abandonada tras rechazos termina en `expired -> canceled` (sin dinero movido) y una pagada con otra tarjeta termina en `completed`. `failed` solo es alcanzable con el fallo definitivo de un método asíncrono, que sí cierra la sesión. Ver D-B y P1.
- Los dos eventos `completed`/`async_payment_succeeded` aplican el mismo efecto, por lo que un segundo evento sobre el mismo intento ya completado cae en `attempt_not_pending` (ignorado) sin duplicar nada.

### RF2. Ruta `POST /api/webhooks/stripe` (punto 3)

Archivo `src/app/api/webhooks/stripe/route.ts`. Solo compone (SETUP §1.2); patrón de la ruta de Clerk:

```ts
export const runtime = "nodejs";   // explícito: el SDK es Node-only; es el valor por defecto en Next 16

export async function POST(req: NextRequest): Promise<Response>
```

Flujo:

1. `const rawBody = await req.text()` (una sola lectura, **sin** `req.json()` ni parseo previo) y `req.headers.get("stripe-signature")`.
2. `constructStripeEvent(rawBody, signature)` (RF3) dentro de `try`:
   - `StripeConfigError` (falta o es inválido `STRIPE_WEBHOOK_SECRET`) -> **500** `"Webhook not configured"` (error nuestro, no del emisor; se corrige y Stripe reintenta). Se registra solo el mensaje del error (nunca el valor).
   - Cualquier otro error (cabecera ausente o mal formada, firma que no coincide, timestamp fuera de tolerancia, JSON inválido) -> **400** `"Invalid webhook"`. **Sin escribir en BD y sin llamar al servicio.**
3. `await handleStripeEvent(event)` dentro de `try`; si lanza -> **500** `"Webhook processing failed"` (fallo transitorio de BD: Stripe reintenta; la transacción ya revirtió todo, incluida la fila del evento). Nada del payload se registra.
4. Cualquier resultado devuelto por el servicio (`applied`, `ignored`, `duplicate`, `unhandled`, `discarded`) -> **200** `"OK"`.

Reglas:

- Pública: autentica por firma; nunca `auth()` ni `auth.protect()` (spec 004 RF4 ya la lista como pública; `proxy.ts` no cambia).
- Ningún mensaje de error ni log incluye el cuerpo, la cabecera de firma ni el secreto.
- Respuestas de texto plano fijo (como la ruta de Clerk); el emisor no necesita más.
- **Tolerancia de timestamp y replay (punto 9):** se pasa explícitamente `tolerance = 300` s (`WEBHOOK_TOLERANCE_SECONDS`, igual al valor por defecto del SDK; nunca `0`). Una entrega reenviada por Stripe lleva firma y timestamp nuevos, por lo que entra en la ventana; una captura reinyectada fuera de la ventana da 400; dentro de la ventana el replay lo neutraliza la idempotencia por `event.id` (RF4).
- **Sin dependencias nuevas.** Sin cambios en `package.json`.

### RF3. `STRIPE_WEBHOOK_SECRET` y verificación en `src/lib/stripe.ts` (T0)

`.env.example` (solo T0): la línea comentada de 009 pasa a **activa**, solo el nombre y el comentario:

```
# Stripe webhook signing secret (whsec_...): the one printed by `stripe listen` locally; the Dashboard endpoint secret when deployed
STRIPE_WEBHOOK_SECRET=
```

(se elimina la línea "Spec 010 (not read by spec 009)"). El humano copia el `whsec_` que imprime `stripe listen` a `.env.local` (paso manual 14.1). **Ningún agente lee ni escribe `.env.local` ni maneja el valor.** Sin prefijo `NEXT_PUBLIC_`.

Adiciones a `src/lib/stripe.ts` (mismo archivo, misma frontera; `import "server-only"`, sin leer nada al importar):

```ts
getWebhookSecret(): string
constructStripeEvent(rawBody: string, signature: string | null): Stripe.Event
```

- `getWebhookSecret()`: lee `process.env.STRIPE_WEBHOOK_SECRET` en cada llamada (sin memoizar: no crea un cliente), `trim()`. Ausente o vacío -> `StripeConfigError("STRIPE_WEBHOOK_SECRET is not defined. Set it in .env.local (the whsec_... printed by `stripe listen`).")`. Si no empieza por `whsec_` -> `StripeConfigError("STRIPE_WEBHOOK_SECRET has an unexpected format; expected a Stripe webhook signing secret (whsec_...).")`. Ningún mensaje incluye el valor ni parte de él.
- `constructStripeEvent(rawBody, signature)`: si `signature` es `null` o vacía lanza un error de firma (no `StripeConfigError`); si no, `Stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret(), WEBHOOK_TOLERANCE_SECONDS)` (**método estático: no necesita `STRIPE_SECRET_KEY` ni crea cliente**; **a verificar en T0** que el estático existe en la versión instalada, ya confirmado en los tipos). Orden: primero valida el secreto (si falta, `StripeConfigError`), luego la firma. Constante exportada `WEBHOOK_TOLERANCE_SECONDS = 300`.
- Por estar en la frontera `@/lib/stripe`, los tests de servicios pueden sustituirla con `vi.mock`; los tests de la ruta usan la implementación real con `vi.stubEnv` (RF10).

### RF4. Servicio de procesamiento `handleStripeEvent` (punto 4)

Archivo `src/modules/payments/services/payment-event.service.ts` (`import "server-only"`):

```ts
handleStripeEvent(event: Stripe.Event): Promise<StripeEventOutcome>

type StripeEventOutcome =
  | { result: "applied"; reason: AppliedReason }
  | { result: "ignored"; reason: IgnoredReason }
  | { result: "duplicate" }
  | { result: "unhandled" }
  | { result: "discarded"; reason: "livemode" };

type AppliedReason = "completed" | "completed_project_not_selected" | "failed" | "canceled";
type IgnoredReason =
  | "attempt_not_found" | "reference_mismatch" | "attempt_not_pending" | "payment_not_paid"
  | "amount_mismatch" | "currency_mismatch" | "missing_payment_intent";
```

Los tipos se declaran en `payment.types.ts` (T1). Recibe un evento **ya verificado** (la firma es de la ruta). Secuencia:

1. **Descartar livemode** (sin BD): `event.livemode !== false` o `session.livemode !== false` -> `{ result: "discarded" }`, log `warn` con `event.id` y `type`. No se escribe fila (no son datos de este entorno).
2. **No manejado** (sin BD): `event.type` fuera de los cuatro de RF1 -> `{ result: "unhandled" }`. No se registra fila: `processed_payment_events` no debe crecer con cada evento ajeno de una cuenta de Stripe compartida (D-C). Se recomienda suscribir el endpoint solo a los cuatro tipos (manual 11.3).
3. **Una transacción** (`db.transaction`), en este orden:
   1. `INSERT INTO processed_payment_events (stripe_event_id, type, result) VALUES (event.id, event.type, 'ignored') ON CONFLICT (stripe_event_id) DO NOTHING RETURNING stripe_event_id`. Sin fila devuelta -> **duplicado**: se sale con `{ result: "duplicate" }` **sin ningún efecto** (200). Si dos entregas del mismo evento llegan a la vez, la segunda espera al commit de la primera por la PK y luego recibe `DO NOTHING`; si la primera revierte, la segunda inserta y procesa. El `'ignored'` es provisional: nadie lo observa porque la fila se actualiza en la misma transacción (paso 3.3).
   2. `applySessionOutcome(tx, { outcome, session })` (RF5) con `outcome`: `completed` | `async_payment_succeeded` -> `"completed"`; `async_payment_failed` -> `"failed"`; `expired` -> `"expired"`.
   3. `UPDATE processed_payment_events SET result = :result, payment_attempt_id = :attemptId WHERE stripe_event_id = :id` con el resultado final y el id del intento (o `NULL`).
4. Cualquier error lanzado en la transacción revierte **todo** (efectos y fila del evento) y se propaga: la ruta responde 500 y Stripe reintenta.
5. Log de una línea, `console.info("[payments] stripe event", { eventId, type, result, reason })`. Nunca `event.data`, la sesión, `customer_details` (contiene email), URLs ni secretos. Las anomalías (RF5) usan `console.error` con `eventId`, `attemptId` y el motivo, nada más.

### RF5. Núcleo `applySessionOutcome` y orden de locks (punto 5)

Archivo `src/modules/payments/services/payment-session-effects.ts` (`import "server-only"`). Lo usan `handleStripeEvent` (webhook) y `reconcileProjectPayment` (RF7): **una sola implementación de las reglas**, sin duplicar lógica (DRY).

```ts
applySessionOutcome(
  tx: Tx,
  input: { outcome: "completed" | "failed" | "expired"; session: Stripe.Checkout.Session },
): Promise<{ result: "applied" | "ignored"; reason: AppliedReason | IgnoredReason; attemptId: string | null }>
```

Dentro de la transacción del llamador, **orden de locks: proyecto -> intento** (el mismo orden de `closeProject`, `selectProposal` y `createCheckoutForProject`: proyecto primero; la propuesta ganadora es terminal y 010 no necesita bloquearla):

1. Localizar el intento **solo por `stripe_checkout_session_id = session.id`** (lectura simple, sin lock: `id`, `projectId`, `proposalId`, `clientId`, `status`, `amountCents`, `currency`). Sin `session.id` string o sin fila -> `ignored` / `attempt_not_found` (`attemptId: null`). La metadata **no** sirve para localizar (D-D).
2. `SELECT id, status FROM projects WHERE id = :projectId FOR UPDATE` (primer lock).
3. `SELECT id, status, ... FROM payment_attempts WHERE id = :attemptId FOR UPDATE` (segundo lock; relee el estado ya bajo el lock del proyecto).
4. **Validación cruzada contra la BD** (nunca confiar ciegamente): `session.client_reference_id` debe ser `attempt.id`; si `session.metadata` trae `payment_attempt_id`, `project_id`, `proposal_id` o `client_id`, cada uno debe coincidir con la fila del intento. Si no -> `ignored` / `reference_mismatch` + `console.error` (señal de seguridad).
5. Según `outcome`:
   - `expired`: intento `pending` -> `cancelPendingAttempt` (`applied` / `canceled`); no `pending` -> `ignored` / `attempt_not_pending` (cubre `expired` sobre un intento ya `canceled` por 009 y sobre un `completed_test`).
   - `failed`: intento `pending` -> `failPendingAttempt` (`applied` / `failed`); no `pending` -> `ignored` / `attempt_not_pending` (un `failed` tardío nunca toca un `completed_test`).
   - `completed`:
     1. intento no `pending` -> `ignored` / `attempt_not_pending` (cubre el segundo evento del mismo pago y cualquier intento terminal; si el intento está `canceled` o `failed`, además `console.error` de anomalía: una sesión pagada sobre un intento ya cerrado nunca lo reabre);
     2. `session.payment_status !== 'paid'` -> `ignored` / `payment_not_paid`;
     3. `session.currency?.toLowerCase() !== attempt.currency.toLowerCase()` -> `ignored` / `currency_mismatch`; `session.amount_total !== attempt.amountCents` -> `ignored` / `amount_mismatch` (ambos con `console.error`, sin importes en el log). **El intento sigue `pending`; no se completa** (D-E);
     4. id del PaymentIntent (`typeof session.payment_intent === "string" ? it : it?.id`) ausente -> `ignored` / `missing_payment_intent`;
     5. `completePendingAttempt(tx, { attemptId, paymentIntentId })`; si no actualiza fila (imposible bajo el lock) -> `ignored` / `attempt_not_pending`;
     6. Si `project.status === 'proposal_selected'` -> `markContracted(tx, projectId)`; si devuelve `false` (imposible bajo el lock) se lanza un error y la transacción revierte; resultado `applied` / `completed`.
     7. Si el proyecto **no** está en `proposal_selected` (p. ej. `closed`) -> **no se contrata** (RF6); el intento queda `completed_test`; `applied` / `completed_project_not_selected`.

Hojas de transición:

- `projects/services/project-transitions.ts` (T0), mismo archivo y estilo que `markProposalSelected`: `markContracted(executor, projectId): Promise<boolean>` = `UPDATE projects SET status = 'contracted', contracted_at = now WHERE id = :id AND status = 'proposal_selected' RETURNING id`; `true` solo si actualizó una fila. No importa `db`, `project.service` ni nada de `payments`.
- `payments/services/payment-transitions.ts` (T1): hojas que reciben el `executor` (no importan `db`), cada una con su guarda en el `WHERE`:
  - `completePendingAttempt(executor, { attemptId, paymentIntentId })`: `SET status = 'completed_test', stripe_payment_intent_id, completed_at = now WHERE id AND status = 'pending'` (cumple el CHECK de `completed_at`).
  - `failPendingAttempt(executor, attemptId)`: `SET status = 'failed' WHERE id AND status = 'pending'`.
  - `cancelPendingAttempt(executor, attemptId)`: `SET status = 'canceled' WHERE id AND status = 'pending'`.
  - Todas devuelven `boolean`.
- Ninguna llamada a Stripe ocurre dentro de la transacción. `payments` importa `markContracted` de `projects/services/project-transitions` (dependencia permitida: `payments -> projects`; no importa `project.service`).
- Por qué no hay deadlock: el webhook toma proyecto -> intento; `closeProject` y `createCheckoutForProject` toman proyecto primero y leen o escriben intentos después; `selectProposal` toma proyecto -> propuesta; los `UPDATE` de 009 fuera de transacción (`storeSessionId`, `cancelAttempt`) toman solo el lock de la fila del intento y no esperan a ningún otro. Dos eventos distintos del mismo proyecto se serializan por el lock del proyecto; la clave de `processed_payment_events` que cada transacción toma al inicio es única por evento y ningún otro flujo la espera, por lo que no forma ciclos.

### RF6. Caso límite: el proyecto ya no está en `proposal_selected` cuando llega el evento (punto 6)

Con `closeProject` hoy es prácticamente imposible (con un intento `pending` el cierre responde `PAYMENT_IN_PROGRESS`, y se serializa con el webhook por el lock del proyecto), pero puede ocurrir por cierre forzado fuera de la app o por datos antiguos. Razonamiento:

- `closed` es terminal y `contracted` solo se alcanza desde `proposal_selected` (`state-machines §1`): **no se contrata ni se reabre** (I1: la selección no se reabre; D2).
- El pago y el proyecto son entidades independientes (I3) y el evento verificado es un hecho consumado en Stripe: dejar el intento `pending` para siempre mentiría sobre un pago ya confirmado, y un intento activo huérfano en un proyecto cerrado no se puede cancelar desde ningún flujo de la app.
- Decisión (D-G): el intento pasa a `completed_test` (con PaymentIntent y `completed_at`), el proyecto **no cambia**, el resultado registrado es `applied` con motivo `completed_project_not_selected`, se emite `console.error` de anomalía (`eventId`, `attemptId`, estado del proyecto) para revisión manual y la ruta responde 200. No se crea ningún intento nuevo ni se muestra como dinero recibido (I5, regla 14). La página de pago de ese proyecto muestra el panel de `completed_test` con el texto genérico "Pago de prueba confirmado por el servidor. No se movió dinero real." sin afirmar "En contratación" (RF9).
- Carrera real entre `closeProject` y el webhook: ambos toman el lock del proyecto. Si cierra primero -> el cierre fue permitido solo porque el intento ya no estaba `pending` (D2); si el webhook va primero -> el proyecto queda `contracted` y luego `contracted -> closed` es válido (`closeProject` permite cerrar desde `contracted`) sin tocar el intento `completed_test`.

### RF7. Reconciliación mínima bajo demanda (punto 7; resuelve la política D2/R4 para 010)

**Qué cubre 010 de D2/R4:**

- `checkout.session.expired` cancela el intento `pending` y, con ello, desbloquea `closeProject` (el cierre solo mira `pending`/`completed_test`). Cubre el abandono con el webhook funcionando.
- Una sesión que nunca emite `expired` útil (webhook caído o sin `stripe listen`) se resuelve con la **reconciliación bajo demanda** de esta sección.
- La **cancelación explícita** iniciada por el cliente (botón "Cancelar intento") es de la spec 012; D2 queda cerrada del lado servidor con 010 y del lado UX con 012.

**Mecanismo mínimo (D-F):** un botón "Actualizar estado" (acción de servidor, **POST explícito**, no un GET con efectos) que relee la sesión en Stripe y aplica el mismo núcleo de RF5. Se descartan: escribir en el render de la página (un GET no cambia estados, 009 RF6), un endpoint manual aparte, cron o polling (infraestructura que no se pide).

Archivo `src/modules/payments/services/payment-reconciliation.service.ts` (`import "server-only"`):

```ts
reconcileProjectPayment(actor: AuthUser, projectId: string): Promise<ReconcileResult>

type ReconcileResult = { outcome: "completed" | "canceled" | "unchanged" | "none" };
```

1. `can(actor.role, "payment.start")` -> si no, `AuthError("FORBIDDEN")` (developer y admin; sin BD ni Stripe). Después `getStripe()`: `StripeConfigError` -> `PaymentError("STRIPE_NOT_CONFIGURED")`.
2. Lectura sin lock: proyecto (inexistente o ajeno, sin `allowAdmin` -> `AuthError("NOT_FOUND")`) y su intento más reciente. Si no hay intento `pending` con `stripe_checkout_session_id` -> `{ outcome: "none" }` **sin llamar a Stripe**.
3. `stripe.checkout.sessions.retrieve(sessionId)` **fuera de la transacción**; error -> `PaymentError("STRIPE_UNAVAILABLE")` sin cambiar estado. Si `session.livemode !== false` -> `PaymentError("STRIPE_NOT_CONFIGURED")` sin cambios.
4. Mapeo del estado leído: `status = 'complete'` y `payment_status = 'paid'` -> `"completed"`; `status = 'expired'` -> `"expired"`; cualquier otro (`open`, o `complete` con `unpaid`) -> `{ outcome: "unchanged" }` sin transacción. (La lectura no puede distinguir un fallo asíncrono de un pendiente: por eso la reconciliación nunca produce `failed`.)
5. `db.transaction(tx => applySessionOutcome(tx, { outcome, session }))` **sin** fila de `processed_payment_events` (no hay `event.id`); la idempotencia la dan las guardas `WHERE status = 'pending'` y los locks. `applied` -> `completed` o `canceled`; `ignored` -> `unchanged`.
6. El navegador no aporta estado: solo dispara una relectura al servidor, que consulta a Stripe con la clave secreta. La URL de retorno (`?checkout=`) sigue sin tener efecto.

Action `src/modules/payments/actions/payment-reconciliation.actions.ts` (`"use server"`): `refreshPaymentStatusAction(projectId): Promise<RefreshActionResult>` con `type RefreshActionResult = { ok: true; outcome: ReconcileResult["outcome"] } | PaymentActionResult`. Flujo (patrón de `startCheckoutAction`): `requireRole("client")` en `try` con `handleAuthErrorForPage`; `refreshPaymentInputSchema` (reutiliza `startCheckoutInputSchema`, UUID; no UUID -> `{ ok: false, code: "NOT_FOUND" }`); servicio en `try` con `toResult` (mismos mensajes de `PAYMENT_ERROR_MESSAGES`); éxito -> `revalidatePath` de `/projects/<id>/payment` y `/dashboard/projects` y `{ ok: true, outcome }`.

### RF8. Cambios de UI mínimos (punto 8)

Solo lo imprescindible; sin polling ni recarga automática (P3 de 009 se mantiene: botón manual).

- `payments/components/refresh-payment-button.tsx` (`"use client"`): `RefreshPaymentButton({ projectId })`; `useTransition`; llama `refreshPaymentStatusAction`; deshabilitado con texto "Actualizando..." mientras corre; al terminar `router.refresh()` siempre; si `ok: false` muestra el mensaje en `role="alert"` dentro de `aria-live="polite"`; si `ok: true` y `outcome` es `unchanged` muestra en `role="status"`: "Stripe todavía no confirma el pago."; objetivo táctil >= 40 px. Patrón de `start-checkout-button.tsx`.
- `payments/components/payment-page-view.tsx` (T3), cambios acotados:
  - El `Link` "Actualizar estado" (recarga) se sustituye por `<RefreshPaymentButton projectId={project.id} />`, visible solo cuando `canResume`.
  - Texto de `pending`: "Pendiente de confirmación del servidor. Si ya pagaste en Stripe, puede tardar unos segundos; usa «Actualizar estado» para consultar de nuevo." (se elimina la promesa "se actualizará sola").
  - Texto de `completed_test` según el estado del **proyecto**: si `project.status === 'contracted'`: "Pago de prueba confirmado por el servidor. El proyecto está en contratación. No se movió dinero real y la transferencia al desarrollador sigue pendiente de implementación." En cualquier otro estado (p. ej. `closed`, caso RF6): "Pago de prueba confirmado por el servidor. No se movió dinero real." (sin afirmar contratación).
  - Sin otros cambios: el progreso ya muestra paso 3 completo y el paso 4 "Pendiente de implementación"; la leyenda "Volver desde Stripe no confirma el pago..." y el banner de Modo de prueba se mantienen; `canceled` y `failed` siguen mostrando su etiqueta y el botón "Reintentar pago de prueba".
- `projects/components/project-list.tsx` (T3): para `status === "contracted"` un `Link` "Ver pago de prueba" (variante `outline`, `h-9`, foco visible, igual que "Ver propuestas") a `/projects/${id}/payment`. La etiqueta "En contratación" ya existe y no se toca. No se añade ningún texto de "dinero recibido" ni de transferencia.
- Errores de dominio nuevos: **ninguno** (la reconciliación reutiliza `STRIPE_UNAVAILABLE`, `STRIPE_NOT_CONFIGURED`; el webhook no tiene errores de usuario).
- Qué ve el desarrollador: **nada nuevo** (D-I de 009 y 013 se mantienen; "Mis propuestas" sigue mostrando "Aceptada"/"Rechazada"). Cuando 013 lo añada, mostrará "Completado en Test Mode" y la transferencia "Pendiente de implementación", nunca dinero recibido.

## 4. Requisitos no funcionales

- Server-only: servicios de `payments` y `lib/stripe.ts`. La ruta solo compone; la lógica vive en servicios; las hojas reciben el `executor` y no importan `db`.
- Sin dependencias npm nuevas, sin migraciones, sin cambios de esquema.
- Ninguna llamada a Stripe dentro de una transacción con locks, salvo que no hay ninguna en el camino del webhook (el evento ya trae los datos) y la reconciliación lee antes de abrir la transacción.
- Transacciones cortas: una por evento, sin I/O externo. El endpoint debe responder rápido (Stripe espera 2xx en pocos segundos).
- Archivos pequeños por responsabilidad: `lib/stripe` (SDK y firma), `payment-transitions` (UPDATEs con guarda), `payment-session-effects` (reglas), `payment-event.service` (idempotencia y despacho), `payment-reconciliation.service` (lectura bajo demanda).
- Logs: solo `eventId`, `type`, `result`, `reason`, `attemptId`, `error.type`/`code` de Stripe; nunca payloads, sesiones, URLs, `customer_details`, firmas ni secretos.
- Accesibilidad: el botón nuevo con `aria-live`, foco visible y objetivo táctil >= 40 px.

## 5. Reglas de negocio

- R1. Solo un evento verificado en servidor (firma válida) o una lectura autenticada de la API de Stripe hecha por el servidor (D-F) puede dejar un intento en `completed_test`/`failed`/`canceled` o contratar un proyecto. La página de retorno y el navegador nunca (`BRIEF §7` reglas 9 y 10; I4).
- R2. `proposal_selected -> contracted` ocurre solo junto a `pending -> completed_test` del intento ganador, en la misma transacción (`state-machines §1`).
- R3. Un `completed_test` jamás cambia; `failed` y `canceled` jamás se reabren ni se completan (`BRIEF §7` regla 12; `state-machines §3`). Un evento tardío o repetido no revierte nada.
- R4. Un evento repetido (mismo `event.id`) no cambia estado (regla 11).
- R5. Importe y moneda del evento deben coincidir con los del intento (copiados de la propuesta en servidor, I2); si no, no se completa (D-E).
- R6. Solo Test Mode: eventos con `livemode = true` se descartan (I5, regla 15).
- R7. El pago y la transferencia son independientes (I3): contratar no implica transferencia; el paso 4 sigue "Pendiente de implementación" y nunca aparece como completo ni como dinero recibido (reglas 14 y 15).
- R8. Los pagos completados en Test Mode no son ingresos ni dinero recibido (regla 13).
- R9. Un `failed` o `canceled` mantiene el proyecto en `proposal_selected` y permite un intento nuevo (`state-machines §5`).
- R10. Ningún dato de tarjeta ni de cliente de Stripe se guarda ni se registra.

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones. Se usan por primera vez: `processed_payment_events` (`stripe_event_id` PK, `type`, `payment_attempt_id`, `result`, `received_at`) y, de `payment_attempts`, `status`, `stripe_payment_intent_id`, `completed_at`; de `projects`, `status` y `contracted_at`. Observaciones:

- `processed_payment_events.result` es NOT NULL con valores `applied`/`ignored`: por eso la fila se inserta con `'ignored'` provisional y se actualiza en la misma transacción. No se añade un tercer valor (`duplicate`/`unhandled` no se almacenan: el duplicado ya tiene su fila original; los no manejados no se registran).
- Un evento `ignored` por `attempt_not_found` se registra con `payment_attempt_id = NULL`; el motivo no se persiste (no hay columna; YAGNI), solo se registra en el log del servidor.
- No hay CHECK que ligue `projects.contracted_at` con `status`; lo garantiza `markContracted` y sus pruebas.
- `stripe_payment_intent_id` es UNIQUE: una colisión (un PaymentIntent ya guardado en otro intento) es deterministamente imposible con sesiones propias; si ocurriera, la transacción revertiría y la ruta respondería 500 en bucle (riesgo R7).

## 7. Contratos de servidor o API

- Ruta: `POST /api/webhooks/stripe` (RF2): `200 OK`, `400 Invalid webhook`, `500 Webhook not configured | Webhook processing failed`. Cabecera requerida `Stripe-Signature`; cuerpo crudo.
- `src/lib/stripe.ts`: `getWebhookSecret()`, `constructStripeEvent()`, `WEBHOOK_TOLERANCE_SECONDS` (RF3).
- Servicios: `handleStripeEvent` (RF4), `applySessionOutcome` (RF5, interno del módulo), `reconcileProjectPayment` (RF7). Hojas: `markContracted`, `completePendingAttempt`, `failPendingAttempt`, `cancelPendingAttempt`.
- Action: `refreshPaymentStatusAction` (RF7).
- Tipos (`payment.types.ts`, T1): `StripeEventOutcome`, `AppliedReason`, `IgnoredReason`, `ReconcileResult`, `RefreshActionResult`.
- Contrato heredado de 009 que 010 cumple: localiza por `stripe_checkout_session_id`, valida `client_reference_id`/metadata (`payment_attempt_id`, `project_id`, `proposal_id`, `client_id`) y trata `expired` sobre un intento ya `canceled` como `ignored`.

## 8. Permisos y seguridad

- **Cuerpo crudo y firma (punto 9):** `await req.text()` antes de cualquier parseo; `constructEvent` con `STRIPE_WEBHOOK_SECRET` antes de leer un solo campo del evento; firma ausente o inválida -> 400 sin efectos; secreto ausente -> 500 (nunca se acepta un evento sin verificar).
- **Timestamp y replay:** tolerancia 300 s; replays dentro de la ventana neutralizados por `event.id` + PK; fuera de la ventana -> 400.
- **`livemode`:** descartado sin tocar BD; además la BD tiene `CHECK livemode = false`.
- **Importe y moneda:** deben coincidir con el intento; si no, no se completa y se registra el motivo (sin importes) en el log.
- **Localización del intento:** por session id (UNIQUE), validando `client_reference_id` y metadata contra la fila; la metadata sola nunca decide.
- **Secretos fuera de logs y respuestas:** `STRIPE_WEBHOOK_SECRET` solo en servidor, validado con mensajes que no incluyen el valor, sin `NEXT_PUBLIC_`; respuestas con texto fijo.
- **Datos del cliente de Stripe:** el objeto de sesión incluye `customer_details` (email): no se persiste ni se registra.
- Autorización de la action de refresco en capas: `requireRole("client")`, `can("payment.start")` y `requireOwnership` sin admin; ajeno o inexistente -> 404; rol incorrecto -> 403. La ruta del webhook es pública por diseño.
- **Rate limiting (spec 015):** el endpoint público del webhook (coste de HMAC por petición no autenticada) y la action de refresco (cada clic llama a Stripe) quedan sin límite de tasa en 010; **se anota para la spec 015**. Mitigación parcial: la action llama a Stripe solo si hay un intento `pending` con sesión y solo para el cliente dueño.

## 9. Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Firma ausente, inválida, cuerpo alterado, timestamp > 300 s | 400, sin efectos |
| `STRIPE_WEBHOOK_SECRET` ausente o con formato inválido | 500 (`StripeConfigError`), sin efectos |
| Fallo transitorio de BD durante el procesamiento | 500; la transacción revirtió todo (incluida la fila del evento); Stripe reintenta |
| Evento repetido (mismo `event.id`) | 200, `duplicate`, sin efectos ni segunda fila |
| Dos entregas simultáneas del mismo evento | Una `applied`, la otra `duplicate`; un solo `contracted` |
| `completed` con `paid`, intento `pending`, proyecto `proposal_selected` | Intento `completed_test` + PaymentIntent + proyecto `contracted` + fila `applied`, una transacción |
| `completed` con `unpaid` | `ignored`/`payment_not_paid`; luego `async_payment_succeeded` completa; `async_payment_failed` -> `failed` |
| `expired` sobre `pending` | `canceled`; `closeProject` deja de bloquear |
| `expired` sobre `canceled` (009), `completed_test` o `failed` | `ignored`/`attempt_not_pending` |
| `async_payment_failed` o `failed` tardío sobre `completed_test` | `ignored`/`attempt_not_pending` |
| `completed` sobre `canceled`/`failed` | `ignored`/`attempt_not_pending` + log de anomalía; nunca reabre |
| Importe o moneda distintos | `ignored`; intento sigue `pending`; 200 (el reintento no lo arreglaría); queda para revisión manual |
| `livemode = true` | `discarded`; 200; sin BD |
| Sesión desconocida (p. ej. `stripe trigger` o evento de otra app en la misma cuenta) | `ignored`/`attempt_not_found`; 200; fila con `payment_attempt_id` NULL (D-D) |
| `client_reference_id`/metadata no coinciden con la BD | `ignored`/`reference_mismatch`; 200 |
| Sin PaymentIntent en una sesión pagada | `ignored`/`missing_payment_intent`; 200 + log |
| Proyecto ya `closed` al llegar `completed` | Intento `completed_test`, proyecto sin cambios, `applied`/`completed_project_not_selected`, anomalía en log (RF6) |
| Evento de tipo no manejado (`payment_intent.payment_failed`, etc.) | `unhandled`; 200; sin fila |
| Rechazo de tarjeta de prueba (`4000 0000 0000 0002`) | La sesión sigue abierta y el intento `pending`; sin `failed`; al pagar luego con `4242` en la misma sesión -> `completed` |
| Retorno `?checkout=success` antes del webhook | Panel `pending`; nunca "pagado" (sin cambios de 009) |
| "Actualizar estado" con webhook caído | Relee Stripe y aplica `completed`/`expired`; con `open` -> "Stripe todavía no confirma el pago." |
| "Continuar en Stripe" con sesión ya `complete` y webhook pendiente | `PAYMENT_ALREADY_ACTIVE` (009, sin cambios); el cliente usa "Actualizar estado" |

## 10. Criterios de aceptación verificables

Entorno, frontera y hojas:

- AC1. `package.json` y `package-lock.json` **no cambian**. `.env.example` tiene `STRIPE_WEBHOOK_SECRET=` activa (solo el nombre, sin valor, sin `NEXT_PUBLIC_`) y ya no contiene la línea "Spec 010 (not read by spec 009)".
- AC2. `getWebhookSecret()` lanza `StripeConfigError` (sin el valor en el mensaje) si falta, está vacío o no empieza por `whsec_`, y devuelve el secreto válido; `constructStripeEvent` devuelve el evento con firma válida y lanza (error que no es `StripeConfigError`) con cabecera ausente o vacía, cuerpo alterado, secreto distinto o timestamp anterior a 300 s; con secreto ausente lanza `StripeConfigError`. Importar el módulo sin variables no lanza.
- AC3. `markContracted(executor, projectId)` devuelve `true` y deja `status = 'contracted'` con `contracted_at` no nulo solo desde `proposal_selected`; devuelve `false` y no cambia nada desde `draft`, `published`, `contracted` y `closed`; no modifica otras columnas salvo `updated_at`.

Ruta:

- AC4. `POST /api/webhooks/stripe`: lee el cuerpo con `req.text()`; firma ausente o inválida, cuerpo alterado o timestamp fuera de tolerancia -> 400 y `handleStripeEvent` **no** se llama; `StripeConfigError` -> 500; `handleStripeEvent` lanza -> 500; cualquier resultado devuelto -> 200; textos fijos; ninguna respuesta ni log incluye cuerpo, firma o secreto.
- AC5. La ruta solo compone: sin SQL, sin `auth()`, sin `req.json()`; exporta `runtime = "nodejs"`; `proxy.ts` no cambia.

Procesamiento de eventos (todos con PGlite y migraciones reales):

- AC6. `checkout.session.completed` con `paid`, importe y moneda iguales, intento `pending` y proyecto `proposal_selected` deja: intento `completed_test` con `stripe_payment_intent_id` y `completed_at`; proyecto `contracted` con `contracted_at`; **una** fila en `processed_payment_events` (`result = 'applied'`, `type`, `payment_attempt_id` del intento); todo en una sola transacción.
- AC7. Idempotencia: el mismo `event.id` por segunda vez devuelve `duplicate`, sin cambios y con una sola fila; dos entregas simultáneas (`Promise.allSettled`) dejan exactamente un `applied`, un `duplicate` y un solo `contracted`.
- AC8. `checkout.session.expired` sobre `pending` -> `canceled`, proyecto sin cambios, fila `applied`; después `closeProject` ya no responde `PAYMENT_IN_PROGRESS`. `expired` sobre un intento `canceled` (como lo deja 009), `completed_test` o `failed` -> `ignored`/`attempt_not_pending`, sin cambios, con fila registrada.
- AC9. `async_payment_failed` sobre `pending` -> `failed`, proyecto `proposal_selected`, `canStart` verdadero (se puede reintentar); sobre `completed_test` -> `ignored`. `completed` con `payment_status = 'unpaid'` -> `ignored`/`payment_not_paid` con intento `pending`; un `async_payment_succeeded` posterior con `paid` -> `completed_test` + `contracted`. `payment_intent.payment_failed` y otros tipos -> `unhandled` (200), sin fila ni cambios.
- AC10. Sin regresión: ningún evento cambia un `completed_test` a otro estado; `failed`/`canceled` nunca vuelven a `pending` ni pasan a `completed_test` (`completed` sobre `canceled` -> `ignored`); verificado tras cada caso con una invariante común.
- AC11. Importe o moneda distintos al intento -> `ignored`/`amount_mismatch` o `currency_mismatch`, intento `pending`, proyecto sin cambios, fila `ignored`, `console.error` sin importes.
- AC12. `event.livemode = true` (o `session.livemode = true`) -> `discarded`: ninguna escritura en BD (ni intento, ni proyecto, ni fila de evento).
- AC13. Localización: solo por `stripe_checkout_session_id`; sesión sin intento -> `ignored`/`attempt_not_found` con fila `payment_attempt_id` NULL y 200; `client_reference_id` distinto del intento o metadata (`payment_attempt_id`, `project_id`, `proposal_id`, `client_id`) distinta de la BD -> `ignored`/`reference_mismatch` sin cambios; una sesión con metadata correcta pero session id desconocido nunca localiza un intento; sesión pagada sin PaymentIntent -> `ignored`/`missing_payment_intent`.
- AC14. Atomicidad: si `markContracted` (simulado con un fallo inyectado) o la actualización final falla, la transacción revierte **todo**: intento `pending`, proyecto `proposal_selected` y **ninguna** fila del evento; el reenvío del mismo evento después se aplica con éxito.
- AC15. Proyecto no `proposal_selected` al completar (sembrado `closed`): intento `completed_test`, proyecto sigue `closed`, `applied`/`completed_project_not_selected`, `console.error` de anomalía, no se crea intento nuevo.
- AC16. Orden de locks (revisión del reviewer por lectura del SQL): dentro de `db.transaction`, el primer statement es el `INSERT ... ON CONFLICT DO NOTHING` del evento, el primer lock es `SELECT ... FOR UPDATE` del proyecto, el segundo el del intento; ninguna llamada a Stripe dentro de la transacción; cada `UPDATE` de transición lleva su guarda de estado en el `WHERE`.
- AC17. Logs: ninguna prueba encuentra en `console.*` el cuerpo, la sesión, `customer_details`, la firma ni el secreto (se espía `console` con un evento que los contiene).

Reconciliación y action:

- AC18. `reconcileProjectPayment`: sesión `complete`+`paid` -> `completed` (intento `completed_test`, proyecto `contracted`); `expired` -> `canceled`; `open` o `complete`+`unpaid` -> `unchanged` sin escribir; sin intento `pending` con sesión -> `none` y **sin llamar a Stripe**; error de `retrieve` -> `STRIPE_UNAVAILABLE` sin cambios; `livemode` true -> `STRIPE_NOT_CONFIGURED` sin cambios; importe distinto -> `unchanged`; `StripeConfigError` -> `STRIPE_NOT_CONFIGURED`; `developer`/`admin` -> `FORBIDDEN` sin BD ni Stripe; ajeno o inexistente -> `NOT_FOUND`.
- AC19. Convergencia con el webhook: webhook y luego reconciliación -> la reconciliación da `none`/`unchanged` sin cambios; reconciliación y luego el evento -> el evento queda `ignored`/`attempt_not_pending` con su fila; ambos simultáneos -> un solo `contracted`, sin error sin traducir.
- AC20. `refreshPaymentStatusAction`: autentica con `requireRole("client")` antes de validar; con `AuthError` (salvo `NOT_FOUND`) no llama al servicio; no UUID -> `{ ok: false, code: "NOT_FOUND" }` sin llamar al servicio; cada `PaymentError` -> su mensaje en español; error desconocido -> `UNKNOWN` genérico; éxito -> `revalidatePath` de las dos rutas y `{ ok: true, outcome }`; nunca devuelve ids de Stripe ni URLs.

UI y regresión:

- AC21. UI (verificación manual, sección 11.3): con un pago completado, `/projects/<id>/payment` muestra la etiqueta "Completado en Test Mode · confirmado por el servidor", el paso 3 completo, el paso 4 "Pendiente de implementación" (nunca completo ni "recibido") y el texto de `contracted` de RF8; en `pending` aparece el botón "Actualizar estado" (no el enlace de recarga) y el texto nuevo; no hay polling; el HTML no contiene ids de Stripe ni correos.
- AC22. "Mis proyectos": un proyecto `contracted` muestra la etiqueta "En contratación" y el enlace "Ver pago de prueba"; ningún texto afirma transferencia, dinero recibido ni ingresos.
- AC23. Dependencias de módulos: `payments` no importa `project.service` ni `proposal.service` (solo la hoja `project-transitions` y tablas Drizzle); `project.service.ts`, `payment-checkout.service.ts`, `payment-overview.service.ts`, `payment-errors.ts`, `payment.actions.ts`, `payment-progress.tsx`, `proxy.ts`, `drizzle/` y los servicios de `proposals` no cambian.
- AC24. Regresión: `npm run lint`, `npm run test` y `npm run build` pasan; los tests de 004 a 009 pasan **sin modificaciones** (incluidos `payment-checkout.service.test.ts`, `project.service.test.ts`, `project-transitions.test.ts`, `stripe.test.ts`, `constraints.test.ts`); ningún test usa red, Stripe, Clerk ni Neon reales; la tabla de rutas del build añade solo `/api/webhooks/stripe`.
- AC25. Documentación: `docs/MANUAL-TESTS.md` tiene la sección "Spec 010" y las líneas de 009 que decían que el pago no se refleja hasta la 010 quedan actualizadas; `system-design.md` y `state-machines.md` reflejan lo que justifica esta spec (T4).

## 11. Pruebas requeridas

### 11.1 Automáticas (Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM)

Los tests existentes de 004 a 009 **no se modifican**; todo test nuevo va en archivos nuevos. **No hay ningún test automático contra Stripe real.** El SDK se sustituye en la frontera `@/lib/stripe` donde hace falta; la verificación de firma usa la implementación real del SDK (`Stripe.webhooks`), que no hace red.

- `src/lib/stripe-webhook.test.ts` (AC2): `getWebhookSecret` (ausente, vacío, formato inválido, válido; mensajes sin el valor) y `constructStripeEvent` (firma válida generada con `Stripe.webhooks.generateTestHeaderString({ payload, secret })`; cabecera ausente/vacía; cuerpo alterado; secreto distinto; timestamp 301 s atrás; secreto del entorno ausente) con `vi.stubEnv` y `vi.resetModules`; mock de `server-only`.
- `src/modules/projects/services/mark-contracted.test.ts` con `createTestDb()` (AC3): los cinco estados de origen; columnas intactas. Archivo nuevo para no tocar `project-transitions.test.ts`.
- `src/modules/payments/services/payment-event.service.test.ts` con `createTestDb()`, mock de `server-only` y de `@/lib/db/client` (patrón `Proxy` + `holder`); eventos armados a mano (`Stripe.Event` mínimos con `id`, `type`, `livemode`, `data.object`) (AC6 a AC17): camino feliz y todas las filas de RF1; repetido; simultáneo (`Promise.allSettled`); `expired` tras `completed`, tras `canceled` (como 009) y sobre `pending`; `failed` tras `completed`; `unpaid` y luego asíncrono; importe/moneda distintos; `livemode` true; sesión desconocida; `client_reference_id` y metadata distintos; sin PaymentIntent; tipo no manejado; proyecto `closed`; atomicidad con `vi.mock` del módulo `project-transitions` envolviendo `markContracted` con un `vi.fn` que falla una vez; invariante común (nunca `completed_test` regresa; `failed`/`canceled` nunca se reabren); regresión de `closeProject` (`PAYMENT_IN_PROGRESS` con `pending`, cierre permitido tras `canceled`/`failed`, cierre permitido desde `contracted`); espía de `console` (AC17). Los efectos de `payment-session-effects.ts` y las hojas de `payment-transitions.ts` se cubren aquí y en el test de reconciliación (no tienen archivo de test propio). **Limitación documentada en el archivo**: PGlite es de una sola conexión y serializa las transacciones; las pruebas de simultaneidad demuestran coherencia, no el comportamiento real de `FOR UPDATE` en Neon; el reviewer valida los locks leyendo el SQL (AC16).
- `src/modules/payments/services/payment-reconciliation.service.test.ts` con `createTestDb()` y `vi.mock("@/lib/stripe")` con un Stripe falso en memoria (`checkout.sessions.retrieve` configurable) (AC18, AC19): todos los casos de RF7, convergencia con `handleStripeEvent` en ambos órdenes y simultánea.
- `src/modules/payments/actions/payment-reconciliation.actions.test.ts` (AC20): mismo patrón que `payment.actions.test.ts` (mock de `requireRole`, del servicio y de `next/cache`).
- `src/app/api/webhooks/stripe/route.test.ts` (AC4, AC5): mismo patrón que `clerk/route.test.ts`, con `@/modules/payments/services/payment-event.service` mockeado y `@/lib/stripe` **real**, `vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret")`; eventos con firma real vía `Stripe.webhooks.generateTestHeaderString`: válida -> 200 y `handleStripeEvent` llamado con el evento; sin cabecera -> 400; firma alterada -> 400; cuerpo alterado -> 400; timestamp viejo -> 400; sin secreto -> 500; servicio lanza -> 500; el servicio nunca se llama en los 400.
- `src/app/api/webhooks/stripe/route.flow.test.ts` (AC6, AC7, AC14 a nivel de tubería): ruta real + `handleStripeEvent` real + PGlite, firma real: `completed` firmado válido -> BD final correcta; mismo cuerpo firmado dos veces -> una sola fila; firma inválida -> BD intacta. Pocos casos (el detalle está en el test del servicio).
- Regresión (se ejecutan sin cambios): `payment-checkout.service.test.ts`, `payment-overview.service.test.ts`, `payment.actions.test.ts`, `project.service.test.ts`, `project-transitions.test.ts`, `proposal-selection.service.test.ts`, `stripe.test.ts`, `clerk/route.test.ts`, `constraints.test.ts`.
- No requieren test unitario (SETUP §3): `payment-page-view.tsx`, `project-list.tsx`, la página de `src/app`. `refresh-payment-button.tsx`: test RTL opcional (muestra el error, deshabilita durante la acción, con la action mockeada).

### 11.2 Qué nunca se prueba de forma automática

Entrega real de eventos por Stripe, reintentos y orden real de entrega, `stripe listen`, comportamiento de las tarjetas de prueba, métodos asíncronos reales, `customer_details` real, y la lectura real de la sesión (`retrieve`). Todo eso se cubre en 11.3.

### 11.3 Pruebas manuales con claves reales (tarea T4 las escribe en `docs/MANUAL-TESTS.md`, sección "Spec 010")

Preparación del humano (14.1): instalar la CLI de Stripe, `stripe login`, ejecutar `stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/webhooks/stripe`, copiar el `whsec_...` impreso a `STRIPE_WEBHOOK_SECRET` en `.env.local` y reiniciar `npm run dev`.

Pasos que T4 documenta, cada uno como casilla verificable:

1. **Pago correcto:** con un proyecto en "Con propuesta seleccionada", pagar con `4242 4242 4242 4242` desde la página de pago. En la terminal de `stripe listen` aparece `checkout.session.completed` con 200. En Neon: el intento queda `completed_test` con `stripe_payment_intent_id` y `completed_at`, el proyecto `contracted` con `contracted_at`, y hay una fila `applied` en `processed_payment_events`. En la UI: "En contratación" en "Mis proyectos", panel "Completado en Test Mode · confirmado por el servidor", paso 3 completo, paso 4 "Pendiente de implementación" y ningún texto de dinero recibido.
2. **Idempotencia:** reenviar el mismo evento (`stripe events resend <evt_id>`; **a verificar** que llegue al listener local; si no, repetir la petición firmada guardada con `--print-json` dentro de 5 minutos con `curl`). Respuesta 200, sin cambios y sin segunda fila.
3. **Evento ajeno:** `stripe trigger checkout.session.completed` genera una sesión sin intento: respuesta 200, el log del servidor dice `attempt_not_found` y se crea una fila `ignored` con `payment_attempt_id` NULL; nada más cambia.
4. **Rechazo de tarjeta:** pagar con `4000 0000 0000 0002`: Stripe muestra el rechazo en su página y el intento sigue `pending` (no pasa a `failed`); pagar después con `4242` en la misma sesión completa el pago como en el paso 1.
5. **Expiración:** con un intento `pending`, expirar la sesión con `stripe checkout sessions expire <cs_test_...>`: llega `checkout.session.expired`, el intento pasa a `canceled`, el proyecto sigue `proposal_selected`, "Cerrar proyecto" ya no responde `PAYMENT_IN_PROGRESS` y se puede reintentar el pago.
6. **Firma alterada:** `curl -i -X POST http://localhost:3000/api/webhooks/stripe -H "Stripe-Signature: t=1,v1=firma_falsa" -d '{}'` responde 400; sin la cabecera también 400; ninguna fila nueva en `processed_payment_events`.
7. **Sin `stripe listen` (reconciliación):** detener el listener, pagar con `4242`, volver a la página: el intento sigue "Pendiente"; pulsar "Actualizar estado" lo pasa a completado y el proyecto a "En contratación". Con la sesión aún abierta (sin pagar), "Actualizar estado" muestra "Stripe todavía no confirma el pago.".
8. **Retorno del navegador:** volver con `?checkout=success` antes de que llegue el evento sigue mostrando "pendiente"; escribir `?checkout=success` a mano en otro proyecto no cambia nada.
9. **Secreto ausente:** quitar `STRIPE_WEBHOOK_SECRET`, reiniciar y enviar un evento: 500 y ningún cambio; restaurar y reiniciar.
10. **Privacidad y logs:** el log del servidor no contiene cuerpos de evento, emails ni secretos; el HTML de la página no contiene ids de Stripe.
11. **Método asíncrono (opcional, solo si la cuenta de prueba tiene uno habilitado):** `completed` con `unpaid` no completa; el evento asíncrono posterior sí.
12. **Responsive y accesibilidad** del botón "Actualizar estado" a 390 px (teclado, foco visible, `aria-live`).

Actualizaciones de las líneas existentes que T4 debe corregir en `docs/MANUAL-TESTS.md` (por texto, no por número de línea): la cabecera "Cubre: specs 003 a 009" -> "003 a 010"; el párrafo introductorio de la sección 7 ("La confirmación ... llegan con la spec 010: en esta fase un pago hecho en Stripe nunca se refleja como completado"); la nota "La CLI de Stripe ... **no** hacen falta aquí"; las casillas del pago de prueba ("Nunca aparece 'completado' ni 'pagado' (eso llega con la spec 010)" y "La fila sigue `pending` y el proyecto sigue en `proposal_selected`") para indicar que valen **sin** `stripe listen` activo; la casilla "Cierre bloqueado" y "Sesión vencida" (ahora también cubiertas por el evento `expired`); y en la sección de pendientes la nota "Sin la spec 010 un pago hecho en Stripe no se refleja como completado" y la de "intento abandonado bloquea el cierre". La sección "Spec 010" se inserta antes de "Revisión visual transversal", que queda como última junto con "Pendientes" (renumeradas).

## 12. Dependencias y riesgos

Dependencias entre specs: 003 (tablas), 004 (ruta pública), 005 (`closeProject`), 008 (patrones), 009 (checkout y sesión guardada). Bloquea: 011 (Connect, al final), 012 (dashboard y cancelación explícita). Dependencias npm: ninguna nueva (`stripe@^23.0.0` ya instalado).

Riesgos:

- R1. **Comportamiento real de Stripe no verificado en esta sesión** (entrega, reintentos hasta 3 días en Test Mode, orden, `stripe events resend` contra el listener local, `payment_status` real con métodos habilitados): se cubre con las pruebas manuales; las decisiones de RF1 se basan en los tipos del SDK y en el comportamiento documentado de Checkout.
- R2. **`failed` casi inalcanzable en Test Mode con tarjeta** (D-B): un rechazo no termina la sesión; el intento termina `completed_test` o `canceled`. El estado `failed` queda soportado por el servicio y la UI pero solo se ejercita con un método asíncrono.
- R3. **Intento `pending` abandonado bloquea el cierre** (R4 de 009): mitigado por `expired` (webhook) y por "Actualizar estado" (reconciliación); queda un hueco residual si el webhook falta y el cliente no vuelve; lo cierra la cancelación explícita de 012. Importe/moneda distintos o referencia inválida dejan un `pending` que solo se resuelve con `expired` o a mano.
- R4. **Reconciliación vs "el webhook es la única fuente de verdad":** es una lectura autenticada servidor-a-servidor con la misma regla, no una entrada del navegador; se somete a aprobación (D-F, P2). Alternativa sin reconciliación: más simple pero un webhook perdido deja el pago colgado.
- R5. **PGlite no demuestra concurrencia real** (mismo caveat que 008/009): locks e idempotencia se validan por lectura del SQL y por la PK/UNIQUE de BD (AC7, AC16).
- R6. **Rate limiting ausente** en el endpoint público y en la action de refresco (se asigna a 015).
- R7. **Colisión UNIQUE de `stripe_payment_intent_id`** o error determinista de BD en el efecto: la transacción revierte y Stripe reintenta (hasta 3 días) sin éxito; aceptado por improbable; los logs traen `eventId` para diagnóstico.
- R8. **Cuerpo crudo con `proxy.ts`:** Next clona y bufferiza el cuerpo; la firma verifica los bytes exactos (`req.text()`); si el proxy alterara el cuerpo, todas las firmas fallarían y la prueba manual 1 lo revelaría de inmediato.
- R9. **Secreto distinto por entorno:** el `whsec_` de `stripe listen` es de la CLI; en despliegue es el del endpoint del Dashboard (spec 017).
- R10. No se pudo abrir el artifact de diseño: textos y detalles visuales por contrastar con el humano (P4).

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. Archivos de otras specs: `project-transitions.ts`, `.env.example` -> T0; `payment-page-view.tsx` y `project-list.tsx` -> T3; `payment.types.ts` -> T1; `MANUAL-TESTS.md`, `system-design.md`, `state-machines.md` -> T4. **No se tocan**: `package.json`, `package-lock.json`, `payment-checkout.service.ts`, `payment-overview.service.ts`, `payment-errors.ts`, `payment.actions.ts`, `start-checkout-button.tsx`, `payment-progress.tsx`, `project.service.ts`, servicios y componentes de `proposals`, `proxy.ts`, `layout.tsx`, `globals.css`, `drizzle/`, ni ningún `.env*` distinto de `.env.example`. Durante el bloque paralelo (T2, T3, T4) nadie corre `npm install` ni `npm run build`; el reviewer corre el build completo al final.

### T0 — Entorno, frontera de firma y hoja de proyecto (serial, primero)

- Archivos: `.env.example` (solo RF3), `src/lib/stripe.ts` (añade `getWebhookSecret`, `constructStripeEvent`, `WEBHOOK_TOLERANCE_SECONDS`; sin tocar lo existente), `src/lib/stripe-webhook.test.ts`, `src/modules/projects/services/project-transitions.ts` (añade `markContracted`), `src/modules/projects/services/mark-contracted.test.ts`.
- Depende de: —
- Paralelizable: no (cambio compartido de configuración, `src/lib/**` y contrato de `projects` que T1 importa)
- Cubre: AC1, AC2, AC3

### T1 — Servicios de pago: hojas, núcleo, evento y reconciliación (serial)

- Archivos: `src/modules/payments/types/payment.types.ts` (tipos nuevos de RF4/RF7), `src/modules/payments/services/payment-transitions.ts`, `src/modules/payments/services/payment-session-effects.ts`, `src/modules/payments/services/payment-event.service.ts`, `src/modules/payments/services/payment-event.service.test.ts`, `src/modules/payments/services/payment-reconciliation.service.ts`, `src/modules/payments/services/payment-reconciliation.service.test.ts`.
- Depende de: T0
- Paralelizable: no (contrato base de T2, T3 y T4)
- Cubre: AC6 a AC19, AC23 (servicios)

### T2 — Ruta del webhook y action de refresco

- Archivos: `src/app/api/webhooks/stripe/route.ts`, `src/app/api/webhooks/stripe/route.test.ts`, `src/app/api/webhooks/stripe/route.flow.test.ts`, `src/modules/payments/actions/payment-reconciliation.actions.ts`, `src/modules/payments/actions/payment-reconciliation.actions.test.ts`.
- Depende de: T1
- Paralelizable: sí (con T3 y T4: archivos disjuntos; T3 importa la firma fijada en RF7)
- Cubre: AC4, AC5, AC20 (y AC6, AC7, AC14 a nivel de tubería)

### T3 — UI mínima: botón de refresco, textos y enlace

- Archivos: `src/modules/payments/components/refresh-payment-button.tsx`, `src/modules/payments/components/payment-page-view.tsx`, `src/modules/projects/components/project-list.tsx`.
- Depende de: T1 y contrato de T2 (RF7)
- Paralelizable: sí (con T2 y T4)
- Cubre: AC21, AC22 (verificación manual; sin tests unitarios obligatorios)

### T4 — Documentación y pruebas manuales (una sola tarea documental)

- Archivos: `docs/MANUAL-TESTS.md` (cabecera "Cubre: specs 003 a 010"; actualización de las líneas de 009 listadas en 11.3; sección "Spec 010" con los pasos de 11.3 y 14.1; renumeración de "Revisión visual transversal" y "Pendientes"), `docs/architecture/system-design.md` (solo: `§4` nota de que `payments` escribe `payment_attempts` y `processed_payment_events` y llama a la hoja `markContracted` de `projects`; `§7` precisión de D-F (lectura autenticada de la API además del webhook) y de D-B (`payment_intent.payment_failed` no se maneja); `§8` D2: cierre del lado servidor por `expired` y reconciliación, cancelación explícita en 012), `docs/architecture/state-machines.md` (solo: `§3` reemplazar "La spec 010 detalla el mapeo exacto" por el resumen del mapeo de RF1; `§5` el caso límite de `completed` con proyecto no `proposal_selected` (RF6) y la línea "Cliente intenta cerrar un proyecto con pago `pending`" con el comportamiento definido).
- Depende de: T1 (contratos finales)
- Paralelizable: sí (con T2 y T3: solo documentación)
- Cubre: AC25

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: **aprobada** por el humano con las recomendaciones por defecto (D-A..D-L, P1–P5).

### 14.1 Pasos manuales del humano (el agente nunca maneja secretos)

1. Instalar la CLI de Stripe y ejecutar `stripe login` (modo de prueba).
2. Ejecutar `stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/webhooks/stripe`.
3. Copiar el `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET` en `.env.local` (la variable ya figura en `.env.example`, T0) y reiniciar `npm run dev`. El agente no lee ni escribe `.env.local`.
4. Pagar con `4242 4242 4242 4242` (éxito) o `4000 0000 0000 0002` (rechazo), cualquier fecha futura, CVC y código postal.

### 14.2 Decisiones

- D-A. Alcance de eventos. Recomendación: cuatro tipos (`completed`, `expired`, `async_payment_succeeded`, `async_payment_failed`). Alternativa: solo `completed` y `expired` (más corto; un método asíncrono dejaría el intento `pending` para siempre).
- D-B. `payment_intent.payment_failed` y `failed`. Recomendación: no manejar `payment_intent.payment_failed` (un rechazo no termina la sesión); `failed` solo por `async_payment_failed`. Alternativa: mapear `payment_intent.payment_failed -> failed` (rompe el pago posterior en la misma sesión o exige permitir `failed -> completed_test`, contradiciendo "nunca reabrir un terminal").
- D-C. Eventos no manejados. Recomendación: 200 sin fila (no hace crecer la tabla con eventos ajenos). Alternativa: registrar todo evento recibido como `ignored` (mayor auditoría, crecimiento sin límite y una escritura por evento ajeno).
- D-D. Intento no encontrado. Recomendación: localizar solo por session id; si no existe, `ignored`/`attempt_not_found`, fila con `payment_attempt_id` NULL y 200 (una sesión de otra app o de `stripe trigger` no es un fallo nuestro y un 5xx provocaría reintentos inútiles durante días; en 009 la URL solo se entrega tras guardar el session id, así que el webhook no puede adelantarse a esa escritura). Alternativa: localizar también por `client_reference_id` y "adoptar" la sesión, o responder 5xx hasta que aparezca (más código y reintentos sin sentido).
- D-E. Importe o moneda distintos. Recomendación: no completar, registrar `ignored` con motivo y `console.error`, responder 200 (reintentar no cambia el resultado) y dejar el intento `pending` para revisión manual. Alternativa: marcar el intento `failed` (mezcla un fallo de pago con una inconsistencia) o responder 4xx/5xx (reintentos inútiles).
- D-F. Reconciliación. Recomendación: botón "Actualizar estado" (acción POST) que relee la sesión con `retrieve` y aplica el mismo núcleo; sin cron ni polling; no escribe en renderizado. Esto precisa una lectura de I4/`BRIEF §7` regla 10 ("evento **o estado autorizado desde el servidor**"): el estado leído de la API con la clave secreta cuenta como verificado; el navegador nunca aporta estado. Alternativa: sin reconciliación (más simple; un webhook perdido deja el pago colgado) o reconciliar al abrir la página (efectos en un GET).
- D-G. Proyecto fuera de `proposal_selected` al llegar `completed`. Recomendación: intento `completed_test`, proyecto sin cambios, `applied`/`completed_project_not_selected`, anomalía en log, 200. Alternativa: ignorar el evento y dejar el intento `pending` (el estado local mentiría sobre un pago confirmado y el intento no se podría cancelar desde la app).
- D-H. Respuesta ante `StripeConfigError` del secreto. Recomendación: 500 (error nuestro; Stripe reintenta cuando se corrija). Alternativa: 400 (señalaría un problema del emisor que no existe).
- D-I. `runtime`. Recomendación: `export const runtime = "nodejs"` explícito. Alternativa: omitirlo (es el valor por defecto en Next 16).
- D-J. Verificación con el método estático `Stripe.webhooks.constructEvent` desde `src/lib/stripe.ts` (no necesita `STRIPE_SECRET_KEY`). Alternativa: `getStripe().webhooks.constructEvent` (exige clave y cliente solo para verificar).
- D-K. Qué ve el desarrollador. Recomendación: nada nuevo en 010 (013). Alternativa: mostrar el estado del pago en "Mis propuestas" (obliga a modificar `proposal.service.ts` y sus tests).
- D-L. Código duplicado aceptado: `cancelAttempt` privado de 009 frente a `cancelPendingAttempt`, y `toResult` privado frente a la nueva action. Recomendación: no tocar archivos de 009 para mantener intacta su regresión; refactorizar al unificar en una limpieza posterior. Alternativa: extraer ahora (toca `payment-checkout.service.ts` y `payment.actions.ts`, y exige revisar sus tests).

## Preguntas abiertas

- P1. ¿Se confirma que un rechazo de tarjeta de prueba **no** produce `failed` (D-B) y que el panel "Fallido" solo se verá con métodos asíncronos? Es una consecuencia del comportamiento de Checkout; el diseño muestra el estado "fallido" y puede ser necesario reinterpretarlo con el humano.
- P2. ¿Se aprueba la reconciliación "Actualizar estado" (D-F) como excepción acotada a "el webhook es la única fuente de verdad", y la reescritura de `system-design.md §7`/I4 que la acompaña?
- P3. ¿Aprobar D-G (marcar `completed_test` aunque el proyecto esté `closed`) o prefieres que un evento sobre un proyecto no contratable quede ignorado y se resuelva a mano?
- P4. Textos y detalles visuales (leyenda del paso 3, texto de `contracted`, botón "Actualizar estado") por contrastar con el diseño de referencia, que no fue accesible.
- P5. ¿Se mantiene el 200 para importe/moneda distintos (D-E) aun cuando deja un intento `pending` que bloquea el cierre hasta `expired` o revisión manual?

## Próximas fases

- 011 (`developer-payment-routing-test-model.md`, **al final**): Stripe Connect en Test Mode o transferencia simulada, `simulatedTransfer` y derivación formal de `transferStatus` (hoy el paso 4 es texto fijo "Pendiente de implementación"). Reutilizará `completed_test` de 010 como disparador.
- 012: panel del cliente, **cancelación explícita** de un intento `pending` (cierra D2 del lado UX), vista de pago para admin.
- 013: panel del desarrollador (estado del pago y de la transferencia, nunca dinero recibido).
- 014: estados de carga/error/vacío y mensajes transversales.
- 015: **rate limiting del endpoint público `/api/webhooks/stripe` y de `refreshPaymentStatusAction`**, revisión de privacidad y logs, auditoría.
- 017: valor de `STRIPE_WEBHOOK_SECRET` por entorno (secreto del endpoint del Dashboard en despliegue) y registro del endpoint en Stripe.

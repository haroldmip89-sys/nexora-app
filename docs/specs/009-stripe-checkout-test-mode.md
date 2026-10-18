# Stripe Checkout en Test Mode: creación del pago de prueba (Fase 3 de Nexora, parte 1)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10` (el orden de las secciones 1 a 14 coincide con ella). Requisitos de origen: `docs/SDD-PLAN.md §6` (Spec 009; 010 y 011 se citan solo para delimitar), `docs/BRIEF.md §6.4`, `§6.5`, `§7` (reglas 9 a 15), `§9`. Dominio: `docs/architecture/system-design.md §2` (entidades `paymentAttempt` y `processedPaymentEvent`, invariantes I1 a I5), `§3` (propiedad de datos Stripe vs Nexora), `§4` (módulos, excepciones de escritura vía funciones hoja, "los clientes de Stripe son singletons mínimos en `src/lib`"), `§6` (permisos: iniciar pago solo el cliente dueño), `§7` (pagos y webhooks), `§8` (D2, D10); `docs/architecture/state-machines.md §1` (`proposal_selected -> contracted` solo por webhook verificado), `§3` (intento de pago), `§4` (transferencia independiente), `§5` (casos límite). Base: spec 003 (restricciones de `payment_attempts`), 004 (auth y frontera Clerk), 005 (`closeProject` y `PAYMENT_IN_PROGRESS`), 008 (selección y "Próximas fases"). Diseño visual de referencia (no accesible, no contractual): artboard "Pago de prueba (Stripe Test Mode)": banner "Modo de prueba", progreso de 4 pasos, resumen proyecto/desarrollador/importe/plazo, estados pendiente/completado/cancelado/fallido y leyenda de que volver desde Stripe no confirma el pago.

Fuentes de Stripe: no pude acceder a las skills/MCP de Stripe (`stripe-best-practices`, `stripe-docs`) desde este agente, y el paquete `stripe` aún no está instalado (no hay tipos que leer). Lo relativo a la API de Stripe se basa en conocimiento general de Checkout Sessions y se marca **"a verificar en T0"** donde corresponde; T0 lo contrasta con los tipos del SDK instalado antes de que T1 escriba código.

## 1. Objetivo

Que el cliente dueño de un proyecto en `proposal_selected` inicie un pago de prueba: el servidor crea una Stripe Checkout Session en Test Mode con el importe y la moneda de la propuesta `accepted` guardada en servidor (I2), registra un intento de pago `pending` y redirige al cliente a Stripe. Al volver, la página solo informa; **009 nunca confirma un pago** (reglas 9 y 10): el intento queda `pending` y la UI dice "pendiente de confirmación del servidor". La confirmación (`completed_test`) y `contracted` son de la spec 010.

Entrega:

- Dependencia `stripe` y cliente mínimo `src/lib/stripe.ts` que rechaza claves live.
- Servicio `createCheckoutForProject` (crear o reanudar el intento y la sesión sin duplicados) y servicio de lectura del estado de pago.
- Server action `startCheckoutAction` con redirect a Stripe.
- Página `/projects/[id]/payment` con resumen, progreso de 4 pasos, banner de Test Mode y estados según el último intento; enlace real "Continuar al pago de prueba" en "Mis proyectos" y en la vista de propuestas.
- Pruebas automáticas con Stripe simulado en la frontera y sección de pruebas manuales con claves reales.

## 2. Contexto y alcance

### 2.1 Alcance 009 vs 010 vs 011 (punto 1 del requerimiento)

| Capacidad | 009 | 010 | 011 |
|---|---|---|---|
| Dependencia `stripe` y cliente de Stripe en servidor | Sí | Reutiliza | Reutiliza |
| Crear Checkout Session en servidor (importe de la propuesta guardada) | Sí | | |
| Insertar `payment_attempt` `pending` y guardar `stripe_checkout_session_id` | Sí | | |
| Idempotency key, reutilización de sesión `pending` vigente, sin duplicados | Sí | | |
| Compensación si Stripe falla al crear la sesión (`pending -> canceled` por el servidor) | Sí | | |
| Reconciliar sesión expirada al reintentar (`pending -> canceled` por el servidor, tras leer `status = 'expired'` de la API de Stripe) | Sí | Cubre además el evento `checkout.session.expired` | |
| Página de pago, `?checkout=success\|cancel` informativo, enlaces | Sí | | |
| Ruta `POST /api/webhooks/stripe`, verificación de firma, `STRIPE_WEBHOOK_SECRET` | No | Sí | |
| `processed_payment_events` (idempotencia por `event.id`), eventos fuera de orden | No | Sí | |
| `pending -> completed_test` y `pending -> failed` | No | Sí | |
| `proposal_selected -> contracted` (hoja en `projects/services/project-transitions.ts`) | No | Sí | |
| Guardar `stripe_payment_intent_id` | No (sigue `NULL`) | Sí | |
| Cancelación explícita iniciada por el cliente, política de cierre con `pending` (D2) | No | Parcial (expiración) | |
| Reconciliación completa con Stripe | No | Sí | |
| Stripe Connect, transferencia al desarrollador, comisiones | No | No | Sí (último paso) |
| Vistas de admin y desarrollador sobre pagos, paneles | No | No | 012/013 |

### 2.2 Decisiones humanas ya aprobadas y heredadas

Pago solo con Stripe Checkout en Test Mode (`livemode = false`; se rechazan claves live); importe y moneda salen de la propuesta `accepted` guardada en servidor, nunca del cliente (I2); solo el cliente dueño del proyecto con propuesta seleccionada inicia el pago (D8: el admin no); la página de retorno no confirma nada (I4, reglas 9 y 10); en 009 el intento queda `pending`; sin comisiones ni Connect; transferencia "Pendiente de implementación" (nunca dinero recibido, I3, I5); ningún dato de tarjeta pasa por Nexora; `STRIPE_SECRET_KEY` (y `STRIPE_WEBHOOK_SECRET` en 010) los pone el humano en `.env.local`; recurso ajeno -> 404, rol incorrecto -> 403; dinero en centavos USD; estados con los ids exactos de `state-machines`.

- Incluye:
  - T0 serial: dependencia `stripe`, `package.json`, `package-lock.json`, `.env.example` (solo nombres), `src/lib/stripe.ts` y su test.
  - Contratos del módulo `payments` (errores, tipos, schema Zod), servicio de checkout, servicio de lectura del estado de pago.
  - Server action `startCheckoutAction` (redirect a Stripe) y su test.
  - Página `/projects/[id]/payment` (+ `loading.tsx` y `error.tsx`), componentes de pago, enlace "Continuar al pago de prueba" en `project-list.tsx` y `project-proposals-view.tsx` (sustituye el aviso "disponible próximamente" de 008).
  - Sección "Spec 009" en `docs/MANUAL-TESTS.md` y notas de arquitectura en `system-design.md` (D10 resuelta, nota de `payments`).
- No incluye:
  - Webhook, firma, `processed_payment_events`, `completed_test`, `failed` por Stripe, `contracted`, `stripe_payment_intent_id` (spec 010).
  - Cancelación explícita iniciada por el cliente, cambios al cierre de proyectos con intento `pending` (010/012; ver riesgo R4).
  - Stripe Connect, transferencia, comisiones, clientes de Stripe (`customer`), suscripciones, reembolsos (011 y fuera del MVP).
  - Vistas de pago para `admin` y `developer` ni cambios en "Mis propuestas" (ver D-I; 012/013).
  - Cambios de esquema o migraciones (`payment_attempts` ya trae todo lo necesario), cambios en `proxy.ts`, `layout.tsx`, `globals.css`.
  - Tests automáticos contra Stripe real. **No los hay**: la verificación con claves reales es manual (sección 11.3).

### 2.3 Reutilizar (inventario verificado con Glob/Read/Grep; nada nuevo si ya existe)

| Existente | Uso en 009 |
|---|---|
| `payments/schema/payment-attempts.table.ts`, `processed-payment-events.table.ts` | **Sin cambios.** Se usan como red de seguridad: índice parcial UNIQUE `payment_attempts_one_active_per_project_idx` (un intento `pending`/`completed_test` por proyecto), `stripe_checkout_session_id` y `stripe_payment_intent_id` UNIQUE nullable, CHECKs `amount_cents > 0`, `currency = 'USD'`, `livemode = false`, coherencia `completed_at`, FK compuesta `(proposal_id, project_id) -> proposals(id, project_id)`. `processed_payment_events` no se toca (010) |
| `projects/services/project.service.ts` (`closeProject`, `getMyProject`, `hasActivePayment`) | **No se modifica ni se importa.** `closeProject` ya bloquea con `PAYMENT_IN_PROGRESS` ante un intento `pending`/`completed_test`; 009 respeta su orden de locks (proyecto primero) |
| `projects/services/project-transitions.ts` (`markProposalSelected`) | Sin cambios. 010 añadirá aquí la hoja hacia `contracted`; 009 no escribe `projects` |
| `proposals/schema/{proposals,proposal-selections}.table.ts`, `users/schema/users.table.ts` | Lectura (tablas Drizzle, no servicios): propuesta `accepted` del proyecto (`price_cents`, `currency`, `timeline_weeks`) y `users.display_name` del desarrollador. `proposals` y `projects` ya se leen así entre módulos (system-design §4) |
| `auth/**`: `requireRole`, `requireOwnership`, `can("payment.start")` (solo `client`, **ya en la matriz**), `AuthError`, `handleAuthErrorForPage` | Guards de action y servicio; sin acciones nuevas en la matriz |
| `proposals/services/proposal-selection.service.ts` | **Patrón a imitar** (transacción, `FOR UPDATE` proyecto primero, guardas, no se importa) |
| `proposals/services/proposal-errors.ts`, `projects/services/project-errors.ts` | Patrón de `PaymentError` (código, estado HTTP, mapa de mensajes en español) |
| `proposals/actions/proposal-selection.actions.ts`, `proposals/components/select-proposal-button.tsx` | Patrón de action (`requireRole` antes de validar, UUID -> `NOT_FOUND`, `toResult`) y de botón (`useTransition`, error `aria-live`, `router.refresh()` ante datos obsoletos) |
| `src/lib/db/client.ts`, `src/lib/db/test-db.ts` (`createTestDb`), patrón de mock `Proxy` + `holder` y `vi.mock("server-only")` de `proposal-selection.service.test.ts` | Pruebas con PGlite y migraciones reales |
| `src/lib/money.ts` (`formatUsd`, `centsToUsd`) | Mostrar el importe; el importe a Stripe es el entero de centavos sin conversión |
| `auth/services/clerk-identity.service.ts` | **Patrón de frontera inyectable**: módulo mínimo que envuelve al SDK externo y que los tests sustituyen con `vi.mock`. `src/lib/stripe.ts` hace lo mismo para Stripe |
| `src/components/shared`: `empty-state`; `src/components/ui`: `button` (`buttonVariants`), `badge`, `alert-dialog` (sin uso nuevo) | UI. No se necesita ningún componente shadcn nuevo (verificado con `ls src/components/ui`) |
| `projects/components/project-status-badge.tsx`, `proposals/components/proposals-error.tsx`, `proposals-loading.tsx`, `src/app/projects/[id]/proposals/{error,loading}.tsx` | Patrón de `loading.tsx`/`error.tsx` y de página fina para la nueva ruta |
| `proxy.ts` | Sin cambios: solo expone la sesión; la autorización vive en los guards de página y action |

No existen `src/hooks`, stores ni módulo `payments/services`; no se necesitan stores ni hooks.

## 3. Requisitos funcionales

### RF1. Dependencia `stripe` (punto 2)

- Paquete `stripe`, versión estable verificada en npm (`npm view stripe version`, solo lectura, 2026-10-17): **23.0.0** (`latest`; existen `23.1.0-beta.1` y `23.1.0-alpha.3` como preview, **no** se usan). `engines.node >= 20`, `peerDependencies: @types/node >= 20`, sin dependencias de runtime. Se instala como `"stripe": "^23.0.0"` en `dependencies`.
- Justificación: es el único cliente oficial; Checkout Sessions se crean y leen con él (RF3) y 010 lo necesita para `webhooks.constructEvent`. Sin él habría que firmar a mano llamadas HTTP y verificaciones de firma (más superficie de error en seguridad). No hay librería existente en el repo que lo cubra (`axios` no valida firmas ni tipa la API).
- T0 es la única tarea dueña de `package.json` y `package-lock.json`: `npm install stripe` (una vez, serial). Nadie más ejecuta `npm install` en ningún momento de la spec.
- **A verificar en T0 contra los tipos instalados** (anotar el resultado en el reporte de T0): (a) versión de API que fija el SDK 23.0.0 por defecto y que no hace falta pasar `apiVersion` (no se pasa; si el SDK lo exigiera, se fija la que traiga por defecto); (b) forma del export (`import Stripe from "stripe"` y `new Stripe(key, options)`); (c) compatibilidad con Next 16.3.8 (Turbopack, runtime Node, `serverExternalPackages` no necesario) y React 19.2.8: el SDK es Node-only y se importa solo en archivos con `import "server-only"`; `npm run build` no debe avisar; (d) nombres exactos de `checkout.sessions.create/retrieve`, opciones de petición (`idempotencyKey`), campos `url`, `status` (`open | complete | expired`), `livemode`, `expires_at` y `client_reference_id`; (e) tipo/campo de error (`type`: `StripeInvalidRequestError`, `StripeAuthenticationError`, `StripePermissionError`, `StripeConnectionError`, `StripeRateLimitError`, `StripeAPIError`, `StripeIdempotencyError`, `statusCode`, `code`, `requestId`); (f) límites de `expires_at` (entre 30 minutos y 24 horas desde la creación) y mínimo de cobro en USD (0,50; el mínimo de propuesta es USD 1, por lo que no se alcanza); (g) que `url` solo se devuelve mientras la sesión está `open`. Si algo difiere, T0 lo documenta y el developer ajusta T1 a lo real sin cambiar los contratos de esta spec; si afecta un contrato, se escala (la spec vuelve a `borrador`).
- `npm audit`/licencias no se tocan en esta spec.

### RF2. Cliente Stripe `src/lib/stripe.ts` (punto 3)

Un solo archivo (`import "server-only"`), singleton perezoso, **frontera inyectable**: la lógica de negocio importa únicamente de `@/lib/stripe`, y los tests la sustituyen con `vi.mock("@/lib/stripe")` (mismo patrón que `clerk-identity.service`).

```ts
getStripe(): Stripe      // lanza StripeConfigError si falta o es inválida STRIPE_SECRET_KEY
getAppUrl(): string      // origen público de la app (sin "/" final) para success_url/cancel_url
class StripeConfigError extends Error   // mensaje claro, sin el valor de la clave
```

Reglas de `getStripe()`:

- Lee `process.env.STRIPE_SECRET_KEY` **al primer uso** (no al importar; importar sin variable no lanza, como `db`).
- Ausente o vacía -> `StripeConfigError("STRIPE_SECRET_KEY is not defined. Set it in .env.local (Stripe test secret key).")`.
- Debe empezar por `sk_test_` o `rk_test_` (clave restringida de prueba). `sk_live_`/`rk_live_` -> `StripeConfigError("STRIPE_SECRET_KEY is a live key; only Stripe test keys (sk_test_...) are accepted.")`. Cualquier otro formato -> `StripeConfigError("STRIPE_SECRET_KEY has an unexpected format; expected a Stripe test key (sk_test_...).")`. **Ningún mensaje incluye la clave ni parte de ella.**
- Solo memoiza la instancia **después** de validar; opciones del cliente: `maxNetworkRetries: 2` y `timeout` razonable (p. ej. 15 000 ms; **a verificar en T0** nombres y semántica); sin `apiVersion` salvo lo indicado en RF1.
- `getAppUrl()` lee `APP_URL` (ver D-B), exige `http:` o `https:`, quita el `/` final y el path, y lanza `StripeConfigError` mensaje claro si falta o es inválida. Está en este archivo porque solo existe para armar las URLs de retorno de Stripe.
- `StripeConfigError` está en este archivo (un solo archivo, sin `stripe-errors.ts`).

### RF3. Variables de entorno nuevas (punto 4; resuelve D10 para Stripe)

Solo nombres; los valores los pone el humano. `.env.example` (archivo existente, **solo T0**) añade, con comentarios en el mismo estilo del archivo:

```
# Stripe (Test Mode only: sk_test_..., never a live key)
STRIPE_SECRET_KEY=
# Public origin of this app, used for Stripe success/cancel URLs (e.g. http://localhost:3000)
APP_URL=
# Spec 010 (not read by spec 009)
# STRIPE_WEBHOOK_SECRET=
```

- `STRIPE_SECRET_KEY`: secreto, solo servidor, jamás con prefijo `NEXT_PUBLIC_`.
- `APP_URL` (decisión D-B): se usa **solo en servidor** para construir `success_url` y `cancel_url`; por eso **no** lleva `NEXT_PUBLIC_` (no se inyecta al bundle del cliente). Derivarlo del header `Host` de la petición se descarta (spoofable; el destino de retorno debe ser una configuración, no una entrada). 017 definirá el valor por entorno.
- `STRIPE_WEBHOOK_SECRET` solo como línea comentada (documenta el nombre que usará 010; 009 no lo lee).
- Convención D10 (se resuelve aquí para Stripe y se anota en `system-design.md §8` en T4): nombres `UPPER_SNAKE`; secretos nunca con `NEXT_PUBLIC_`; `.env.example` lista solo nombres, agrupados por proveedor; `.env.local` nunca se commitea (ya cubierto por `.gitignore`). Ninguna tarea lee ni escribe `.env.local`.

### RF4. Contrato del servicio de checkout (punto 5)

Archivo `src/modules/payments/services/payment-checkout.service.ts` (`import "server-only"`):

```ts
createCheckoutForProject(actor: AuthUser, projectId: string): Promise<CheckoutStartResult>

type CheckoutStartResult = {
  attemptId: string;      // payment_attempts.id (interno)
  checkoutUrl: string;    // URL de Stripe Checkout; solo para redirect, nunca se persiste ni se muestra
  reused: boolean;        // true si se reanudó/reutilizó un intento pending existente
};
```

Sin `amount`, `currency` ni `proposalId` en la entrada (I2): todo sale de la BD.

Constantes del archivo: `CHECKOUT_SESSION_TTL_SECONDS = 3600` (la sesión vence 60 minutos después de crear el intento; D-F) y `RESUME_WINDOW_SECONDS = 600` (un intento `pending` sin id de sesión se reanuda solo durante 10 minutos).

**Secuencia (dos fases; ninguna llamada a Stripe ocurre dentro de una transacción de BD que retenga locks):**

0. Fuera de transacción y antes de tocar la BD: `can(actor.role, "payment.start")` -> si no, `AuthError("FORBIDDEN")` (developer y admin; sin BD ni Stripe). Después `getStripe()` y `getAppUrl()`: si lanzan `StripeConfigError` -> `PaymentError("STRIPE_NOT_CONFIGURED")` (se registra solo el mensaje del error, nunca la clave). Así una mala configuración no deja intentos huérfanos.
1. **Fase A — preparar el intento** (`db.transaction`):
   1. **Lock del proyecto (primero):** `SELECT id, clientId, status FROM projects WHERE id = :projectId LIMIT 1 FOR UPDATE`. Inexistente -> `AuthError("NOT_FOUND")`; `requireOwnership(actor, clientId)` **sin** `allowAdmin` (ajeno -> `NOT_FOUND`).
   2. Estado: `status !== 'proposal_selected'` -> `PaymentError("PAYMENT_NOT_ALLOWED")` (incluye `draft`, `published`, `contracted`, `closed`).
   3. **Propuesta ganadora (segundo, `FOR SHARE`):** `SELECT p.id, p.priceCents, p.currency FROM proposal_selections s JOIN proposals p ON p.id = s.proposal_id AND p.project_id = s.project_id WHERE s.project_id = :projectId AND p.status = 'accepted' ... FOR SHARE OF p`. Sin fila (inconsistencia) -> `PaymentError("PAYMENT_NOT_ALLOWED")`. Orden de locks **proyecto -> propuesta**, el mismo de `closeProject` y `selectProposal` (sin deadlock; `FOR SHARE` sobre una propuesta ya `accepted`, que es terminal, es solo coherencia con el orden).
   4. **Intento activo:** `SELECT ... FROM payment_attempts WHERE project_id = :projectId AND status IN ('pending','completed_test') LIMIT 1`.
      - `completed_test` (solo existirá con 010; defensa) -> `PaymentError("PAYMENT_ALREADY_ACTIVE")`.
      - `pending` -> se devuelve `{ kind: "existing", attempt }` (continúa en la Fase B).
      - ninguno -> `INSERT INTO payment_attempts (project_id, proposal_id, client_id, amount_cents, currency, status) VALUES (..., proposal.priceCents, 'USD', 'pending')` (`livemode` por defecto `false`; `stripe_checkout_session_id` `NULL`). Si el índice parcial UNIQUE dispara (red de seguridad; no debería ocurrir bajo el lock) -> `PaymentError("PAYMENT_ALREADY_ACTIVE")`. Devuelve `{ kind: "created", attempt }`. **El intento se inserta y se confirma ANTES de llamar a Stripe.**
2. **Fase B — Stripe (fuera de transacción):**
   - `kind: "existing"` con `stripe_checkout_session_id`: `stripe.checkout.sessions.retrieve(id)`:
     - `status = 'open'` y `url` presente -> **reutiliza**: devuelve `{ reused: true, checkoutUrl: url }` sin crear otra sesión.
     - `status = 'expired'` -> reconciliación del servidor: `UPDATE payment_attempts SET status = 'canceled' WHERE id = :id AND status = 'pending'` (guarda de estado en el `WHERE`) y **vuelve a la Fase A** (una sola vez; si volviera a caer aquí, `STRIPE_UNAVAILABLE`). Solo se cancela con lo que Stripe reporta como `expired`; nunca por el navegador.
     - `status = 'complete'` -> **no cambia ningún estado** (confirmar es de 010): `PaymentError("PAYMENT_ALREADY_ACTIVE")` ("pendiente de confirmación del servidor").
     - error de Stripe al leer -> `PaymentError("STRIPE_UNAVAILABLE")`, sin cambio de estado.
   - `kind: "existing"` **sin** `stripe_checkout_session_id` (sesión nunca guardada: otro request en vuelo, o un fallo entre A y C): si `now - attempt.createdAt <= RESUME_WINDOW_SECONDS` se **reanuda** con la misma idempotency key (abajo). Si es más antiguo -> `UPDATE ... SET status = 'canceled' WHERE id = :id AND status = 'pending' AND stripe_checkout_session_id IS NULL` y vuelve a la Fase A. Esa sesión fantasma, si Stripe llegó a crearla, nunca recibió URL hacia el cliente, así que nadie puede pagarla; vence sola.
   - `kind: "created"` o reanudación: `stripe.checkout.sessions.create(params, { idempotencyKey })` con:
     - `idempotencyKey = "nexora:checkout:" + attempt.id` (determinista por intento: un reintento o doble clic sobre el mismo intento devuelve la misma sesión en Stripe, ventana de 24 h; **a verificar en T0** que Stripe devuelve la misma sesión y que errores de clave en uso son de tipo `StripeIdempotencyError`/409).
     - `params` construidos **solo desde la fila del intento y de la propuesta ya guardadas** (para que los parámetros sean idénticos en cada reintento, requisito de la idempotencia de Stripe):
       - `mode: "payment"`, un `line_items` con `quantity: 1` y `price_data: { currency: "usd", unit_amount: attempt.amountCents, product_data: { name } }`. `unit_amount` es el entero de centavos tal cual (sin conversión ni punto flotante); el servicio comprueba `Number.isSafeInteger(amountCents) && amountCents > 0` y que `currency === "USD"` antes de llamar. `name` = título del proyecto truncado a 80 caracteres (D-K).
       - `client_reference_id: attempt.id`.
       - `metadata` y `payment_intent_data.metadata`: **solo ids internos**: `{ payment_attempt_id, project_id, proposal_id, client_id }`. Nunca email, nombre, título ni descripción (sin PII). 010 usará `payment_attempt_id` para correlacionar eventos.
       - `success_url: ${appUrl}/projects/${projectId}/payment?checkout=success` y `cancel_url: ${appUrl}/projects/${projectId}/payment?checkout=cancel` (**sin** `{CHECKOUT_SESSION_ID}`: la página de retorno no consulta ni usa la sesión; D-H).
       - `expires_at: floor(attempt.createdAt / 1000) + CHECKOUT_SESSION_TTL_SECONDS` (determinista por intento; la ventana de reanudación de 10 min garantiza que siga >= 30 min en el futuro, mínimo de Stripe; **a verificar en T0**).
       - Sin `customer`, `customer_email`, `customer_creation`, `payment_method_types` (métodos dinámicos por defecto de Stripe) ni `locale`.
   - **Respuesta válida:** `session.id` y `session.url` presentes, `session.livemode === false` (defensa en profundidad), `new URL(session.url)` con `https:` y host que termina en `.stripe.com` (**a verificar en T0**). Si `livemode` es `true` -> el intento pasa a `canceled` y `PaymentError("STRIPE_NOT_CONFIGURED")`; si `url` no es válida -> `canceled` y `STRIPE_UNAVAILABLE`.
3. **Fase C — registrar la sesión:** `UPDATE payment_attempts SET stripe_checkout_session_id = :id WHERE id = :attemptId AND status = 'pending' AND stripe_checkout_session_id IS NULL RETURNING id`. Con 0 filas se relee el intento: si ya tiene **ese mismo** session id (otra petición con la misma idempotency key lo guardó primero) es éxito; si tiene otro id o el estado cambió -> `PaymentError("PAYMENT_ALREADY_ACTIVE")`. Devuelve `{ attemptId, checkoutUrl: session.url, reused }`.

**Compensación si Stripe falla al crear la sesión (Fase B, punto 5 del requerimiento; D-D):**

- Rechazo **definitivo** de Stripe (la sesión no se creó): `error.type` en `StripeInvalidRequestError`, `StripeAuthenticationError` o `StripePermissionError` (clasificación por `type`/`statusCode` sin `instanceof`, para que sea simulable sin el SDK) -> `UPDATE ... SET status = 'canceled' WHERE id = :id AND status = 'pending' AND stripe_checkout_session_id IS NULL` y `PaymentError("STRIPE_UNAVAILABLE")`. El intento `canceled` **no bloquea** (el índice parcial solo cuenta `pending`/`completed_test`) y el siguiente clic crea un intento nuevo.
- Fallo **ambiguo o transitorio** (`StripeConnectionError`, timeout, `StripeAPIError`, `StripeRateLimitError`, `StripeIdempotencyError` por clave en uso concurrente, o error de BD en la Fase C): el intento **queda `pending` sin session id** y se lanza `PaymentError("STRIPE_UNAVAILABLE")`. El siguiente clic lo **reanuda con la misma idempotency key** (dentro de la ventana de 10 min) y Stripe devuelve la sesión ya creada si existiera: no hay doble sesión. Pasada la ventana, se cancela y se crea otro intento (ver Fase B).
- `failed` **no** se usa en 009: `failed` es el resultado de un fallo de pago reportado por un webhook verificado (010). Los cierres hechos por el servidor usan `canceled`, que `state-machines §3` permite ("cancelación explícita del servidor").
- Logging: solo `error.type`, `error.code`, `error.statusCode` y `error.requestId` (nunca el mensaje completo si pudiera incluir datos del request, nunca claves ni URLs de Checkout).

**Estados y casos límite del servicio:**

| Caso | Resultado |
|---|---|
| Rol `developer` o `admin` | `AuthError FORBIDDEN` antes de BD y de Stripe |
| Proyecto inexistente, ajeno o id mal formado | `AuthError NOT_FOUND` |
| Proyecto `draft`/`published`/`contracted`/`closed`, o sin propuesta `accepted` | `PAYMENT_NOT_ALLOWED` |
| Sin intento activo | Crea intento `pending` + sesión; `reused: false` |
| Intento `pending` con sesión `open` (reintento, doble clic, otra pestaña) | Devuelve la misma URL; no inserta fila ni crea otra sesión (`reused: true`) |
| Intento `pending` con sesión `complete` en Stripe | `PAYMENT_ALREADY_ACTIVE`, sin cambiar estado |
| Intento `pending` con sesión `expired` | Lo cancela y crea intento nuevo |
| Dos solicitudes simultáneas | Una sola fila activa (lock del proyecto + índice); ambas terminan en éxito con el mismo intento o una recibe `STRIPE_UNAVAILABLE` por clave en uso y reintenta |
| `StripeConfigError` (falta o es live la clave, falta `APP_URL`) | `STRIPE_NOT_CONFIGURED` sin escribir en BD |
| Falla de Stripe | Ver compensación arriba |
| Fallo inesperado de BD | Se propaga; la action responde mensaje genérico |

### RF5. Errores de dominio (punto 11)

Archivo `src/modules/payments/services/payment-errors.ts`, mismo estilo que `ProjectError`/`ProposalError`; las fallas de autorización siguen siendo `AuthError`:

```ts
type PaymentErrorCode =
  | "PAYMENT_NOT_ALLOWED"     // 409  proyecto no está en proposal_selected / sin ganadora
  | "PAYMENT_ALREADY_ACTIVE"  // 409  ya hay un pago en curso o pendiente de confirmación
  | "STRIPE_UNAVAILABLE"      // 502  Stripe no respondió o rechazó la creación/lectura
  | "STRIPE_NOT_CONFIGURED";  // 503  falta/invalida la clave de prueba o APP_URL
```

Mapas `PAYMENT_ERROR_STATUS` y `PAYMENT_ERROR_MESSAGES` (español, sin detalles técnicos):

| Código | Mensaje |
|---|---|
| `PAYMENT_NOT_ALLOWED` | "Este proyecto no está listo para el pago de prueba." |
| `PAYMENT_ALREADY_ACTIVE` | "Ya hay un pago de prueba en curso, pendiente de confirmación del servidor." |
| `STRIPE_UNAVAILABLE` | "No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos." |
| `STRIPE_NOT_CONFIGURED` | "El pago de prueba no está disponible en este entorno." |

### RF6. Servicio de lectura del estado de pago

Archivo `src/modules/payments/services/payment-overview.service.ts` (`import "server-only"`; solo lectura, sin locks):

```ts
getProjectPaymentOverview(actor: AuthUser, projectId: string): Promise<ProjectPaymentOverview>

type ProjectPaymentOverview = {
  project: { id: string; title: string; status: ProjectStatus };
  proposal: { developerName: string; priceCents: number; currency: "USD"; timelineWeeks: number };
  attempt: { status: PaymentAttemptStatus; amountCents: number; createdAt: Date; updatedAt: Date } | null;  // el más reciente por created_at
  canStart: boolean;   // project.status === 'proposal_selected' y no hay intento pending/completed_test
  canResume: boolean;  // project.status === 'proposal_selected' y el último intento es pending
};
```

- `can(actor.role, "payment.start")` -> si no, `AuthError("FORBIDDEN")` (en 009 solo el cliente dueño ve la página; admin y developer: D-I). Proyecto inexistente, ajeno o **sin propuesta ganadora** (borrador, publicado) -> `AuthError("NOT_FOUND")` (404 indistinguible).
- Proyecciones mínimas: **no** incluyen ids de Stripe (sesión, PaymentIntent), `checkoutUrl`, `clientId`, `developerId`, email ni contacto. Un test comprueba `Object.keys` exactos (patrón de 007).
- La página no escribe en BD ni llama a Stripe (un GET no cambia estados). La reconciliación de sesiones expiradas ocurre solo al pulsar el botón (RF4).

### RF7. Server action (punto 6)

Archivo `src/modules/payments/actions/payment.actions.ts` (`"use server"`, solo funciones async):

```ts
startCheckoutAction(projectId: string): Promise<PaymentActionResult>

type PaymentActionResult = { ok: false; code: PaymentErrorCode | "NOT_FOUND" | "UNKNOWN"; message: string };
```

Solo retorna en error; en éxito **no retorna: `redirect(checkoutUrl)`**. Flujo (patrón de 008):

1. `requireRole("client")` dentro de `try`; `catch` -> `handleAuthErrorForPage(e)` (sin sesión -> `/sign-in`; sin fila -> `/onboarding`; rol incorrecto -> 404). **Autentica antes de validar.**
2. `startCheckoutInputSchema.safeParse({ projectId })`: no UUID -> `{ ok: false, code: "NOT_FOUND", message: "No encontramos el proyecto." }` sin tocar BD.
3. `try { result = await createCheckoutForProject(actor, projectId) } catch (e) { return toResult(e) }`. `PaymentError` -> `{ ok: false, code, message: PAYMENT_ERROR_MESSAGES[code] }`; `AuthError NOT_FOUND` -> mensaje de no encontrado; otro `AuthError` -> `handleAuthErrorForPage`; cualquier otro error -> `UNKNOWN` con mensaje genérico "No pudimos completar la acción. Inténtalo de nuevo." sin detalles.
4. Éxito: `revalidatePath(`/projects/${projectId}/payment`)` y `revalidatePath("/dashboard/projects")` y **después, fuera de cualquier `try/catch`**, `redirect(result.checkoutUrl)`. `redirect` lanza por diseño; Next admite URLs absolutas (verificado en `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`: "Can be a relative or absolute path"); T3 verifica manualmente que la navegación a un origen externo funciona con `push` desde la acción (si no, se escala; no se devuelve la URL al cliente como alternativa sin nueva aprobación, D-M).
5. El `checkoutUrl` solo existe en el servicio, la action y la respuesta de redirect: **nunca** se devuelve en `PaymentActionResult`, ni se loguea, ni se guarda.

Schema `src/modules/payments/schemas/payment.schema.ts` (Zod `^4.6.5`):

```ts
startCheckoutInputSchema = z.object({ projectId: z.uuid() });
paymentPageQuerySchema = z.object({ checkout: z.enum(["success", "cancel"]).optional().catch(undefined) });
```

### RF8. Páginas y UI (puntos 7, 8, 9)

**Ruta** `src/app/projects/[id]/payment/page.tsx` (coherente con `/projects/[id]/proposals` y `/edit`), más `loading.tsx` y `error.tsx` (finos, delegan a `payments-loading.tsx`/`payments-error.tsx`). La página: valida UUID (`notFound()` si no), parsea `searchParams` con `paymentPageQuerySchema`, `requireRole("client")` + `getProjectPaymentOverview` dentro de `try` con `handleAuthErrorForPage` en el `catch` (como la página de propuestas) y compone `<PaymentPageView overview={...} returnNotice={checkout} />`. Metadata "Pago de prueba | Nexora". No contiene lógica de negocio.

**Componentes** (`src/modules/payments/components/`):

- `payment-page-view.tsx` (servidor, presentacional): un solo `<h1>`; enlace "Volver a mis proyectos"; **banner permanente** de Modo de prueba (`role="note"`): "Modo de prueba · No se mueve dinero real. Los pagos de prueba no son ingresos ni transferencias reales."; resumen (título del proyecto, nombre del desarrollador, importe con `formatUsd`, plazo en semanas; solo `developerName`, sin email ni contacto); `<PaymentProgress>`; panel de estado según el último intento; leyenda fija "Volver desde Stripe no confirma el pago. El estado solo cambia cuando el servidor lo verifica."; botón según la tabla; aviso de retorno (`?checkout=`).
- `payment-progress.tsx` (presentacional): `<ol>` de 4 pasos con `aria-current="step"` en el paso activo: (1) "Propuesta seleccionada" (siempre completo), (2) "Pago de prueba", (3) "Confirmado por el servidor", (4) "Transferencia al desarrollador: pendiente de implementación". En 009 el paso 3 nunca aparece como completo (solo 010 lo logra) y el paso 4 **nunca** aparece como completo ni como "recibido" (D-J); el texto del paso 4 es "Pendiente de implementación".
- `start-checkout-button.tsx` (`"use client"`): `StartCheckoutButton({ projectId, label }: { projectId: string; label: string })`; `useTransition`; llama `startCheckoutAction(projectId)`; mientras corre queda `disabled` con texto "Redirigiendo a Stripe..."; si responde `{ ok: false }` muestra el mensaje en región `role="alert"`/`aria-live="polite"` y llama `router.refresh()` para `PAYMENT_NOT_ALLOWED`, `PAYMENT_ALREADY_ACTIVE` y `NOT_FOUND` (datos obsoletos); objetivo táctil >= 40 px; sin `window.confirm`.
- `payments-loading.tsx` y `payments-error.tsx` (patrón de `proposals-*`).

**Estado según el último intento** (la fuente es siempre la BD, nunca el query param):

| Estado | Panel | Acción |
|---|---|---|
| Sin intento (`attempt = null`, `canStart`) | "Aún no iniciaste el pago de prueba." Paso 2 activo | Botón "Pagar con Stripe (prueba)" |
| `pending` | Etiqueta "Pendiente". Texto: "Pendiente de confirmación del servidor. Si ya pagaste en Stripe, esta página se actualizará cuando el servidor lo verifique (puede tardar unos segundos)." Paso 3 activo | Botón "Continuar en Stripe" (reanuda o reutiliza la sesión, RF4) y enlace "Actualizar estado" (recarga la misma página; sin polling) |
| `canceled` (`canStart`) | Etiqueta "Cancelado". "El intento anterior se cerró sin completarse." | Botón "Reintentar pago de prueba" |
| `failed` (`canStart`; solo posible con 010) | Etiqueta "Fallido". "El intento anterior falló." | Botón "Reintentar pago de prueba" |
| `completed_test` (solo posible con 010; la vista debe renderizarlo sin romperse) | Etiqueta "Completado en Test Mode · confirmado por el servidor". Paso 3 completo, paso 4 "Pendiente de implementación" | Sin botón |
| Proyecto `closed` o `contracted` sin intento activo | Estado informativo ("Este proyecto ya no admite un nuevo pago de prueba.") | Sin botón |

**Retorno de Stripe** (decisión D-G): misma página con `?checkout=success|cancel`; **solo informa**, no consulta Stripe, no escribe y no altera el panel de estado:

- `success`: aviso `role="status"`: "Volviste desde Stripe. Esto no confirma el pago: esperamos la verificación del servidor." (el panel de debajo muestra el estado real).
- `cancel`: "Volviste desde Stripe sin completar el pago desde esta pantalla. Puedes retomarlo cuando quieras."
- Parámetro ausente o inválido: sin aviso. Como el parámetro es manipulable por cualquiera, ninguno de los textos afirma que un pago se completó ni que no se cobró nada.

**Enlaces (punto 8; archivos de otras specs, asignados a T3):**

- `projects/components/project-list.tsx` (008 lo dejó intacto): para `status === "proposal_selected"` añade un `Link` "Continuar al pago de prueba" a `/projects/${project.id}/payment` (estilo `buttonVariants` primario como "Nuevo proyecto", `h-9`, foco visible), junto a "Ver propuestas". No cambia nada más.
- `proposals/components/project-proposals-view.tsx`: en el aviso de `proposal_selected` se reemplaza el texto "que estará disponible próximamente" por el texto equivalente de próximo paso y un `Link` "Continuar al pago de prueba" a la misma ruta; resto sin cambios.

**Qué ve el desarrollador (punto 9):** en 009 **nada nuevo**. 008 RF9 y D-I ya lo dejaron en 013: "Mis propuestas" sigue mostrando "Aceptada"/"Rechazada" y no hay vista de pago para el desarrollador. Se evita así tocar `proposal.service.ts` y `my-proposals-list.tsx` (007) y su test de proyecciones. Cuando 013 lo añada, solo mostrará el estado del pago ("Pago de prueba pendiente" / "Completado en Test Mode") y la transferencia "Pendiente de implementación", nunca dinero recibido (reglas 14 y 15 de `BRIEF §7`). Alternativa y recomendación en D-I.

**Privacidad de la UI (punto 10):** la página muestra solo `developerName` (ya expuesto al cliente por 007), importe, plazo, título y estado; ni email, ni contacto, ni ids de Stripe, ni session secrets, ni `checkoutUrl` (solo viaja en el redirect). Sin claves en el cliente: `STRIPE_SECRET_KEY` y `APP_URL` no tienen prefijo `NEXT_PUBLIC_`; `src/lib/stripe.ts` es `server-only`; el cliente solo importa la action y tipos.

## 4. Requisitos no funcionales

- Server-only: `src/lib/stripe.ts`, ambos servicios de `payments`. La lógica vive en los servicios, no en la action ni en la UI.
- Una sola dependencia npm nueva (`stripe`); sin cambios de esquema, migraciones, `layout.tsx`, `globals.css`, `proxy.ts` ni `drizzle/`. Único cambio compartido de configuración: T0.
- Sin ninguna llamada a Stripe dentro de una transacción de BD con locks (no se retiene el lock del proyecto durante latencia de red).
- Archivos pequeños y por responsabilidad (SETUP §2): `lib/stripe` envuelve al SDK, schema valida, servicio decide y orquesta, action traduce, componentes renderizan.
- Next 16.3.8 y React 19.2.8: render dinámico; `params`/`searchParams` son `Promise` (patrón de la página de propuestas). El developer consulta `node_modules/next/dist/docs/` (server actions, `redirect`, `revalidatePath`, `useRouter().refresh`) antes de fijar firmas.
- Clave y datos sensibles: nunca se loguean ni se incluyen en mensajes de error (RF2, RF4).
- Accesibilidad: un `<h1>` por página, `aria-live` para errores, foco visible, objetivos táctiles >= 40 px, progreso en `<ol>`.

## 5. Reglas de negocio

- R1. Solo el `client` dueño inicia el pago; admin y developer no (`system-design §6`, D8).
- R2. Solo un proyecto en `proposal_selected` con propuesta `accepted` admite un pago (`state-machines §3`).
- R3. Importe y moneda salen de la propuesta `accepted` guardada en servidor; la entrada no los contiene (I2).
- R4. Como máximo un intento `pending`/`completed_test` por proyecto (red de seguridad: índice parcial); un intento `failed`/`canceled` no bloquea uno nuevo; un reintento crea intento nuevo (`state-machines §3`).
- R5. 009 jamás deja un intento en `completed_test` ni un proyecto en `contracted` (I4); la página de retorno no cambia estado (`BRIEF §7` reglas 9 y 10).
- R6. En 009 solo se escriben `pending` (alta) y `canceled` (cierre por el servidor: error definitivo de Stripe, sesión leída como `expired` desde la API de Stripe, o reintento abandonado fuera de la ventana de reanudación). `failed` queda reservado a 010.
- R7. Todo pago es de Test Mode (`livemode = false`), nunca dinero real (I5); se rechazan claves live.
- R8. El pago y la transferencia son estados independientes (I3): la transferencia se muestra "Pendiente de implementación" y nunca como dinero recibido ni completada (`BRIEF §7` reglas 14 y 15).
- R9. Ningún dato de tarjeta pasa por Nexora: solo identificadores de Stripe y estado derivado; la UI no pide ni muestra datos de pago.
- R10. Sin comisiones, suscripciones, Connect ni cobros reales (`BRIEF §7` regla 15).
- R11. El texto de usuario no afirma custodia ni garantía de fondos.

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones: spec 003 ya define `payment_attempts` (importe en centavos, `currency 'USD'`, `status`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `livemode false`, índice parcial único por proyecto) y `processed_payment_events`. En 009 se escriben `project_id`, `proposal_id`, `client_id`, `amount_cents`, `currency`, `status` y `stripe_checkout_session_id`; `stripe_payment_intent_id` y `completed_at` quedan `NULL`. Observaciones: no existe columna `expires_at` (el vencimiento se obtiene de Stripe al reintentar; no se añade columna: YAGNI); no hay CHECK que ligue `proposal_selected` con intento activo (lo garantizan el servicio y sus pruebas).

## 7. Contratos de servidor o API

- Cliente: `getStripe()`, `getAppUrl()`, `StripeConfigError` (RF2).
- Servicios: `createCheckoutForProject` (RF4) y `getProjectPaymentOverview` (RF6). Errores: `PaymentError` (RF5) y `AuthError`.
- Action: `startCheckoutAction` (RF7). Sin route handlers ni endpoints nuevos (el de webhooks es 010); una ruta de página nueva (`/projects/[id]/payment`).
- Tipos (`src/modules/payments/types/payment.types.ts`): `PaymentAttemptStatus` (derivado del enum de la tabla), `PAYMENT_ATTEMPT_STATUS_LABELS` (Pendiente, Completado en Test Mode, Fallido, Cancelado), `CheckoutStartResult`, `ProjectPaymentOverview`, `PaymentActionResult`.
- Contrato para 010: el `payment_attempt_id` viaja en `metadata` y en `client_reference_id`; el session id queda guardado; 010 debe tratar `checkout.session.expired` sobre un intento ya `canceled` por 009 como evento ignorado (registrado en `processed_payment_events`), sin error.

## 8. Permisos y seguridad

- Autorización en servidor en capas independientes: guard de action (`requireRole("client")`), `can("payment.start")` + `requireOwnership` sin admin dentro del servicio, y la consulta del proyecto con el lock como único punto de decisión. Ni la UI ni `proxy.ts` deciden nada.
- Ajeno o inexistente -> 404 indistinguible; rol incorrecto -> 403 (en páginas, `handleAuthErrorForPage`).
- El actor, el importe, la moneda y la propuesta nunca vienen de la entrada; `projectId` se valida como UUID; los campos extra se ignoran.
- Secretos: `STRIPE_SECRET_KEY` solo servidor, validada y rechazada si es live; sin prefijo `NEXT_PUBLIC_`; ninguna tarea lee `.env*`.
- La URL de Checkout y los ids de Stripe no se envían al cliente más que como destino de redirect; no se guardan URLs en BD.
- Metadata hacia Stripe: solo UUIDs internos, sin PII.
- Exposición mínima: la página solo muestra nombre de desarrollador, importe, plazo, título y estado. Sin email ni contacto.
- Rate limiting de la action y registro/auditoría: spec 015.

## 9. Estados, errores y casos límite

- Doble clic o dos pestañas: bloqueo `FOR UPDATE` del proyecto + idempotency key + índice parcial; ambas terminan en la misma sesión. UI: botón `disabled` durante `pending`.
- Cliente cierra la pestaña de Stripe y vuelve a "Continuar en Stripe": se reutiliza la sesión `open` (sin intento nuevo).
- Cliente abandona y la sesión vence (60 min): al pulsar el botón se lee `expired`, el intento pasa a `canceled` y se crea uno nuevo. Mientras no pulse el botón, el intento sigue `pending` y `closeProject` responde `PAYMENT_IN_PROGRESS` (riesgo R4: 010 lo cierra con `checkout.session.expired`; 012 con cancelación explícita).
- Retorno `?checkout=success` antes del webhook (que aún no existe en 009): panel `pending`, nunca "pagado".
- Retorno `?checkout=cancel`: solo informa; el intento sigue `pending` hasta reanudar o vencer.
- Sesión pagada en Stripe pero 010 aún no desplegado: el intento queda `pending` indefinidamente y el botón responde `PAYMENT_ALREADY_ACTIVE` ("pendiente de confirmación del servidor"). Es el estado esperado entre 009 y 010; sin 010 el flujo completo no cierra.
- `APP_URL` o `STRIPE_SECRET_KEY` ausentes, o clave live: `STRIPE_NOT_CONFIGURED`, sin intento creado.
- Stripe caído al crear: ver compensación (cancelado en rechazo definitivo; reanudable en ambiguo).
- Proyecto cerrado concurrentemente: se serializa por el lock; el perdedor ve `PAYMENT_NOT_ALLOWED` o `PAYMENT_IN_PROGRESS` (de 005).
- Admin o developer abren `/projects/<id>/payment`: 404 (`handleAuthErrorForPage`).
- Proyecto sin ganadora (publicado, borrador): página 404.
- Sesión Clerk expirada en la action: redirect a `/sign-in`; sin onboarding: `/onboarding`.
- Fallo de BD: mensaje genérico en `aria-live`; la página no se rompe.

## 10. Criterios de aceptación verificables

Dependencia, entorno y cliente:

- AC1. `package.json` incluye `"stripe": "^23.0.0"` en `dependencies` y `package-lock.json` lo resuelve; es la única dependencia nueva; `npm run build` pasa. T0 anota en su reporte los resultados de los puntos "a verificar en T0" de RF1.
- AC2. `.env.example` añade solo los nombres `STRIPE_SECRET_KEY` y `APP_URL` (y `STRIPE_WEBHOOK_SECRET` comentado), sin valores; ninguna variable de Stripe tiene prefijo `NEXT_PUBLIC_`.
- AC3. `getStripe()` lanza `StripeConfigError` con mensaje claro (sin la clave ni parte de ella) si `STRIPE_SECRET_KEY` falta, está vacía, empieza por `sk_live_`/`rk_live_` o tiene formato desconocido; acepta `sk_test_...` y devuelve la misma instancia en llamadas siguientes; importar el módulo sin variable no lanza. `getAppUrl()` exige `http(s)`, quita `/` final y lanza si falta.

Servicio de checkout:

- AC4. Camino feliz: el cliente dueño con proyecto `proposal_selected` obtiene `{ attemptId, checkoutUrl, reused: false }`; existe **una** fila `payment_attempts` con `status = 'pending'`, `project_id`, `proposal_id` de la propuesta `accepted`, `client_id = actor.id`, `amount_cents` y `currency` iguales a los de esa propuesta, `livemode = false`, `stripe_checkout_session_id` = id devuelto por Stripe, `stripe_payment_intent_id` y `completed_at` nulos; el proyecto sigue `proposal_selected`.
- AC5. El importe sale del servidor (I2): con varias propuestas de precios distintos, el intento usa el precio de la `accepted`; `createCheckoutForProject` no admite importe, moneda ni propuesta en su entrada (tipo y prueba); `unit_amount` enviado a Stripe es un entero de centavos igual a `amount_cents`, `currency: "usd"`.
- AC6. Parámetros enviados a Stripe: `mode: "payment"`, `client_reference_id = attemptId`, `metadata` y `payment_intent_data.metadata` con exactamente las claves `payment_attempt_id`, `project_id`, `proposal_id`, `client_id` (todas UUID; sin email, nombre ni título), `success_url`/`cancel_url` iguales a `getAppUrl()` + `/projects/<id>/payment?checkout=success|cancel` (sin `session_id`), `expires_at` determinista a partir de `created_at`, y opción `idempotencyKey = "nexora:checkout:" + attemptId`.
- AC7. El intento se inserta **antes** de llamar a Stripe: en la prueba, cuando el mock de `create` se ejecuta, la fila `pending` ya existe en BD con `stripe_checkout_session_id` nulo.
- AC8. Elegibilidad: proyecto `draft`, `published`, `contracted`, `closed` o `proposal_selected` sin propuesta `accepted` -> `PAYMENT_NOT_ALLOWED`, sin fila nueva y sin llamada a Stripe.
- AC9. Autorización: `developer` y `admin` -> `AuthError FORBIDDEN` sin tocar BD ni Stripe (incluso siendo "dueño" sembrado); cliente ajeno, proyecto inexistente -> `AuthError NOT_FOUND`.
- AC10. Un solo intento activo: una segunda llamada con el intento `pending` y sesión `open` en Stripe devuelve la **misma** `checkoutUrl` (`reused: true`), no inserta fila ni llama a `sessions.create`; dos llamadas simultáneas (`Promise.allSettled`) dejan exactamente una fila activa y cada resultado es éxito o `STRIPE_UNAVAILABLE`/`PAYMENT_ALREADY_ACTIVE`, nunca un error de BD sin traducir. El índice parcial se prueba como red de seguridad (INSERT directo de un segundo `pending` es rechazado por la BD, y el servicio responde `PAYMENT_ALREADY_ACTIVE` si se siembra una condición en que el índice dispara).
- AC11. Con sesión `complete` en Stripe: `PAYMENT_ALREADY_ACTIVE`, el intento sigue `pending` (nunca `completed_test`). Con sesión `expired`: el intento viejo pasa a `canceled` y se crea uno nuevo `pending` con nueva sesión; solo uno activo. Un fallo al leer la sesión -> `STRIPE_UNAVAILABLE` sin cambiar estado.
- AC12. Compensación: rechazo definitivo de Stripe (`type: "StripeInvalidRequestError"`/`StripeAuthenticationError`/`StripePermissionError`) deja el intento `canceled`, responde `STRIPE_UNAVAILABLE` y un nuevo intento inmediato funciona; fallo transitorio (`StripeConnectionError`) deja el intento `pending` sin session id y responde `STRIPE_UNAVAILABLE`; el reintento dentro de 10 minutos usa el **mismo** `attemptId` e `idempotencyKey` (no inserta otra fila); pasados los 10 minutos (reloj simulado) el intento viejo pasa a `canceled` y se crea otro. En ningún caso `failed` ni `completed_test`.
- AC13. Respuesta de Stripe inválida: `livemode: true` -> intento `canceled` y `STRIPE_NOT_CONFIGURED`; `url` ausente o que no es `https` de `*.stripe.com` -> intento `canceled` y `STRIPE_UNAVAILABLE`.
- AC14. `StripeConfigError` (clave ausente, clave `sk_live_` simulada desde la frontera) -> `STRIPE_NOT_CONFIGURED` sin ninguna fila escrita.
- AC15. Ningún flujo de 009 deja un intento `completed_test`, un `stripe_payment_intent_id` ni un proyecto distinto de `proposal_selected` (invariante comprobada tras cada caso).
- AC16. Orden de locks (revisión del reviewer por lectura del SQL): el primer sentencia con lock es el `SELECT ... FOR UPDATE` del proyecto, el de la propuesta va después, ninguna llamada a Stripe ocurre dentro de `db.transaction`, y cada `UPDATE` de transición lleva su guarda de estado en el `WHERE`.

Lectura, schema y action:

- AC17. `getProjectPaymentOverview`: devuelve resumen con el precio y plazo de la `accepted`, el último intento por `created_at`, `canStart`/`canResume` correctos para sin intento, `pending`, `canceled`, `failed` sembrado, `completed_test` sembrado, y proyecto `closed`/`contracted`; `Object.keys` exactos de `project`, `proposal` y `attempt` (sin ids de Stripe, `checkoutUrl`, `clientId`, `developerId`, email); ajeno, inexistente o sin ganadora -> `NOT_FOUND`; `developer` y `admin` -> `FORBIDDEN`; no escribe en BD ni llama a Stripe.
- AC18. Schemas: `startCheckoutInputSchema` acepta UUID y rechaza no UUID/vacío/número; `paymentPageQuerySchema` devuelve `success`, `cancel` y `undefined` para cualquier otro valor o ausencia.
- AC19. Action: autentica con `requireRole("client")` antes de validar; con `AuthError` (salvo `NOT_FOUND`) no llama al servicio; UUID inválido -> `{ ok: false, code: "NOT_FOUND" }` sin llamar al servicio; cada `PaymentError` (los 4 códigos) -> su mensaje en español; `AuthError NOT_FOUND` -> mensaje de no encontrado; error desconocido -> `UNKNOWN` genérico; éxito -> `revalidatePath` de las dos rutas y `redirect(checkoutUrl)` **fuera del `try/catch`** (la prueba verifica que `redirect` se llama una vez, tras `revalidatePath`, y que un error de `redirect` no se captura); el resultado de error nunca incluye `checkoutUrl`.

UI y regresión:

- AC20. UI (verificación manual, tras T3, con claves de prueba reales; ver sección 11.3): `/projects/<id>/payment` muestra banner de Modo de prueba, resumen, progreso de 4 pasos y leyenda "Volver desde Stripe no confirma el pago"; los estados sin intento, `pending` y `canceled` se muestran según la tabla de RF8; el botón "Pagar con Stripe (prueba)" redirige a Stripe; pagar con `4242 4242 4242 4242` y volver con `?checkout=success` muestra "pendiente de confirmación del servidor" y **nunca** "pagado"; `?checkout=cancel` solo informa; el paso 4 dice "Pendiente de implementación"; sin email ni ids de Stripe en el HTML.
- AC21. Enlaces: "Mis proyectos" muestra "Continuar al pago de prueba" solo en proyectos `proposal_selected`; la vista de propuestas lo muestra en el aviso de siguiente paso; ambos llevan a la página de pago.
- AC22. Responsive y accesibilidad a 390, 768 y 1280 px: sin scroll horizontal, objetivos táctiles >= 40 px, `aria-live` para errores, foco visible, un `<h1>`.
- AC23. Dependencias de módulos: `payments` no importa `project.service` ni `proposal.service`; solo lee tablas; `project.service.ts`, `proposal.service.ts`, `proposal-selection.service.ts`, `project-transitions.ts`, `my-proposals-list.tsx` y `proxy.ts` no cambian; `drizzle/` no cambia.
- AC24. Regresión: `npm run lint`, `npm run test` y `npm run build` pasan; los tests de 004 a 008 pasan **sin modificaciones**; ningún test usa red, Stripe, Clerk ni Neon reales; la tabla de rutas del build añade solo `/projects/[id]/payment`; `package.json`/`package-lock.json` cambian solo en T0 y solo por `stripe`.
- AC25. Documentación: `docs/MANUAL-TESTS.md` tiene la sección "Spec 009" (sección 11.3); el aviso de 008 "sin enlace de pago todavía" queda actualizado; `system-design.md` marca D10 resuelta para Stripe y anota la dependencia de `payments`.

## 11. Pruebas requeridas

### 11.1 Automáticas (Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM)

Los tests existentes de 004 a 008 **no se modifican**; las pruebas nuevas van en archivos nuevos. **No hay ningún test automático contra Stripe real**: el SDK se sustituye con `vi.mock("@/lib/stripe")` en la frontera (salvo `stripe.test.ts`, que construye el cliente con una clave falsa de prueba sin hacer ninguna petición de red).

- `src/lib/stripe.test.ts` (AC3): clave ausente, vacía, `sk_live_...`, `rk_live_...`, formato desconocido, `sk_test_...` válida (con `vi.stubEnv` y `vi.resetModules`); mensajes sin la clave; memoización tras validar; `getAppUrl` válido, con `/` final, sin esquema, ausente. Mock de `server-only`.
- `src/modules/payments/schemas/payment.schema.test.ts` (AC18).
- `src/modules/payments/services/payment-checkout.service.test.ts` con `createTestDb()` y el mismo patrón de mock (`server-only`, `@/lib/db/client` con `Proxy` + `holder`) que `proposal-selection.service.test.ts`, y `vi.mock("@/lib/stripe")` con un Stripe falso en memoria (`checkout.sessions.create` idempotente por `idempotencyKey`, `retrieve` configurable) (AC4 a AC16): camino feliz, importe de la `accepted` y no del input, parámetros y metadata exactos, intento insertado antes de `create`, no segundo activo, reintento reutiliza sesión `open`, `complete`, `expired`, simultáneas, compensación definitiva y transitoria (reloj simulado con `vi.useFakeTimers({ toFake: ["Date"] })`), respuesta inválida (`livemode`, `url`), `StripeConfigError`, elegibilidad por estado, `developer`/`admin` FORBIDDEN, ajeno/inexistente NOT_FOUND, `completed_test` nunca escrito, red de seguridad del índice, y regresión de `closeProject` (`PAYMENT_IN_PROGRESS` ante el intento creado). **Limitación documentada en el archivo de prueba**: PGlite es de una sola conexión y serializa las transacciones; las pruebas de simultaneidad demuestran coherencia, no el comportamiento real de `FOR UPDATE` en Neon; el reviewer valida los locks leyendo el SQL (AC16).
- `src/modules/payments/services/payment-overview.service.test.ts` con `createTestDb()` (AC17).
- `src/modules/payments/actions/payment.actions.test.ts` (AC19): mismo patrón que `proposal-selection.actions.test.ts` (mock de `requireRole`, del servicio, de `next/cache` y `next/navigation`).
- Regresión: `project.service.test.ts` (incluye `PAYMENT_IN_PROGRESS`), `proposal-selection.service.test.ts`, `proposal.actions.test.ts`, tests de 006 y 004, y `constraints.test.ts` se ejecutan y pasan sin cambios.
- No requieren test unitario (SETUP §3): páginas de `src/app`, `payment-page-view.tsx`, `payment-progress.tsx`, `payments-loading.tsx`, `payments-error.tsx` y los cambios en `project-list.tsx`/`project-proposals-view.tsx` (presentacionales). `start-checkout-button.tsx`: test RTL opcional (muestra error, deshabilita durante la acción, con la action mockeada); no obligatorio.

### 11.2 Qué nunca se prueba de forma automática

Creación real de la sesión, comportamiento de `idempotencyKey` con el servidor de Stripe, `expires_at`, límites del SDK real, navegación al dominio de Stripe y la tarjeta de prueba. Todo eso se cubre en 11.3.

### 11.3 Pruebas manuales con claves reales (tarea T4 las escribe en `docs/MANUAL-TESTS.md`, sección "Spec 009")

Con la cuenta Cliente, un proyecto `proposal_selected` y `STRIPE_SECRET_KEY`/`APP_URL` en `.env.local`: abrir `/projects/<id>/payment` desde "Continuar al pago de prueba" en las dos pantallas; pulsar "Pagar con Stripe (prueba)" y verificar redirección a `checkout.stripe.com` con el importe de la propuesta ganadora y en USD; en el panel de Stripe (modo prueba) comprobar la sesión, su metadata (solo UUIDs) y `client_reference_id`; volver con el botón del navegador y con "cancelar" de Stripe (`?checkout=cancel`) y verificar que solo informa; pulsar de nuevo y verificar que reutiliza la misma sesión (misma URL, sin segunda sesión ni segunda fila en `payment_attempts`); doble clic rápido; pagar con la tarjeta de prueba `4242 4242 4242 4242` y volver (`?checkout=success`): debe decir "pendiente de confirmación del servidor", la fila queda `pending`, el proyecto sigue `proposal_selected` y "Cerrar proyecto" responde `PAYMENT_IN_PROGRESS`; clave `sk_live_` en `.env.local` (con una clave live **falsa**, nunca una real) -> "El pago de prueba no está disponible"; quitar `APP_URL` -> mismo mensaje; revisión de privacidad (sin email ni ids de Stripe en el HTML de la página); cuenta Desarrollador, Admin y Cliente ajeno -> 404; revisión a 390 px.

## 12. Dependencias y riesgos

Dependencias entre specs: 003 (esquema), 004 (auth), 005 (`closeProject`), 008 (selección). Bloquea: 010 (webhooks), 011 (Connect). Dependencia npm: `stripe@^23.0.0` (T0).

Riesgos:

- R1. **API y SDK no verificados contra tipos** (no pude consultar `stripe-docs`/`stripe-best-practices` ni leer los tipos): nombres de campos, errores y límites (`expires_at`, mínimo de cobro) se verifican en T0 (RF1) antes de escribir T1; si algún contrato cambia, la spec vuelve a `borrador`.
- R2. **Idempotencia de Stripe**: la reanudación con la misma clave exige parámetros idénticos; por eso `expires_at` y todo `params` se derivan del intento ya guardado y no de `Date.now()`. Una clave reutilizada con parámetros distintos devuelve error; el diseño lo evita.
- R3. **Atomicidad BD + Stripe**: no hay transacción distribuida. Se resuelve con insertar antes, idempotency key por intento, cancelación en rechazo definitivo y reanudación en fallo ambiguo; el peor caso es una sesión fantasma que nadie puede pagar (nunca recibió URL).
- R4. **Intento `pending` abandonado bloquea el cierre del proyecto** (`PAYMENT_IN_PROGRESS`) hasta que el cliente reintente y la sesión se reconcilie, o hasta 010 (`checkout.session.expired`) / 012 (cancelación explícita). Aceptado en la fase; mitigación parcial: sesión de 60 min y reconciliación al pulsar el botón. Se anota para D2.
- R5. **Sin 010, un pago real completado en Stripe no se refleja**: el intento queda `pending`. Es inherente a la división de fases; el botón avisa "pendiente de confirmación del servidor". No se lanzan 009 y 010 por separado a usuarios finales.
- R6. **Redirect externo desde Server Action**: la documentación lo admite; T3 lo verifica a mano. Alternativa (devolver la URL al cliente y `window.location`) rompe "la URL solo para redirect" y requiere nueva aprobación (D-M).
- R7. **PGlite no demuestra concurrencia real** (mismo caveat que 008): se valida por lectura del SQL y restricciones de BD (AC16, AC10).
- R8. **Query param manipulable**: `?checkout=success` lo puede escribir cualquiera; por eso no afecta al estado ni a los textos de estado.
- R9. No se pudo abrir el artifact de diseño: detalles visuales por contrastar con el humano.
- R10. `APP_URL` mal configurada hace que Stripe redirija a un origen equivocado tras pagar; mitigación: validación de formato y verificación manual en 11.3; valor por entorno en 017.

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. Archivos de otras specs: `project-list.tsx` y `project-proposals-view.tsx` -> T3; `system-design.md` y `MANUAL-TESTS.md` -> T4; `.env.example`, `package.json`, `package-lock.json` -> T0. **No se tocan**: `project.service.ts`, `proposal.service.ts`, `proposal-selection.service.ts`, `project-transitions.ts`, `my-proposals-list.tsx`, `proxy.ts`, `layout.tsx`, `drizzle/`, ni ningún `.env*` distinto de `.env.example`. Durante el bloque paralelo (T2, T3, T4) nadie corre `npm install` ni `npm run build`; el reviewer corre el build completo al final.

### T0 — Dependencia Stripe, entorno y cliente (serial, primero)

- Archivos: `package.json`, `package-lock.json` (solo `npm install stripe`), `.env.example` (solo nombres, RF3), `src/lib/stripe.ts`, `src/lib/stripe.test.ts`.
- Depende de: —
- Paralelizable: no (cambio compartido de configuración y `src/lib/**`)
- Cubre: AC1, AC2, AC3 y los puntos "a verificar en T0" de RF1 (el developer los reporta; no inventa).

### T1 — Contratos y servicios de pago (serial)

- Archivos: `src/modules/payments/services/payment-errors.ts`, `src/modules/payments/types/payment.types.ts`, `src/modules/payments/schemas/payment.schema.ts`, `src/modules/payments/schemas/payment.schema.test.ts`, `src/modules/payments/services/payment-checkout.service.ts`, `src/modules/payments/services/payment-checkout.service.test.ts`, `src/modules/payments/services/payment-overview.service.ts`, `src/modules/payments/services/payment-overview.service.test.ts`.
- Depende de: T0
- Paralelizable: no (contrato base de T2, T3 y T4)
- Cubre: AC4 a AC18, AC23 (servicios)

### T2 — Server action

- Archivos: `src/modules/payments/actions/payment.actions.ts`, `src/modules/payments/actions/payment.actions.test.ts`.
- Depende de: T1
- Paralelizable: sí (con T3 y T4: archivos disjuntos; T3 importa la firma fijada en RF7)
- Cubre: AC19

### T3 — Página, componentes y enlaces

- Archivos: `src/app/projects/[id]/payment/page.tsx`, `src/app/projects/[id]/payment/loading.tsx`, `src/app/projects/[id]/payment/error.tsx`, `src/modules/payments/components/payment-page-view.tsx`, `src/modules/payments/components/payment-progress.tsx`, `src/modules/payments/components/start-checkout-button.tsx`, `src/modules/payments/components/payments-loading.tsx`, `src/modules/payments/components/payments-error.tsx`, `src/modules/projects/components/project-list.tsx` (enlace "Continuar al pago de prueba", RF8), `src/modules/proposals/components/project-proposals-view.tsx` (enlace en el aviso, RF8).
- Depende de: T1 y contrato de T2 (RF7)
- Paralelizable: sí (con T2 y T4)
- Cubre: AC20, AC21, AC22 (verificación manual; sin tests unitarios obligatorios)

### T4 — Documentación y pruebas manuales

- Archivos: `docs/MANUAL-TESTS.md` (cabecera "Cubre: specs 003 a 009"; sección 6: actualizar la línea "Aparece el aviso del siguiente paso (sin enlace de pago todavía)"; nueva sección "Spec 009" con 11.3 y los pasos de la sección 14.1; la sección "Revisión visual transversal" pasa a ser la última), `docs/architecture/system-design.md` (solo: `§4` nota de que `payments` escribe únicamente `payment_attempts` y lee tablas de `projects`/`proposals`/`users`, y que el cliente de Stripe es `src/lib/stripe.ts`; `§8` D10 marcada resuelta para variables de Stripe con la convención de RF3).
- Depende de: T1 (contratos finales)
- Paralelizable: sí (con T2 y T3: solo documentación)
- Cubre: AC25

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: **aprobada** por el humano con las recomendaciones por defecto de D-A a D-N y de las preguntas abiertas P1-P4.

### 14.1 Pasos manuales del humano (punto 13; el agente nunca maneja secretos)

1. Crear una cuenta de Stripe y quedarse en el modo de prueba (sandbox/Test Mode; no activar la cuenta para cobros reales).
2. En el panel de Stripe (modo prueba, Developers -> API keys) copiar la **clave secreta de prueba** (`sk_test_...`; nunca una `sk_live_`) y pegarla en `.env.local` como `STRIPE_SECRET_KEY`. Poner `APP_URL=http://localhost:3000` (o el puerto en uso).
3. Reiniciar `npm run dev` para que lea las variables. El agente no lee ni escribe `.env.local`.
4. Para pagar en la página de Stripe usar la tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y cualquier código postal.
5. **Solo para la spec 010** (no necesario para 009): instalar la CLI de Stripe, ejecutar `stripe login` y `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; copiar el `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET` en `.env.local`.

### 14.2 Decisiones

- D-A. Versión del SDK. Recomendación: `stripe@^23.0.0` (estable `latest` verificada hoy con `npm view stripe version`; sin preview). Alternativa: fijar `23.0.0` exacta (como `next`), más reproducible, menos parches automáticos.
- D-B. Variable de URL de retorno. Recomendación: `APP_URL` solo servidor (no `NEXT_PUBLIC_`, sin necesidad en el cliente). Alternativa: `NEXT_PUBLIC_APP_URL` (consistente con las variables de Clerk, pero expone en el bundle un dato que ningún componente cliente usa) o derivar del `Host` (descartado: spoofable).
- D-C. Orden y fases. Recomendación: insertar `pending` y confirmar **antes** de llamar a Stripe y registrar el session id después (sin Stripe dentro de la transacción, no se retiene el lock de proyecto durante la red). Alternativa: crear la sesión dentro de la transacción (una sola unidad, pero retiene locks y pierde la compensación fina).
- D-D. Compensación si Stripe falla. Recomendación: `canceled` en rechazo definitivo; dejar `pending` reanudable (misma idempotency key, 10 min) en fallo ambiguo; `failed` reservado a webhook. Alternativa: marcar siempre `failed` (viola que `failed` lo fija solo un webhook verificado) o nunca compensar (un error de configuración dejaría el proyecto bloqueado por `PAYMENT_IN_PROGRESS`).
- D-E. Reutilización y reconciliación de sesión. Recomendación: leer la sesión con `retrieve` (no se guarda la URL), reutilizar si `open`, cancelar el intento si `expired`, no tocar nada si `complete`. Alternativa: no reconciliar en 009 (un intento abandonado bloquea hasta 010) o guardar la URL en BD (descartado: dato sensible adicional).
- D-F. Vencimiento y ventana. Recomendación: `expires_at` = creación + 60 min (determinista), ventana de reanudación 10 min. Alternativa: sin `expires_at` (24 h por defecto de Stripe; más simple, pero un intento abandonado bloquea el cierre hasta 24 h).
- D-G. Página de retorno. Recomendación: misma página `/projects/[id]/payment?checkout=success|cancel`, solo informa. Alternativa: rutas separadas `/payment/success` y `/payment/cancel` (más archivos, sin beneficio).
- D-H. `session_id` en `success_url`. Recomendación: no incluirlo (nada en 009 lo consume y evita la tentación de "confirmar" con él). Alternativa: incluir `{CHECKOUT_SESSION_ID}` para uso futuro (010/012); se añade si hace falta.
- D-I. Vistas de pago para `admin` y `developer`. Recomendación: no en 009 (el servicio de lectura es solo cliente dueño; 012/013 las definen y 008 ya las difirió); "Mis propuestas" sin cambios. Alternativa: mostrar al desarrollador ganador el estado del pago en "Mis propuestas" ahora (obliga a modificar `proposal.service.ts`, `my-proposals-list.tsx`, `proposal.types.ts` y sus tests de proyecciones: más tareas y más riesgo, poco valor mientras no exista 010).
- D-J. Paso 4 del progreso (transferencia). Recomendación: texto fijo "Pendiente de implementación", sin derivar `transferStatus` formalmente (la derivación `not_applicable`/`pending_implementation` de `state-machines §4` llega con 010/011/013). Alternativa: derivarlo ya (helper más), con el mismo texto visible.
- D-K. Nombre del producto en Stripe. Recomendación: título del proyecto truncado a 80 caracteres (lo ve el propio cliente en su Checkout; no va en `metadata`). Alternativa: texto fijo "Proyecto Nexora (pago de prueba)" (sin contenido de usuario en Stripe).
- D-L. Cancelación explícita iniciada por el cliente. Recomendación: fuera de 009 (010 cubre expiración por webhook; 012 la cancelación explícita y la política de cierre D2). Alternativa: botón "Cancelar intento" en 009 (expirar la sesión por la API y marcar `canceled`), más superficie y pruebas.
- D-M. Entrega de la URL de Checkout. Recomendación: `redirect()` desde la Server Action (la URL nunca llega al cliente como dato). Alternativa: devolver la URL en el resultado y navegar en el cliente, solo si T3 comprueba que `redirect` a origen externo no funciona (requiere nueva aprobación).
- D-N. Archivo de `src/lib/stripe`. Recomendación: un solo archivo `src/lib/stripe.ts` con `getStripe`, `getAppUrl` y `StripeConfigError`. Alternativa: carpeta `src/lib/stripe/` con varios archivos (YAGNI, más superficie de mock).

## Preguntas abiertas

- P1. ¿Se desea mostrar el número de tarjeta de prueba (`4242 4242 4242 4242`) en la propia página como ayuda, o solo en la documentación? Recomendación: solo en documentación (la propia página de Stripe lo sugiere en modo prueba).
- P2. ¿El texto del banner de Modo de prueba debe nombrar a Stripe? Recomendación: sí, "Modo de prueba de Stripe · No se mueve dinero real"; confirmar con el diseño.
- P3. ¿Debe la página recargarse sola (polling) mientras está `pending`? Recomendación: no en 009 (enlace manual "Actualizar estado"); 010 puede añadirlo cuando exista algo que esperar.
- P4. Detalles visuales (jerarquía del progreso, disposición del resumen, colores del banner): por contrastar con el diseño de referencia, que no fue accesible.

## Próximas fases

- 010 (`payment-state-and-webhooks.md`): ruta `POST /api/webhooks/stripe` (`await req.text()` para el cuerpo crudo), `STRIPE_WEBHOOK_SECRET`, `webhooks.constructEvent`, `processed_payment_events`, mapeo de eventos (`checkout.session.completed` -> `completed_test` + `stripe_payment_intent_id` + `projects: proposal_selected -> contracted` mediante una hoja nueva en `projects/services/project-transitions.ts`; `checkout.session.expired` y `payment_intent.payment_failed` -> `canceled`/`failed`), eventos fuera de orden, política de cierre con intento `pending` (D2), reconciliación con Stripe; debe tratar `expired` sobre un intento ya `canceled` por 009 como ignorado.
- 011: Stripe Connect o simulación de la transferencia (`simulatedTransfer`) y derivación formal de `transferStatus`.
- 012/013: paneles del cliente y del desarrollador (estado del pago, cancelación explícita, contacto del ganador); vista de pago para admin.
- 014: estados de carga/error/vacío y mensajes de éxito transversales.
- 015: rate limiting de la action de pago, revisión de privacidad y logs.
- 017: valor de `APP_URL` y de las claves por entorno; webhooks de Stripe en el entorno desplegado.

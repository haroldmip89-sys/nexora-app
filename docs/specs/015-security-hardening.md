# Seguridad del MVP: rate limiting y endurecimiento

Estado: done

Spec 015 de `docs/SDD-PLAN.md §8` (Fase 5; el plan la nombra `security-and-privacy`, aquí se usa el slug `security-hardening` por el patrón `NNN-slug` y por su alcance real). Cierra los pendientes "rate limiting del webhook y de la acción de refresco" de `docs/MANUAL-TESTS.md §10` (specs 010 y 011a). Formato y patrones: specs 010, 011a/b/c, 012 y 014.

## Objetivo

MVP seguro sin infraestructura pesada ni cuentas externas nuevas:

1. Limitar la frecuencia de las server actions sensibles (las que llaman a Stripe o escriben datos) por usuario interno, con una interfaz mínima y reemplazable.
2. Añadir cabeceras de seguridad (hoy no hay ninguna) y una CSP compatible con Clerk y Stripe, primero en modo `Report-Only`.
3. Corregir los hallazgos confirmados con evidencia (sección siguiente): cuerpo del webhook sin tope y errores completos de Drizzle en logs.

Arquitectura que aplica (solo estas secciones): `system-design.md §6` (permisos: el limitador no cambia la matriz, solo añade un techo de frecuencia a acciones ya autorizadas), `§7` (webhooks y pagos: la firma sigue siendo la única autenticación del webhook) y `§3` (propiedad de datos: una tabla de contadores en Neon). Next 16: se consultó `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (el `proxy.ts` sustituye al middleware; la CSP con nonce exige render dinámico), `.../05-config/01-next-config-js/headers.md` y `.../03-file-conventions/proxy.md` (las Server Functions son POST a la ruta de la página; un matcher que excluye una ruta también las excluye). Clerk: `clerkMiddleware(handler, { contentSecurityPolicy })` ya existe en `@clerk/nextjs` 7.9 (`node_modules/@clerk/nextjs/dist/types/server/clerkMiddleware.d.ts:23-26`, `content-security-policy.d.ts`) y trae directivas por defecto para Clerk y Stripe (`dist/esm/server/content-security-policy.js`: `frame-src`/`script-src` con `js.stripe.com`, `hooks.stripe.com`, `connect-src` con `api.stripe.com`, `img.clerk.com`).

## Hallazgos (confirmados en código, con evidencia)

| # | Hallazgo | Evidencia | Severidad | Tratamiento |
|---|---|---|---|---|
| H1 | Ninguna acción sensible tiene límite de frecuencia: cada llamada puede crear sesiones de Checkout, leer sesiones/cuentas de Stripe o escribir en Neon sin techo | Acciones: `payment.actions.ts:33`, `payment-reconciliation.actions.ts:32`, `payment-cancellation.actions.ts:35`, `connected-account.actions.ts:46` y `:61`, `developer-transfer.actions.ts:13`, `project.actions.ts:84,110,171,175,179`, `proposal.actions.ts:82,111,141`, `proposal-selection.actions.ts:42`, `rating.actions.ts:89,97`, `developer-profile.actions.ts:26`. Pendiente reconocido en `MANUAL-TESTS.md §10` | Media (costo y cuota de Stripe en Test Mode, carga de BD) | T1, T2, T3 |
| H2 | El webhook de Stripe lee el cuerpo completo antes de verificar la firma, sin tope de tamaño | `src/app/api/webhooks/stripe/route.ts:12` (`await req.text()`), la verificación llega en `:16` | Baja (el hosting ya limita el payload; la verificación es un HMAC en memoria y nada toca la BD antes de verificar) | T4 (tope explícito) |
| H3 | No hay cabeceras de seguridad ni CSP; `x-powered-by` queda activo (valor por defecto de Next) | `next.config.ts:3-5` (config vacía); `src/proxy.ts:6` (`clerkMiddleware()` sin opciones) | Media | T0 |
| H4 | Varios `console.error` registran el objeto de error completo. Un error de Drizzle (`DrizzleQueryError`) incluye en el mensaje la consulta y sus parámetros (`node_modules/drizzle-orm/errors.js:10-15`: ``Failed query: ${query}\nparams: ${params}``), que pueden ser el id de Clerk del usuario o el texto de búsqueda del catálogo | `src/modules/auth/services/nav-viewer.service.ts:14,24`; `src/modules/projects/services/public-viewer.service.ts:23`; `src/app/projects/page.tsx:29`; `src/modules/projects/components/public-catalog-results.tsx:59` | Baja-media (PII/identificadores en logs de producción) | T4 |

### Revisado y sin hallazgo (no se toca)

- **Autorización e IDOR:** todo recurso privado se verifica en el servidor con `requireOwnership` o filtrando por `actor.id`: `payment-checkout.service.ts:110`, `payment-reconciliation.service.ts:38`, `payment-cancellation.service.ts:40`, `payment-overview.service.ts:39`, `proposal-selection.service.ts:43`, `rating.service.ts:36`, `project.service.ts:45`, `proposal.service.ts:125,242`, `developer-transfer.service.ts:205`, `connected-account.service.ts:77`, `developer-profile.service.ts:42`. Todas las acciones empiezan con `requireRole` (`payment.actions.ts:36`, `developer-transfer.actions.ts:16`, etc.). Los ajenos responden `NOT_FOUND` (`current-user.service.ts:37-46`).
- **Entradas:** los ids se validan como UUID (`project.actions.ts:38-42`, `proposal.actions.ts:26-30`, `startCheckoutInputSchema` en las acciones de pago) y los formularios con Zod antes de llegar al servicio.
- **XSS:** no hay `dangerouslySetInnerHTML` en `src/`; el Markdown pasa por `urlTransform` con `sanitizeUrl` (`markdown-content.tsx:84`), las imágenes se renderizan solo como texto alternativo (`:81`) y los enlaces externos llevan `rel="noopener noreferrer nofollow"` (`developer-profile-view.tsx:117`, `markdown-content.tsx:22`).
- **Webhooks:** la firma se verifica antes de cualquier efecto (`stripe/route.ts:16`, `clerk/route.ts:9`), con tolerancia de 300 s (`stripe.ts:81`) y sin registrar cuerpo ni cabecera.
- **Claves:** `getStripe()` rechaza claves live (`stripe.ts:36-40`); `stripeErrorLogFields` sanea mensajes de Stripe (`stripe.ts:127-155`).
- **Variables de entorno:** `process.env` se lee en solo 4 puntos, cada uno validado de forma perezosa con mensaje sin valor (`stripe.ts:30,57,85`, `db/client.ts:11`); Clerk lee las suyas internamente. **No está dispersa, así que no se crea un módulo de validación de env (YAGNI).** `.env*` está ignorado salvo `.env.example` (`.gitignore:34-35`) y `.env.example` ya lista todas las variables usadas, solo nombres, sin valores reales. Esta spec no añade variables nuevas.
- **No confirmado, por tanto fuera:** abuso de `completeOnboarding` (`complete-onboarding.action.ts:15`, idempotente y autenticado por Clerk); límites de inicio de sesión (los gestiona Clerk).

## Alcance

- Incluye:
  - `src/lib/rate-limit.ts`: limitador de ventana fija con puerto de almacenamiento y almacenamiento en memoria (solo tests), reloj inyectable.
  - Almacenamiento real en Neon: tabla `rate_limit_hits` (migración generada por drizzle-kit) y servicio `enforceRateLimit(actor, policy)`.
  - Políticas por acción y su uso en las 18 acciones listadas en H1 (resultado `RATE_LIMITED` con mensaje en español).
  - Cabeceras estáticas en `next.config.ts` y CSP en `proxy.ts` vía `clerkMiddleware` en modo `reportOnly`.
  - Tope de tamaño del cuerpo del webhook de Stripe y logs de error sin objeto completo.
  - Actualizar `docs/MANUAL-TESTS.md` (§10 y una sección de pruebas manuales de seguridad) y registrar decisiones en `system-design.md §8`.
- No incluye: limitar por IP; rate limiting del webhook de Stripe o de Clerk (ver D3); Upstash/Redis; WAF, CAPTCHA, MFA, antivirus; CSP en modo enforce con nonce (`strict`); módulo central de validación de env; despliegue (017); tests globales (016); dinero real; rate limiting de `completeOnboarding`; cambios a specs `done` (ver Preguntas abiertas P6).

## Decisiones (con recomendación por defecto)

- **D1. Almacenamiento del limitador: tabla en Neon (recomendado).** Opciones evaluadas:

  | Opción | Fiabilidad en Vercel/serverless | Costo / cuenta | Veredicto |
  |---|---|---|---|
  | Memoria (`Map`) | **No es fiable**: cada instancia serverless tiene su propio mapa y se pierde en cada arranque en frío; un atacante, o simple concurrencia, la esquiva | Gratis | Solo tests; nunca producción |
  | Upstash Redis + `@upstash/ratelimit` | Buena y con latencia baja, algoritmos listos | Cuenta externa nueva, dos variables de entorno secretas, dependencia nueva (`@upstash/ratelimit`, `@upstash/redis`); el plan gratuito y su cuota deben verificarse al contratar | Mejor opción si el tráfico crece o se limitan rutas públicas por IP; reemplazo previsto (interfaz de D2) |
  | Tabla en Neon (upsert atómico) | Buena: una sola fuente compartida, atómica (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`) | Sin cuenta ni dependencia nuevas; un upsert extra por acción sensible (cada una ya hace varias consultas), costo de cómputo despreciable | **Recomendada** para el MVP: las acciones limitadas son autenticadas y de baja frecuencia |

  Inconveniente aceptado: una escritura más por acción y una tabla que crece (limpieza oportunista, D2). Para limitar rutas públicas por IP (que haría una escritura de BD por petición anónima, un vector de abuso en sí mismo) se necesitaría Upstash: por eso el webhook queda fuera (D3).
- **D2. Interfaz mínima y reemplazable.** `src/lib/rate-limit.ts` define el puerto `RateLimitStore { increment(key: string, windowStartMs: number): Promise<number> }` y `createRateLimiter({ store, now })`, que devuelve `check(key, { limit, windowSeconds }): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }>` con ventana fija (`windowStart = floor(now / window) * window`; ráfaga máxima en el borde de ventana de 2x el límite, aceptable). El adaptador de Neon vive en el módulo `security` (la tabla y su store, no en `lib`, para que `lib` no dependa de módulos); pasar a Upstash = escribir otro `RateLimitStore` y cambiar una línea del servicio. Limpieza: con probabilidad 1/100 por llamada se borran filas con `window_start` de más de 1 día (azar inyectable para test); sin cron.
- **D3. Webhook de Stripe: no se limita por IP; se endurece.** Justificación: (a) la firma ya se verifica (`stripe/route.ts:16`) y antes de verificar solo se ejecuta un HMAC en memoria, sin BD ni Stripe, de modo que un flujo de peticiones falsas cuesta cómputo, no datos; (b) limitar por IP exigiría una escritura de BD por petición anónima, peor que el problema, y la IP de origen en cabeceras reenviadas no es confiable por sí sola; (c) bloquear por IP arriesga descartar eventos legítimos de Stripe, que no se pueden reproducir si ya se devolvió 2xx/4xx. Se añade un tope de tamaño del cuerpo (1 MiB, muy por encima de un evento real) con `413` antes de leer el cuerpo (H2), y no se cambian los códigos 400/500 existentes (Stripe reintenta ante 5xx). Techo por IP, si algún día hiciera falta, se resuelve con Upstash en 017/ficha de despliegue, con un límite generoso (por ejemplo 300 peticiones/minuto por IP hasheada) y **fail-open**. `/api/webhooks/clerk` queda igual (la verificación Svix la hace el SDK).
- **D4. Clave y logs sin PII.** La clave es `<política>:<users.id>` (UUID interno del actor ya autenticado), nunca correo, id de Clerk ni IP. El único log del limitador es `console.warn("[rate-limit] blocked", { policy })` y `console.error("[rate-limit] store failed", { name })` (nombre del error, nunca el objeto): sin userId, sin correo, sin IP.
- **D5. Fail-open si falla el almacenamiento.** Si el store lanza, la acción continúa y se registra el error: el limitador es una defensa de costo/abuso, no un control de autorización (esa sigue en `requireRole`/`requireOwnership`), y las acciones limitadas ya dependen de la misma BD, de modo que una caída real de Neon hace fallar la acción de todos modos. Fail-closed convertiría un fallo del limitador en una caída de pagos.
- **D6. Políticas (por usuario, ventana fija; valores iniciales ajustables en un solo lugar):**

  | Política | Acciones | Límite |
  |---|---|---|
  | `checkout.start` | `startCheckoutAction` | 10 / 10 min |
  | `payment.refresh` | `refreshPaymentStatusAction` | 20 / 5 min |
  | `payment.cancel` | `cancelPendingPaymentAction` | 10 / 10 min |
  | `payout.onboarding` | `startPayoutOnboardingAction` | 10 / 10 min |
  | `payout.refresh` | `refreshConnectedAccountAction` | 20 / 5 min |
  | `transfer.retry` | `retryTransfersAction` | 10 / 10 min |
  | `project.write` | `createProjectAction`, `updateProjectAction`, publicar, despublicar, cerrar | 60 / 10 min |
  | `proposal.write` | crear, actualizar, retirar propuesta | 60 / 10 min |
  | `proposal.select` | `selectProposalAction` | 20 / 10 min |
  | `rating.write` | crear y actualizar valoración | 20 / 10 min |
  | `profile.save` | `saveDeveloperProfileAction` | 30 / 10 min |

  Los techos son holgados para un uso humano normal (incluido el reintento tras un error) y cortan automatizaciones. Las políticas con llamada a Stripe son las más estrictas.
- **D7. Dónde se aplica.** En la acción, justo después de `requireRole` (el actor ya es un usuario real) y antes de validar o llamar al servicio; así un usuario sin permiso no consume cuota y el servicio de dominio no cambia. Al rechazar: resultado `{ ok: false, code: "RATE_LIMITED", message: "Hiciste demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo." }` (o `formError(...)` con ese mensaje en las acciones de formulario). Se añade `"RATE_LIMITED"` a los uniones de `code` de resultado de cada módulo; el developer ejecuta `tsc` para encontrar los consumidores (componentes que hagan `switch` exhaustivo).
- **D8. Cabeceras estáticas (`next.config.ts`, todas las rutas) y `poweredByHeader: false`.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` (anti-clickjacking efectivo ya, porque `frame-ancestors` **se ignora en `Report-Only`**), `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Strict-Transport-Security: max-age=63072000` (sin `includeSubDomains` ni `preload`: decisión de dominio de 017). Sin `Cross-Origin-Opener-Policy`: podría romper ventanas emergentes de OAuth de Clerk.
- **D9. CSP: `Content-Security-Policy-Report-Only` primero, vía Clerk.** `clerkMiddleware(undefined, { contentSecurityPolicy: { reportOnly: true, directives: ... } })` reutiliza las directivas por defecto de Clerk (Clerk, Cloudflare Turnstile, `js.stripe.com`, `hooks.stripe.com`, `api.stripe.com`) y se le añaden `frame-ancestors 'none'`, `object-src 'none'` y `base-uri 'self'` (se conserva el `form-action 'self'` por defecto). Riesgo conocido y por qué `Report-Only`: la CSP por defecto de Clerk mantiene `script-src` con `'unsafe-inline'`, `https:` y `http:`, de modo que aporta poca defensa contra XSS; el modo estricto (`strict: true`, nonce + `strict-dynamic`) exige render dinámico de todas las páginas y puede romper la carga de Clerk/Next, así que queda fuera (P3). La redirección a Checkout (`checkout.stripe.com`, `connect.stripe.com`) es navegación de nivel superior iniciada con `redirect()` desde una acción (fetch + navegación del cliente), no un envío de formulario, por lo que `form-action` no debería afectarla: se comprueba a mano en Report-Only. Los problemas que aparezcan en consola se corrigen añadiendo orígenes concretos en `directives`; **pasar a modo enforce (quitar `reportOnly`) lo decide un humano tras la lista manual de §MANUAL-TESTS** y no es parte de esta spec.
- **D10. Logs de error.** Nuevo `safeErrorLog(error)` en `src/lib/safe-error-log.ts` devuelve solo `{ name, code? }` (sin `message`, `params`, `query`, `cause` ni stack) y sustituye al objeto completo en los 4 sitios de H4. Los logs de pagos ya cumplen (usan `stripeErrorLogFields` o `error.name`).

## Reutilizar

| Qué | Dónde | Uso |
|---|---|---|
| `requireRole` / `requireOwnership` / `AuthError` | `src/modules/auth/services/current-user.service.ts` | Se mantienen como únicos controles de autorización; el limitador va después |
| Patrón de resultado `{ ok, code, message }` y `toResult`/`formError` en cada `*.actions.ts` | acciones existentes | `RATE_LIMITED` se integra en esos mismos tipos |
| `db` (Neon, Drizzle) y `sql` upsert | `src/lib/db/client.ts` | Store del limitador |
| Tabla `processed_payment_events` como patrón de tabla técnica | `src/modules/payments/schema/processed-payment-events.table.ts` | Forma de `rate_limit_hits` |
| PGlite para tests de BD | `src/lib/db/test-db.ts`, `migrations.test.ts` | Test del store de Neon, si permite aplicar la migración |
| `clerkMiddleware` con `contentSecurityPolicy` | `@clerk/nextjs` 7.9 | CSP sin reimplementar las directivas de Clerk/Stripe |
| `stripeErrorLogFields`, `WEBHOOK_TOLERANCE_SECONDS` | `src/lib/stripe.ts` | Ya cubren la firma y los logs de Stripe; no se tocan |
| Tests existentes del webhook | `src/app/api/webhooks/stripe/route.test.ts`, `route.flow.test.ts` | Se amplían, no se reescriben |
| Existe ya | Nada equivalente a un limitador, cabeceras o `safeErrorLog` (`grep` en `src/`: sin resultados) | Todo lo anterior es nuevo |

## Archivos

Nuevos: `src/lib/rate-limit.ts` (+ test), `src/lib/security-headers.ts` (+ test), `src/lib/safe-error-log.ts` (+ test), `src/modules/security/schema/rate-limit-hits.table.ts`, `src/modules/security/services/rate-limit.service.ts` (+ test), `src/modules/security/services/rate-limit-policies.ts`, `drizzle/0009_<nombre>.sql` y `drizzle/meta/*` (generados).
Modificados: `next.config.ts`, `src/proxy.ts`, las 10 `*.actions.ts` de las tareas T2/T3 y sus tipos de resultado, `src/app/api/webhooks/stripe/route.ts` (+ `route.test.ts`), `nav-viewer.service.ts`, `public-viewer.service.ts`, `src/app/projects/page.tsx`, `public-catalog-results.tsx`, `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`.

## Criterios de aceptación

- AC1: `createRateLimiter` permite hasta `limit` llamadas por clave dentro de la ventana y rechaza la siguiente con `retryAfterSeconds` (entero, >= 1, <= `windowSeconds`); al avanzar el reloj a la ventana siguiente vuelve a permitir.
- AC2: Claves distintas (otro usuario u otra política) no comparten contador.
- AC3: `enforceRateLimit` nunca lanza: si el store falla devuelve `{ ok: true }` (fail-open) y registra solo el nombre del error; al bloquear registra solo la política. Ningún log contiene userId, correo ni IP.
- AC4: La tabla `rate_limit_hits` (`key` texto, `window_start` timestamptz, `count` entero, clave primaria `(key, window_start)`) se crea con una migración generada por drizzle-kit; `increment` es un único upsert atómico que devuelve el contador nuevo; la limpieza oportunista borra solo filas de más de 1 día.
- AC5: Las 18 acciones de H1 llaman a `enforceRateLimit` con la política de D6 después de `requireRole` y antes de validar/llamar al servicio; un usuario sin rol no consume cuota; al rechazar, el servicio de dominio no se invoca y el resultado es `RATE_LIMITED` con el mensaje de D7 (en español, sin códigos internos visibles).
- AC6: `next.config.ts` emite en todas las rutas `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y `Strict-Transport-Security` con los valores de D8, y `poweredByHeader: false`.
- AC7: Las respuestas de páginas incluyen `Content-Security-Policy-Report-Only` (no `Content-Security-Policy`) con las directivas por defecto de Clerk más `frame-ancestors 'none'`, `object-src 'none'` y `base-uri 'self'`; las rutas `/api/webhooks/*` siguen respondiendo igual que antes.
- AC8: Con la CSP en Report-Only, iniciar sesión, registrarse, completar onboarding, abrir `/projects/<id>/payment`, ser redirigido a Stripe Checkout y volver, e iniciar el onboarding de cobros funcionan igual que antes (verificación manual) y la consola del navegador no muestra violaciones sin explicar; las que aparezcan se resuelven en `directives` o se anotan en `MANUAL-TESTS.md`.
- AC9: El webhook de Stripe responde `413` si `Content-Length` supera 1 MiB (sin leer el cuerpo); un cuerpo mayor sin `Content-Length` válido se rechaza con `413` tras leerlo con el mismo tope; eventos legítimos (firma válida, tamaño normal) siguen respondiendo igual: 200/400/500 como hoy.
- AC10: Ningún `console.*` de H4 registra el objeto de error; `safeErrorLog` devuelve solo `name` y `code` (cadena), y nunca `message`, `params`, `query`, `cause` ni stack.
- AC11: `docs/MANUAL-TESTS.md §10` ya no lista el rate limiting como pendiente y documenta el límite del webhook (D3) y la lista manual de CSP; `system-design.md §8` registra D1-D10.
- AC12: `npm run lint`, `npm run test` y `npm run build` pasan; `npm run db:migrate` lo corre solo el humano.

## Tests requeridos

(Vitest, junto al archivo)

- `src/lib/rate-limit.test.ts`: reloj falso (`vi.useFakeTimers` o `now` inyectado) y store falso en memoria. Casos: AC1 (límite exacto, el siguiente rechaza, `retryAfterSeconds` correcto, nueva ventana), AC2 (claves independientes), sin estado compartido entre limitadores.
- `src/modules/security/services/rate-limit.service.test.ts`: store falso; AC3 (fail-open si el store lanza; spies de `console` verifican que no se loguea userId/correo; bloqueo registra solo política); política desconocida imposible por tipo; limpieza con azar inyectado.
- Store de Neon: test con PGlite si `test-db.ts` aplica la migración (upsert incrementa, filas viejas se limpian, PK `(key, window_start)`); si no es posible, se revisa el SQL generado y se anota en la spec como limitación (mismo criterio que `MANUAL-TESTS.md §10`, última nota).
- `src/lib/security-headers.test.ts`: los valores exactos de D8 y las directivas añadidas de D9; `next.config.ts` expone `headers()` con ellas y `poweredByHeader === false`.
- Una prueba por archivo de acciones de T2/T3 (`*.actions.test.ts`): con el limitador mockeado a `{ ok: false }` el servicio no se llama y se devuelve `RATE_LIMITED`; con `{ ok: true }` el flujo actual no cambia; con rol incorrecto no se consume cuota (AC5).
- `src/app/api/webhooks/stripe/route.test.ts`: `413` por `Content-Length`; evento válido pequeño sigue en 200; firma inválida sigue en 400; config faltante sigue en 500.
- `src/lib/safe-error-log.test.ts`: AC10 con un `DrizzleQueryError` simulado cuyo `message`/`params` contienen un correo: la salida no los contiene.
- Sin tests de `proxy.ts` (composición de Clerk); se cubre con la lista manual de AC8.

## Tareas

### T0 — Base: migración, cabeceras y CSP (serial, primero)
- Archivos: `src/modules/security/schema/rate-limit-hits.table.ts`; `drizzle/0009_*.sql` y `drizzle/meta/*` (generados con `npm run db:generate`, **no** se corre `db:migrate`); `src/lib/security-headers.ts` y `src/lib/security-headers.test.ts`; `next.config.ts`; `src/proxy.ts`.
- Depende de: —
- Paralelizable: no (toca configuración y `proxy.ts`; nadie más edita estos archivos)
- Cubre: AC4 (tabla y migración), AC6, AC7, AC8 (preparación), parte de AC12

### T1 — Limitador y servicio
- Archivos: `src/lib/rate-limit.ts` y `.test.ts`; `src/modules/security/services/rate-limit.service.ts` y `.test.ts` (incluye el store de Neon); `src/modules/security/services/rate-limit-policies.ts`.
- Depende de: T0 (tabla)
- Paralelizable: no con T2/T3 (estos importan `enforceRateLimit`); sí con T4
- Cubre: AC1, AC2, AC3, AC4

### T2 — Aplicar límites en pagos y cobros
- Archivos: `src/modules/payments/actions/payment.actions.ts`, `payment-reconciliation.actions.ts`, `payment-cancellation.actions.ts`, `connected-account.actions.ts`, `developer-transfer.actions.ts`; sus `*.actions.test.ts` nuevos; los tipos de resultado `src/modules/payments/types/payment.types.ts`, `connected-account.types.ts` y `developer-transfer.types.ts` (solo añadir `"RATE_LIMITED"` al unión de `code`); y los componentes de `src/modules/payments/components/` solo si `tsc` exige tratar el nuevo código.
- Depende de: T1
- Paralelizable: sí (con T3 y T4)
- Cubre: AC5 (políticas `checkout.start`, `payment.refresh`, `payment.cancel`, `payout.onboarding`, `payout.refresh`, `transfer.retry`)

### T3 — Aplicar límites en proyectos, propuestas, valoraciones y perfil
- Archivos: `src/modules/projects/actions/project.actions.ts`, `src/modules/proposals/actions/proposal.actions.ts`, `proposal-selection.actions.ts`, `src/modules/ratings/actions/rating.actions.ts`, `src/modules/profile/actions/developer-profile.actions.ts`; sus `*.actions.test.ts` nuevos; los tipos `src/modules/projects/types/project.types.ts`, `src/modules/proposals/types/proposal.types.ts` y `src/modules/profile/types/developer-profile.types.ts` (solo `"RATE_LIMITED"` en `code`); componentes de esos módulos solo si `tsc` lo exige.
- Depende de: T1
- Paralelizable: sí (con T2 y T4)
- Cubre: AC5 (políticas `project.write`, `proposal.write`, `proposal.select`, `rating.write`, `profile.save`)

### T4 — Webhook, logs y documentación
- Archivos: `src/app/api/webhooks/stripe/route.ts` y `route.test.ts`; `src/lib/safe-error-log.ts` y `.test.ts`; `src/modules/auth/services/nav-viewer.service.ts`; `src/modules/projects/services/public-viewer.service.ts`; `src/app/projects/page.tsx`; `src/modules/projects/components/public-catalog-results.tsx`; `docs/MANUAL-TESTS.md`; `docs/architecture/system-design.md` (§8 y nota en §7).
- Depende de: —
- Paralelizable: sí (archivos disjuntos con T1, T2, T3; no toca `layout.tsx`, `proxy.ts` ni `next.config.ts`)
- Cubre: AC9, AC10, AC11 (y AC12 al cierre)

Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer ejecuta el build completo al final. Esta spec no añade dependencias npm.

## Preguntas abiertas

- **P1. Almacenamiento del limitador y costo/cuenta externa.** Recomendación: tabla en Neon (D1): sin cuenta externa, sin dependencias, costo despreciable. Alternativa: Upstash Redis (cuenta nueva, 2 secretos, dependencias; verificar su plan gratuito al contratar). Si se elige Upstash, T0 pierde la tabla y la migración, y T1 cambia el adaptador; el resto no cambia. **Responde el humano antes de aprobar.**
- **P2. Webhook sin límite por IP.** Recomendación: dejarlo así con tope de tamaño (D3); revisar con Upstash en 017 si el despliegue lo justifica. Alternativa: pedir ya el techo por IP (obliga a P1 = Upstash).
- **P3. CSP en modo enforce y modo estricto con nonce.** Recomendación: dejar `Report-Only` en esta spec y decidir el paso a enforce tras la lista manual (AC8), en 017; el modo `strict` (nonce) queda como mejora futura porque exige render dinámico global.
- **P4. Valores de las políticas (D6).** Recomendación: aceptar los iniciales y ajustarlos con uso real; viven en un solo archivo.
- **P5. HSTS.** Recomendación: `max-age=63072000` sin `includeSubDomains`/`preload`; el dominio definitivo y su preload se deciden en 017.
- **P6. Notas en specs `done`.** Esta spec no edita specs `done`; los pendientes de 010 y 011a se cierran en `MANUAL-TESTS.md §10`. Recomendación: no tocarlas. Si se prefiere trazabilidad, bastaría una nota de una línea en `010-payment-state-and-webhooks.md` y `011a-developer-connected-accounts.md` apuntando a esta spec (lo decide el humano; devolvería esas specs a revisión según su regla).
- **P7. `lang="en"` y metadata por defecto en `layout.tsx` y la página de inicio de `create-next-app`.** No es un hallazgo de seguridad; sigue para 006b (ver spec 014).

## Próximas fases

- 017 (despliegue): decidir el paso de CSP a enforce, `includeSubDomains`/`preload` en HSTS, endpoint de webhook en producción, y Upstash si se necesita límite por IP.
- 016 (tests globales): contraste del limitador contra una rama real de Neon (concurrencia del upsert), junto con los bloqueos de Postgres pendientes en `MANUAL-TESTS.md §10`.
- Revisión de `npm audit` antes del despliegue (pendiente en `MANUAL-TESTS.md §10`).
- Rate limiting de `completeOnboarding` y de rutas públicas por IP solo si aparece un caso real.

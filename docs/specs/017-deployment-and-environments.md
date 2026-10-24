# Despliegue y entornos

Estado: done

## Objetivo

Dejar documentado y verificable cómo se despliega Nexora en Vercel con configuración de prueba segura (sin cobros reales), de modo que un humano pueda: crear los servicios externos, cargar las variables sin commitear valores, migrar la base de datos de forma segura, registrar los webhooks, decidir las cabeceras de seguridad diferidas por 015 y verificar el resultado con un smoke test y un plan de rollback.

Requisitos de origen: `docs/SDD-PLAN.md §8` (Spec 017) y plantilla de `§10`. Dominio: `docs/architecture/system-design.md §3` (propiedad de datos), `§7` (pagos y webhooks), `§8` (decisiones de seguridad 015-D8/D9; esta spec añade 017-D1 a 017-D6). Decisiones diferidas desde 015: `015-security-hardening.md` líneas 168-177 (P2, P3, P5 y "017: decidir CSP enforce, HSTS, endpoint de webhook en producción, Upstash").

Esta spec es **casi solo documental**: por defecto no cambia código de producción ni dependencias ni migraciones. Todo lo que dependa de crear cuentas, pegar secretos o ejecutar migraciones lo hace el humano (sección "Acciones del humano").

### Plataforma (el BRIEF no la define)

`docs/BRIEF.md §9` (líneas 183-193) lista el stack (Next.js, Neon, Drizzle, Clerk, Supabase Storage, Stripe) pero **no nombra plataforma de alojamiento**. Los docs que la asumen son solo supuestos: `015-security-hardening.md:51` ("fiabilidad en Vercel/serverless") y el tipo de runtime (`src/app/api/webhooks/stripe/route.ts:6`, `export const runtime = "nodejs"`). `.gitignore` ya excluye `.vercel`.

**Recomendación: Vercel (plan Hobby/gratuito).** Justificación: (a) es el hospedaje nativo de Next.js (App Router, `proxy.ts`, rutas Node); (b) despliegue por Git con rollback inmediato "promover despliegue anterior"; (c) variables por entorno (Production / Preview / Development) sin archivos; (d) el rate limiting ya está diseñado para serverless sin estado en memoria (tabla Neon, 015-D1) y el cliente Neon usa WebSocket Pool (`src/lib/db/client.ts:1-2`), compatible; (e) costo cero para el MVP. Limitación a verificar: el plan Hobby de Vercel es de uso no comercial (a verificar en los términos vigentes; aceptable para portafolio/demostración con Stripe en Test Mode). Alternativas (Netlify, Railway, Fly) no se evalúan: YAGNI.

## Alcance

- Incluye:
  - Guía `docs/DEPLOYMENT.md` con: entornos, tabla de variables, Neon, Clerk, Stripe (webhook y URLs de retorno), migraciones, seguridad previa al lanzamiento, observabilidad/recuperación, rollback y "Acciones del humano".
  - Decisiones 017-D1 a 017-D6 (sección "Decisiones") registradas en `docs/architecture/system-design.md §8`.
  - Ajustes de comentarios en `.env.example` (sin variables nuevas).
  - Sección nueva en `docs/MANUAL-TESTS.md` (8l: smoke test en producción y rollback) y actualización mínima de su cabecera y de la nota de §10 sobre el webhook en despliegue.
  - Evaluación de `npm run verify` y de un workflow de GitHub Actions (resultado en 017-D6; el workflow solo se crea si se responde que sí a P5).
- No incluye:
  - Dinero real / Stripe live, claves `sk_live_` (`src/lib/stripe.ts:19,36-40` ya las rechaza).
  - Landing, metadata completa y 404 con marca (`006b`, ver `MANUAL-TESTS.md §10`).
  - Playwright/E2E (016 Q4), WAF, Upstash (límite por IP), Sentry u otra observabilidad externa, dominios de pago.
  - Supabase Storage: la spec 021 (adjuntos) está **descartada** (`021-proposal-attachments.md:5`); no hay dependencia ni código de Supabase en `src/` ni en `package.json`. Las variables `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` **no existen** y no se añaden. Si 021 se retoma, esa spec añadirá las variables y la configuración del bucket.
  - Webhooks de Connect (`account.updated`, thin events v2): diferidos (`system-design.md §7`, última línea; `011c:240`).
  - Migraciones nuevas: ninguna.
  - Cualquier cambio en specs `done`: no se editan (015, 010, 004 siguen diciendo "se decide en 017"; la decisión queda en esta spec y en `system-design.md §8`).

## Decisiones

- **017-D1. Entornos.** Local (`.env.local`, Neon de desarrollo, Clerk Development, `stripe listen`), Producción en Vercel (único entorno desplegado; Stripe **Test Mode**). **Preview de Vercel: no se configura** (YAGNI): cada preview tiene URL distinta, `APP_URL` no coincidiría con el webhook de Stripe ni con los dominios de Clerk. No se crea entorno "pruebas" separado; las pruebas automáticas usan PGlite (spec 016). Si se quisiera Preview, requeriría rama Neon propia y sin webhook (solo reconciliación con "Actualizar estado"): se deja como fase futura.
- **017-D2. Claves de Stripe.** En Producción se usan `sk_test_...` y el secreto `whsec_...` del endpoint de **Test Mode** del Dashboard. Ninguna clave `sk_live_`/`rk_live_`: `getStripe()` lanza `StripeConfigError` (`src/lib/stripe.ts:36-40`).
- **017-D3. CSP.** Se **mantiene `Report-Only`** (`src/proxy.ts:12-15`). Justificación: (a) pasar a enforce exige ejecutar antes la lista manual `MANUAL-TESTS.md §8j` (f)-(k) contra la URL de producción (Clerk, Turnstile, Stripe Checkout y Connect cargan scripts/frames externos), que aún no se ha hecho; (b) no hay endpoint de reportes (`report-uri`), así que las violaciones solo se ven en la consola del navegador; (c) un enforce erróneo rompe inicio de sesión o pago y no es recuperable sin redeploy. Condición para enforce en una fase posterior: checklist 8j completa en prod sin violaciones sin explicar **y** rollback documentado (volver `reportOnly: true`, redeploy anterior). Cambiarlo es una spec aparte (una línea en `src/proxy.ts`).
- **017-D4. HSTS.** Se mantiene `max-age=63072000` **sin** `includeSubDomains` ni `preload` (`src/lib/security-headers.ts:13`). Justificación: con subdominio `*.vercel.app` el dominio no es del proyecto (no se puede preloadear ni controlar sus subdominios). Solo se añadiría `includeSubDomains` si se compra un dominio propio y todos sus subdominios sirven HTTPS; `preload` solo con ese dominio y tras decisión explícita (es difícil de revertir). Fuera de alcance (dominios de pago).
- **017-D5. Layout.** `src/app/layout.tsx:17-18,25` conserva `title: "Create Next App"` y `lang="en"` (la UI está en español). **No bloquean el despliegue** funcional; se resuelven en `006b`. Ver P4 si se prefiere un parche mínimo.
- **017-D6. `npm run verify` y GitHub Actions.** `npm run verify` **ya existe** (`package.json:11`, `lint && test && build`, añadido en 016): no hay nada que crear; se ejecuta a mano antes de desplegar. Workflow mínimo de Actions: **recomendación por defecto: no ahora**. Costo: un archivo YAML (~20 líneas), ~5-10 min de CI por push (gratis en repo público; en privado consume la cuota gratuita mensual, a verificar), mantenimiento de claves ficticias (el build de Clerk puede exigir una `pk_test_` con formato válido: a verificar) y no bloquea por sí solo el despliegue de Vercel salvo protección de rama o "wait for checks" (configuración extra). Beneficio: detecta regresiones de lint/test que `next build` de Vercel no ejecuta. Se deja como T4 condicional (P5).

## Reutilizar

| Qué existe | Dónde | Uso |
|---|---|---|
| Rechazo de claves live, validación de `APP_URL`, `whsec_` | `src/lib/stripe.ts:27-97` | La guía lo cita como defensa; no se duplica |
| Cabeceras estáticas y CSP extra | `src/lib/security-headers.ts`, `next.config.ts`, `src/proxy.ts` | Sin cambios; solo se documenta la decisión |
| Webhook Stripe (firma, 413, 400/500) | `src/app/api/webhooks/stripe/route.ts` | Registro de endpoint y smoke test |
| Webhook Clerk (`verifyWebhook`, 400/500) | `src/app/api/webhooks/clerk/route.ts`, `src/modules/auth/services/clerk-webhook.service.ts` | Eventos `user.updated`, `user.deleted` |
| `npm run verify`, `db:migrate`, `db:generate` | `package.json:11-13` | Comandos de la guía |
| Migraciones `drizzle/0000`-`0009` (10 `.sql`; incluyen seed de tecnologías en `0002`, 009c) | `drizzle/` | `db:migrate` aplica también el seed: no hay script de seed aparte |
| Pasos manuales y "a verificar" de Stripe/Clerk | `MANUAL-TESTS.md §0, §7, §8, §8b, §8f, §8j`; `004` líneas 267-273 | Se enlazan; no se copian enteros |
| Patrón de secciones de pruebas manuales | `docs/MANUAL-TESTS.md` (8a-8k) | Plantilla de la sección 8l |

## Inventario de variables (verificado con grep de `process.env` en `src/` y `drizzle.config.ts`)

Nombres y lectura exactos. Ninguna otra variable se lee en el código de la app (`NODE_ENV` no se lee directamente; Next y Vercel lo fijan solas).

| Variable | Origen del valor | Secreto | Dónde se lee | Producción |
|---|---|---|---|---|
| `DATABASE_URL` | Neon: cadena **pooled** de la rama de producción | Sí | `src/lib/db/client.ts:11` (lazy); `drizzle.config.ts:11` (`db:migrate`) | Obligatoria |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk (instancia usada en producción) | No (pública, se incrusta en el bundle) | Lectura interna de `@clerk/nextjs` (`ClerkProvider`, `clerkMiddleware`); no hay `process.env` propio | Obligatoria |
| `CLERK_SECRET_KEY` | Clerk | Sí | Interna de `@clerk/nextjs` (`auth()`, `currentUser`) | Obligatoria |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Clerk Dashboard > Webhooks > endpoint (Signing Secret, `whsec_...`) | Sí | Interna de `verifyWebhook` en `src/app/api/webhooks/clerk/route.ts:9`; nombre confirmado en `node_modules/@clerk/backend/dist/webhooks.js` y `004:257` | Obligatoria en despliegue (sin ella el webhook responde 400) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Constante `/sign-in` (`004:258`) | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Constante `/sign-up` | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | Constante `/onboarding` | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Constante `/` | No | Interna de Clerk | Obligatoria |
| `STRIPE_SECRET_KEY` | Stripe Dashboard (**Test Mode**) > Developers > API keys: `sk_test_...` | Sí | `src/lib/stripe.ts:30` | Obligatoria; solo test |
| `APP_URL` | URL pública estable de producción, `https://<dominio>` sin barra final ni ruta | No (pero no `NEXT_PUBLIC_`) | `src/lib/stripe.ts:57`; se usa en `payment-checkout.service.ts:301-302` (success/cancel) y `connected-account.service.ts:173-174` (refresh/return) | Obligatoria |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > endpoint de **Test Mode** > Signing secret `whsec_...` (no el de `stripe listen`) | Sí | `src/lib/stripe.ts:85` | Obligatoria |

Diferencias frente a `.env.example` (verificado): las 11 variables ya figuran con el mismo nombre; no falta ninguna. Discrepancias de contenido: (1) el comentario de `APP_URL` solo da ejemplo local (`http://localhost:3000`); (2) `STRIPE_WEBHOOK_SECRET` explica local y "Dashboard endpoint secret when deployed" sin decir que el endpoint debe ser de Test Mode; (3) no indica qué variables son secretas ni valores fijos de las 4 URLs de Clerk (`/sign-in`, `/sign-up`, `/onboarding`, `/`, de `004:258-261`); (4) falta la nota de que Vercel guarda las variables en el panel, no en archivos. T2 corrige solo comentarios.

Reglas para Vercel: variables solo en el panel (Project > Settings > Environment Variables) o con `vercel env add` ejecutado por el humano; marcar como **Sensitive** las secretas; asignarlas **solo al entorno Production** (017-D1: Preview sin variables); cambiar una variable exige un redeploy. Nunca imprimir valores en logs, issues, chat ni capturas.

## Archivos

| Archivo | Tipo | Tarea |
|---|---|---|
| `docs/DEPLOYMENT.md` | Nuevo | T1 |
| `docs/architecture/system-design.md` (§8: filas 017-D1 a 017-D6; §7 sin cambios) | Modificado | T1 |
| `.env.example` (solo comentarios) | Modificado | T2 |
| `docs/MANUAL-TESTS.md` (cabecera, §8l nueva, nota en §10) | Modificado | T3 |
| `.github/workflows/ci.yml` | Nuevo, **condicional** (P5 = sí) | T4 |
| `src/app/layout.tsx` (`lang="es"`, título y descripción mínimos) | Modificado, **condicional** (P4 = sí) | T5 |

Estructura de `docs/DEPLOYMENT.md` (títulos fijos para que T3 pueda enlazarlos sin depender de T1): `1. Entornos y plataforma`, `2. Variables de entorno`, `3. Base de datos (Neon) y migraciones`, `4. Clerk`, `5. Stripe (Test Mode)`, `6. Seguridad previa al lanzamiento`, `7. Observabilidad y recuperación`, `8. Rollback`, `9. Acciones del humano`.

## Contenido requerido de la guía (cada punto con cita a archivo/línea; sin valores reales)

1. **Neon.** Un proyecto de producción distinto del de desarrollo y rama `main`/`production` propia; `DATABASE_URL` = cadena pooled (consistente con `003:221` y con `MANUAL-TESTS.md §0`). Si `drizzle-kit migrate` fallara con la cadena pooled, probar la directa/unpooled (a verificar; no confirmado en el repo). Región y plan: a decidir por el humano (P3).
2. **Migraciones seguras.** Solo el humano ejecuta `npm run db:migrate`. Orden: (a) crear una rama de respaldo en Neon desde producción (copia instantánea) o anotar el punto de restauración (retención según plan: a verificar); (b) `DATABASE_URL=<prod> npm run db:migrate` desde su máquina (`dotenv` no sobrescribe una variable ya definida en el entorno: a verificar con `drizzle.config.ts:4`, que carga `.env.local`; en caso de duda usar un `.env.local` temporal apuntando a prod y borrarlo después); (c) comprobar con `SELECT count(*) FROM technologies;` (el seed viene en `0002`, 009c; ~50 filas) y que existe `rate_limit_hits` (`0009`); (d) **solo entonces** desplegar la versión que depende del esquema. Migraciones **solo hacia delante**: Drizzle no genera `down`; el rollback de datos es restaurar la rama de respaldo, no revertir el SQL. Una migración destructiva (como `0003`, drop de columna) exige el respaldo previo obligatorio.
3. **Seed.** No hay seed separado: las tecnologías llegan en la migración `0002`. El primer administrador (opcional) se promueve con el `UPDATE users SET role = 'admin' WHERE email = '<correo>'` de `004:272` y `MANUAL-TESTS.md §0`.
4. **Webhook de Stripe.** Dashboard en **Test Mode** > Developers > Webhooks > Add endpoint (destino "Your account", no "Connected accounts"): URL `https://<dominio>/api/webhooks/stripe`; eventos exactos (los únicos manejados, `src/modules/payments/services/payment-event.service.ts:14-17` y `system-design.md §7`): `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. Copiar el secreto del endpoint a `STRIPE_WEBHOOK_SECRET` (distinto del de `stripe listen`; `010:463`). No suscribir `payment_intent.*` ni `account.*`.
5. **URLs de retorno.** Salen de `APP_URL`: Checkout `…/projects/<id>/payment?checkout=success|cancel`; onboarding `…/dashboard/payouts/onboarding/return|refresh`. `APP_URL` debe ser la URL estable de producción (no la de un despliegue concreto) y coincidir con el dominio autorizado en Clerk. Connect: activar Connect en el Dashboard en Test Mode (precondición de `system-design.md §7` y `MANUAL-TESTS.md §8b`).
6. **Clerk.** Webhook: Clerk Dashboard > Webhooks > Add Endpoint `https://<dominio>/api/webhooks/clerk`, eventos **solo** `user.updated` y `user.deleted` (`004:63`, `clerk-webhook.service.ts:12-35`); el signing secret va a `CLERK_WEBHOOK_SIGNING_SECRET`. Configurar en la instancia usada: las 4 URLs de la tabla de variables y el dominio de la aplicación. **Aviso a verificar:** una instancia de *Producción* de Clerk normalmente exige un dominio propio con registros DNS (no vale `*.vercel.app`); una instancia *Development* (`pk_test_`/`sk_test_`) funciona sin dominio propio pero con limitaciones (banner de desarrollo, tope de usuarios; a verificar en la documentación vigente). `004:273` pedía "otra instancia Clerk" para producción; ver P1.
7. **Seguridad previa al lanzamiento.** Lista de comprobación: (a) `STRIPE_SECRET_KEY` empieza por `sk_test_`; (b) `APP_URL` es `https://` y no contiene `localhost` ni `127.0.0.1` (el código **no** lo impide: `getAppUrl` acepta cualquier http/https, `src/lib/stripe.ts:72`); (c) `npm audit --omit=dev` ejecutado y el resultado anotado: criterio = 0 críticas (estado conocido: 9 vulnerabilidades altas/moderadas solo en herramientas de dev/CLI, `MANUAL-TESTS.md §10`); nunca `npm audit fix --force`; (d) `npm run verify` en verde; (e) `.env*` no está en el repo (`.gitignore`); (f) cabeceras y CSP según 017-D3/D4 (verificar con `MANUAL-TESTS.md §8j (j)` en la URL real); (g) NODE_ENV lo fija Vercel (`production`); no se define a mano.
8. **Observabilidad y recuperación.** Sin servicio externo (YAGNI). Fuentes: Vercel > Logs (los `console.error` de servicios y de `src/app/api/webhooks/stripe/route.ts:49`; **ya saneados**: sin PII, claves ni cuerpos; retención según plan, a verificar), Stripe Dashboard > Webhooks > entregas (reintentar eventos fallidos), Clerk > Webhooks > mensajes (reenviar), tabla `processed_payment_events` (estado `applied`/`ignored`). Recuperación: (i) webhook de Stripe caído: reenviar desde el Dashboard o "Actualizar estado" (reconciliación, `system-design.md §7`; idempotente por `event.id`); (ii) transferencia pendiente: botón "Reintentar transferencia" (011b); (iii) webhook de Clerk perdido: `user.updated` es de estado absoluto (`004:64`) y se corrige en la siguiente actualización; (iv) datos corruptos: restaurar rama Neon de respaldo.
9. **Rollback.** Vercel > Deployments > despliegue anterior bueno > "Promote to Production"/"Instant Rollback" (no requiere rebuild). Las variables no se revierten con el despliegue: anotar cuáles se cambiaron. Las migraciones **no se deshacen**: si el despliegue nuevo trae una migración aplicada, el código anterior debe seguir siendo compatible (migraciones aditivas), o se restaura la rama Neon (pierde datos posteriores al respaldo: advertirlo). Orden seguro: migración aditiva -> despliegue -> (mucho después) migración destructiva.

## Criterios de aceptación

- AC1: `docs/DEPLOYMENT.md` existe, está en español, tiene las 9 secciones fijas y no contiene ningún valor real (sin `sk_`, `whsec_`, `pk_`, cadenas de conexión ni URLs de proyecto reales; solo marcadores `<...>`). Comprobable con `grep -nE "sk_(test|live)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|postgres(ql)?://[^<]" docs/DEPLOYMENT.md` sin coincidencias.
- AC2: La tabla de variables de la guía coincide con el inventario de esta spec (11 variables, mismo nombre, secreto sí/no, archivo y línea donde se lee) y con `.env.example`; no aparece ninguna variable de Supabase.
- AC3: La guía recomienda Vercel citando que el BRIEF no define plataforma, y explica Preview = sin configurar (017-D1) y claves Stripe de prueba también en producción (017-D2).
- AC4: La guía describe el webhook de Stripe con la URL `/api/webhooks/stripe`, los 4 eventos exactos y la variable `STRIPE_WEBHOOK_SECRET`, y el de Clerk con `/api/webhooks/clerk`, `user.updated`/`user.deleted` y `CLERK_WEBHOOK_SIGNING_SECRET`.
- AC5: La guía describe el procedimiento de migración (respaldo Neon, humano corre `db:migrate` contra prod, migrar antes de desplegar, solo hacia delante, seed incluido en `0002`) y advierte que ningún agente corre migraciones.
- AC6: La guía registra las decisiones de CSP (Report-Only con condición para enforce) y HSTS (sin `includeSubDomains`/`preload`) y la lista de comprobación previa al lanzamiento incluye `npm audit --omit=dev`, `APP_URL` sin localhost y `sk_test_`.
- AC7: `docs/DEPLOYMENT.md §9` contiene la lista "Acciones del humano" completa (ver sección homónima abajo).
- AC8: `docs/architecture/system-design.md §8` contiene la tabla de 017-D1 a 017-D6 con los mismos ids; no se modifican otras secciones.
- AC9: `.env.example` conserva exactamente los mismos nombres de variable en el mismo orden (sin añadir ni quitar), sin valores, y los comentarios cubren producción (https, Test Mode, secretos del endpoint, URLs de Clerk).
- AC10: `docs/MANUAL-TESTS.md` tiene la sección `8l. Spec 017 — Despliegue y smoke test en producción` con: registro y rol, publicar proyecto, propuesta, selección, pago `4242 4242 4242 4242`, webhook recibido (200 en Dashboard de Stripe y fila `applied`), transferencia de prueba `completed_test`, cuenta de cobros v2 `active`, cabeceras (`§8j (j)`), webhook sin firma = 400, y el plan de rollback con la advertencia de migraciones solo hacia delante. La cabecera "Cubre" incluye 017 y la nota de `§10` sobre el webhook en despliegue apunta a esta sección.
- AC11: Ninguna tarea modifica código de producción por defecto, `package.json`, `drizzle/**` ni specs `done`. (T5 solo si P4 = sí; T4 solo si P5 = sí.)
- AC12 (solo si P5 = sí): `.github/workflows/ci.yml` ejecuta `npm ci`, `npm run verify` con variables ficticias en `env:` (sin `secrets.*`), en `push` a `main` y `pull_request`; el build termina en verde con esas claves.
- AC13 (solo si P4 = sí): `src/app/layout.tsx` tiene `lang="es"` y `metadata.title`/`description` de Nexora; `npm run verify` sigue en verde.

## Tests requeridos

Ninguno de Vitest: no hay `services`, `hooks`, `stores`, `schemas` ni `src/lib` nuevos. Verificación:

- AC1/AC2/AC9: revisión del reviewer con los `grep` indicados y comparación de nombres con `src/` (`grep -rn "process.env" src drizzle.config.ts`).
- Si T5 se ejecuta, el test existente que cubra el layout (si lo hay) debe seguir pasando; no se añade test nuevo.
- Verificación manual en producción: `MANUAL-TESTS.md §8l` (la ejecuta el humano; los agentes no tienen acceso a Vercel, Neon, Clerk ni Stripe).

## Acciones del humano (se copian a `docs/DEPLOYMENT.md §9`)

Ningún agente ejecuta estos pasos ni ve los valores.

1. **Vercel:** crear el proyecto vinculando el repositorio Git; rama de producción `main`; framework Next.js; anotar la URL estable de producción.
2. **Neon:** crear (o elegir) el proyecto/rama de producción; copiar la cadena pooled; crear una rama de respaldo antes de cada migración.
3. **Clerk:** decidir instancia (P1); copiar `pk_`/`sk_`; configurar dominio y las 4 URLs; crear el webhook `/api/webhooks/clerk` con `user.updated`, `user.deleted`; copiar el signing secret.
4. **Stripe (Test Mode):** copiar `sk_test_...`; activar Connect en Test Mode; crear el endpoint `/api/webhooks/stripe` con los 4 eventos; copiar el signing secret del endpoint.
5. **Vercel, variables:** pegar las 11 variables en Production (marcar secretas como Sensitive); `APP_URL` = URL estable `https://...`; no definir Preview.
6. **Migrar:** `npm run db:migrate` contra la `DATABASE_URL` de producción **antes** del primer despliegue y antes de cada despliegue que traiga migraciones; comprobar tablas y seed.
7. **Auditoría y verificación local:** `npm audit --omit=dev` y `npm run verify`; anotar resultado.
8. **Desplegar** (push a `main` o "Deploy" manual) y ejecutar `MANUAL-TESTS.md §8l`.
9. **Opcional:** promover un administrador con `UPDATE users SET role = 'admin' ...`; rotar cualquier secreto que se haya pegado por error en un chat o log.
10. **Decidir** (con la lista de P1-P5) y, si procede, abrir specs posteriores (CSP enforce, dominio propio, 006b).

## Tareas

### T1 — Guía de despliegue y decisiones
- Archivos: `docs/DEPLOYMENT.md`, `docs/architecture/system-design.md` (solo añadir filas 017-D1 a 017-D6 en §8)
- Depende de: —
- Paralelizable: sí
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC11

### T2 — Comentarios de `.env.example` para producción
- Archivos: `.env.example`
- Depende de: —
- Paralelizable: sí
- Cubre: AC9, AC11
- Nota: solo comentarios (https en `APP_URL`, Test Mode del endpoint, qué variables son secretas, valores fijos de las URLs de Clerk, referencia a `docs/DEPLOYMENT.md §2`). Cero nombres añadidos o quitados; ningún valor.

### T3 — Pruebas manuales de producción
- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: — (enlaza los títulos fijos de `docs/DEPLOYMENT.md`; no necesita que T1 esté terminada)
- Paralelizable: sí
- Cubre: AC10, AC11
- Nota: añade `8l` tras `8k` (antes de la sección 9), actualiza "Cubre" de la cabecera y el punto de `§10` ("o un endpoint de webhook en despliegue, spec 017"). No marca ninguna casilla.

### T4 — Workflow mínimo de CI (CONDICIONAL, solo si P5 = sí)
- Archivos: `.github/workflows/ci.yml`
- Depende de: —
- Paralelizable: sí
- Cubre: AC12
- Nota: si P5 = no (default), esta tarea no se ejecuta y la decisión queda en 017-D6 y en "Próximas fases".

### T5 — Parche mínimo del layout (CONDICIONAL, solo si P4 = sí)
- Archivos: `src/app/layout.tsx`
- Depende de: —
- Paralelizable: sí
- Cubre: AC13
- Nota: solo `lang`, `title` y `description`; sin landing ni metadata completa (006b).

Por defecto se ejecutan T1-T3 en paralelo (3 tareas, archivos disjuntos). Ningún `npm install`, `npm run build` ni migración durante el bloque paralelo; el reviewer ejecuta `npm run verify` solo si T4/T5 se ejecutaron.

## Preguntas abiertas (con recomendación por defecto)

- **P1. Instancia de Clerk en producción.** Una instancia de Producción de Clerk normalmente exige dominio propio (a verificar). Default: **reutilizar una instancia Development** (claves `pk_test_`/`sk_test_`) para el despliegue de demostración en `*.vercel.app`, con sus limitaciones, y no comprar dominio (fuera de alcance). Si se compra dominio: instancia Production, HSTS/`includeSubDomains` se reevalúan (017-D4).
- **P2. Plataforma.** Default: Vercel Hobby (justificación arriba). Alternativa: otra plataforma si el humano ya tiene cuenta, lo que cambiaría la sección 1 y la 8 de la guía.
- **P3. Región y plan de Neon.** Default: misma región que la función de Vercel más cercana a Neon (a elegir por el humano) y plan gratuito; la retención de restauración y de logs depende del plan (a verificar).
- **P4. ¿Parche de `lang="es"` y título?** Default: **no** (se hace en 006b; no bloquea el funcionamiento). Alternativa: sí, T5 (3 líneas), útil si la demostración se enseña a terceros antes de 006b.
- **P5. ¿Workflow de GitHub Actions?** Default: **no** ahora (017-D6: `verify` local es suficiente para un solo desarrollador; costo y claves ficticias a verificar). Alternativa: sí, T4, de bajo costo y sin secretos, si se quiere protección de rama.
- **P6. ¿Guardas en código para producción?** (rechazar `localhost` en `APP_URL` cuando `NODE_ENV=production`). Default: **no** (YAGNI; se cubre con la lista de comprobación y el smoke test). Alternativa: spec aparte con test unitario en `src/lib/stripe.test.ts`.
- **P7. Rama de Neon para Preview y rate limit por IP (Upstash).** Default: no ahora (017-D1; el webhook ya tiene tope 1 MiB y firma, 015-D3).

## Próximas fases

- Pasar la CSP a enforce (tras `MANUAL-TESTS.md §8j` en producción, con rollback), y `report-uri` si se desea medir violaciones.
- Dominio propio: Clerk Production, HSTS `includeSubDomains`/`preload` si procede.
- Entorno Preview con rama Neon propia y Clerk/Stripe de prueba.
- Webhooks de Connect (`account.updated`, thin events v2) y límite por IP (Upstash), si el uso lo justifica.
- E2E con Playwright (016 Q4), `006b` (landing/metadata/`lang`), observabilidad externa (Sentry) y alertas.

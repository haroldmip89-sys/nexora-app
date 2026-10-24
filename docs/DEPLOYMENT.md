# Despliegue y entornos

Guía para desplegar Nexora en Vercel con configuración de prueba (Stripe Test Mode, sin cobros reales). Origen: `docs/specs/017-deployment-and-environments.md`. Las decisiones 017-D1 a 017-D6 están en `docs/architecture/system-design.md §8`.

Regla general: esta guía no contiene valores reales. Todo valor va como marcador `<...>`. Los agentes no crean cuentas, no ven secretos ni ejecutan migraciones: lo hace el humano (sección 9).

## 1. Entornos y plataforma

**Plataforma: Vercel (plan Hobby).** `docs/BRIEF.md §9` lista el stack (Next.js, Neon, Drizzle, Clerk, Supabase Storage, Stripe) pero no define plataforma de alojamiento; Vercel es una recomendación. Motivos: hospedaje nativo de Next.js (App Router, `proxy.ts`, rutas Node como `src/app/api/webhooks/stripe/route.ts:6`), despliegue por Git con rollback inmediato, variables por entorno sin archivos, rate limiting sin estado en memoria (tabla Neon, 015-D1) y cliente Neon por WebSocket (`src/lib/db/client.ts`), y costo cero. Limitación a verificar: el plan Hobby es de uso no comercial (a verificar en los términos vigentes); aceptable para portafolio y demostración con Stripe en Test Mode.

| Entorno | Uso | Servicios |
|---|---|---|
| Local | Desarrollo | `.env.local`, Neon de desarrollo, Clerk Development, `stripe listen` |
| Producción (Vercel) | Único entorno desplegado (demo) | Neon de producción, Clerk Development sobre `*.vercel.app`, Stripe **Test Mode** |
| Preview (Vercel) | **No se configura** (017-D1) | Sin variables |

- **Preview = sin configurar (017-D1).** Cada preview tiene una URL distinta: `APP_URL` no coincidiría con el endpoint de webhook de Stripe ni con los dominios de Clerk. No hay entorno "pruebas" separado: las pruebas automáticas usan PGlite (spec 016). Si se quisiera Preview haría falta una rama Neon propia y sin webhook (fase futura).
- **Stripe de prueba también en producción (017-D2).** Producción usa `sk_test_<...>` y el secreto `whsec_<...>` del endpoint de Test Mode. Nunca claves live: `getStripe()` lanza `StripeConfigError` (`src/lib/stripe.ts:36-40`).
- **Demo en `*.vercel.app` con Clerk Development, sin dominio propio (decisión del humano, P1).** Se usan claves `pk_test_<...>` / `sk_test_<...>` de una instancia Development de Clerk. Limitaciones (todas a verificar en la documentación vigente de Clerk): banner o aviso de modo desarrollo, tope de usuarios de la instancia Development, y que una instancia Production normalmente exige dominio propio con DNS. Comprar dominio queda fuera de alcance; si se compra, se reevalúan Clerk Production y HSTS (017-D4).
- **Plan de Neon:** plan gratuito (P3). Región a elegir por el humano, cercana a la región de las funciones de Vercel. Retención de restauración y de logs según plan: a verificar.
- **Fuera de alcance:** Supabase Storage (spec 021 descartada; no hay variables de Supabase), Stripe live, webhooks de Connect, Upstash, Sentry, dominios de pago, workflow de GitHub Actions (017-D6).

## 2. Variables de entorno

Inventario verificado con `grep -rn "process.env" src drizzle.config.ts` y contra `.env.example` (11 variables, mismos nombres; no hay ninguna de Supabase).

| Variable | Origen del valor | Secreto | Dónde se lee | Producción |
|---|---|---|---|---|
| `DATABASE_URL` | Neon: cadena **pooled** de la rama de producción (`<cadena-pooled-neon>`) | Sí | `src/lib/db/client.ts:11` (lazy); `drizzle.config.ts:11` (`db:migrate`) | Obligatoria |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk, instancia Development (`pk_test_<...>`) | No (pública, va en el bundle) | Interna de `@clerk/nextjs` (`ClerkProvider`, `clerkMiddleware`) | Obligatoria |
| `CLERK_SECRET_KEY` | Clerk (`sk_test_<...>`) | Sí | Interna de `@clerk/nextjs` (`auth()`, `currentUser`) | Obligatoria |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Clerk > Webhooks > endpoint > Signing Secret (`whsec_<...>`) | Sí | Interna de `verifyWebhook` en `src/app/api/webhooks/clerk/route.ts:9` | Obligatoria (sin ella el webhook responde 400) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Constante `/sign-in` | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Constante `/sign-up` | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` | Constante `/onboarding` | No | Interna de Clerk | Obligatoria |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Constante `/` | No | Interna de Clerk | Obligatoria |
| `STRIPE_SECRET_KEY` | Stripe (Test Mode) > Developers > API keys (`sk_test_<...>`) | Sí | `src/lib/stripe.ts:30` | Obligatoria; solo test |
| `APP_URL` | URL pública estable `https://<dominio>` sin barra final ni ruta | No (no usar `NEXT_PUBLIC_`) | `src/lib/stripe.ts:57`; usada en `payment-checkout.service.ts` (success/cancel) y `connected-account.service.ts` (refresh/return) | Obligatoria |
| `STRIPE_WEBHOOK_SECRET` | Stripe > endpoint de **Test Mode** > Signing secret (`whsec_<...>`); no el de `stripe listen` | Sí | `src/lib/stripe.ts:85` | Obligatoria |

Reglas para Vercel:

- Variables solo en el panel (Project > Settings > Environment Variables) o con `vercel env add` ejecutado por el humano. Nunca en archivos del repo.
- Marcar como **Sensitive** las secretas (`DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).
- Asignarlas **solo al entorno Production** (Preview sin variables, 017-D1).
- Cambiar una variable exige un redeploy.
- Nunca imprimir valores en logs, issues, chat ni capturas.
- `NODE_ENV` lo fija Vercel (`production`); no se define a mano.

## 3. Base de datos (Neon) y migraciones

**Proyecto.** Un proyecto de producción distinto del de desarrollo y una rama `main`/`production` propia. `DATABASE_URL` = cadena **pooled** (coherente con `docs/MANUAL-TESTS.md §0`). Si `drizzle-kit migrate` fallara con la cadena pooled, probar la directa/unpooled (a verificar; no confirmado en el repo).

**Migraciones seguras.** Solo el humano ejecuta `npm run db:migrate`; ningún agente lo hace. Orden:

1. Crear una rama de respaldo en Neon desde producción (copia instantánea) o anotar el punto de restauración (retención según plan: a verificar).
2. Ejecutar `DATABASE_URL=<cadena-pooled-prod> npm run db:migrate` desde la máquina del humano. `drizzle.config.ts:4` carga `.env.local` con `dotenv`, que normalmente no sobrescribe una variable ya definida en el entorno (a verificar); en caso de duda, usar un `.env.local` temporal apuntando a producción y borrarlo después.
3. Comprobar con `SELECT count(*) FROM technologies;` (el seed llega en `0002`; ~50 filas) y que existe la tabla `rate_limit_hits` (`0009`).
4. **Solo entonces** desplegar la versión que depende del esquema (migrar antes de desplegar).

Migraciones **solo hacia delante**: Drizzle no genera `down`. El rollback de datos es restaurar la rama de respaldo, no revertir el SQL. Una migración destructiva (como `0003`, drop de columna) exige respaldo previo obligatorio.

**Seed.** No hay seed separado: las tecnologías vienen en la migración `0002`. El primer administrador (opcional) se promueve con `UPDATE users SET role = 'admin' WHERE email = '<correo>';` (ver `docs/MANUAL-TESTS.md §0`).

## 4. Clerk

- **Instancia: Development (`pk_test_`/`sk_test_`) sobre `*.vercel.app`, sin dominio propio** (decisión P1). Limitaciones, todas a verificar en la documentación vigente: banner de desarrollo y tope de usuarios de la instancia. Una instancia Production normalmente exige dominio propio con registros DNS (a verificar), por lo que no se usa.
- **Configurar en la instancia:** el dominio de la aplicación (la URL `https://<dominio>.vercel.app` de producción) y las 4 URLs de la tabla de variables (`/sign-in`, `/sign-up`, `/onboarding`, `/`).
- **Webhook:** Clerk Dashboard > Webhooks > Add Endpoint con URL `https://<dominio>/api/webhooks/clerk`; eventos **solo** `user.updated` y `user.deleted` (`src/modules/auth/services/clerk-webhook.service.ts`). El Signing Secret va a `CLERK_WEBHOOK_SIGNING_SECRET`.
- Con Clerk Development el comportamiento de los dominios autorizados y de las redirecciones en `*.vercel.app` debe comprobarse en el smoke test (a verificar).

## 5. Stripe (Test Mode)

- **Modo:** Test Mode siempre (017-D2). `sk_live_`/`rk_live_` son rechazadas por `src/lib/stripe.ts:36-40`.
- **Connect:** activar Connect en el Dashboard en Test Mode (precondición de `system-design.md §7` y `docs/MANUAL-TESTS.md §8b`).
- **Webhook:** Dashboard en Test Mode > Developers > Webhooks > Add endpoint, destino "Your account" (no "Connected accounts"). URL `https://<dominio>/api/webhooks/stripe`. Eventos exactos (los únicos manejados, `src/modules/payments/services/payment-event.service.ts`):
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
- No suscribir `payment_intent.*` ni `account.*`.
- El Signing secret del endpoint (`whsec_<...>`) va a `STRIPE_WEBHOOK_SECRET`. Es distinto del que imprime `stripe listen`.
- **URLs de retorno.** Salen de `APP_URL`: Checkout `<APP_URL>/projects/<id>/payment?checkout=success|cancel`; onboarding `<APP_URL>/dashboard/payouts/onboarding/return|refresh`. `APP_URL` debe ser la URL estable de producción (no la de un despliegue concreto) y coincidir con el dominio autorizado en Clerk.

## 6. Seguridad previa al lanzamiento

Lista de comprobación:

- [ ] `STRIPE_SECRET_KEY` empieza por `sk_test_`.
- [ ] `APP_URL` es `https://` y no contiene `localhost` ni `127.0.0.1`. El código **no** lo impide (`getAppUrl` acepta cualquier http/https, `src/lib/stripe.ts:72`).
- [ ] `npm audit --omit=dev` ejecutado y resultado anotado. Criterio: 0 críticas (estado conocido: vulnerabilidades altas/moderadas solo en herramientas de dev/CLI, `docs/MANUAL-TESTS.md §10`). Nunca `npm audit fix --force`.
- [ ] `npm run verify` (`lint && test && build`) en verde, ejecutado a mano antes de desplegar.
- [ ] `.env*` no está en el repo (`.gitignore`).
- [ ] Cabeceras y CSP según 017-D3/D4; verificar con `docs/MANUAL-TESTS.md §8j (j)` en la URL real.
- [ ] `NODE_ENV` no definido a mano.

Decisiones diferidas desde 015:

- **CSP: se mantiene `Report-Only` (017-D3)** (`src/proxy.ts`). Pasar a enforce exige antes la lista `MANUAL-TESTS.md §8j (f)-(k)` contra producción (Clerk, Turnstile, Stripe Checkout y Connect cargan scripts/frames externos), no hay `report-uri` (las violaciones solo se ven en la consola del navegador) y un enforce erróneo rompe inicio de sesión o pago. Condición para enforce en una fase posterior: checklist 8j completa en producción sin violaciones sin explicar **y** rollback documentado (volver `reportOnly: true` y redeploy anterior). Es una spec aparte.
- **HSTS: `max-age=63072000` sin `includeSubDomains` ni `preload` (017-D4)** (`src/lib/security-headers.ts`). En `*.vercel.app` el dominio no es del proyecto (no se puede preloadear ni controlar sus subdominios). `includeSubDomains` solo con dominio propio y todos sus subdominios en HTTPS; `preload` solo con ese dominio y decisión explícita (difícil de revertir). Fuera de alcance.
- **Layout (017-D5):** `src/app/layout.tsx` conserva `title: "Create Next App"` y `lang="en"`; no bloquea el funcionamiento y se resuelve en `006b`.
- **`npm run verify` y Actions (017-D6):** `verify` ya existe; no hay workflow de GitHub Actions (decisión del humano, P5 = no).

## 7. Observabilidad y recuperación

Sin servicio externo (YAGNI). Fuentes:

- Vercel > Logs: los `console.error` de servicios y de `src/app/api/webhooks/stripe/route.ts` ya están saneados (sin PII, claves ni cuerpos). Retención según plan: a verificar.
- Stripe Dashboard > Webhooks > entregas: reintentar eventos fallidos.
- Clerk > Webhooks > mensajes: reenviar.
- Tabla `processed_payment_events` (estado `applied`/`ignored`).

Recuperación:

1. Webhook de Stripe caído: reenviar desde el Dashboard o usar "Actualizar estado" (reconciliación, `system-design.md §7`; idempotente por `event.id`).
2. Transferencia pendiente: botón "Reintentar transferencia" (011b).
3. Webhook de Clerk perdido: `user.updated` es de estado absoluto y se corrige en la siguiente actualización.
4. Datos corruptos: restaurar la rama Neon de respaldo.

## 8. Rollback

- **Código:** Vercel > Deployments > despliegue anterior bueno > "Promote to Production" / "Instant Rollback" (no requiere rebuild).
- **Variables:** no se revierten con el despliegue; anotar cuáles se cambiaron para restaurarlas a mano.
- **Migraciones:** no se deshacen. Si el despliegue nuevo trae una migración aplicada, el código anterior debe seguir siendo compatible (migraciones aditivas) o se restaura la rama Neon (se pierden los datos posteriores al respaldo: advertirlo).
- **Orden seguro:** migración aditiva -> despliegue -> (mucho después) migración destructiva.
- **CSP:** si en el futuro se activa enforce y rompe algo, volver a `reportOnly: true` y desplegar.

## 9. Acciones del humano

Ningún agente ejecuta estos pasos ni ve los valores.

1. **Vercel:** crear el proyecto vinculando el repositorio Git; rama de producción `main`; framework Next.js; anotar la URL estable de producción.
2. **Neon:** crear (o elegir) el proyecto/rama de producción; copiar la cadena pooled; crear una rama de respaldo antes de cada migración.
3. **Clerk:** usar una instancia Development (P1); copiar `pk_test_<...>`/`sk_test_<...>`; configurar dominio y las 4 URLs; crear el webhook `/api/webhooks/clerk` con `user.updated`, `user.deleted`; copiar el signing secret.
4. **Stripe (Test Mode):** copiar `sk_test_<...>`; activar Connect en Test Mode; crear el endpoint `/api/webhooks/stripe` con los 4 eventos; copiar el signing secret del endpoint.
5. **Vercel, variables:** pegar las 11 variables en Production (secretas como Sensitive); `APP_URL` = URL estable `https://<dominio>`; no definir Preview.
6. **Migrar:** `npm run db:migrate` contra la `DATABASE_URL` de producción **antes** del primer despliegue y antes de cada despliegue que traiga migraciones; comprobar tablas y seed.
7. **Auditoría y verificación local:** `npm audit --omit=dev` y `npm run verify`; anotar el resultado.
8. **Desplegar** (push a `main` o "Deploy" manual) y ejecutar `docs/MANUAL-TESTS.md §8l`.
9. **Opcional:** promover un administrador con `UPDATE users SET role = 'admin' ...`; rotar cualquier secreto que se haya pegado por error en un chat o log.
10. **Decidir** y, si procede, abrir specs posteriores (CSP enforce, dominio propio, 006b, Preview, CI).

### Demo para presentación

Antes de presentar, dejar listo en producción:

- Cuentas de prueba de **cliente** y de **desarrollador**, esta última con el onboarding de cobros (cuenta conectada) completo y en estado `active`.
- Un proyecto de ejemplo ya creado (y, si conviene, una propuesta) para no depender de datos en vivo.
- Tarjeta de prueba de Stripe `4242 4242 4242 4242` (cualquier fecha futura y CVC) para el pago.
- `stripe listen` **no** es necesario en producción: el endpoint registrado en el Dashboard de Stripe (Test Mode) recibe los eventos. Comprobar antes que sus entregas aparecen con 200.
- Recordar que Clerk Development puede mostrar un banner de modo desarrollo y que la plataforma opera en Test Mode (a verificar el aspecto exacto del banner).

# Testing transversal: estabilidad, cobertura e higiene

Estado: done

> **Ajuste en la aprobación (2026-10-23, decidido por el humano):** Q2 = no. Se **descarta la suite `test:neon`** (D3, T4, AC7-AC11, `vitest.neon.config.mts`, `concurrency.neon.test.ts`, script `test:neon`). Lo que PGlite no prueba (bloqueos reales, concurrencia entre conexiones) se documenta como no cubierto en `MANUAL-TESTS.md §10`. El resto queda como se escribió. Las referencias antiguas a la suite Neon dentro de este documento quedan sin efecto.

Spec 016 de `docs/SDD-PLAN.md §8` (el plan la nombra `testing-strategy`; aquí se usa el slug `testing-transversal` por el patrón `NNN-slug` y por su alcance real: la suite ya existe, esta spec la estabiliza y cierra huecos medidos). Formato y patrones: specs 003, 010, 011a/b/c, 012 y 015. Cierra los pendientes de `docs/MANUAL-TESTS.md §10`: "`npm audit` pendiente" y "los tests no demuestran los bloqueos reales de Postgres".

## Objetivo

1. Eliminar la intermitencia de los tests del webhook de Stripe (causa raíz confirmada, sección Hallazgos).
2. Reducir el costo de la suite sin romper el aislamiento entre archivos.
3. ~~Prueba opcional contra Neon~~ (descartada, Q2): se documenta como límite conocido lo que PGlite no puede probar.
4. Medir cobertura (`@vitest/coverage-v8`) con umbrales mínimos y cerrar solo los huecos con evidencia.
5. Higiene: `npm audit`, script local `verify`, y confirmar que ningún test usa red ni secretos reales.

Arquitectura que aplica (solo estas secciones): `system-design.md §7` (pagos y webhooks: la firma es la única autenticación; los tests de firma deben ser deterministas), `§5` y `§2` (invariantes que la prueba de concurrencia comprueba: una sola propuesta ganadora por proyecto; ningún proyecto en borrador con propuestas) y `§3` (propiedad de datos: Neon es el único almacén de la prueba opcional).

## Alcance

- Incluye:
  - Corrección determinista de los dos tests de firma alterada del webhook (H1) y un helper compartido con su test.
  - Pragma `// @vitest-environment node` en 21 tests `.ts` que hoy arrancan jsdom sin necesitarlo (H4).
  - Tests de los 5 botones de pagos con lógica propia y sin test (H7).
  - `@vitest/coverage-v8`, script `test:coverage`, umbrales a partir de la línea base medida y script `verify`.
  - Actualización mínima de dependencias con vulnerabilidades de producción (H6), sujeta a la pregunta Q1.
  - Notas en `docs/MANUAL-TESTS.md` (§8k nueva y los dos puntos de §10).
- No incluye:
  - Despliegue y entornos (spec 017), funciones de producto, landing/metadata (006b), refactors de producción.
  - E2E con navegador (Q4, solo recomendación).
  - Subir timeouts, cambiar `maxWorkers`, `pool` o `isolate` (evaluados y descartados, H3/H5).
  - Migraciones. Tocar specs `done` (no hace falta ninguna nota en ellas).
  - Tests de componentes puramente presentacionales (SETUP.md §3).

## Hallazgos (evidencia confirmada ejecutando o leyendo)

Línea base: `npx vitest run` = 94 archivos, 1806 tests, ~60 s (4 workers), verde en 5 de 6 corridas completas; la sexta falló como se describe en H1.

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| H1 | **Causa raíz de la intermitencia del webhook: no es carga ni orden, es azar de 1/16.** El caso "tampered signature" altera la firma con `.replace(/v1=[0-9a-f]/, "v1=0")`. Si el primer carácter hex del HMAC ya es `0` (probabilidad 1/16, el HMAC cambia con cada timestamp), el reemplazo no cambia nada, la firma sigue siendo válida y el endpoint responde 200 en vez de 400. Ocurre igual en el test unitario y en el de pipeline, así que la probabilidad de que una corrida completa falle por esto es ~12% | `src/app/api/webhooks/stripe/route.test.ts:60` y `route.flow.test.ts:151`. Medido: 2000 firmas con `Stripe.webhooks.generateTestHeaderString` y timestamps distintos, `replace` fue no-op en 120 (6.0%). Reproducido en corrida completa natural: `route.flow.test.ts:152 expected 200 to be 400` ("leaves the DB untouched on an invalid signature"), y aislado pasa. El código de producción es correcto | Confirmado |
| H2 | Hipótesis de estado compartido descartadas | `route.test.ts` solo mockea `handleStripeEvent` (líneas 5-6), no `constructStripeEvent`; el secreto se lee en cada llamada (`src/lib/stripe.ts` `getWebhookSecret`) y se estabiliza con `vi.stubEnv`/`unstubAllEnvs` (líneas 31-38); `constructStripeEvent` usa `Stripe.webhooks` estático, no `getStripe()` (la memoización no interviene). Suite completa verde con `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `DATABASE_URL` y `APP_URL` exportados con valores ajenos: 94/94 | Descartado |
| H3 | La carga no influye: pasa con `--pool=forks` (60.5 s), `--maxWorkers=2` (85.8 s) y `--maxWorkers=8` (59.4 s), 1806/1806 en las tres | Corridas de esta investigación. Subir `maxWorkers` no acelera (4 → 8: 62 s → 59 s); bajarlo sí empeora | Descartado como causa; sin cambio de config |
| H4 | 21 tests `.ts` sin pragma corren en jsdom sin necesitarlo. Con `--environment=node` pasan igual (21/21, 426 tests) y el subconjunto baja de 8.4 s a 2.6 s (jsdom: 20.5 s de entorno acumulado, 77% del tiempo rastreado). Hay 63 tests con pragma `node` y solo 10 `.test.tsx` necesitan jsdom | Lista: `src/lib/{announcer.store,is-active-path,money,rate-limit,safe-error-log,security-headers,utils}.test.ts`, `src/modules/auth/schemas/onboarding.schema.test.ts`, `auth/services/dashboard-link.test.ts`, `dashboard/services/{dashboard-actions,developer-dashboard-actions}.test.ts`, `payments/schemas/{connected-account,payment}.schema.test.ts`, `payments/services/connected-account-status.test.ts`, `profile/schemas/developer-profile.schema.test.ts`, `profile/services/{avatar-initials,contact-visibility}.test.ts`, `proposals/schemas/proposal-selection.schema.test.ts`, `ratings/schemas/rating.schema.test.ts`, `ratings/services/{client-name,rating-window}.test.ts` | Confirmado |
| H5 | `isolate: false` (lo que sugiere el resumen de Vitest, "~11 s más rápido") rompe la suite: 71 tests fallan (p. ej. `auth-errors.test.ts` "expected vi.fn() to be called", `connected-account.service.test.ts` con `rejected`) por fugas de `vi.mock`/estado entre archivos. PGlite se crea una vez por archivo (31 de las 32 llamadas a `createTestDb` están en `beforeAll`, ninguna en `beforeEach`; la restante en `migrations.test.ts:87`) y es el aislamiento que se quiere conservar | `npx vitest run --no-isolate`; `src/lib/db/test-db.ts:6-9` | Descartado |
| H6 | `npm audit`: 17 vulnerabilidades (1 crítica, 11 altas, 5 moderadas). **De producción (`--omit=dev`): 10**, entre ellas **`next` 16.3.8 (crítica)**, rango afectado 16.0.0-16.4.0, corregido en `next@16.4.2` (RCE en el optimizador de imágenes con SVG, RCE en funciones `use cache`, DoS en Server Actions). La app usa Server Actions en todos los módulos y `next/image` en `src/app/page.tsx:1`; no usa `use cache` (grep sin resultados). `vite` 8.3.0-8.3.2 (alta, solo dev server) se corrige dentro del rango. El resto (`shadcn`, `@shadcn/registry`, `ts-morph`, `braces`, `micromatch`, `fast-glob`, `@modelcontextprotocol/sdk`, `ip-address`) llega solo por la CLI `shadcn`; en runtime únicamente se importa `shadcn/tailwind.css` (`src/app/globals.css:3`), CSS de build. `eslint-config-next`, `drizzle-kit`/`esbuild`/`@esbuild-kit/*` son herramientas de desarrollo. Los "fixes" que propone npm para `shadcn`, `drizzle-kit` y `eslint-config-next` son **majors/downgrades** (`shadcn@1.0.0`, `drizzle-kit@0.18.1`, `eslint-config-next@14.2.35`): no aplicar. Ninguna es `react-markdown` ni `remark-gfm` | `npm audit --json`, `package.json:36` (`next` exacto 16.3.8) | Confirmado |
| H7 | Cinco componentes cliente de pagos con lógica propia (estado de error, `router.refresh` condicional, `announce`, `startTransition`) no tienen test ni lo importa ningún otro | `start-checkout-button.tsx:11-32` (`STALE_CODES` -> `router.refresh()`), `refresh-payment-button.tsx:10-35` (4 resultados + error), `retry-transfers-button.tsx:10-20`, `refresh-connected-account-button.tsx:10-20`, `start-payout-onboarding-button.tsx:11-24`, todos en `src/modules/payments/components/`. En contraste, los botones hermanos `cancel-payment-button`, `select-proposal-button`, `withdraw-proposal-button` sí tienen test | Confirmado |
| H8 | Sin red ni secretos reales en los tests | Grep en `src/**/*.test.*`, `vitest.setup.ts`, `vitest.config.mts`: sin `fetch(`, `axios`, `new Stripe(`, `neon(`, `new Pool(`, `process.env` directo; las claves son marcadores (`sk_test_FAKEKEY…`, `whsec_FAKESECRET…`, `stripe.test.ts:6-7`, `stripe-webhook.test.ts:7-8`); sin `postgres://`, `neon.tech` ni `npg_`. Vitest no carga `.env.local` (solo `drizzle.config.ts:4` lo hace). `getStripe`/Neon/Clerk se mockean o no se invocan | Confirmado (sin acción) |
| H9 | `src/modules/payments/services/payment-session-effects.ts` (179 líneas, reglas centrales del webhook) no tiene `*.test.ts` propio pero **sí está cubierto** de forma indirecta con PGlite real por `payment-event`, `payment-reconciliation` y `payment-cancellation.service.test.ts` (los tres lo importan). Igual `payment-transitions.ts`, los `*-errors.ts` y `rate-limit-policies.ts`. `src/proxy.ts` (23 líneas, solo configuración de Clerk/CSP, validada por `security-headers.test.ts`) no se prueba | `grep -rn "payment-session-effects" src` | Descartado como hueco |
| H10 | Ruido, no fallo: en la corrida completa `cancel-payment-button.test.tsx` emite "The current testing environment is not configured to support act(...)"; aislado o junto a los demás `.test.tsx` no aparece (0 ocurrencias). Causa no confirmada | Corrida completa, 5 bloques stderr de ese archivo | Observado; fuera de alcance (Q5) |
| H11 | PGlite tiene una sola conexión, así que los tests "concurrentes" solo prueban coherencia, no bloqueos. Código afectado: `FOR UPDATE`/`FOR SHARE` en `payment-checkout.service.ts:108,126`, `payment-session-effects.ts:62,69`, `project.service.ts:43`, `proposal-selection.service.ts:41,65`, `proposal.service.ts:84`; upsert atómico `ON CONFLICT … DO UPDATE` en `rate-limit.service.ts:35-40`. El propio test lo declara (`proposal-selection.service.test.ts:4`). El cliente real (`src/lib/db/client.ts:14`) usa `Pool` de Neon con varias conexiones | Código citado | Confirmado |

### Cobertura de lo que pide SDD-PLAN §8 (inventario de tests existentes, no se duplica)

| Punto de SDD-PLAN | Tests existentes |
|---|---|
| Validaciones de proyectos y propuestas | `projects/schemas/project.schema.test.ts`, `proposals/schemas/proposal.schema.test.ts`, `proposal-selection.schema.test.ts` |
| Permisos por rol | `auth/services/permissions.test.ts` y los `*.actions.test.ts` por módulo |
| Selección concurrente | `proposal-selection.service.test.ts:440` (coherencia en PGlite; bloqueo real: T4) |
| Integridad de BD | `src/lib/db/*constraints.test.ts`, `migrations.test.ts` |
| Checkout: crear y cancelar | `payment-checkout.service.test.ts`, `payment-cancellation.service.test.ts` |
| Webhooks inválidos y repetidos | `route.test.ts`, `route.flow.test.ts` (idempotencia), `stripe-webhook.test.ts` |
| Pagos fallidos y completados | `payment-event.service.test.ts`, `payment-reconciliation.service.test.ts` |
| Pago confirmado y transferencia | `developer-transfer.service.test.ts`, `developer-transfer-records.test.ts`, `developer-transfers-constraints.test.ts` |
| Flujos de cliente y desarrollador | `client-dashboard.service.test.ts`, `developer-dashboard.service.test.ts` (a nivel de servicio; E2E de navegador: Q4) |

## Decisiones

- **D1 (H1):** el test debe alterar la firma de forma que **siempre** cambie: sustituir el primer dígito hex por uno distinto (`c === "0" ? "1" : "0"`). Helper compartido `tamperSignature` en `src/lib/stripe-test-signature.ts` (DRY: dos usos reales hoy) con test propio que recorre 256 timestamps. No se tocan `route.ts` ni `stripe.ts`.
- **D2 (H4):** pragma `node` por archivo, igual que los otros 63 (convención existente); no se cambia el entorno por defecto en `vitest.config.mts` para no alterar el comportamiento de los `.test.tsx`. Ahorro esperado: unos 5 s de ~60 s de reloj con 4 workers (estimado a partir del subconjunto: ~20 s de CPU de jsdom, repartidos en 4 workers). Modesto pero sin riesgo.
- **D3 (H11), DESCARTADA (Q2 = no):** no hay suite Neon; el límite se documenta en `MANUAL-TESTS.md §10`. Texto original, sin efecto: suite opcional `*.neon.test.ts` con config propia y script `test:neon`, **no** solo prueba manual. Motivo: es repetible, sin dependencias nuevas (usa `@neondatabase/serverless` y `drizzle-orm` ya instalados), y se salta sola sin la variable `NEON_TEST_DATABASE_URL`. Una prueba manual no detecta regresiones en `FOR UPDATE`/`FOR SHARE`. Requisito: una rama desechable de Neon con migraciones aplicadas (el plan gratuito permite ramas); costo: ninguno monetario. No entra en `npm test` ni en `verify`.
- **D4 (cobertura):** medir con `@vitest/coverage-v8` (proveedor oficial, usa V8 nativo, sin instrumentación de código). Alcance de la medición: `src/modules/**`, `src/lib/**`, `src/app/api/**`; excluye `src/components/ui/**`, `**/*.test.*`, `**/*.types.ts`, `**/*.table.ts` y `src/lib/db/test-db.ts`. **Umbrales:** globales (líneas, funciones, ramas, sentencias) = línea base medida en T0 menos 2 puntos, redondeado hacia abajo (red de seguridad contra regresiones, no meta). No se fijan cifras ahora porque no se ha medido: la instalación es parte de T0. No se exigen umbrales por carpeta en esta fase; T0 registra en su entrega el porcentaje de `auth`, `payments`, `security`, `ratings` y `dashboard` para decidir en una fase posterior.
- **D5 (higiene):** `verify` = `npm run lint && npm run test && npm run build` (sin cobertura, para que sea rápido). `test:coverage` aparte.
- **D6 (H6):** actualizar `next` y `eslint-config-next` juntos a 16.4.2 (ambos están fijados exactos en `package.json`) y aplicar el arreglo dentro de rango de `vite`. Nunca `npm audit fix --force`. Condicionado a que `verify` pase; si no pasa, revertir y dejar la vulnerabilidad documentada (Q1).

## Reutilizar

- `src/lib/db/test-db.ts` (`createTestDb`): sin cambios; la suite Neon no lo usa a propósito (necesita varias conexiones reales).
- Patrón de `holder`/`Proxy` y `vi.mock("@/lib/db/client")` de `route.flow.test.ts:14-17`: la suite Neon hace lo contrario (importa el cliente real tras fijar `DATABASE_URL` desde `NEON_TEST_DATABASE_URL`).
- Servicios reales a invocar en T4: `selectProposal` (`proposal-selection.service.ts`), `createProposal` (`proposal.service.ts:71`), `unpublishProject` (`project.service.ts:147`), `createNeonRateLimitStore` (`rate-limit.service.ts:32`).
- Patrones de test de botones: `cancel-payment-button.test.tsx`, `select-proposal-button.test.tsx` (mocks de `next/navigation` y de la acción, `userEvent`, `useAnnouncerStore`).
- `src/lib/announcer.store.ts` (`announce`, `useAnnouncerStore`), `Stripe.webhooks.generateTestHeaderString` (ya usado).
- `docs/MANUAL-TESTS.md` formato de secciones `## 8j. Spec 015` como modelo para la nueva §8k.

## Archivos

Nuevos:
- `src/lib/stripe-test-signature.ts` y `src/lib/stripe-test-signature.test.ts`
- `src/modules/payments/components/{start-checkout,refresh-payment,retry-transfers,refresh-connected-account,start-payout-onboarding}-button.test.tsx`

Modificados:
- `package.json`, `package-lock.json`, `vitest.config.mts`
- `src/app/api/webhooks/stripe/route.test.ts`, `src/app/api/webhooks/stripe/route.flow.test.ts`
- los 21 tests `.ts` de H4 (solo la línea de pragma)
- `docs/MANUAL-TESTS.md`

## Criterios de aceptación

- AC1: `tamperSignature(sig)` devuelve siempre una firma distinta de la original y con la misma forma `t=…,v1=…`, para 256 timestamps distintos (incluidos los que producen un HMAC que empieza por `0`).
- AC2: `route.test.ts` y `route.flow.test.ts` usan `tamperSignature` y ya no contienen `.replace(/v1=`. Cada archivo pasa 50 veces seguidas en bucle (`for i in 1..50`) sin ningún fallo (con el código anterior, la probabilidad de 50 pasadas era ~4%).
- AC3: los 21 tests de H4 llevan `// @vitest-environment node` y la suite completa sigue en 94 archivos / 1806+ tests verdes. El tiempo de reloj de `npm test` no empeora respecto a la línea base de ~60 s (se reporta el valor medido).
- AC4: `vitest.config.mts` no cambia `isolate`, `pool` ni timeouts (solo añade el bloque `coverage`).
- AC5: `npm run test:coverage` genera el informe (texto + `coverage/`) y falla si algún umbral global baja; los umbrales son línea base menos 2 puntos, y el valor medido y el elegido se reportan en la entrega. `coverage/` queda en `.gitignore` (verificar; añadirlo si falta, en T0 junto con `package.json`).
- AC6: `npm run verify` ejecuta lint, test y build en ese orden y termina con código 0 en el árbol final.
- AC7: (descartado, Q2 = no; sin suite Neon).
- AC8: (descartado, Q2 = no; sin suite Neon).
- AC9: (descartado, Q2 = no; sin suite Neon).
- AC10: (descartado, Q2 = no; sin suite Neon).
- AC11: (descartado, Q2 = no; sin suite Neon).
- AC12 (H7): cada botón de T3 tiene tests de: etiqueta y estado `pending` deshabilitado, error de la acción mostrado con `role="alert"` o `announce(…,"alert")` según el componente, `router.refresh` solo cuando corresponde (`STALE_CODES` en checkout; siempre en error en onboarding; en éxito en refresh/retry), y que en éxito de checkout/onboarding (la acción redirige y no regresa, resultado `undefined`) no aparece error.
- AC13: tras T0 la lista de `npm audit --omit=dev` ya no incluye `next`; `vite` queda sin avisos; las demás vulnerabilidades pendientes (CLI `shadcn`, `drizzle-kit`, `eslint-config-next`) quedan registradas en `docs/MANUAL-TESTS.md §10` con la razón de no aplicarlas (arreglo = major/downgrade). Si Q1 se responde "no", AC13 se reduce a ese registro.
- AC14: un grep sobre `src/**/*.test.*` sigue sin `fetch(`, `new Stripe(`, `postgres://`, `neon.tech` ni claves con forma real (`sk_(test|live)_` seguido de 24+ caracteres alfanuméricos).
- AC15: ningún archivo de `src/**` de producción cambia (solo tests, helpers de test, configs y docs).

## Tests requeridos

(Vitest, junto al archivo.)

- `src/lib/stripe-test-signature.test.ts` (AC1), entorno `node`.
- Los dos tests del webhook modificados (AC2).
- Cinco `*-button.test.tsx` de pagos (AC12), jsdom + RTL.
- No se añaden tests para `payment-session-effects`, `payment-transitions`, `*-errors`, `rate-limit-policies` ni `proxy.ts` (H9: ya cubiertos o configuración).

## Tareas

### T0 — Base: dependencias, configs, helper y scripts (serial, primero)
- Archivos: `package.json`, `package-lock.json`, `vitest.config.mts`, `.gitignore` (solo si falta `coverage`), `src/lib/stripe-test-signature.ts`, `src/lib/stripe-test-signature.test.ts`
- Contenido: `npm i -D @vitest/coverage-v8@5.0.3` (versión exacta igual a `vitest`; su peer es `vitest: 5.0.3`); scripts `test:coverage` y `verify`; en `vitest.config.mts` el bloque `coverage` (proveedor v8, include/exclude de D4, umbrales = línea base − 2); helper `tamperSignature`; actualización de dependencias de D6 (`next`, `eslint-config-next`, `vite`) y reporte de `npm audit` antes/después. Mide la línea base con `test:coverage` y reporta los porcentajes global y por carpeta de `auth`, `payments`, `security`, `ratings`, `dashboard`.
- Depende de: —
- Paralelizable: no (toca `package.json`, `node_modules`, `.next`; nadie ejecuta `npm install` ni `build` mientras corre el bloque paralelo)
- Cubre: AC1, AC4, AC5, AC6, AC13 (parte de dependencias), AC15

### T1 — Webhook determinista
- Archivos: `src/app/api/webhooks/stripe/route.test.ts`, `src/app/api/webhooks/stripe/route.flow.test.ts`
- Contenido: usar `tamperSignature` en el caso "tampered signature" y en "leaves the DB untouched on an invalid signature"; verificar con el bucle de AC2.
- Depende de: T0
- Paralelizable: sí (con T2, T3, T4)
- Cubre: AC2

### T2 — Entorno node en tests `.ts` puros
- Archivos: los 21 de H4 (solo la primera línea `// @vitest-environment node`)
- Depende de: —
- Paralelizable: sí
- Cubre: AC3

### T3 — Tests de botones de pagos
- Archivos: `src/modules/payments/components/start-checkout-button.test.tsx`, `refresh-payment-button.test.tsx`, `retry-transfers-button.test.tsx`, `refresh-connected-account-button.test.tsx`, `start-payout-onboarding-button.test.tsx`
- Depende de: —
- Paralelizable: sí
- Cubre: AC12, AC14

### T4 — Documentación
- Archivos: `docs/MANUAL-TESTS.md`
- Contenido: reemplazar los dos puntos de §10 (`npm audit`, bloqueos de Postgres) por su estado final: las vulnerabilidades de producción corregidas y las de herramientas de desarrollo registradas con su razón (AC13), y la nota de que los bloqueos reales de Postgres/Neon y la concurrencia entre conexiones **no están cubiertos** por la suite (PGlite tiene una sola conexión; se probaron a mano en 8f/8g y no hay suite Neon, Q2). Solo añadir o reemplazar esas líneas.
- Depende de: T0
- Paralelizable: sí (con T1, T2, T3)
- Cubre: AC13 (parte de registro), AC14

Orden: T0 serial; luego T1, T2, T3 y T4 en paralelo (propiedad de archivos disjunta; ninguna ejecuta `npm install` ni `build`). El reviewer ejecuta `npm run verify` y `npm run test:coverage` al final, y repite el bucle de AC2.

## Preguntas abiertas

- **Q1 (D6): ¿actualizar `next` 16.3.8 → 16.4.2 en esta spec?** Es una vulnerabilidad crítica en una dependencia de producción (H6). Por defecto: sí, en T0, con `verify` verde; si algo rompe, se revierte y se documenta. Next 16 difiere de versiones anteriores: el developer debe revisar el changelog y `node_modules/next/dist/docs/` antes de subir. Si prefieres que sea una spec aparte (cambia el árbol de producción), se quita de T0 y queda solo el registro.
- **Q2 (D3): RESUELTA por el humano: no.** Sin suite `test:neon`; el límite se documenta en `MANUAL-TESTS.md §10`.
- **Q3 (D4): umbrales.** Por defecto, línea base − 2 puntos en las cuatro métricas globales, sin umbrales por carpeta. Costo de `@vitest/coverage-v8`: 1 devDependency (peer exacto `vitest@5.0.3`: al actualizar vitest hay que actualizar ambos a la vez; el costo de tiempo en `test:coverage` no está medido, se reporta en T0). Con la línea base ya medida, ¿quieres endurecer carpetas críticas (auth, payments, security) en una fase 2?
- **Q4: E2E ligero (Playwright + Clerk en test).** Recomendación: no ahora; hacerlo después del despliegue (017). Costo: `@playwright/test` + descarga de navegadores (cientos de MB), una instancia de desarrollo de Clerk con usuarios de prueba y `@clerk/testing` (nueva dependencia), Neon de pruebas y Stripe en modo de prueba con `stripe listen`; ~1 jornada para un solo flujo (cliente publica, desarrollador propone, cliente selecciona) y un CI con secretos. Hoy los flujos están cubiertos a nivel de servicio y por las pruebas manuales de `MANUAL-TESTS.md`. Fuera de alcance salvo que lo pidas.
- **Q5 (H10): ruido de `act(...)` en `cancel-payment-button.test.tsx`.** Sin fallo y sin causa confirmada. Por defecto: no hacer nada. Si molesta, abrir una tarea pequeña para investigar (posible `IS_REACT_ACT_ENVIRONMENT` en `vitest.setup.ts`, no verificado).
- **Q6: las 3 vulnerabilidades de herramientas de desarrollo sin arreglo sano** (`shadcn`, `drizzle-kit`, `eslint-config-next`): por defecto se aceptan y se registran (no llegan al bundle ni al servidor en ejecución; npm solo ofrece majors/downgrades). Revisar cuando salga una versión corregida.

## Próximas fases

- Endurecer umbrales por carpeta crítica con la línea base de T0 y añadir los tests que la cobertura de ramas evidencie (no se listan ahora para no inventar huecos sin medir).
- Playwright + Clerk (Q4) tras la spec 017.
- Investigar el aviso de `act(...)` (Q5).

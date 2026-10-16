# Auditoría del repositorio (Fase 0 de Nexora)

Estado: aprobada

## Objetivo

Determinar cómo debe integrarse Nexora en el template existente sin duplicar herramientas o convenciones, según `docs/SDD-PLAN.md §3` (Fase 0 — Auditoría del repositorio). Este documento es el insumo de entrada para las specs 002 en adelante (dominio/arquitectura, schema DB, auth, etc.); no describe código a implementar ni autoriza instalaciones.

## Alcance

- Incluye:
  - Inventario verificable de lo que ya existe en el repo (estructura, convenciones, dependencias, agentes, tests, env).
  - Comparación entre esas capacidades y lo que el brief de Nexora (`docs/BRIEF.md §9`) requiere: Clerk, Drizzle + Neon (Postgres), Supabase Storage, Stripe.
  - Decisiones técnicas abiertas que requieren aprobación humana antes de redactar la spec 002.
  - Lista de dependencias que faltan, con el motivo de cada una (sin instrucciones de instalación).
- No incluye:
  - Modificación de ningún archivo de código de la app.
  - Instalación de paquetes (`npm install`, `npx shadcn add`).
  - Definición de modelo de datos, roles o schema SQL (eso es spec 002/003).
  - La spec de landing page (`docs/NEXORA-LANDING-DESIGN.md`), que es un documento de diseño visual independiente y fuera del alcance de esta auditoría.

## Reutilizar

No aplica — esta spec no produce componentes/hooks/servicios. El inventario de "qué reutilizar" para futuras specs de feature es, precisamente, el contenido de la sección "Inventario de capacidades existentes" más abajo.

## Archivos

- `docs/specs/001-repository-audit.md` (este documento). No se toca ningún otro archivo del repositorio.

---

## Inventario de capacidades existentes

### 1. Next.js / App Router / TypeScript

- Next.js `16.3.8` (`package.json:21`), React `19.2.8`, build con Turbopack (`npm run build` según `CLAUDE.md`). Esta versión difiere del training data del agente; la guía local vive en `node_modules/next/dist/docs/` (carpetas `01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md` — verificado por listado de directorio).
- Estructura actual de `src/app`: solo `favicon.ico`, `globals.css`, `layout.tsx`, `page.tsx` (contenido por defecto de `create-next-app`, ver `src/app/page.tsx:1-69`). No hay rutas de dominio todavía.
- `src/app/layout.tsx` usa fuentes Geist vía `next/font/google`, `RootLayout` tipado con `LayoutProps<"/">` (API de Next 16). No hay providers (React Query, etc.) montados.
- TypeScript: `tsconfig.json` con `strict: true`, alias `@/*` → `./src/*` (`tsconfig.json:21-23`), `moduleResolution: "bundler"`, plugin `next`.

### 2. Convenciones de módulos y componentes (`docs/SETUP.md`)

- `docs/SETUP.md` define: dominio en `src/modules/<domain>` (componentes/hooks/services/schemas/types/store), `src/app` solo routing, naming en inglés kebab-case, sufijos `.service.ts` / `.schema.ts` / `.types.ts` / `.store.ts`, `src/components/ui` (shadcn) vs `src/components/shared` (compartidos de dominio) vs `src/modules/<domain>/components` (específicos), `src/lib` para utilidades transversales.
- `src/modules/` **no existe todavía** (`Glob src/modules/**` → sin resultados): el template no tiene ningún dominio implementado, es scaffold puro.
- `src/components/` solo contiene `ui/` con un único componente generado (`src/components/ui/button.tsx`); no existe `src/components/shared/`.
- `src/lib/` solo contiene `utils.ts` (re-exporta `cn` del paquete `cn`, `src/lib/utils.ts:1`) y su test `utils.test.ts`. No hay cliente de axios, ni ningún `.service.ts`/`.schema.ts`/`.store.ts` en el repo (confirmado por Grep sin resultados de `zod\.object|z\.object` en `src/`).
- SETUP.md solo tiene 3 secciones numeradas (1. Estructura de carpetas, 2. Buenas prácticas, 3. Metodología SDD). **No existe una sección §4** ni un directorio `docs/architecture/` — ver "Decisiones técnicas que requieren aprobación humana" más abajo, es una inconsistencia detectada contra las referencias de los agentes.

### 3. Sistema de estilos y UI

- No existe `tailwind.config.ts` ni variante `.js/.mjs` (`Glob tailwind.config.*` → sin resultados), consistente con Tailwind CSS v4 (theme vía `@theme inline` + CSS custom properties en `src/app/globals.css:1-130`, tokens `:root`/`.dark` en oklch).
- `components.json` confirma shadcn configurado con `"style": "base-nova"`, `"tailwind": {"config": ""}`, `baseColor: "neutral"`, `cssVariables: true`, iconLibrary `lucide`, alias `@/components`, `@/components/ui`, `@/lib`, `@/hooks` (`components.json:1-25`). El estilo `base-nova` construye sobre Base UI (`@base-ui/react@^1.8.0` en `package.json:14`), no Radix.
- `src/components/ui/` solo tiene `button.tsx` hoy; cualquier otro componente (input, table, dialog, form, etc.) debe agregarse con `npx shadcn@latest add <componente>` cuando una spec aprobada lo requiera (prohibido en esta fase).

### 4. Formularios y validación

- `zod@^4.6.5` está en `dependencies` (`package.json:26`) pero **sin ningún `.schema.ts` ni `z.object(...)` en `src/`** (Grep `z\.object` en `src/` → sin resultados). Confirmado: instalado, no integrado.

### 5. Acceso a PostgreSQL / ORM

- No hay Drizzle, `pg`, `postgres`, ni ningún cliente de base de datos en `package.json` (Grep `drizzle|postgres|neon` → sin resultados en `package.json`). No hay carpeta `src/lib/db` ni variables `DATABASE_URL` en ningún archivo del repo (no existe ningún `.env*` — ver sección 9).
- `docs/BRIEF.md §9` requiere PostgreSQL en Neon + Drizzle ORM como stack objetivo; esto es una integración completamente nueva, no una extensión de algo existente.

### 6. Integración con Clerk

- No hay ninguna referencia a `clerk` en `package.json` ni en `src/` (Grep `clerk` sin resultados en ambos). No hay middleware de auth, no hay `src/middleware.ts`, no hay provider de sesión en `src/app/layout.tsx`.
- `docs/BRIEF.md §6.1` y `§9` requieren Clerk para registro/login y resolución de rol (cliente/desarrollador).

### 7. Pruebas, linting y calidad

- Vitest configurado en `vitest.config.mts` (plugin `@vitejs/plugin-react`, `environment: "jsdom"`, `setupFiles: ["./vitest.setup.ts"]`); `vitest.setup.ts` solo importa `@testing-library/jest-dom/vitest`. React Testing Library (`@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`) está en `devDependencies` (`package.json:31-34`).
- Único test existente: `src/lib/utils.test.ts` (junto a `src/lib/utils.ts`), patrón que SETUP.md pide seguir (tests junto al archivo para services/hooks/stores/schemas/lib).
- ESLint flat config (`eslint.config.mjs:1-18`) usa `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, con `globalIgnores` sobre `.next/`, `out/`, `build/`, `next-env.d.ts`.
- Scripts de `package.json:5-12`: `dev` (`next dev`), `build` (`next build`, incluye type-check según `CLAUDE.md`), `start`, `lint` (`eslint`), `test` (`vitest run`), `test:watch` (`vitest`).

### 8. Agentes y flujo de aprobación (SDD)

- `.claude/agents/` contiene 4 agentes: `orchestrator.md`, `spec.md`, `developer.md`, `reviewer.md` (confirmado por `ls .claude/agents`).
- `orchestrator.md`: hace triage BUILD vs SDD; en fase A genera spec en `Estado: borrador` y se detiene; en fase B exige `Estado: aprobada` explícito de un humano para lanzar `developer` (bloqueante, con mención de un hook del proyecto que rechaza lanzar `developer` sin spec aprobada referenciada); agrupa tareas en olas según "Depende de"; cambios compartidos (`package.json`, `src/app/layout.tsx`, `globals.css`, `npx shadcn add`) van en tarea base `T0` nunca en paralelo; máximo 2 rondas de corrección en el loop de review antes de escalar al usuario.
- `developer.md`: bloqueante si la spec no tiene `Estado: aprobada`; solo toca los archivos listados en su tarea; no instala paquetes salvo que sea dueño de `package.json`; corre `eslint`/`vitest`/`tsc --noEmit` solo sobre sus archivos.
- `reviewer.md`: solo lectura (sin Write/Edit); valida AC de la spec, estructura, reutilización, buenas prácticas, tests, y corre `lint`/`vitest run`/`build` completos del proyecto; devuelve `PASS`/`FAIL` con hallazgos `archivo:línea`.
- `CLAUDE.md` (raíz) documenta el mismo flujo y agrega la regla explícita: "Human approval is a hard gate... Silence or 'it's small' is not approval. A spec edited after approval goes back to draft and needs approval again."
- Inconsistencia detectada: `developer.md` y `reviewer.md` citan `SETUP.md §4` y `docs/architecture/` para secciones de auth/roles/pagos/inventario, pero `docs/SETUP.md` solo llega hasta la sección 3 y **no existe** el directorio `docs/architecture/` en el repo (`Glob docs/architecture/**` → sin resultados). Ver pregunta abierta correspondiente.
- No hay ninguna spec previa en `docs/specs/` (`Glob docs/specs/**` → sin resultados antes de este documento): esta es la primera spec del repositorio.

### 9. Variables de entorno y secretos

- No existe ningún archivo `.env`, `.env.local` ni `.env.example` en el repo (verificado por listado de archivos en la raíz).
- `.gitignore:33-34` ya incluye el patrón `.env*` (con el comentario "env files (can opt-in for committing if needed)"), por lo que el mecanismo de exclusión de git ya está listo, pero no hay ninguna convención de nombres de variables, ni un `.env.example` documentando qué se necesita.
- El stack objetivo (`docs/BRIEF.md §9`, `§6.4`) va a requerir como mínimo: claves de Clerk (publishable/secret), `DATABASE_URL` de Neon, claves de Supabase Storage (URL + service role o anon key según el uso), claves de Stripe en modo de prueba (publishable/secret + webhook signing secret). Ninguna de estas existe hoy en el repo.

---

## Diferencias entre el template y las necesidades de Nexora

| Capacidad requerida (BRIEF §9) | Estado en el template | Brecha |
|---|---|---|
| Autenticación (Clerk) | No instalado, no hay middleware ni provider | Integración completa nueva: paquete, provider en `layout.tsx`, middleware de rutas protegidas, mapeo de rol |
| Base de datos (Postgres/Neon) + ORM (Drizzle) | No instalado, no hay cliente de DB | Integración completa nueva: paquete, cliente, config de conexión, carpeta de schema/migraciones (ubicación a definir en spec 003) |
| Archivos privados (Supabase Storage) | No instalado, no mencionado en ningún archivo | Integración completa nueva: paquete cliente, buckets, política de acceso a definir en spec de seguridad (015) |
| Pagos de prueba (Stripe Checkout Test Mode) | No instalado | Integración completa nueva: paquete, rutas de servidor para Checkout Sessions y webhooks, manejo de firma/idempotencia (specs 009-011) |
| Validación (Zod) | Instalado pero sin uso | Reutilizable tal cual; solo falta empezar a escribir `.schema.ts` por módulo |
| UI (Tailwind v4 + shadcn/ui `base-nova`) | Configurado y funcional, un único componente (`button`) | Reutilizable tal cual; agregar componentes vía `npx shadcn@latest add` según cada spec de UI lo necesite |
| Estructura modular (`src/modules/<domain>`) | Definida en SETUP.md, sin ningún módulo creado | Reutilizable tal cual; la spec 002 debe decidir los primeros dominios (`users`/`projects`/`proposals`/`payments`, etc.) |
| Server state / tablas (`@tanstack/react-query`, `@tanstack/react-table`) | Instalados, sin `QueryClientProvider` montado ni uso | Falta wiring mínimo (un `QueryClientProvider` en `layout.tsx`) cuando la primera spec de datos lo requiera |
| Testing (Vitest + RTL) | Configurado y funcional, un solo test de ejemplo | Reutilizable tal cual; seguir el patrón de test junto al archivo |

## Decisiones técnicas que requieren aprobación humana

1. **Convención de numeración de specs**: `docs/SDD-PLAN.md §2 regla 4` pide seguir "la convención de numeración del repositorio", pero `docs/specs/` está vacío antes de este documento y los agentes (`orchestrator.md`, `developer.md`, `reviewer.md`) solo citan `docs/specs/<slug>.md` sin prefijo numérico. Este documento adopta el prefijo `001-` (y `BRIEF`/`SDD-PLAN` ya numeran specs 002 a 017) como la convención a partir de ahora. Requiere confirmación explícita de un humano antes de que spec 002 se escriba con ese mismo patrón.
2. **Brecha `SETUP.md §4` / `docs/architecture/`**: los tres agentes (`developer.md`, `reviewer.md`, y el propio prompt de `spec`) asumen una sección 4 de `SETUP.md` y un directorio `docs/architecture/` con documentos como `system-design.md` para auth/roles/pagos/inventario, que hoy no existen. Hay que decidir si: (a) la spec 002 (`product-domain-and-architecture.md`) crea `docs/architecture/system-design.md` y se agrega una entrada §4 a `SETUP.md` que apunte ahí, o (b) se usa otro mecanismo. Sin esta decisión, specs 002+ no tienen dónde anclar las citas que `CLAUDE.md` exige.
3. **Drizzle + Neon vs. alternativa de ORM/DB** (`BRIEF.md §9`): confirmar que se mantiene Drizzle + Neon como se especifica, o evaluar alternativas, antes de redactar spec 003 (`database-schema.md`).
4. **Clerk vs. alternativa de auth** (`BRIEF.md §6.1`, `§9`): confirmar Clerk como proveedor de auth antes de spec 004 (`authentication-and-authorization.md`).
5. **Supabase Storage vs. otro storage** (`BRIEF.md §6.4`... en realidad §9): confirmar Supabase Storage para archivos privados antes de que cualquier spec dependa de subir/servir archivos.
6. **Alcance de Stripe Connect** (`SDD-PLAN.md §6`, spec 011 `developer-payment-routing-test-model.md`): decidir si el MVP solo simula la transferencia al desarrollador (alcance menor) o si se implementa un flujo real de Stripe Connect en modo de prueba (alcance mayor, requiere aprobación expresa según el propio `SDD-PLAN.md`).
7. **Estrategia de gestión de variables de entorno/secrets**: no existe hoy ningún `.env.example` ni convención de nombres. Hay que decidir el esquema de nombres (ej. `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) y si se documentan en un `.env.example` versionado (sin valores reales) — esto normalmente se resuelve en spec 017 (`deployment-and-environments.md`) pero conviene decidir el criterio general ahora para que specs intermedias (009, 017) no lo redefinan de forma distinta.
8. **Primeros dominios de `src/modules/`**: aunque es decisión de spec 002, vale dejar registrado que el template no impone ningún dominio; la spec 002 deberá proponer el corte inicial (`users`/`profile`, `projects`, `proposals`, `payments`, etc.) para validación humana.

## Dependencias faltantes (sin instalar)

Lista de paquetes que el stack de Nexora (`BRIEF.md §9`) requiere y que hoy no están en `package.json`, con el motivo. Ninguno se instala en esta fase (regla 8 de `SDD-PLAN.md §2`); la instalación corresponde a la spec que primero necesite cada uno, una vez aprobada.

- **Clerk** (`@clerk/nextjs` o equivalente): motivo — autenticación y gestión de sesión/roles requerida por `BRIEF.md §6.1`; no hay alternativa instalada en el template.
- **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`): motivo — acceso tipado a PostgreSQL y migraciones requerido por `BRIEF.md §9`; no hay ningún ORM ni cliente SQL en el template.
- **Driver de Postgres para Neon** (ej. `@neondatabase/serverless` o `pg`, a decidir en spec 003): motivo — conexión real a la base de datos Neon; Drizzle necesita un driver subyacente.
- **Supabase Storage client** (`@supabase/supabase-js` o similar): motivo — almacenamiento de archivos privados requerido por `BRIEF.md §9`; no instalado.
- **Stripe** (`stripe` para servidor; opcionalmente `@stripe/stripe-js` si se necesita algo en cliente): motivo — Checkout Sessions y verificación de webhooks en modo de prueba requerido por `BRIEF.md §6.4`; no instalado.

No se listan `zod`, `@tanstack/react-query`, `@tanstack/react-table`, `zustand`, `axios` porque ya están instalados (sección "Inventario" punto 4 y tabla de diferencias); solo falta integrarlos cuando una spec aprobada lo requiera, sin instalación adicional.

---

## Criterios de aceptación

- AC1: cada afirmación de la sección "Inventario de capacidades existentes" cita al menos un archivo o ruta real del repositorio verificado con Read/Grep/Glob durante esta auditoría (ej. `package.json:21`, `docs/SETUP.md`, `tsconfig.json:21-23`).
- AC2: la sección "Diferencias entre el template y las necesidades de Nexora" cubre las 4 integraciones explícitas del brief (Clerk, Drizzle+Neon, Supabase Storage, Stripe) y señala qué ya existe vs. qué es nuevo para cada una.
- AC3: la sección "Dependencias faltantes" no incluye ninguna instrucción de instalación (`npm install`, `npx shadcn add`), solo nombre del paquete y motivo.
- AC4: no hay ninguna tarea de tipo developer en esta spec; el documento deja explícito que no se proponen modificaciones de código ni instalaciones (criterio de `SDD-PLAN.md §3`: "No se proponen modificaciones ni instalaciones sin haber identificado primero qué capacidades ya existen").
- AC5: toda decisión técnica pendiente (Drizzle vs. alternativa, Clerk vs. alternativa, Supabase Storage vs. alternativa, alcance de Stripe Connect, convención de numeración de specs, brecha `SETUP.md §4`/`docs/architecture/`, estrategia de env vars) queda registrada en "Decisiones técnicas que requieren aprobación humana" y/o "Preguntas abiertas", no implícita en el cuerpo del documento.
- AC6: el único archivo tocado por esta spec es `docs/specs/001-repository-audit.md`.

## Tests requeridos

Ninguno. Esta spec no produce código de aplicación; no hay `services/`, `hooks/`, `schemas/`, `stores/` ni utilidades en `src/lib` que verificar.

## Tareas

Esta spec no genera tareas de developer. Es un documento de auditoría/inventario, insumo para las specs 002 en adelante; no hay implementación de código que dividir en tareas paralelizables.

### T1 — Redacción del documento de auditoría (ya completada)

- Archivos: `docs/specs/001-repository-audit.md`
- Depende de: —
- Paralelizable: no aplica (tarea única, documental)
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6

## Preguntas abiertas

- ¿Se confirma el prefijo numérico `NNN-slug.md` (ej. `001-repository-audit.md`, `002-product-domain-and-architecture.md`, ...) como convención de nombres en `docs/specs/`, dado que los agentes actuales (`orchestrator.md`, `developer.md`, `reviewer.md`) no lo mencionan y `SDD-PLAN.md` sí lo usa?
- ¿Cómo se resuelve la brecha entre `SETUP.md §4` / `docs/architecture/` citados por los agentes y la ausencia actual de ambos? ¿La spec 002 debe crear `docs/architecture/system-design.md` y actualizar `SETUP.md` con una sección 4 que lo referencie?
- ¿Se mantiene Drizzle ORM + Neon Postgres, o se evalúa una alternativa antes de spec 003 (`database-schema.md`)?
- ¿Se mantiene Clerk como proveedor de autenticación, o se evalúa una alternativa antes de spec 004 (`authentication-and-authorization.md`)?
- ¿Se mantiene Supabase Storage para archivos privados, o se evalúa una alternativa?
- Para spec 011 (`developer-payment-routing-test-model.md`, `SDD-PLAN.md §6`): ¿el MVP solo simula la transferencia al desarrollador, o se implementa Stripe Connect en modo de prueba (alcance mayor, requiere aprobación expresa)?
- ¿Cuál es la convención definitiva de nombres de variables de entorno y el criterio de cuándo versionar un `.env.example` (sin valores reales) vs. dejarlo para spec 017?
- ¿Qué dominios de `src/modules/` se crean primero cuando spec 002 defina el dominio (ej. `users`, `projects`, `proposals`, `payments`)? (Delegado a spec 002, solo queda registrado aquí como punto a decidir.)

## Próximas fases

Según `docs/SDD-PLAN.md`, esta auditoría es prerrequisito de:

- **Fase 1** (specs 002-004): dominio/arquitectura, schema de base de datos (Drizzle), autenticación y autorización (Clerk).
- **Fase 2** (specs 005-008): gestión y catálogo público de proyectos, gestión de propuestas, selección de propuesta ganadora.
- **Fase 3** (specs 009-011): Stripe Checkout en Test Mode, estados de pago y webhooks, modelo de pago directo al desarrollador o transferencia simulada (Stripe Connect).
- **Fase 4** (specs 012-014): paneles de cliente y desarrollador, accesibilidad y feedback de UI.
- **Fase 5** (specs 015-017): seguridad y privacidad, estrategia de pruebas, despliegue y entornos.

Ninguna de estas specs se redacta hasta que las decisiones técnicas de la sección correspondiente de este documento queden aprobadas por un humano.

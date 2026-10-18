# Autenticación y autorización (Fase 1 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §4` (Spec 004). Dominio: `docs/architecture/system-design.md §3` (propiedad de datos), `§4` (módulos), `§6` (roles y permisos), `§8` (D1, D8, D10); `docs/BRIEF.md §4, §6.1, §7 (reglas 2, 7, 8)`. Esquema usado: `src/modules/users/schema/users.table.ts` (spec 003, done). Esta spec produce código (integración Clerk, guards, webhook, páginas de acceso) pero ninguna UI de negocio (catálogo, paneles, header: specs 006, 012-014).

## 1. Objetivo

Que cada petición al servidor pueda responder, sin confiar en el navegador: quién es el usuario (Clerk), qué rol tiene (Neon, `users.role`, D1) y si puede ejecutar la acción sobre el recurso concreto. Entrega:

- Registro e inicio de sesión con Clerk (credenciales y sesión viven solo en Clerk; Nexora no guarda contraseñas, `system-design.md §3`).
- Alta de la fila interna en `users` con un rol `client` o `developer` elegido una sola vez, sin ninguna vía para auto-asignarse `admin`.
- Sincronización de email y nombre visible desde Clerk, y tratamiento de cuentas eliminadas.
- Helpers de servidor reutilizables por las specs 005-013 (`getCurrentUser`, `requireUser`, `requireRole`, `requireOwnership`) y la matriz de permisos por rol.
- Protección de rutas con `proxy.ts` (sesión) más guards en cada página, handler y server action.

## 2. Contexto y alcance

Decisiones humanas ya aprobadas: Clerk como proveedor; D1 un solo rol por usuario, fijo desde el registro, Neon es la fuente de verdad; D8 admin solo lee y cierra proyectos, sin moderación (confirmada aquí, ver 5); Clerk guarda credenciales y sesión.

- Incluye:
  - Dependencia `@clerk/nextjs`, `ClerkProvider`, `src/proxy.ts`.
  - Páginas `/sign-in`, `/sign-up` (componentes prebuilt de Clerk) y `/onboarding` (elección de rol).
  - Módulo `src/modules/auth` (guards, permisos, errores, frontera con Clerk) y servicio `src/modules/users` (alta/sincronización/anonimizado).
  - Endpoint `POST /api/webhooks/clerk` (solo `user.updated` y `user.deleted`).
  - Tests Vitest sin llamar a Clerk real.
- No incluye:
  - Header global con avatar/`UserButton`, paneles cliente/desarrollador, landing (specs 006, 012, 013, 014). La referencia visual solo informa que luego habrá un header autenticado; esta spec no toca `page.tsx`.
  - Perfil del desarrollador (`developer_profiles`): se crea en la spec que lo edite (013) o en `users`; no aquí.
  - Cambio de rol, multi-rol, organizaciones de Clerk, MFA/políticas avanzadas, rate limiting (spec 015).
  - Reglas de negocio de proyectos, propuestas y pagos: solo se entrega la primitiva de autorización; cada spec la aplica.
  - `.env.example` completo y despliegue (D10; specs 009/017). Ver 12.
  - Cualquier cambio de esquema de BD: esta spec no añade columnas ni migraciones.

### Reutilizar (inventario)

- `src/modules/users/schema/users.table.ts` (`users`, `userRoleEnum`): sin cambios; `clerk_user_id` único habilita el upsert idempotente.
- `src/lib/db/client.ts` (`db` lazy, neon-serverless Pool) y `src/lib/db/test-db.ts` (`createTestDb()` PGlite con migraciones reales) para el servicio de usuarios y sus tests.
- FKs `onDelete: restrict` hacia `users` (proyectos, propuestas, selecciones, pagos): impiden borrar la fila; por eso la eliminación en Clerk se traduce en anonimizado (ver 9).
- `src/components/ui`: no existe nada que reutilizar para la elección de rol; se verifica en T4 con `ls src/components/ui` y `npx shadcn@latest search @shadcn -q card` (card/button/radio-group). Cualquier `shadcn add` se haría en T0 (no se prevé: se usan primitivos existentes o markup simple).
- Nada de auth previo en el repo (`src/` sin Clerk, sin `proxy.ts`/`middleware.ts`), verificado por el inventario de la spec 001.

## 3. Requisitos funcionales

### RF1. Registro e inicio de sesión (decisión: componentes prebuilt)

Se usan `<SignIn />` y `<SignUp />` prebuilt de `@clerk/nextjs` en rutas catch-all `src/app/sign-in/[[...sign-in]]/page.tsx` y `src/app/sign-up/[[...sign-up]]/page.tsx`.

Justificación: Clerk guarda credenciales, verificación de email, OAuth y anti-bot; una UI custom (hooks `useSignUp`/`useSignIn`) duplicaría esa superficie de seguridad y mantenimiento sin que el requerimiento lo pida (KISS, YAGNI). El estilo se acerca al template con el prop `appearance` si hace falta, en T4, sin pantallas propias. Las rutas son `/sign-in` y `/sign-up`; tras registrarse se fuerza `/onboarding`; tras iniciar sesión se va a `/` (los paneles llegan en 012/013).

### RF2. Elección de rol y persistencia (decisión: onboarding con server action, sin metadata del cliente)

- El rol NO viaja en `unsafeMetadata`. Tras registrarse, el usuario cae en `/onboarding` (página en `src/app`, delgada), que muestra dos opciones: "Necesito un desarrollador" (`client`) y "Soy desarrollador" (`developer`).
- Un server action `completeOnboarding({ role })` valida la entrada con Zod (`z.enum(["client","developer"])`; `admin` es inválido por construcción), obtiene identidad del servidor (sesión Clerk + email/nombre desde Clerk, nunca del cuerpo de la petición) e inserta la fila con `INSERT ... ON CONFLICT (clerk_user_id) DO NOTHING`. Si la fila ya existía, devuelve la existente: el rol NO se sobrescribe (D1: fijo).
- Justificación frente a `unsafeMetadata`/`publicMetadata`: `unsafeMetadata` es escribible por el propio usuario desde el navegador (también tras el registro, vía SDK) y `publicMetadata` solo escribe el backend. Usar metadata como canal del rol obliga a defenderse de escaladas y de desincronización. Con el server action hay una única vía de escritura del rol en servidor, validada por enum y solo ejecutable con sesión; cubre además el caso de cuentas creadas por OAuth desde `/sign-in` (sin pasar por `/sign-up`) y evita depender del webhook `user.created` (la fila no se puede crear antes de conocer el rol, que es `NOT NULL`).
- Cómo se impide escalar a `admin`: (a) ningún código acepta `admin` desde entrada de usuario (Zod); (b) no existe función de actualización de rol en `users.service` (AC12); (c) el rol se lee siempre de Neon, nunca de claims de sesión ni de metadata de Clerk (se ignora cualquier `role` en `unsafeMetadata`/`publicMetadata`); (d) `admin` se asigna solo manualmente (SQL sobre Neon, ver 11).
- Un usuario autenticado sin fila (no completó el onboarding) es el estado `ONBOARDING_REQUIRED`: puede ver rutas públicas; en rutas privadas se le redirige a `/onboarding`. Si ya tiene fila, `/onboarding` redirige a `/`.
- No se escribe caché del rol en metadata de Clerk (D1 lo permite como opcional): YAGNI y evita una segunda fuente que mantener.

### RF3. Vinculación Clerk <-> `users` (decisión: alta explícita en onboarding + webhook solo para `user.updated`/`user.deleted`)

- Alta: solo en `completeOnboarding` (RF2). Vínculo: `users.clerk_user_id` único. Idempotencia y carrera (doble envío, dos pestañas): resueltas por el `ON CONFLICT DO NOTHING` + lectura posterior; el resultado es el mismo para N llamadas concurrentes.
- Webhook `POST /api/webhooks/clerk`: verifica la firma con `verifyWebhook` de `@clerk/nextjs/webhooks` (secreto `CLERK_WEBHOOK_SIGNING_SECRET`; Svix integrado, no se instala `svix` aparte, a verificar en T0). Se suscribe solo a `user.updated` y `user.deleted`.
  - `user.updated`: actualiza `display_name` y `email` de la fila con ese `clerk_user_id` (estado absoluto, no incremental: reentregas y desorden no rompen nada). Si no hay fila, no hace nada (no crea filas: no se conoce el rol). No toca `role` jamás.
  - `user.deleted`: anonimiza (ver RF8). Si no hay fila, no hace nada.
  - Eventos desconocidos: responder 200 sin acción.
  - Orden inverso (`updated` tras `deleted`): `syncProfile` no actualiza filas ya anonimizadas (marca: email con dominio `@deleted.invalid`), así no se reanima PII.
- Sin lazy sync en cada petición: el email/nombre en Neon puede estar desfasado hasta que llegue el webhook (aceptable; Clerk es la fuente de verdad de esos campos, `system-design.md §3`, y el rol/identidad de autorización no dependen de ellos). Por eso el desarrollo local funciona sin túnel (el webhook es opcional en local).
- Códigos de respuesta del webhook: 400 firma inválida o cabeceras ausentes; 200 procesado o ignorado; 500 error transitorio de BD (para que Svix reintente). Nunca se registran secretos ni el cuerpo completo (solo `type` y `clerk_user_id` truncado si hace falta).

### RF4. Protección de rutas (matcher público vs privado)

Principio (verificado en la guía del skill `clerk-nextjs-patterns` y en `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`): el proxy no es la capa de autorización; cada página, handler y server action comprueba por sí mismo. `createRouteMatcher` está deprecado en `@clerk/nextjs` 7 (a verificar en T0 contra la versión instalada), por lo que el proxy es `clerkMiddleware()` desnudo (solo hace disponible la sesión) y la distinción público/privado se define por contrato de guards:

| Ruta | Tipo | Guard |
|---|---|---|
| `/` (landing), `/projects`, `/projects/[id]` (catálogo y detalle `published`, spec 006) | pública | ninguno |
| `/sign-in(.*)`, `/sign-up(.*)` | pública | ninguno |
| `/onboarding` | requiere sesión | `requireUser` sin exigir fila: sin sesión -> `/sign-in`; con fila -> `/` |
| `/api/webhooks/clerk` | pública (autentica con firma) | `verifyWebhook`; nunca `auth.protect()` |
| `/api/webhooks/stripe` (spec 010) | pública (autentica con firma Stripe) | firma Stripe |
| `/dashboard/**`, `/projects/new`, `/projects/[id]/edit`, acciones de propuestas/pagos | privada | `requireRole(...)` / `requireOwnership(...)` en cada page/route/action |

Los catálogos públicos jamás llaman a `requireUser`. Un layout nunca sustituye al guard de la página.

### RF5. Archivo de interceptación: `proxy.ts` (verificado parcialmente)

- Verificado en `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (Next 16.3.8 instalado): `middleware` está deprecado y renombrado a `proxy`; el archivo es `src/proxy.ts` (mismo nivel que `src/app`), con `export default` o export nombrado `proxy` y `config.matcher`. Esta spec usa `src/proxy.ts`, no `middleware.ts`.
- A verificar en T0 (el paquete no está instalado): que `@clerk/nextjs` instalado exporta `clerkMiddleware` compatible con `proxy.ts` (el skill `clerk-nextjs-patterns` lo indica para Next >= 16), el matcher recomendado y el runtime del proxy.
- Matcher (a confirmar en T0 contra la documentación del paquete instalado): `['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)']`. Sin la entrada `api|trpc`, `auth()` no tiene sesión en route handlers.

### RF6. Helpers de servidor (contrato, ubicación `src/modules/auth`)

```ts
// types/auth.types.ts
type Role = "client" | "developer" | "admin";            // = users.role
type AuthUser = { id: string; clerkUserId: string; role: Role; displayName: string; email: string };
type AuthErrorCode = "UNAUTHENTICATED" | "ONBOARDING_REQUIRED" | "FORBIDDEN" | "NOT_FOUND";
class AuthError extends Error { code: AuthErrorCode; status: 401 | 403 | 404 }

// services/current-user.service.ts (server-only)
getCurrentUser(): Promise<AuthUser | null>   // sesión Clerk -> fila Neon por clerk_user_id; null si sin sesión o sin fila. Memoizado por petición con React cache().
requireUser(): Promise<AuthUser>             // sin sesión -> AuthError UNAUTHENTICATED (401); con sesión sin fila -> ONBOARDING_REQUIRED (403)
requireRole(...roles: Role[]): Promise<AuthUser>   // requireUser + rol permitido, si no FORBIDDEN (403)
requireOwnership(user: AuthUser, ownerUserId: string, opts?: { allowAdmin?: boolean }): void
                                              // user.id === ownerUserId; si no NOT_FOUND (404, no revela existencia). allowAdmin (default false) solo para LECTURAS (D8).
// services/permissions.ts (puro)
can(role: Role | null, action: Action): boolean   // matriz de 5; null = visitante
// services/auth-errors.ts
authErrorToResponse(e): Response      // 401/403/404 JSON { error: code } para route handlers
handleAuthErrorForPage(e): never      // UNAUTHENTICATED -> redirect("/sign-in"); ONBOARDING_REQUIRED -> redirect("/onboarding"); FORBIDDEN/NOT_FOUND -> notFound()
```

- `getCurrentUser` obtiene `userId` de Clerk solo a través de la frontera `services/clerk-identity.service.ts` (`getSessionUserId()`, `getClerkProfile()`), que es lo único que importa `@clerk/nextjs/server`; todo test mockea ese borde.
- Dependencia de módulos: `getCurrentUser` lee `users` -> `auth` depende de `users` (llama a `users.service.findByClerkUserId`). Esto invierte lo escrito en `system-design.md §4` (`users` -> `auth`); ver decisión D-A y tarea T2 que actualiza el documento. `users` no importa nunca `auth`.
- Los guards leen el rol de la fila Neon; nunca de claims de sesión, `publicMetadata` ni `unsafeMetadata`.

### RF7. Autorización sobre recursos ajenos (siempre en servidor)

Regla para todas las specs 005-013 (los guards solo dan la primitiva):

1. Toda server action y route handler privado empieza con `requireRole`/`requireUser`; no hay autorización solo en la UI ni solo en `proxy.ts`.
2. Nunca se acepta `userId`/`clientId`/`developerId` del cliente: el actor sale de `getCurrentUser()`; los ids de dominio se resuelven en Neon y se compara `ownerUserId` con `requireOwnership` (cliente dueño del proyecto; desarrollador autor de la propuesta; cliente del pago).
3. Recurso privado ajeno -> 404 (no 403) para no revelar existencia; rol incorrecto sobre la acción -> 403.
4. Las consultas de listados privados filtran por el usuario en el `WHERE` (no se filtra en cliente).
5. Un cliente no puede proponer en su propio proyecto (un solo rol por usuario ya lo impide; la spec 007 lo verifica además).
6. Admin: solo lectura y cierre (RF8/D8). `requireOwnership(..., { allowAdmin: true })` solo en lecturas y en la transición de cierre.

Matriz por rol (acciones, no recursos; derivada de `system-design.md §6`). `own` = además `requireOwnership`; `ro` = solo lectura:

| Action | visitante | client | developer | admin |
|---|---|---|---|---|
| `catalog.view` | sí | sí | sí | sí |
| `project.create` / `project.update` / `project.publish` | no | sí (own) | no | no |
| `project.close` | no | sí (own) | no | sí |
| `project.readPrivate` | no | sí (own) | no | sí (ro) |
| `proposal.create` / `proposal.withdraw` | no | no | sí (own en withdraw) | no |
| `proposal.read` | no | sí (proyecto propio) | sí (propia) | sí (ro) |
| `proposal.select` | no | sí (proyecto propio) | no | no |
| `payment.start` | no | sí (proyecto propio) | no | no |
| `payment.read` | no | sí (proyecto propio) | sí (su propuesta ganadora) | sí (ro) |

### RF8. Cuentas desactivadas/eliminadas y datos de sesión

- Eliminada en Clerk: Clerk revoca sesiones y no permite volver a entrar. El webhook `user.deleted` anonimiza la fila: `display_name = 'Deleted user'`, `email = '<id>@deleted.invalid'` (usando `users.id`, no el id de Clerk). La fila y su `clerk_user_id` se conservan (FKs `restrict`: no se puede borrar sin romper el historial de proyectos, propuestas y pagos; Clerk no reutiliza ids). Sin cambios de esquema (no hay soft delete, 003).
- Bloqueada/baneada/suspendida en Clerk: Clerk impide sesiones nuevas; Nexora no mantiene un estado propio (YAGNI).
- Ventana de sesión: el token de sesión de Clerk es de vida corta y se renueva contra Clerk; tras una eliminación/baneo puede seguir válido unos segundos. Aceptado en el MVP; si hace falta cierre inmediato se evaluaría un flag `deleted_at` (spec 015, no aquí).
- Datos de sesión: `AuthUser` contiene solo `id, clerkUserId, role, displayName, email`; no se almacenan tokens, no se pone el rol en claims personalizados ni en cookies propias, no se usa `unstable_cache`/caché compartida con datos por usuario sin `userId` en la clave.

## 4. Requisitos no funcionales

- Server-only: módulos de `auth`/`users` importan `server-only` (o equivalente ya usado en el repo, a verificar en T0) para no empaquetar secretos ni acceso a BD en el cliente.
- Sin secretos en logs ni en el repo; el agente no lee ni escribe `.env*` con valores reales.
- Dependencias mínimas: solo `@clerk/nextjs`.
- Next 16: `src/proxy.ts`, `LayoutProps`, `await auth()` (asíncrono); se consultan las guías de `node_modules/next/dist/docs/` para cualquier API de Next usada (`redirect`, `notFound`, server actions, route handlers).

## 5. Reglas de negocio

- R1. Rol único e inmutable en la app: `client` | `developer` | `admin` (D1). Registro público solo permite `client` y `developer`.
- R2. Fuente de verdad del rol: `users.role` en Neon.
- R3. D8 confirmada: admin lee proyectos, propuestas y pagos y puede cerrar proyectos; no modera, no edita contenido de otros, no inicia pagos, no selecciona propuestas, no cambia roles desde la app.
- R4. Visitantes ven catálogo y detalle de proyectos `published` sin sesión (`BRIEF §7.1`).
- R5. Presentar propuestas y toda acción privada requiere sesión + rol + (cuando aplica) propiedad (`BRIEF §7.2, 7.7, 7.8`).

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones (tabla `users` de la spec 003 suficiente). Contrato del servicio `src/modules/users/services/users.service.ts` (server-only, usa `db` de `@/lib/db/client`):

```ts
findByClerkUserId(clerkUserId: string): Promise<AuthUserRow | null>
registerUser(input: { clerkUserId: string; role: "client" | "developer"; displayName: string; email: string }): Promise<AuthUserRow>
  // INSERT ... ON CONFLICT (clerk_user_id) DO NOTHING; si no insertó, devuelve la existente (no cambia rol). Idempotente y segura ante concurrencia.
syncProfile(clerkUserId: string, p: { displayName: string; email: string }): Promise<void>
  // UPDATE solo display_name/email; no actualiza filas anonimizadas; 0 filas = no-op
anonymizeByClerkUserId(clerkUserId: string): Promise<void>   // idempotente
```

No existe ninguna función que modifique `role`. Derivación de nombre visible (frontera Clerk, funciones puras testeables): `"first last"` recortado; si vacío, `username`; si vacío, parte local del email. Email: el principal (`primary_email_address_id` en el payload del webhook; `primaryEmailAddress` en el SDK).

## 7. Contratos de servidor o API

- `POST /api/webhooks/clerk` (`src/app/api/webhooks/clerk/route.ts`): delgado; llama a `verifyWebhook(req)` y delega a `handleClerkEvent(evt)` (en `modules/auth/services`). Respuestas en RF3.
- Server action `completeOnboarding(input: unknown)` (`modules/auth/actions/complete-onboarding.action.ts`): `safeParse` con `onboardingSchema`; errores: sin sesión -> redirige/`UNAUTHENTICATED`; rol inválido -> error de validación (sin tocar BD); éxito -> `redirect("/")`.
- `modules/auth/schemas/onboarding.schema.ts`: `onboardingSchema = z.object({ role: z.enum(["client", "developer"]) })`.

## 8. Permisos y seguridad

- Autorización exclusivamente en servidor (RF7). El proxy solo expone la sesión.
- Anti-escalada de rol: ver RF2 (a)-(d). Ningún camino acepta `admin` de entrada; el webhook nunca escribe `role`.
- Webhook: firma verificada antes de parsear/actuar; ruta sin `auth.protect()`; respuesta genérica en fallo.
- `/onboarding` y su action leen identidad de Clerk en servidor (email/nombre no vienen del formulario).
- Mínima exposición de datos personales: `AuthUser` incluye `email` solo para uso de servidor; las specs de UI deciden qué se muestra (`BRIEF §6.6`, spec 015).
- Fuera de esta spec: rate limiting, CSRF adicional más allá del de server actions de Next, auditoría (spec 015).

## 9. Estados, errores y casos límite

- Autenticado sin fila: `ONBOARDING_REQUIRED` (rutas privadas -> `/onboarding`).
- Doble envío / dos pestañas en onboarding: una sola fila; gana el primero; el segundo recibe la fila existente (rol no cambia aunque el segundo pidió otro; la UI muestra el rol vigente).
- Rol inválido o `admin` enviado a la action: rechazo de validación, sin insert.
- Usuario con `unsafeMetadata.role = "admin"` manipulado: ignorado por completo.
- Webhook repetido: mismo resultado (updates absolutos; anonimizado idempotente).
- Webhook fuera de orden: `updated` sin fila -> no-op; `updated` tras `deleted` -> no reanima (marca `@deleted.invalid`).
- Webhook con firma inválida o sin cabeceras Svix: 400, sin efectos.
- Webhook con BD caída: 500 (Svix reintenta).
- Usuario eliminado en Clerk con token aún válido: puede actuar hasta unos segundos; luego Clerk lo rechaza.
- Fila de usuario ausente en BD mientras Clerk existe (p. ej. BD restaurada): `ONBOARDING_REQUIRED`; el usuario repite el onboarding y elige rol de nuevo (riesgo de perder asignación de `admin` manual; se reasigna por SQL).
- Clerk caído: `getCurrentUser` falla cerrado (error 500/`UNAUTHENTICATED`), nunca asume sesión.

## 10. Criterios de aceptación verificables

- AC1. `/sign-in` y `/sign-up` renderizan los componentes de Clerk en rutas catch-all y `/` (y el catálogo futuro) son accesibles sin sesión.
- AC2. Un registro nuevo llega a `/onboarding`; tras elegir `client` o `developer` existe exactamente una fila en `users` con ese rol y `clerk_user_id` del usuario, con email y nombre tomados de Clerk.
- AC3. `completeOnboarding` rechaza `role: "admin"`, vacío y cualquier otro valor sin escribir en BD.
- AC4. Llamar dos veces (secuencial y concurrente) con roles distintos deja una sola fila y conserva el rol del primer insert.
- AC5. No existe código que actualice `users.role` (búsqueda estática en el diff/tests: `users.service` no exporta tal función, `syncProfile` no incluye `role` en el `SET`).
- AC6. `getCurrentUser` devuelve `null` sin sesión y sin fila; devuelve `AuthUser` con el rol de Neon aunque `unsafeMetadata`/`publicMetadata` digan otra cosa.
- AC7. `requireUser`: sin sesión -> `AuthError UNAUTHENTICATED` (401); con sesión sin fila -> `ONBOARDING_REQUIRED` (403).
- AC8. `requireRole("client")` con un `developer` -> `FORBIDDEN` (403); con `client` -> devuelve el usuario.
- AC9. `requireOwnership` con otro usuario -> `NOT_FOUND` (404); admin solo pasa con `allowAdmin: true`.
- AC10. `can(role, action)` coincide celda a celda con la matriz de RF7 (visitante = `null`).
- AC11. El webhook devuelve 400 con firma inválida/ausente y no llama a `users.service`; con firma válida procesa `user.updated` y `user.deleted` y responde 200; eventos de otro tipo -> 200 sin cambios; fallo de BD -> 500.
- AC12. `user.updated` actualiza solo `display_name` y `email`; no crea filas; no modifica filas anonimizadas; repetido N veces da el mismo estado. `user.deleted` anonimiza (nombre `Deleted user`, email `@deleted.invalid`), conserva `id`, `clerk_user_id`, `role` y las relaciones, y es idempotente.
- AC13. `src/proxy.ts` existe (no `middleware.ts`), expone la sesión a `auth()` en páginas y route handlers (matcher incluye `/(api|trpc)(.*)`), y `/api/webhooks/clerk` es accesible sin sesión.
- AC14. `npm run lint`, `npm run test` y `npm run build` pasan sin secretos reales (build con variables de Clerk ficticias o dummy cuando aplique; ver T0).
- AC15. Ningún test llama a Clerk ni a la red; ningún archivo versionado contiene claves.

## 11. Pruebas requeridas

Vitest, junto al archivo, `// @vitest-environment node` donde no haya DOM; Clerk mockeado solo en el borde (`vi.mock("@/modules/auth/services/clerk-identity.service")` y `vi.mock("@clerk/nextjs/webhooks")`).

- `permissions.test.ts`: matriz completa rol x acción (visitante `null`, client, developer, admin) contra RF7 (AC10).
- `current-user.service.test.ts`: `getCurrentUser`/`requireUser`/`requireRole`/`requireOwnership` con identidad y `users.service` mockeados: sin sesión, sin fila, rol de Neon prevalece sobre metadata, 401/403/404, `allowAdmin` (AC6-AC9).
- `auth-errors.test.ts`: mapeo de `AuthError` a respuesta HTTP y a redirect/notFound de página.
- `onboarding.schema.test.ts`: acepta `client`/`developer`; rechaza `admin`, vacío, mayúsculas, tipos no string (AC3).
- `complete-onboarding.action.test.ts`: identidad mockeada; valida, llama a `registerUser` con email/nombre del borde y no del input; rechaza sin sesión (AC2, AC3).
- `users.service.test.ts` con `createTestDb()` (PGlite, migraciones reales; el módulo `@/lib/db/client` se mockea para devolver esa BD): `registerUser` crea, es idempotente y concurrente (`Promise.all`) conservando el primer rol (AC4); `syncProfile` solo cambia nombre/email, no crea, no toca anonimizadas; `anonymizeByClerkUserId` idempotente y conserva `role`/relaciones (AC12). Verifica que el módulo no exporta función de cambio de rol (AC5).
- `clerk-webhook.service.test.ts`: `handleClerkEvent` con payloads de ejemplo (`user.updated`, `user.deleted`, otro tipo, usuario sin email principal, nombre vacío) con `users.service` mockeado (AC12).
- `route.test.ts` del webhook (`src/app/api/webhooks/clerk/route.test.ts`): `verifyWebhook` mockeado que lanza -> 400 y sin llamadas al servicio; que resuelve -> 200; servicio que lanza -> 500 (AC11).
- `clerk-identity.service.test.ts`: mappers puros de nombre visible y email principal (SDK camelCase y payload snake_case).
- No requieren test: páginas `sign-in`, `sign-up`, `onboarding` y el componente selector (presentacionales; SETUP.md §3), `proxy.ts` (configuración; se verifica por `npm run build` y revisión manual de AC13).
- Verificación manual (no automatizada, a cargo del humano tras T4): registro real en entorno de desarrollo de Clerk, onboarding, acceso a ruta privada sin sesión, y entrega de webhook desde el dashboard (ver 12).

## 12. Dependencias, variables de entorno y pasos manuales

### Dependencias (instala solo T0; nada se instala antes de aprobar la spec)

- `@clerk/nextjs`: versión estable más reciente en npm al redactar esta spec = 7.9.17 (consultada en el registro, no instalada). Marcado "a verificar en T0": versión exacta, compatibilidad con Next 16.3.8 / React 19.2.8 y exports `clerkMiddleware`, `auth`, `currentUser`, `ClerkProvider`, `SignIn`, `SignUp`, `Show`, `@clerk/nextjs/webhooks`.
- `svix`: no se instala; `verifyWebhook` de `@clerk/nextjs/webhooks` verifica la firma (el skill `clerk-webhooks` indica no usar `svix` directo). A verificar en T0 que ese export existe en la versión instalada; si no existiera, T0 añadiría `svix` y lo registra como cambio de spec (vuelve a borrador).
- `server-only`: a verificar en T0 si ya está disponible (viene con Next) para marcar módulos de servidor; si no, se omite y se documenta.

### Variables de entorno (solo nombres; nunca valores en el repo ni en la conversación)

| Variable | Uso | Alcance |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | clave pública de la instancia Clerk | cliente+servidor |
| `CLERK_SECRET_KEY` | API backend de Clerk (`currentUser`, sesión) | solo servidor |
| `CLERK_WEBHOOK_SIGNING_SECRET` | verificación de firma de `/api/webhooks/clerk` | solo servidor; opcional en local sin túnel |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` = `/sign-in` | ruta de inicio de sesión | cliente+servidor |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` = `/sign-up` | ruta de registro | cliente+servidor |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` = `/onboarding` | destino tras registrarse | cliente+servidor |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` = `/` | destino tras iniciar sesión | cliente+servidor |
| `DATABASE_URL` | ya declarada en la spec 003 | servidor |

Los nombres exactos de las cuatro URL se verifican en T0 contra la documentación del paquete instalado (cambian entre versiones de Clerk). Justificación frente a D10: sin las tres primeras no se puede arrancar `npm run dev` con auth, y sin `DATABASE_URL` no hay filas; por eso se declaran aquí aunque `.env.example` completo sigue en 009/017. Ver decisión D-B sobre si T0 crea un `.env.example` mínimo (solo nombres, sin valores).

### Pasos manuales del humano en el dashboard de Clerk (el agente no maneja secretos)

1. Crear una aplicación Clerk (instancia Development) en dashboard.clerk.com; habilitar email + contraseña (y opcionalmente un proveedor OAuth). Alternativa de arranque: el CLI de Clerk (`init`) puede provisionar claves temporales; si se usa, lo ejecuta el humano, no el agente, y el agente no lee `.env*`.
2. Copiar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` a `.env.local` (no versionado, verificar que `.gitignore` lo cubre) junto con las variables de URL de arriba y `DATABASE_URL`.
3. Aplicar las migraciones de la spec 003 en la Neon del entorno (`npm run db:migrate`) antes de probar el onboarding.
4. Webhook (opcional en local, necesario en despliegue): en Clerk Dashboard > Webhooks > Add Endpoint con URL pública `https://<host>/api/webhooks/clerk`; suscribir solo `user.updated` y `user.deleted`. En local, exponer `localhost:3000` con un túnel (ngrok, cloudflared o equivalente) y usar esa URL. Copiar el "Signing Secret" a `CLERK_WEBHOOK_SIGNING_SECRET` en `.env.local`.
5. Para tener un administrador: registrarse normalmente (queda como `client` o `developer`) y promover manualmente en Neon, p. ej. `UPDATE users SET role = 'admin' WHERE email = '<correo>';`. Es la única vía de asignar `admin` (D1/RF2).
6. Producción: otra instancia Clerk y otras claves (spec 017).

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. `package.json`, `src/app/layout.tsx` y todo lo compartido van en T0 (serial). Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer corre el build al final.

### T0 — Base: dependencia Clerk, proveedor y proxy (serial, primero)

- Archivos: `package.json` y lockfile (`@clerk/nextjs`), `src/app/layout.tsx` (`ClerkProvider`; verificar en T0 si va dentro de `<body>` o envolviendo `<html>` según la versión instalada), `src/proxy.ts` (`clerkMiddleware()` + matcher), `.env.example` (solo si se aprueba D-B; únicamente nombres, sin valores).
- Depende de: —
- Paralelizable: no
- Cubre: AC13, AC14 (parcial). Resuelve los "a verificar en T0" de la sección 14. Corre `npm install` y un `npm run build` de humo (con claves dummy no versionadas si el build las exige).

### T1 — Servicio de usuarios (alta idempotente, sincronización, anonimizado)

- Archivos: `src/modules/users/services/users.service.ts`, `src/modules/users/services/users.service.test.ts`, `src/modules/users/types/user.types.ts` (si hace falta el tipo de fila; reutilizar `typeof users.$inferSelect`).
- Depende de: —
- Paralelizable: sí (con T2), contrato en sección 6
- Cubre: AC4, AC5, AC12

### T2 — Núcleo de auth: tipos, permisos, guards, errores y frontera Clerk (+ doc)

- Archivos: `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts` (+ `.test.ts`), `src/modules/auth/services/current-user.service.ts` (+ `.test.ts`), `src/modules/auth/services/auth-errors.ts` (+ `.test.ts`), `src/modules/auth/services/clerk-identity.service.ts` (+ `.test.ts`), `docs/architecture/system-design.md` (actualizar `§4` dependencia `auth -> users`, `§6` D8 confirmada y referencia a esta spec; si D-A no se aprueba, no se toca).
- Depende de: T0 (tipos de `@clerk/nextjs`)
- Paralelizable: sí (con T1; consume el contrato `users.service` de la sección 6, mockeado en tests)
- Cubre: AC6, AC7, AC8, AC9, AC10 y los mappers de identidad

### T3 — Webhook de Clerk

- Archivos: `src/modules/auth/services/clerk-webhook.service.ts` (+ `.test.ts`), `src/app/api/webhooks/clerk/route.ts` (+ `route.test.ts`).
- Depende de: T0, T1, T2 (usa mappers de `clerk-identity.service`)
- Paralelizable: no (tras T1 y T2; puede ir en paralelo con T4)
- Cubre: AC11, AC12 (webhook), AC15

### T4 — Páginas de acceso y onboarding

- Archivos: `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/app/onboarding/page.tsx`, `src/modules/auth/schemas/onboarding.schema.ts` (+ `.test.ts`), `src/modules/auth/actions/complete-onboarding.action.ts` (+ `.test.ts`), `src/modules/auth/components/role-selector.tsx`.
- Depende de: T0, T1, T2
- Paralelizable: sí (con T3; archivos disjuntos)
- Cubre: AC1, AC2, AC3, AC15

## 14. Decisiones pendientes y verificaciones

### Decisiones pendientes (con recomendación)

- D-A. Dirección de dependencia `auth` <-> `users`: `system-design.md §4` dice `users -> auth`, pero `getCurrentUser` necesita leer `users`. Recomendación: invertir a `auth -> users` (`users` sin dependencia de `auth`) y actualizar el doc en T2. Alternativa: mover `getCurrentUser` a `users` (rompe la ubicación pedida en `src/modules/auth`).
- D-B. `.env.example` (D10): recomendación: T0 crea un `.env.example` mínimo con solo los nombres de la sección 12 (sin valores) porque auth no arranca sin ellos; 009/017 lo extienden. Alternativa: no crearlo y documentar nombres solo en esta spec.
- D-C. Elección de rol: recomendación onboarding con server action (RF2). Alternativa con una pantalla previa de selección y `unsafeMetadata={{ role }}` en `<SignUp>` como pista, validada en servidor y con onboarding de respaldo para OAuth: UX de un paso menos, pero dos caminos de alta y superficie de manipulación cliente; no recomendada.
- D-D. Eliminación en Clerk: recomendación anonimizar sin cambio de esquema (RF8). Alternativa: añadir `deleted_at` (modificar spec 003 y migración) para cierre inmediato de sesiones y filtros explícitos; diferir a spec 015 si se necesita.
- D-E. Recurso privado ajeno: recomendación 404 (no revela existencia) y 403 solo por rol; alternativa 403 uniforme.
- D-F. D8: confirmada tal cual (R3). Si se quiere permitir al admin suspender usuarios o cerrar proyectos con motivo, es otra spec.
- D-G. Cambio de rol por equivocación: no existe en el MVP (D1); recomendación: el humano corrige por SQL. Si se quiere self-service, requiere spec.
- D-H. Mostrar el header autenticado (avatar/`UserButton`, `Show`) de la referencia visual: recomendación diferirlo a la spec de UI (014) o 006; esta spec no lo incluye.

### A verificar en T0 (no confirmable sin instalar)

1. Versión exacta de `@clerk/nextjs` (7.9.17 en npm al redactar) y su compatibilidad con Next 16.3.8 y React 19.2.8.
2. Que `clerkMiddleware` funciona en `src/proxy.ts` (renombre confirmado en la doc de Next local; falta confirmar en la doc de Clerk instalada) y el runtime del proxy.
3. Matcher recomendado vigente y estado de `createRouteMatcher` (deprecado en v7 según el skill).
4. Existencia y firma de `verifyWebhook` en `@clerk/nextjs/webhooks`, y que no hace falta `svix`.
5. Forma del payload de `user.updated`/`user.deleted` (`email_addresses`, `primary_email_address_id`, `first_name`, `last_name`, `username`, `id`) contra los tipos `WebhookEvent`.
6. Nombres exactos de las variables de URL (`SIGN_IN_URL`, `SIGN_UP_URL`, `SIGN_UP_FORCE_REDIRECT_URL`, `SIGN_IN_FALLBACK_REDIRECT_URL`).
7. Colocación de `ClerkProvider` en `layout.tsx` (dentro de `<body>` vs envolviendo `<html>`).
8. Nombres de los componentes (`Show` vs `SignedIn`/`SignedOut`) por si se usan en T4, y props de `appearance` para encajar con shadcn.
9. Si el build de Next exige claves Clerk presentes (para decidir claves dummy en el build de verificación) y si el paquete `server-only` está disponible.
10. Uso de `redirect`, `notFound`, server actions y route handlers según `node_modules/next/dist/docs/` (Next 16), y si `forbidden()` está disponible/estable (se usa `notFound()` por defecto).

## Próximas fases

- Header autenticado con avatar y controles de sesión, paneles cliente/desarrollador (specs 012-014).
- Perfil del desarrollador y edición de datos de usuario (spec 013).
- Rate limiting, auditoría de eventos de auth, cierre inmediato de sesiones y `deleted_at` si se necesita (spec 015).
- Tests E2E de registro/login con `@clerk/testing` (spec 016).
- Entornos, claves por entorno y `.env.example` completo (spec 017, D10).

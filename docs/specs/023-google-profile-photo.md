# Foto de perfil de Google (Clerk) como avatar público del desarrollador

Estado: done

Numeración: 023 (sigue a 022e). Modo SDD, Fase A. Esta spec **no se implementa** hasta que un humano la apruebe.

## Objetivo

Mostrar como avatar la foto de Google que Clerk expone en `user.imageUrl`, con las iniciales como respaldo. La foto es **pública**: la ve cualquiera, incluso sin sesión, igual que el resto del perfil público del desarrollador (`/developers/[id]`, 019 D11). Decisión del humano, no se reabre.

Arquitectura que aplica (solo estas secciones):
- `system-design.md §3` (propiedad de datos): Clerk sigue siendo el dueño de la foto; Neon guarda una **copia de la URL** (no el archivo) en `users`, igual que ya copia `display_name` y `email`.
- `system-design.md §4` (módulos): `users` no importa a nadie; `auth` importa `users`; los demás módulos solo leen la tabla Drizzle `users`. No se añaden dependencias entre módulos.
- `system-design.md §6` (permisos): no cambia ninguna regla. El perfil público ya es abierto; las proyecciones nuevas solo añaden `imageUrl` del **desarrollador**.

### Cambio respecto de decisiones anteriores (nota mínima)

- **Esta spec reemplaza 019 D1** ("solo avatar con iniciales, sin columna de foto") y lo dicho en `019` sobre `DeveloperAvatar` ("Sin imágenes ni `next/image`"; texto "Tu foto por defecto se genera con tus iniciales" del formulario). 019 era la alternativa que 019 D1 dejó anotada: "la foto de Clerk (`imageUrl`; acopla el perfil público a una URL de tercero)".
- Las specs `done` (019, 020, 022a a 022e) **no se editan**. El cambio queda registrado aquí y, en la fase B, en una línea de `system-design.md §8` (T4).

### Verificado en el repo y en `node_modules` (no asumido)

- **Clerk, SDK** (`node_modules/@clerk/backend/dist/api/resources/User.d.ts:30-32`): `User.imageUrl: string` y `User.hasImage: boolean`; el comentario de `hasImage` dice "Whether the user has uploaded an image or one was copied from OAuth. Returns `false` if Clerk is displaying an avatar for the user". Es decir: con `hasImage = false`, `imageUrl` apunta al avatar genérico de Clerk, que **no** queremos guardar (volvemos a iniciales).
- **Clerk, webhook** (`.../resources/JSON.d.ts:589-596`, `UserJSON`): `image_url: string` y `has_image: boolean`, ambos presentes en `user.updated`. El código actual del webhook (`clerk-webhook.service.ts`) usa `evt.data` sin leerlos todavía.
- **Host real**: `img.clerk.com`. Evidencia: `node_modules/@clerk/shared/dist/constants.js:41-44` (`https://img.clerk.com/static/${id}.${format}`) y `node_modules/@clerk/nextjs/dist/esm/server/content-security-policy.js` (defaults de CSP de Clerk: `"img-src": ["self", "https://img.clerk.com"]`). Para fotos de OAuth, Clerk sirve la imagen a través de ese mismo host (proxy); **no se pudo verificar sin red una URL real** (ruta exacta, si lleva query), por eso hay un paso manual (AC12) y la validación es solo por protocolo + host exacto.
- **Next 16.4.2** (`node_modules/next/package.json`; guía `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`, secciones `remotePatterns` y `src`): una URL externa solo se puede usar con `next/image` si coincide con `images.remotePatterns`; cualquier otra responde `400`. Si se omiten `protocol`, `port`, `pathname` o `search` se asume `**` ("no recomendado"); `search: ''` bloquea la query string. Los redirects de un host permitido **no se revalidan** contra `remotePatterns` (por eso el host debe ser de confianza y exacto). `dangerouslyAllowLocalIP` queda en su default (`false`).
- **CSP**: `src/proxy.ts` pasa `reportOnly: true` y `extraCspDirectives` (`src/lib/security-headers.ts`: solo `frame-ancestors`, `object-src`, `base-uri`); `clerkMiddleware` los fusiona con sus defaults, que ya incluyen `img-src 'self' https://img.clerk.com` (spec 015 ya lo anotó). Además, con `next/image` el navegador pide `/_next/image?url=...` (mismo origen) y el servidor de Next descarga la imagen. **No hace falta cambiar `proxy.ts` ni `security-headers.ts`.**
- **Dónde se crea hoy la fila `users`**: `completeOnboarding` (`auth/actions/complete-onboarding.action.ts`) -> `getClerkProfile()` -> `registerUser()`; `getCurrentUser()` solo **lee** (nunca crea). El webhook `user.updated` hoy llama `syncProfile` (solo `display_name` y `email`; no-op si el correo es `@deleted.invalid`) y `user.deleted` llama `anonymizeByClerkUserId`.

## Alcance

- Incluye:
  - Columna `users.image_url` (text, nullable) con CHECK de formato, migración generada por drizzle-kit.
  - Función pura `normalizeClerkImageUrl` (host exacto `img.clerk.com`, https, sin puerto ni credenciales ni query, longitud máxima) en `src/lib/`, compartida por `next.config.ts`, la sincronización y los tests.
  - Sincronización: alta (onboarding), webhook `user.updated` / `user.deleted`, y un refresco liviano al abrir "Mi cuenta" del desarrollador.
  - `next.config.ts`: `images.remotePatterns` solo para `img.clerk.com`.
  - Componente compartido `UserAvatar` (foto con `next/image` + iniciales como respaldo) y su uso en: perfil público y "Mi cuenta" (`DeveloperAvatar`), propuestas recibidas (fila y detalle), tarjeta del desarrollador de la página de pago, tabla "En contratación" del panel del cliente y formulario de valoración del proyecto.
  - Campo `imageUrl` en las proyecciones del **desarrollador** que alimentan esas vistas, con listas blancas y tests `Object.keys`.
  - Documentación: sección manual en `docs/MANUAL-TESTS.md` y línea en `docs/architecture/system-design.md` (las hace el developer en fase B, T4).
- No incluye:
  - Subida de archivos ni almacenamiento propio de imágenes (la URL sigue siendo de Clerk).
  - Backfill masivo de usuarios existentes (script o job). Ver D4.
  - Foto del **cliente** en ninguna vista, ni guardar la URL de los clientes (D2, D3).
  - Opt-in/opt-out ni casillas de privacidad (decidido: pública). Ver "Próximas fases".
  - Cambios en `src/proxy.ts`, `src/lib/security-headers.ts`, permisos, roles ni rate limiting.
  - Dependencias nuevas, `shadcn add` o cambios en `src/components/ui`.
  - Foto en el header global ni en listados públicos del catálogo (no muestran al desarrollador hoy).

## Decisiones

- **D1. Una columna, con CHECK genérico y host validado en código.** `users.image_url text NULL` con `CHECK (image_url IS NULL OR (image_url LIKE 'https://%' AND char_length(image_url) <= 2048))`. El host exacto (`img.clerk.com`) **no** va en el CHECK: si Clerk cambia de host se corrige una constante, no una migración. El CHECK es la red de seguridad de formato; la validación real es `normalizeClerkImageUrl` (D5). Migración con `npm run db:generate -- --name users_image_url` (esperada `0010`; el developer toma el siguiente número libre y no escribe SQL a mano). **Solo el humano corre `npm run db:migrate`.** Es una columna nullable sin default: la migración es segura sobre filas existentes (sin backfill).
- **D2. Solo desarrolladores.** Se guarda `image_url` únicamente cuando `users.role = 'developer'` (el rol no cambia nunca, 004 D1): `registerUser` la guarda solo si `role === "developer"` y `syncImageUrl` filtra `role = 'developer'` en el `WHERE`. Justificación: minimización de datos. La foto del cliente no se muestra en ninguna vista (D3); guardarla sería un dato personal sin uso. Si en el futuro se muestra la foto del cliente, será otra spec.
- **D3. El avatar del cliente NO se muestra en las valoraciones (recomendación por defecto).** `abbreviateClientName` (020) existe precisamente para que el cliente no sea identificable ("Ana P."); una foto de Google lo identifica mucho más que su apellido, y el cliente no consintió publicarla (el humano aceptó la publicidad de la foto del **desarrollador**, perfil que él mismo construye). Por eso `PublicDeveloperRating` **no** cambia y `RatingList` sigue con `InitialsAvatar` de las iniciales del nombre abreviado. Se anota como pregunta abierta P1 con esta recomendación por defecto. Consecuencia: ningún cliente muestra foto en ninguna vista, tampoco "a sí mismo" (ningún lugar actual muestra al cliente con avatar).
- **D4. Backfill acotado, sin recorrido masivo ni cambios en `getCurrentUser`.** Se evaluó llamar a Clerk desde `getCurrentUser`/`syncProfile`: descartado, porque `getCurrentUser` corre en casi cada request y `currentUser()` es una llamada a la Backend API de Clerk (latencia y cuota); y `syncProfile` solo corre desde el webhook. En su lugar:
  1. alta nueva: foto desde el primer momento (onboarding);
  2. `user.updated`: se actualiza (en despliegue con webhook);
  3. **refresco al abrir "Mi cuenta"** (`/dashboard/account`, solo desarrollador, página poco frecuente): `refreshOwnImage` llama a Clerk una vez, normaliza y guarda. Cubre a los desarrolladores existentes y el entorno local sin webhook. Nunca lanza: un fallo de Clerk o de BD se registra con `safeErrorLog` y la página sigue con lo que haya en BD.
  Efecto: un desarrollador existente que nunca abra "Mi cuenta" ni dispare `user.updated` seguirá con iniciales en su perfil público. Aceptable para la demo; ver P2.
- **D5. Validación estricta, descarte silencioso.** `normalizeClerkImageUrl(url, hasImage)` devuelve la URL o `null`. `null` si: `hasImage !== true`; no es string; supera 2048 caracteres; no parsea; `protocol !== "https:"`; `hostname !== "img.clerk.com"` (igualdad exacta, sin sufijos ni subdominios); trae `port`, `username`/`password` o `search`/`hash`. Devuelve `url.toString()` solo si pasa todo. Un valor rechazado **borra** la copia (null): nunca se conserva una URL no confiable. Riesgo conocido: si una URL real de Clerk trajera query, se rechazaría y la UI mostraría iniciales sin error; el paso manual AC12 lo detecta.
- **D6. Webhook: solo actualiza.** `user.updated` ejecuta `syncImageUrl(id, normalizeClerkImageUrl(image_url, has_image))`, **independiente** del bloque de nombre/correo (hoy un `user.updated` sin correo primario retorna antes; la foto debe poder sincronizarse igual). `has_image = false` => `null` (vuelve a iniciales). **No crea filas ni cambia `role`**; es idempotente (mismo valor, mismo resultado). `syncImageUrl` es no-op si la fila no existe, si el correo es `@deleted.invalid` (cuenta anonimizada: no se "resucita" la foto si los eventos llegan desordenados) o si el rol no es `developer`. `user.deleted` / anonimización: `anonymizeByClerkUserId` añade `image_url = null` al mismo `UPDATE`.
- **D7. La URL es dato personal: nunca se registra.** Ningún `console.*`, mensaje de error, excepción ni log incluye `imageUrl`, `image_url` ni el payload. Errores de este flujo se registran solo con `safeErrorLog(error)` (`src/lib/safe-error-log.ts`: `{name, code}`). Los tests lo verifican espiando `console.error`/`console.warn`.
- **D8. Componente único `UserAvatar`** en `src/components/shared/user-avatar.tsx` (`"use client"`, necesita `onError`). Props: `name: string`, `imageUrl?: string | null`, `size?: "sm" | "md" | "lg"` (misma escala que `InitialsAvatar`: 30, 40 y 56 px) y `className?` (permite a `DeveloperAvatar` conservar sus 36/64/96/128 px sin cambiar el layout). Comportamiento: sin `imageUrl`, o tras `onError`, o con URL que no pasa `normalizeClerkImageUrl` (defensa en profundidad en cliente: nunca se pasa una URL ajena a `next/image`, que de todos modos respondería 400), renderiza `InitialsAvatar`. Con foto, `next/image` con `fill`, `sizes` acorde, `alt=""`, contenedor `relative overflow-hidden rounded-full`, el mismo tamaño y `aria-hidden="true"`. Decorativo siempre: en todos los usos el nombre está al lado como texto (como ya hace `InitialsAvatar`). `InitialsAvatar` **no se modifica** (YAGNI/DRY: es el respaldo). El developer verifica que `cn` (paquete `cn`) resuelva clases de tamaño en conflicto; si no, `DeveloperAvatar` pasa solo las clases necesarias.
- **D9. `DeveloperAvatar` pasa a ser un envoltorio fino de `UserAvatar`** (conserva su API `initials`/`displayName`/`size` y su escala sm/md/lg/xl; añade `imageUrl?`). Deja de ser `role="img"` con `aria-label="Foto por defecto de ..."`: al ser decorativo, el `aria-label` ya no aplica (el nombre aparece en el `<h1>`). El prop `initials` deja de usarse para dibujar (se derivan del nombre con `getInitials`); se elimina del contrato si ningún llamador lo necesita (el developer ajusta `developer-profile-form.tsx`, `developer-profile-view.tsx` y `src/app/dashboard/account/page.tsx`, que hoy lo pasan).
- **D10. Proyecciones con lista blanca.** Solo el **desarrollador** gana `imageUrl: string | null`, siempre con `users.imageUrl` leído por la misma consulta que ya trae su nombre (sin consultas extra):
  | Proyección | Quién la ve | Cambio |
  |---|---|---|
  | `PublicDeveloperProfile` (`getPublicDeveloperProfile`) | cualquiera, sin sesión | + `imageUrl`; **también** en la rama "sin perfil guardado" (hasProfile=false); cuenta anonimizada => `null` |
  | `OwnDeveloperProfile` (`getOwnProfile`) | el propio desarrollador | + `imageUrl` |
  | `ClientProposalSummary` / `ClientProposalDetail` (`clientSummaryColumns`) | cliente dueño del proyecto o admin | + `imageUrl` del desarrollador |
  | `ProjectPaymentOverview.proposal` | cliente dueño | + `imageUrl` del desarrollador ganador |
  | `DashboardProjectPayment` | cliente dueño | + `imageUrl` del desarrollador ganador |
  | `ProjectRatingView` | cliente dueño del proyecto contratado | + `developerImageUrl` del desarrollador ganador |
  | `PublicDeveloperRating` | cualquiera | **sin cambio** (D3) |
  | `DeveloperDashboard*` (`clientName`) | desarrollador | **sin cambio** (no hay foto del cliente) |
  Ninguna proyección añade `clerkUserId`, `email`, `role` ni el payload de Clerk. Los desarrolladores solo aparecen ya hoy en estas vistas con su nombre (público o ante el cliente dueño); la foto se expone **exactamente donde ya se expone el nombre**.
- **D11. `next.config.ts`:** `images.remotePatterns: [{ protocol: "https", hostname: CLERK_IMAGE_HOST, port: "", pathname: "/**", search: "" }]`, con la constante importada con ruta **relativa** (`./src/lib/clerk-image`; `next.config.ts` ya hace lo mismo con `security-headers`, el alias `@/` no se resuelve ahí). Sin comodines de host. No se toca `maximumRedirects`, `dangerouslyAllowLocalIP` ni `unoptimized`.
- **D12. Privacidad documentada (el humano la aceptó).** Efecto: la foto de Google del desarrollador es visible para cualquiera que conozca la URL de su perfil, sin sesión y sin consentimiento adicional; tras el alta no hay forma de ocultarla salvo quitar la foto en Clerk. Al cambiar o quitar la foto en Clerk, Neon se actualiza cuando llega `user.updated` (solo en despliegue con el webhook configurado) o al abrir "Mi cuenta"; **en local sin webhook solo en el primer acceso o al abrir "Mi cuenta"**. La URL de Clerk puede seguir sirviendo la imagen anterior hasta que Clerk la invalide (comportamiento de Clerk, fuera de alcance). Sin opt-in ni casillas.
- **D13. Sin cambios de layout.** Mismos tamaños, mismo círculo; la foto usa `object-cover`. La carga no desplaza contenido (el contenedor ya tiene tamaño fijo).

## Reutilizar

| Existe | Uso |
|---|---|
| `src/components/shared/initials-avatar.tsx` (`InitialsAvatar`, sm/md/lg decorativo) | Respaldo de `UserAvatar`; sin cambios |
| `src/lib/initials.ts` (`getInitials`) | Iniciales del respaldo |
| `src/modules/profile/components/developer-avatar.tsx` (sm/md/lg/xl) | Se convierte en envoltorio de `UserAvatar` (D9) |
| `src/modules/users/services/users.service.ts` (`registerUser`, `syncProfile`, `anonymizeByClerkUserId`, patrón `email like '%@deleted.invalid'`) | Se extienden; mismo guardia de anonimización |
| `src/modules/auth/services/clerk-identity.service.ts` (`getClerkProfile`, `pickPrimaryEmail`) | `ClerkProfile` gana `imageUrl` |
| `src/modules/auth/services/clerk-webhook.service.ts` | Se añade la rama de foto |
| `src/lib/safe-error-log.ts` | Único logging permitido (D7) |
| `src/lib/db/test-db.ts` (PGlite con migraciones reales) | Tests del servicio y del CHECK |
| `src/lib/security-headers.ts`, `src/proxy.ts`, CSP de Clerk | **Sin cambios**; solo se anota que `img-src` ya cubre el host |
| `src/modules/ratings/services/client-name.ts` (`abbreviateClientName`) | Sin cambios (D3) |
| `npx shadcn@latest search @shadcn -q avatar` | Existe en el registro; **no se añade** (un círculo con imagen/iniciales no justifica tocar `src/components/ui`; mismo criterio de 019) |

## Contratos

```ts
// src/lib/clerk-image.ts (puro, sin "server-only", sin alias "@/")
export const CLERK_IMAGE_HOST = "img.clerk.com";
export const IMAGE_URL_MAX_LENGTH = 2048;
export function normalizeClerkImageUrl(raw: unknown, hasImage: boolean | undefined): string | null;

// users.service.ts
registerUser(input: { ...; imageUrl?: string | null }): Promise<AuthUserRow>; // guarda imageUrl solo si role === "developer"
syncImageUrl(clerkUserId: string, imageUrl: string | null): Promise<void>;     // solo role developer, no-op si anonimizada o sin fila
// anonymizeByClerkUserId: añade image_url = null

// clerk-identity.service.ts
type ClerkProfile = { displayName: string; email: string; imageUrl: string | null };

// auth/services/own-image-sync.service.ts (nuevo)
refreshOwnImage(clerkUserId: string): Promise<void>; // currentUser() -> normalize -> syncImageUrl; nunca lanza

// src/components/shared/user-avatar.tsx
UserAvatar({ name, imageUrl, size, className })
```

## Archivos

| Archivo | Acción | Tarea |
|---|---|---|
| `src/modules/users/schema/users.table.ts` | modificar (columna + `check`) | T0 |
| `drizzle/00NN_users_image_url.sql` + `drizzle/meta/*` | generar con drizzle-kit | T0 |
| `src/lib/clerk-image.ts` + `.test.ts` | nuevo | T0 |
| `next.config.ts` | modificar (`images.remotePatterns`) | T0 |
| `src/lib/db/users-image-url-constraints.test.ts` | nuevo | T0 |
| `src/modules/users/services/users.service.ts` + `.test.ts` | modificar | T1 |
| `src/modules/auth/services/clerk-identity.service.ts` + `.test.ts` | modificar | T1 |
| `src/modules/auth/services/clerk-webhook.service.ts` + `.test.ts` | modificar | T1 |
| `src/modules/auth/services/own-image-sync.service.ts` + `.test.ts` | nuevo | T1 |
| `src/modules/auth/actions/complete-onboarding.action.ts` + `.test.ts` | modificar | T1 |
| `src/components/shared/user-avatar.tsx` + `.test.tsx` | nuevo | T2 |
| `src/modules/profile/components/developer-avatar.tsx` | modificar | T2 |
| `src/modules/profile/components/developer-profile-view.tsx`, `developer-profile-form.tsx` | modificar | T2 |
| `src/modules/profile/types/developer-profile.types.ts` | modificar (`imageUrl`) | T2 |
| `src/modules/profile/services/developer-profile.service.ts` + `.test.ts` | modificar | T2 |
| `src/app/dashboard/account/page.tsx` | modificar (llama `refreshOwnImage`, pasa foto) | T2 |
| `src/modules/proposals/types/proposal.types.ts` | modificar | T3 |
| `src/modules/proposals/services/proposal.service.ts` + `.test.ts` | modificar (`clientSummaryColumns`) | T3 |
| `src/modules/proposals/components/project-proposals-view.tsx`, `client-proposal-detail.tsx` | modificar | T3 |
| `src/modules/ratings/types/rating.types.ts` | modificar (`developerImageUrl` en `ProjectRatingView`) | T3 |
| `src/modules/ratings/services/rating.service.ts` + `.test.ts` | modificar | T3 |
| `src/modules/ratings/components/rate-developer-form.tsx` | modificar | T3 |
| `src/modules/dashboard/types/dashboard.types.ts` | modificar | T4 |
| `src/modules/dashboard/services/client-dashboard.service.ts` + `.test.ts` | modificar | T4 |
| `src/modules/dashboard/components/dashboard-contracting-list.tsx` | modificar | T4 |
| `src/modules/payments/types/payment.types.ts` | modificar | T4 |
| `src/modules/payments/services/payment-overview.service.ts` + `.test.ts` | modificar | T4 |
| `src/modules/payments/components/payment-page-view.tsx` | modificar | T4 |
| `docs/MANUAL-TESTS.md` | sección 8r + cabecera "Cubre" | T4 |
| `docs/architecture/system-design.md` | una línea en §3 (dato en `users`) y una en §8 (reemplazo de 019 D1) | T4 |

`src/app/developers/[id]/page.tsx` no se toca: la vista recibe `profile` completo. No se modifican `rating-list.tsx`, `initials-avatar.tsx`, `proxy.ts`, `security-headers.ts`.

## Criterios de aceptación

- AC1: `users` tiene la columna `image_url` nullable; la migración es **solo aditiva** (una sentencia `ALTER TABLE ... ADD COLUMN` + el CHECK) y las filas existentes quedan en `NULL`. El CHECK rechaza una URL `http://...`, una de más de 2048 caracteres, y acepta `NULL` y una `https://` válida.
- AC2: `normalizeClerkImageUrl` devuelve la URL solo si es `https://img.clerk.com/...` sin puerto, credenciales, query ni hash, `hasImage === true` y longitud <= 2048; devuelve `null` en cualquier otro caso (incluido `https://img.clerk.com.evil.com/x`, `https://evil.com/img.clerk.com`, `http://`, `javascript:`, `data:`, `undefined`, `""`).
- AC3: **Alta.** `completeOnboarding` con rol `developer` guarda la `imageUrl` normalizada de Clerk; con rol `client` **no** guarda nada (`image_url` queda `NULL`). `registerUser` sigue siendo idempotente: un segundo registro no cambia rol ni foto de la fila existente.
- AC4: **Webhook `user.updated`.** Guarda la URL normalizada del desarrollador; actualiza si cambió; con `has_image: false` pone `NULL`; con un host no permitido pone `NULL` (no conserva la anterior); es idempotente (reenviar el mismo evento deja el mismo estado); **no crea filas** si el `clerk_user_id` no existe, **no cambia `role`**, y no toca filas anonimizadas ni de clientes. Un `user.updated` sin correo primario igualmente sincroniza la foto. `display_name`/`email` siguen sincronizándose como antes.
- AC5: **`user.deleted` / `anonymizeByClerkUserId`** deja `image_url = NULL` junto con el nombre y correo anonimizados; es idempotente.
- AC6: **Refresco en "Mi cuenta".** `refreshOwnImage` guarda la foto actual de Clerk del desarrollador logueado y **nunca lanza** (un error de Clerk o de BD no rompe la página y se registra solo con `safeErrorLog`). Se invoca solo desde `/dashboard/account` (no desde `getCurrentUser`, `requireUser` ni layouts).
- AC7: **Sin fuga de la URL.** Ningún log (`console.*`) ni mensaje de error de los flujos de sincronización incluye la URL ni el payload de Clerk.
- AC8: **Componente.** `UserAvatar` con `imageUrl` válida renderiza una `<img>` (`next/image`) con `alt=""` dentro de un contenedor `aria-hidden="true"`; sin `imageUrl`, con `imageUrl` de host no permitido, o tras el evento `error` de la imagen, renderiza las iniciales de `InitialsAvatar`; mantiene tamaños `sm/md/lg` (y los de `DeveloperAvatar`) sin cambiar el layout.
- AC9: **Dónde se ve la foto del desarrollador.** Perfil público `/developers/[id]` (visible **sin sesión**, también en la rama "aún no completó su perfil"), "Mi cuenta", fila de propuestas del proyecto y detalle de propuesta (cliente dueño), tarjeta "Desarrollador" de la página de pago, tabla "En contratación" del panel del cliente y cabecera del formulario de valoración. Un desarrollador sin foto, o una cuenta anonimizada, muestra iniciales en todas.
- AC10: **Listas blancas.** Los tests `Object.keys(...).sort()` de las proyecciones de D10 incluyen `imageUrl` (o `developerImageUrl`) y **ninguna clave más** (sin `email`, `clerkUserId`, `role`). `PublicDeveloperRating` conserva exactamente sus claves actuales: ninguna foto del cliente aparece en `RatingList`.
- AC11: **Configuración.** `next.config.ts` expone exactamente un `remotePatterns` (`https`, `img.clerk.com`, `port: ""`, `search: ""`); `proxy.ts` y `security-headers.ts` no cambian; `npm run lint`, `npm run test` y `npm run build` pasan.
- AC12: **Manual (T4, `MANUAL-TESTS.md` 8r).** Con una cuenta de Google real: tras el alta como desarrollador, `users.image_url` no es `NULL` (si lo es, revisar si la URL real de Clerk trae query, D5); la foto se ve en `/developers/<id>` en una ventana de incógnito, a 1440 y 390 px, sin saltos de layout; con una cuenta correo/contraseña (sin foto) se ven iniciales; con la imagen bloqueada o rota (DevTools: bloquear `/_next/image`) se ven iniciales; en la consola del navegador no hay avisos de CSP por `img.clerk.com`.

## Tests requeridos

Vitest, junto al archivo, sin red ni Clerk reales (Clerk se simula con `vi.mock`; BD con PGlite vía `createTestDb`):

- `src/lib/clerk-image.test.ts` (T0): AC2 (casos válidos e inválidos de D5) y AC11 (la config de `next.config.ts` importada: un solo `remotePatterns`, host exacto, sin comodines).
- `src/lib/db/users-image-url-constraints.test.ts` (T0): AC1 (NULL ok; https ok; `http://` rechazada; > 2048 rechazada).
- `src/modules/users/services/users.service.test.ts` (T1, PGlite): `registerUser` guarda para `developer` y no para `client`, idempotente; `syncImageUrl` guarda, actualiza, borra con `null`, no-op sin fila, no-op en cuenta anonimizada, no-op en cliente, no cambia `role`; `anonymizeByClerkUserId` limpia `image_url` (AC3, AC4, AC5).
- `src/modules/auth/services/clerk-webhook.service.test.ts` (T1): `user.updated` con `has_image` falso/verdadero, host no permitido => `syncImageUrl(id, null)`, evento sin correo primario sincroniza igual la foto, `user.deleted` sin cambios, ningún log con la URL (AC4, AC7).
- `src/modules/auth/services/clerk-identity.service.test.ts` (T1): `getClerkProfile` devuelve `imageUrl` normalizado (`hasImage` falso => `null`).
- `src/modules/auth/services/own-image-sync.service.test.ts` (T1): guarda la foto normalizada; no lanza si `currentUser` o el servicio fallan; el log usa solo `{name, code}` (AC6, AC7).
- `src/modules/auth/actions/complete-onboarding.action.test.ts` (T1): pasa `imageUrl` a `registerUser` (AC3).
- `src/components/shared/user-avatar.test.tsx` (T2, RTL): foto, iniciales sin URL, iniciales con host no permitido, iniciales tras `fireEvent.error`, `aria-hidden` y `alt=""` (AC8). `next/image` se simula si hace falta con un `vi.mock("next/image")` mínimo.
- `src/modules/profile/services/developer-profile.service.test.ts` (T2): `Object.keys` de `PublicDeveloperProfile` (con y sin perfil guardado) y `OwnDeveloperProfile` incluyen `imageUrl` y nada más; cuenta anonimizada => `null` (AC9, AC10).
- `src/modules/proposals/services/proposal.service.test.ts`, `src/modules/ratings/services/rating.service.test.ts`, `src/modules/dashboard/services/client-dashboard.service.test.ts`, `src/modules/payments/services/payment-overview.service.test.ts` (T3, T4): `Object.keys` de cada proyección de D10; en ratings, `PublicDeveloperRating` sin cambio (AC10).
- Sin test obligatorio (SETUP §3): páginas de `src/app`, vistas presentacionales y `DeveloperAvatar` (envoltorio).

## Tareas

Orden: T0 (serial, base compartida) -> T1 y T2 -> T3 y T4. Máximo 5 tareas; archivos disjuntos. Durante bloques paralelos nadie corre `npm install` ni `npm run build`; el reviewer corre el build al final. Solo el humano corre `npm run db:migrate`.

### T0 — Base: columna, migración, helper de URL y `next.config.ts`
- Archivos: `src/modules/users/schema/users.table.ts`, `drizzle/00NN_users_image_url.sql` y `drizzle/meta/*` (generados con `npm run db:generate -- --name users_image_url`), `src/lib/clerk-image.ts`, `src/lib/clerk-image.test.ts`, `next.config.ts`, `src/lib/db/users-image-url-constraints.test.ts`
- Depende de: —
- Paralelizable: no (compartido por todas)
- Cubre: AC1, AC2, AC11

### T1 — Sincronización (alta, webhook, anonimización, refresco)
- Archivos: `src/modules/users/services/users.service.ts` (+ `.test.ts`), `src/modules/auth/services/clerk-identity.service.ts` (+ `.test.ts`), `src/modules/auth/services/clerk-webhook.service.ts` (+ `.test.ts`), `src/modules/auth/services/own-image-sync.service.ts` (+ `.test.ts`), `src/modules/auth/actions/complete-onboarding.action.ts` (+ `.test.ts`)
- Depende de: T0
- Paralelizable: sí (con T2)
- Cubre: AC3, AC4, AC5, AC6, AC7

### T2 — `UserAvatar` y perfil (público y "Mi cuenta")
- Archivos: `src/components/shared/user-avatar.tsx` (+ `.test.tsx`), `src/modules/profile/components/developer-avatar.tsx`, `src/modules/profile/components/developer-profile-view.tsx`, `src/modules/profile/components/developer-profile-form.tsx`, `src/modules/profile/types/developer-profile.types.ts`, `src/modules/profile/services/developer-profile.service.ts` (+ `.test.ts`), `src/app/dashboard/account/page.tsx`
- Depende de: T0 (columna y helper). `account/page.tsx` importa `refreshOwnImage` de T1: se integra cuando T1 termina (el developer de T2 implementa el resto en paralelo y deja esa única línea para el final, o T2 corre después de T1 si el orquestador prefiere no coordinar).
- Paralelizable: sí (con T1, salvo esa importación)
- Cubre: AC6 (invocación en "Mi cuenta"), AC8, AC9 (perfil, "Mi cuenta"), AC10 (perfil)

### T3 — Propuestas y valoración del proyecto
- Archivos: `src/modules/proposals/types/proposal.types.ts`, `src/modules/proposals/services/proposal.service.ts` (+ `.test.ts`), `src/modules/proposals/components/project-proposals-view.tsx`, `src/modules/proposals/components/client-proposal-detail.tsx`, `src/modules/ratings/types/rating.types.ts`, `src/modules/ratings/services/rating.service.ts` (+ `.test.ts`), `src/modules/ratings/components/rate-developer-form.tsx`
- Depende de: T0, T2 (`UserAvatar`)
- Paralelizable: sí (con T4)
- Cubre: AC9 (propuestas, detalle, valoración), AC10

### T4 — Panel del cliente, pago y documentación
- Archivos: `src/modules/dashboard/types/dashboard.types.ts`, `src/modules/dashboard/services/client-dashboard.service.ts` (+ `.test.ts`), `src/modules/dashboard/components/dashboard-contracting-list.tsx`, `src/modules/payments/types/payment.types.ts`, `src/modules/payments/services/payment-overview.service.ts` (+ `.test.ts`), `src/modules/payments/components/payment-page-view.tsx`, `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`
- Depende de: T0, T2 (`UserAvatar`)
- Paralelizable: sí (con T3)
- Cubre: AC9 (panel, pago), AC10, AC12
- Docs (solo adiciones): en `MANUAL-TESTS.md` sección `## 8r. Spec 023 — Foto de perfil de Google` y la cabecera "Cubre" con la 023, con la lista manual: (1) cuenta de Google con foto, alta como desarrollador: `/developers/<id>` y "Mi cuenta" muestran la foto; (2) cuenta correo/contraseña sin foto: iniciales; (3) visitante en incógnito en `/developers/<id>`: foto visible sin sesión; (4) a 1440 px y a 390 px: mismo tamaño que antes, sin saltos de layout; (5) imagen bloqueada/rota: iniciales; (6) cambiar o quitar la foto en Clerk: se refleja al abrir "Mi cuenta" y, con webhook desplegado, al llegar `user.updated`; en local sin webhook, solo al abrir "Mi cuenta"; (7) cuenta de cliente: no se guarda ni se muestra foto, y las valoraciones siguen con iniciales; (8) consola sin avisos de CSP por `img.clerk.com`; (9) recordatorio: el humano corre `npm run db:migrate` antes. En `system-design.md`: una línea en §3 ("`users.image_url`: copia de la URL de la foto de Clerk, solo desarrolladores, pública") y una fila en §8 ("023-D1 | La foto de Google de Clerk reemplaza a 019 D1 (solo iniciales); URL de `img.clerk.com`, pública | 023").

## Preguntas abiertas

Todas tienen un valor por defecto: la spec no depende de las respuestas, pero cambiarlas después de aprobar la devuelve a `borrador`.

- **P1. ¿Mostrar la foto del cliente en las valoraciones?** Por defecto: **no** (D3; protege el anonimato que 020 ya busca con el nombre abreviado). Si el humano quiere sí, habría que añadir `imageUrl` a `PublicDeveloperRating` (y guardar la foto de los clientes, D2) y es una decisión de privacidad nueva.
- **P2. ¿Aceptar que los desarrolladores existentes solo obtengan foto al abrir "Mi cuenta" o al llegar `user.updated`?** Por defecto: sí (D4), sin script de backfill. Alternativa: un script manual con `clerkClient` que el humano ejecute una vez (fuera de esta spec).
- **P3. ¿Solo desarrolladores?** Por defecto: sí (D2), no se guarda `image_url` de clientes.
- **P4. ¿Una URL real de Clerk puede traer query string?** No verificable sin red. Por defecto: se rechaza (D5, `search: ""`), con paso manual AC12 que lo detecta. Si ocurre, bastaría relajar `normalizeClerkImageUrl` y `remotePatterns` (un cambio pequeño, vuelve a `borrador`).
- **P5. Specs `done` tocadas:** ninguna se edita (019, 020, 022x). La nota del reemplazo de 019 D1 vive en esta spec y en `system-design.md §8`. Si el humano prefiere una nota en 019, es una edición adicional que requiere su visto bueno.
- **P6. Optimizador de imágenes de Next (Vercel):** las fotos pasan por `/_next/image` (cuota de transformaciones en Vercel). Por defecto: se usa el optimizador (lo pide el humano: `next/image`). Alternativa si hay problemas de cuota: `unoptimized` (el navegador pide directo a `img.clerk.com`, ya permitido por la CSP).

## Próximas fases

- **Opt-out opcional** ("Mostrar mi foto de Google en mi perfil público"): columna booleana en `developer_profiles` y casilla en "Mi cuenta"; con opt-out se renderizan solo iniciales. No incluida porque el humano decidió pública sin casillas.
- Backfill único con script (`clerkClient.users.getUserList`) para desarrolladores existentes, si P2 se responde que sí.
- Foto del cliente en valoraciones u otras vistas (requiere decisión de privacidad, P1).
- Subida propia de foto (Supabase Storage u otro) si se quiere independizar del proveedor de identidad.
- Pasar la CSP de `Report-Only` a enforce (spec 015) con la lista de `img-src` revisada.

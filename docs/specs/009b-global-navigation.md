# Navegación global: header en el layout raíz

Estado: done. Aprobada por el humano con las recomendaciones por defecto en todas las decisiones y preguntas abiertas (P1–P9).

Numeración: `009b` va entre la 009 (done) y la 010 (webhooks, no se renumera). Es independiente de la 010: no toca pagos, esquema ni `src/proxy.ts`. Retoma la deuda anotada en `006-public-project-catalog.md` D-H ("header/landing global") y en `docs/MANUAL-TESTS.md §9`, pero **solo el header**: el landing, la metadata global y el 404 con marca siguen fuera (ver "No incluye").

## Objetivo

Tras probar la app, el usuario no encuentra cómo ir al inicio, iniciar sesión ni abrir su dashboard: hay que escribir la URL. Hoy `SiteHeader` solo lo renderizan `src/app/projects/page.tsx` y `src/app/projects/[id]/page.tsx`; `/dashboard/**`, `/onboarding`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/payment`, `/sign-in` y `/sign-up` no tienen cabecera.

Decisión ya tomada por el usuario: un header **global** en `src/app/layout.tsx`, y se elimina el render por página. El header muestra:

- Logo "Nexora" (enlace a `/`) y "Proyectos" (`/projects`).
- Enlace al dashboard según el rol, leído en servidor desde la fila `users` de Neon (`system-design.md §6`: el rol sale siempre de la BD, no de Clerk): `client` -> `/dashboard/projects`; `developer` -> `/dashboard/proposals`; sesión sin fila (onboarding pendiente) -> `/onboarding`; `admin`: ver D-C.
- Sin sesión: "Iniciar sesión" (`/sign-in`) y "Registrarse" (`/sign-up`). Con sesión: `UserButton` de Clerk.
- Página actual resaltada con `aria-current="page"`, responsive (menú simple en móvil, sin dependencias nuevas), accesible (foco visible, objetivos táctiles de 44 px) y con los colores ya usados en el repo.

Referencias de arquitectura: `docs/architecture/system-design.md §6` (auth, roles y permisos; el dashboard por rol refleja `can()`), `§4` (módulos; sin dependencias nuevas, ver 6). Guías de Next 16 leídas: `01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`, `03-api-reference/03-file-conventions/layout.md` (layout raíz), `04-functions/use-pathname.md`.

## Alcance

- Incluye:
  - Header global en `src/app/layout.tsx` (Server Component asíncrono envuelto en `<Suspense>` con un fallback estático).
  - Servicio que resuelve el "viewer de navegación" (visitante / onboarding pendiente / usuario con rol / degradado) reutilizando `getCurrentUser` y `getSessionUserId`.
  - Helper puro `getDashboardLink(viewer)` (href y etiqueta por rol) y helper puro `isActivePath(pathname, href)`.
  - Componente cliente `SiteNav` (`usePathname`, `aria-current`, menú móvil).
  - Eliminar `src/components/shared/site-header.tsx` y sus dos usos en `/projects` y `/projects/[id]`.
  - Quitar `min-h-screen` de las tres páginas centradas (`sign-in`, `sign-up`, `onboarding`) para que no desborden con el header encima.
  - Pasos manuales en `docs/MANUAL-TESTS.md`.
- No incluye:
  - Landing de `/` (sigue la plantilla por defecto de Next; el header se muestra sobre ella), metadata global (título "Create Next App", `lang="en"`, `metadataBase`; ver pregunta P4), `not-found` con marca, `src/app/global-error`.
  - Enlace "Publicar proyecto" / "Nuevo proyecto" en el header (no pedido; el cliente ya lo tiene en `/dashboard/projects`).
  - Menú de usuario propio, notificaciones, buscador, selector de tema, "saltar al contenido" (las páginas no tienen `id` en `<main>`; se evalúa en la spec 014).
  - Dashboard de admin (no existe; ver D-C).
  - Cambios de esquema, dependencias npm, componentes shadcn, `src/proxy.ts`, `next.config.ts`.
  - Cambiar `resolvePublicViewer` de la spec 006 (ver "Reutilizar": se evita tocar código `done`).

## Reutilizar

Inventario verificado (Glob/Grep/Read):

| Existente | Uso |
|---|---|
| `src/modules/auth/services/current-user.service.ts`: `getCurrentUser` (con `cache` de React, devuelve `AuthUser` con `role` de Neon o `null`) | Fuente única del rol. Al ir envuelto en `cache`, la llamada del header y la de la página (`requireRole`) comparten una sola consulta por petición |
| `src/modules/auth/services/clerk-identity.service.ts`: `getSessionUserId` | Distinguir "sin sesión" de "sesión sin fila" (onboarding pendiente) |
| `src/modules/auth/types/auth.types.ts`: `Role` | Tipo del rol. No se modifica este archivo |
| `src/modules/projects/services/public-viewer.service.ts` (`resolvePublicViewer`) | Misma clasificación visitante / onboarding / usuario, pero con `isOwner` y por proyecto. **No se reutiliza ni se modifica** (está `done`, depende de `projectId` y vive en `projects`); `resolveNavViewer` es una envoltura de ~10 líneas sobre las mismas dos funciones base, sin duplicar lógica de lectura de rol. Si en el futuro se quiere unificar, `resolvePublicViewer` podría delegar en `resolveNavViewer` (fuera de alcance, YAGNI) |
| `src/components/shared/site-header.tsx` | Fuente de estilos, `FOCUS`, `NAV_LINK`, estructura y uso de `Show`/`UserButton`; se **reemplaza** (se elimina) |
| `src/components/ui/button.tsx` (`buttonVariants`), `src/lib/utils.ts` (`cn`) | Botón "Registrarse" y composición de clases |
| Tokens del repo: `#183D30`, `#F5F6F2`, `#E3E8E3`, `#202522`, `#535E56`, `#DCE6DE`; foco `focus-visible:ring-3 ring-[#183D30]/40`; objetivos `min-h-11` | Estilos del header (idénticos a los del header actual) |
| `@clerk/nextjs` `UserButton`, `Show` (ya usados; `ClerkProvider` ya está en el layout) | `UserButton` en `SiteNav`. `Show` deja de hacer falta: el viewer ya sabe si hay sesión |
| Patrón de tests de `current-user.service.test.ts` y `permissions.test.ts` | Mocks de `server-only`, `current-user.service` y `clerk-identity.service` |
| `src/app/dashboard/projects/page.tsx` (`requireRole("client")`), `src/app/dashboard/proposals/page.tsx` (`requireRole("developer")`) | Confirman a qué rol sirve cada destino; ambos redirigen a `/sign-in` sin sesión (`handleAuthErrorForPage`) y dan 404 a otros roles |
| Grep de tests (`*.test.ts(x)`) por `SiteHeader`, `site-header`, páginas `projects/page` | **Ninguno existe**: no hay tests que renderizan `SiteHeader` ni las páginas. Todos los tests actuales siguen pasando sin cambios; no hay que actualizar ninguno |

No existen helper de "dashboard por rol", `usePathname` ni menú móvil en el repo (Grep de `usePathname`, `dashboard` en `src/lib` y `src/components`): se crean.

## Hechos verificados en Next 16 (y consecuencias)

1. **Layout raíz**: debe definir `<html>` y `<body>` y puede contener UI compartida (`layout.md`). Los layouts **no se re-renderizan en navegaciones cliente entre páginas que lo comparten**, así que el layout no recibe el `pathname`; por eso el resaltado de la página actual vive en un Client Component con `usePathname` (la guía de `usePathname` lo confirma: "Client Component hook"). El layout/header Server Component no puede leer la ruta.
2. **Server vs Client**: leer sesión y Neon exige Server Component; `usePathname` y el estado del menú exigen Client Component. Patrón: Server Component asíncrono (`SiteHeader`) resuelve el viewer y pasa solo props serializables (`links`, `signedIn`) al Client Component pequeño (`SiteNav`). Nada de `server-only` cruza la frontera.
3. **Consecuencia de leer sesión en el layout raíz: todas las rutas pasan a ser dinámicas.** `getSessionUserId` llama a `auth()` de Clerk, que lee cabeceras/cookies (API dinámica). Sin `cacheComponents` (el repo no lo activa; modelo "sin Cache Components"), un API dinámico en el layout hace dinámico **todo el árbol bajo él**, incluidas `/` (hoy estática, la plantilla por defecto), `/sign-in`, `/sign-up` y `_not-found`. Efectos y mitigaciones:
   - Ya eran dinámicas todas las rutas con datos (`/projects` por `searchParams`, `/projects/[id]` por sesión, `/dashboard/**`, `/onboarding`); `src/proxy.ts` ya ejecuta `clerkMiddleware()` en cada petición. El coste real es perder el prerender de `/` y de `_not-found`, sin impacto funcional en el MVP.
   - Sin `<Suspense>`, la primera respuesta de cada página esperaría la consulta del header a Neon. Se usa `<Suspense fallback={<SiteHeaderFallback />}>` para que el resto de la página (y los `loading.tsx` ya existentes) se transmita sin esperar. El fallback muestra solo el logo, con la misma altura (sin salto de layout).
   - AC8 exige comprobar en `npm run build` que la tabla de rutas marca `/`, `/sign-in`, `/sign-up` y `_not-found` como dinámicas (`ƒ`) y que el build no falla; si `_not-found` fallara al prerenderizarse, el developer lo documenta y propone el ajuste (no se improvisa).
   - Si en el futuro se activan Cache Components, el header deberá quedar dentro de `<Suspense>` (ya lo está) para no bloquear el shell estático.
4. **Fallo de Neon**: si `getCurrentUser` lanza (BD caída), el header no puede tumbar todas las páginas. `resolveNavViewer` captura el error, lo registra en servidor y devuelve `{ kind: "degraded" }` (sesión Clerk sin rol conocido): se muestra `UserButton` sin enlace de dashboard. Mismo criterio que `resolvePublicViewer` (spec 006 §9).

## Contratos

### `src/modules/auth/types/nav-viewer.types.ts` (nuevo)

```ts
import type { Role } from "@/modules/auth/types/auth.types";

export type NavViewer =
  | { kind: "visitor" }                       // sin sesión
  | { kind: "needs_onboarding" }              // sesión Clerk sin fila en Neon
  | { kind: "user"; role: Role }              // sesión + fila; el rol viene de Neon
  | { kind: "degraded" };                     // sesión Clerk, la lectura de Neon falló
```

### `src/modules/auth/services/nav-viewer.service.ts` (nuevo, `import "server-only"`)

```ts
resolveNavViewer(): Promise<NavViewer>
// getSessionUserId() === null          -> { kind: "visitor" }
// getCurrentUser() con fila            -> { kind: "user", role }
// sesión sin fila                      -> { kind: "needs_onboarding" }
// error inesperado (no AuthError)      -> console.error + { kind: "degraded" }
// Si getSessionUserId() mismo lanza    -> { kind: "visitor" } (+ log): el header nunca lanza
```

Orden de llamadas: `getCurrentUser()` primero (usa `cache`, ya consulta la sesión); solo si devuelve `null` se llama a `getSessionUserId()` para distinguir visitante de onboarding pendiente (evita una segunda lectura de sesión cuando hay fila).

### `src/modules/auth/services/dashboard-link.ts` (nuevo, puro, sin `server-only`, junto a `permissions.ts`)

```ts
export type NavLinkItem = { href: string; label: string };

getDashboardLink(viewer: NavViewer): NavLinkItem | null
// user client            -> { href: "/dashboard/projects",  label: "Mis proyectos" }
// user developer         -> { href: "/dashboard/proposals", label: "Mis propuestas" }
// needs_onboarding       -> { href: "/onboarding",          label: "Completar registro" }
// user admin             -> null   (D-C)
// visitor | degraded     -> null
```

Es un `switch` exhaustivo por `kind` y `role` (el compilador falla si se añade un rol sin tratar). Las rutas se declaran como constantes en este archivo; es el único lugar que conoce el mapa rol -> dashboard.

### `src/lib/is-active-path.ts` (nuevo, puro)

```ts
isActivePath(pathname: string, href: string): boolean
// href "/"  -> pathname === "/"
// otro href -> pathname === href || pathname.startsWith(href + "/")
```

Con esto `/projects` queda activo en `/projects`, `/projects/<id>`, `/projects/new`, `/projects/<id>/edit` y `/projects/<id>/payment` (todas son "sección Proyectos"); `/dashboard/projects` no activa "Proyectos" (no empieza por `/projects`). Un `pathname` con barra final o `?query` no aplica (`usePathname` no devuelve query).

### `src/components/shared/site-nav.tsx` (nuevo, `"use client"`, sin lógica de dominio)

```ts
type SiteNavProps = {
  links: NavLinkItem[];     // enlaces de navegación ya resueltos en servidor (Proyectos, + dashboard)
  signedIn: boolean;        // true: UserButton; false: "Iniciar sesión" + "Registrarse"
};
export function SiteNav(props: SiteNavProps): JSX.Element
```

Comportamiento:

- `<header>` con borde inferior `#E3E8E3` y fondo `#F5F6F2`, contenedor `max-w-6xl` (mismo que el header actual).
- Logo "Nexora" (`<Link href="/">`, `aria-current="page"` en `/`).
- `<nav aria-label="Principal">` con una **única** `<ul>` de enlaces (sin duplicar nodos para móvil): `links` + (si `!signedIn`) "Iniciar sesión". Cada enlace usa `isActivePath(usePathname(), href)`; activo: `aria-current="page"`, `text-[#183D30]` y subrayado; inactivo `text-[#535E56] hover:text-[#183D30]`.
- A la derecha, fuera de la lista: `UserButton` (con sesión; `appearance` para que su disparador mida >= 44 px, verificando los nombres de `elements` en la versión instalada de Clerk) o el botón "Registrarse" (`buttonVariants`, `h-11`, `bg-[#183D30]`, enlace a `/sign-up`, también con `aria-current` en `/sign-up`).
- **Menú móvil** (`< md`, 768 px): botón "Menú" (`<button type="button">`, `min-h-11 min-w-11`, `aria-expanded`, `aria-controls="site-nav-list"`, etiqueta accesible "Abrir menú"/"Cerrar menú", icono SVG en línea, sin dependencias) que muestra/oculta la lista, desplegada como panel apilado a ancho completo bajo la barra (`hidden` cuando está cerrado; `md:flex` siempre visible desde 768 px, y el botón `md:hidden`). Estado local `useState`. Se cierra al pulsar un enlace, con `Escape` (devolviendo el foco al botón) y al cambiar la ruta. En 390 px la barra es: logo + [UserButton o "Registrarse"] + botón de menú; sin desbordes.
- Foco visible en todos los controles: `outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40` (clase `FOCUS` del header actual). Objetivos `min-h-11` (44 px) en logo, enlaces, botón de menú y "Registrarse".
- Sin `position: sticky` (YAGNI).

### `src/modules/auth/components/site-header.tsx` (nuevo, Server Component asíncrono)

```ts
export async function SiteHeader(): Promise<JSX.Element>
// const viewer = await resolveNavViewer();
// const links = [{ href: "/projects", label: "Proyectos" }, getDashboardLink(viewer)].filter(Boolean)
// return <SiteNav links={links} signedIn={viewer.kind !== "visitor"} />

export function SiteHeaderFallback(): JSX.Element   // <header> estático con solo el logo, misma altura
```

Vive en `modules/auth/components` (no en `shared`) porque conoce roles (SETUP §1.6: `shared` no tiene lógica de dominio); `SiteNav` queda genérico en `shared`. Nueva importación de `src/app/layout.tsx` -> `modules/auth`: permitida (`src/app` solo compone). `auth` no importa de ningún módulo nuevo.

### `src/app/layout.tsx` (modificado)

```tsx
<body className="min-h-full flex flex-col">
  <Suspense fallback={<SiteHeaderFallback />}>
    <SiteHeader />
  </Suspense>
  {children}
</body>
```

Sin tocar `metadata`, `lang`, fuentes ni `ClerkProvider`.

## Decisiones (con recomendación por defecto)

- D-A. Dónde se resuelve el rol. Recomendación: servidor, en el header, con `getCurrentUser` (Neon, `cache`). Alternativa: leer `sessionClaims`/metadata de Clerk (rompe la regla de `system-design.md §6`: el rol vive en Neon) o un fetch cliente (parpadeo y endpoint nuevo).
- D-B. Estructura Server + Client. Recomendación: `SiteHeader` (servidor, `auth` module) + `SiteNav` (cliente, `shared`) con props serializables. Alternativa: header 100% cliente con `useUser` de Clerk (no conoce el rol de Neon).
- D-C. Admin. Recomendación: **sin enlace de dashboard** (`getDashboardLink` -> `null`): `/dashboard/projects` exige `requireRole("client")` y `/dashboard/proposals` `requireRole("developer")`, así que cualquier enlace daría 404 a un admin; no existe panel de admin. Ve Inicio, Proyectos y `UserButton`. Alternativas: apuntar a `/projects` (redundante) o crear un dashboard de admin (spec propia, fuera del MVP).
- D-D. Etiquetas del enlace de rol. Recomendación: "Mis proyectos" (client), "Mis propuestas" (developer) y "Completar registro" (onboarding): coinciden con los `title` de esas páginas y dicen a dónde llevan. Alternativa: etiqueta única "Dashboard" (lo que el usuario nombró; menos descriptiva y igual para ambos roles).
- D-E. Menú móvil. Recomendación: botón "Menú" que despliega una única lista bajo la barra, `useState`, sin librerías. Alternativas: `Sheet`/`Dialog` de shadcn (más pesado, atrapa foco, innecesario con 3-4 enlaces), o enlaces que envuelven en dos filas (rompe la barra a 390 px).
- D-F. Header en `/sign-in`, `/sign-up` y `/onboarding`. Recomendación: **mostrarlo** (es la vía de escape al inicio, el usuario lo pidió "en todas las páginas") y quitar `min-h-screen` de esas tres páginas (el `<main>` ya es `flex-1` dentro de `body` flex-col). Alternativa: ocultarlo allí con `usePathname` (más lógica, peor orientación).
- D-G. Suspense con fallback. Recomendación: sí (hecho 3). Alternativa: sin `Suspense` (más simple, pero bloquea el primer byte de cada página con la consulta del header).
- D-H. Resaltado por prefijo. Recomendación: `isActivePath` por prefijo con frontera de segmento; `aria-current="page"` también en subpáginas de la sección (mismo comportamiento que el header actual, que lo ponía en el detalle). Alternativa: `aria-current="location"` en subpáginas (más correcto semánticamente, complica el helper sin beneficio visible).
- D-I. Usuario con sesión pero BD caída (`degraded`). Recomendación: `UserButton` sin enlace de dashboard. Alternativa: tratar como visitante (confuso: mostraría "Iniciar sesión" a quien ya la tiene).

## Archivos

Nuevos:

- `src/modules/auth/types/nav-viewer.types.ts`
- `src/modules/auth/services/nav-viewer.service.ts`, `nav-viewer.service.test.ts`
- `src/modules/auth/services/dashboard-link.ts`, `dashboard-link.test.ts`
- `src/lib/is-active-path.ts`, `is-active-path.test.ts`
- `src/components/shared/site-nav.tsx`, `site-nav.test.tsx`
- `src/modules/auth/components/site-header.tsx`

Modificados:

- `src/app/layout.tsx`
- `src/app/projects/page.tsx` (quitar `SiteHeader`; el fragmento `<>` queda innecesario, devolver solo `<main>`)
- `src/app/projects/[id]/page.tsx` (ídem)
- `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/app/onboarding/page.tsx` (quitar `min-h-screen`)
- `docs/MANUAL-TESTS.md`

Eliminado:

- `src/components/shared/site-header.tsx`

## Criterios de aceptación

- AC1: `getDashboardLink` devuelve `/dashboard/projects` ("Mis proyectos") para `client`, `/dashboard/proposals` ("Mis propuestas") para `developer`, `/onboarding` ("Completar registro") para `needs_onboarding`, y `null` para `admin`, `visitor` y `degraded`.
- AC2: `resolveNavViewer` devuelve `visitor` sin sesión, `needs_onboarding` con sesión sin fila, `user` con el rol de la fila (de Neon, nunca de Clerk) y `degraded` si `getCurrentUser` lanza un error inesperado; nunca lanza.
- AC3: `isActivePath` cumple la tabla de casos: `("/", "/")` true; `("/projects/abc", "/")` false; `("/projects", "/projects")` y `("/projects/abc", "/projects")` true; `("/projectsx", "/projects")` y `("/dashboard/projects", "/projects")` false; `("/dashboard/projects", "/dashboard/projects")` true.
- AC4: `SiteNav` marca con `aria-current="page"` exactamente el enlace de la ruta actual (según `usePathname`) y ningún otro; en una ruta sin enlace correspondiente ninguno lo lleva.
- AC5: `SiteNav` con `signedIn: false` muestra "Iniciar sesión" y "Registrarse" y no `UserButton`; con `signedIn: true` muestra `UserButton` y no esos enlaces; siempre muestra el logo con `href="/"` y los `links` recibidos.
- AC6: Menú móvil: el botón tiene `aria-expanded="false"` y `aria-controls` apuntando al `id` de la lista; al pulsarlo pasa a `true`; pulsar un enlace, pulsar `Escape` o volver a pulsar el botón lo cierra.
- AC7: El header aparece en **todas** las rutas: `/`, `/projects`, `/projects/[id]`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/payment`, `/dashboard/projects`, `/dashboard/proposals`, `/onboarding`, `/sign-in`, `/sign-up` y el 404; ya no existe `src/components/shared/site-header.tsx` y `grep -r "components/shared/site-header" src` no devuelve resultados; cada página tiene un único `<header>` y un único `<nav aria-label="Principal">`.
- AC8: `npm run build` pasa; la tabla de rutas marca `/`, `/sign-in`, `/sign-up` y `_not-found` como dinámicas (consecuencia documentada del layout con sesión); no hay advertencias nuevas de renderizado dinámico.
- AC9: Con sesión `client` el header muestra "Mis proyectos" (-> `/dashboard/projects`); con `developer`, "Mis propuestas" (-> `/dashboard/proposals`); con sesión sin fila, "Completar registro" (-> `/onboarding`); con `admin`, ningún enlace de dashboard; sin sesión, "Iniciar sesión" y "Registrarse"; con sesión, `UserButton`.
- AC10: Con Neon inaccesible y sesión Clerk activa, las páginas públicas siguen cargando con el header en estado `degraded` (`UserButton`, sin dashboard), sin pantalla de error causada por el header.
- AC11: A 390 px la barra no desborda horizontalmente (logo + acción + botón de menú) y el panel móvil muestra todos los enlaces; a >= 768 px los enlaces van en línea y el botón de menú no aparece.
- AC12: Accesibilidad: foco visible en todos los controles del header, objetivos táctiles de 44 px (logo, enlaces, botón de menú, "Registrarse", disparador de `UserButton`), recorrido completo con Tab y cierre del menú con `Escape`, contraste con los tokens `#183D30`/`#535E56`/`#202522` sobre `#F5F6F2`.
- AC13: `/sign-in`, `/sign-up` y `/onboarding` no generan scroll vertical por `min-h-screen` más el header (el contenido sigue centrado).
- AC14: `npm run lint`, `npm run test` y `npm run build` pasan; ningún test existente se modifica; `package.json`, `package-lock.json`, `src/proxy.ts`, `next.config.ts` y `src/components/ui/**` no cambian; no hay dependencias nuevas.

## Tests requeridos

Vitest, junto al archivo (SETUP §3: sí tests en lógica con ramas, helpers de `lib`/servicios; no obligatorios para componentes presentacionales, pero `SiteNav` tiene lógica de estado y de resaltado, así que sí):

- `src/modules/auth/services/dashboard-link.test.ts` (AC1): tabla completa de `NavViewer` (`client`, `developer`, `admin`, `needs_onboarding`, `visitor`, `degraded`).
- `src/lib/is-active-path.test.ts` (AC3): casos de AC3 más raíz con subruta y comparación de prefijo parcial.
- `src/modules/auth/services/nav-viewer.service.test.ts` (AC2), `// @vitest-environment node`, `server-only`, `current-user.service` y `clerk-identity.service` mockeados en el borde: visitante, onboarding pendiente, un caso por rol (`client`, `developer`, `admin`), error de `getCurrentUser` -> `degraded`, error de `getSessionUserId` -> `visitor`; ninguna llamada a Clerk/Neon reales.
- `src/components/shared/site-nav.test.tsx` (AC4, AC5, AC6), jsdom + RTL, `next/navigation` (`usePathname`) y `@clerk/nextjs` (`UserButton`) mockeados: `aria-current` en `/`, `/projects`, `/projects/abc`, `/dashboard/projects` y ruta sin enlace; estado sin sesión (enlaces de sesión, sin `UserButton`); estado con sesión (con `UserButton`, sin enlaces de sesión); enlaces recibidos por props (cliente, desarrollador, onboarding, sin enlace de dashboard); menú móvil (`aria-expanded`, `aria-controls`, cierre por enlace, por `Escape`, por segundo clic).
- No requieren test unitario: `site-header.tsx` (composición asíncrona de servidor, sin lógica propia más allá de los helpers ya probados), `layout.tsx` y las páginas.
- Tests existentes: ninguno referencia `SiteHeader` ni las páginas modificadas (Grep); siguen pasando sin cambios.

## Tareas

No hay T0: no se instalan dependencias ni se tocan `package.json`, `globals.css` ni `src/components/ui`; el único cambio compartido, `src/app/layout.tsx`, lo posee T3 (serial, nadie más lo edita). Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer corre el build al final.

### T1 — Viewer de navegación y enlace de dashboard por rol

- Archivos: `src/modules/auth/types/nav-viewer.types.ts`, `src/modules/auth/services/nav-viewer.service.ts`, `src/modules/auth/services/nav-viewer.service.test.ts`, `src/modules/auth/services/dashboard-link.ts`, `src/modules/auth/services/dashboard-link.test.ts`
- Depende de: —
- Paralelizable: sí (con T2: archivos disjuntos; T2 solo importa el tipo `NavLinkItem` de `dashboard-link.ts`, que T1 define según el contrato de esta spec; si T2 termina antes, usa el contrato escrito arriba)
- Cubre: AC1, AC2

### T2 — Componente de navegación cliente y helper de ruta activa

- Archivos: `src/lib/is-active-path.ts`, `src/lib/is-active-path.test.ts`, `src/components/shared/site-nav.tsx`, `src/components/shared/site-nav.test.tsx`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC3, AC4, AC5, AC6, AC11 (parte), AC12 (parte)

### T3 — Header global en el layout y limpieza de páginas (serial)

- Archivos: `src/modules/auth/components/site-header.tsx`, `src/app/layout.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/app/onboarding/page.tsx`, `src/components/shared/site-header.tsx` (eliminar)
- Depende de: T1, T2
- Paralelizable: no (integra T1 y T2; posee el layout raíz)
- Cubre: AC7, AC8, AC9, AC10, AC11, AC12, AC13, AC14

### T4 — Pasos manuales en `docs/MANUAL-TESTS.md`

- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: T3
- Paralelizable: no
- Cubre: AC7-AC13 (verificación manual documentada)
- Detalle: añadir la sección "7b. Spec 009b — Navegación global" entre la sección 7 y la 8 con el contenido de "Pasos manuales" de esta spec (formato actual: títulos `## N. Spec NNN — nombre`, casillas `- [ ]`, subtítulos `###`); actualizar la línea `**Cubre:**` ("specs 003 a 009" -> "003 a 009b"); y sustituir el punto de la sección 9 que dice que el header global no existe ("El header global y el landing completo no existen todavía...") por una nota de que el header global existe y que el landing y la metadata global siguen pendientes.

## Pasos manuales de verificación (texto para `docs/MANUAL-TESTS.md`)

## 7b. Spec 009b — Navegación global (todas las cuentas)

Usa las cuentas de la sección 0 (Cliente, Desarrollador A) y, si la preparaste, la de administrador. Una ventana de incógnito sin sesión para el visitante.

### Visitante (sin sesión)

- [ ] En `/`, `/projects`, `/projects/<id>` de un proyecto publicado, `/sign-in` y `/sign-up` aparece la cabecera con "Nexora", "Proyectos", "Iniciar sesión" y "Registrarse"; no aparece ningún enlace de dashboard ni el avatar.
- [ ] En una URL inexistente (por ejemplo `/no-existe`) la página 404 también muestra la cabecera.
- [ ] "Nexora" lleva a `/`; "Proyectos" a `/projects`; "Iniciar sesión" a `/sign-in`; "Registrarse" a `/sign-up`.
- [ ] En cada página, el enlace de la sección actual aparece resaltado (subrayado y verde) y en las herramientas de desarrollo tiene `aria-current="page"` (por ejemplo "Proyectos" en `/projects` y en el detalle).

### Cuenta Cliente

- [ ] El avatar de Clerk aparece a la derecha y desaparecen "Iniciar sesión" y "Registrarse".
- [ ] Aparece "Mis proyectos" y lleva a `/dashboard/projects`; en esa página queda resaltado.
- [ ] No aparece "Mis propuestas".
- [ ] La cabecera se ve igual en `/dashboard/projects`, `/projects/new`, `/projects/<id>/edit` y `/projects/<id>/payment` (con un proyecto en `proposal_selected`), sin duplicarse.
- [ ] Desde `/projects/new` se puede volver a "Proyectos" y a "Nexora" sin escribir la URL.

### Cuenta Desarrollador

- [ ] Aparece "Mis propuestas" y lleva a `/dashboard/proposals`; en esa página queda resaltado. No aparece "Mis proyectos".
- [ ] Desde el detalle de un proyecto publicado se llega a "Mis propuestas" con un clic.

### Cuenta recién registrada, sin rol

- [ ] Tras registrarte y antes de elegir rol, la cabecera muestra el avatar y el enlace "Completar registro" hacia `/onboarding`.
- [ ] Al elegir un rol y volver a `/`, "Completar registro" es sustituido por "Mis proyectos" o "Mis propuestas" según el rol.

### Cuenta administrador (opcional)

- [ ] La cabecera muestra "Nexora", "Proyectos" y el avatar, sin enlace de dashboard (decisión D-C: no hay panel de admin).

### Cerrar sesión

- [ ] Desde el menú del avatar, "Cerrar sesión" devuelve a un estado de visitante: reaparecen "Iniciar sesión" y "Registrarse" y desaparece el enlace de dashboard.

### Responsive y accesibilidad

- [ ] A 390 px la cabecera no tiene scroll horizontal: se ven "Nexora", el avatar o "Registrarse" y el botón "Menú".
- [ ] El botón "Menú" despliega todos los enlaces apilados; se cierra al elegir un enlace, al pulsar `Escape` y al pulsarlo de nuevo. Un lector de pantalla anuncia "expandido/contraído".
- [ ] A 768 px y 1280 px los enlaces van en línea y no aparece el botón "Menú".
- [ ] Con teclado (Tab y Shift+Tab) se recorren logo, enlaces, avatar y botón "Menú" con foco visible, y el orden es lógico.
- [ ] Logo, enlaces, "Registrarse", botón "Menú" y avatar tienen un objetivo táctil de al menos 44 px (inspección o modo táctil).
- [ ] `/sign-in`, `/sign-up` y `/onboarding` se ven centrados y no generan scroll vertical extra por la cabecera.
- [ ] Con la base de datos inaccesible (cadena `DATABASE_URL` inválida temporalmente) y sesión iniciada, las páginas públicas siguen abriendo y la cabecera muestra el avatar sin enlace de dashboard.
- [ ] `npm run build` muestra `/`, `/sign-in`, `/sign-up` y `_not-found` como dinámicas (`ƒ`), y no hay errores.

## Preguntas abiertas

- P1. Admin (D-C): ¿sin enlace de dashboard (recomendado) o prefieres que apunte a otra pantalla? Hoy no existe panel de admin y ambos dashboards le dan 404.
- P2. Etiquetas (D-D): ¿"Mis proyectos"/"Mis propuestas" (recomendado) o una etiqueta única "Dashboard"?
- P3. Usuario sin rol (onboarding pendiente): ¿enlace "Completar registro" en el header (recomendado) o dejar solo el avatar? Nota: tras `/sign-up`, Clerk ya lleva a `/onboarding`, pero quien cierra la pestaña antes de elegir rol hoy no tiene forma de volver sin la URL.
- P4. El layout raíz se edita igualmente: ¿se aprovecha para corregir `lang="en"` -> `"es"` y el título/descripción "Create Next App"? Recomendación: **no** en esta spec (pertenece a la spec de landing, D-H de la 006); si prefieres incluirlo es un cambio de dos líneas en `layout.tsx` (añadir a T3 y un AC).
- P5. Páginas de autenticación (D-F): ¿mostrar el header en `/sign-in`, `/sign-up` y `/onboarding` (recomendado) u ocultarlo allí?
- P6. Páginas privadas sin sesión que redirigen (`/dashboard/**`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/payment`): el redirect a `/sign-in` ocurre antes de renderizar la página, así que el visitante nunca ve el header en ellas, solo en `/sign-in`, que sí lo tiene. ¿Se acepta? (No requiere cambios.)
- P7. `/` sigue siendo la plantilla por defecto de Next: "Inicio" lleva a una página sin contenido de Nexora hasta la spec de landing. ¿Se acepta, o se pide un landing mínimo (fuera de esta spec) antes de liberar?
- P8. ¿Se quiere "Publicar proyecto" visible para el cliente en el header? No se incluye (YAGNI y no pedido); `/dashboard/projects` ya lo ofrece.
- P9. Perder el prerender estático de `/` y `_not-found` (hecho 3): ¿se acepta para el MVP? Es la consecuencia directa de mostrar el rol en el header global.

## Próximas fases

- Spec de landing y metadata global (retoma 006 D-H): contenido de `/`, `lang="es"`, título/descripción, `metadataBase`, 404 con marca.
- Dashboard de admin, si el producto lo pide: sustituir el `null` de `getDashboardLink` para `admin` (un solo archivo).
- Spec 014: "saltar al contenido", diálogos accesibles y revisión transversal de accesibilidad del header.
- Si se unifican clasificaciones de viewer, hacer que `resolvePublicViewer` (006) delegue en `resolveNavViewer`.

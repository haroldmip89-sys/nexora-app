# Login y registro a pantalla dividida: carrusel de imágenes + formulario de Clerk con aspecto Nexora

Estado: done

Spec 022e. Es **solo de interfaz** sobre auth ya probada (004, `done`): no cambia auth, servicios, schemas, permisos, `src/proxy.ts`, CSP ni migraciones, y no añade dependencias. Parte del rediseño 022 (a-d); depende de 022a (`done`: tokens, Plus Jakarta Sans, `surface`, `max-w-page`, header/footer globales, controles `ui/**`). Arquitectura: no aplica ninguna sección de `system-design.md`; el flujo de auth sigue siendo el de `system-design.md §6` y la spec 004 (sin cambios). Seguridad: spec 015 (CSP en Report-Only mezclada por `clerkMiddleware`); accesibilidad: spec 014 y WCAG 2.2.2 (contenido en movimiento).

Guías de Next 16 leídas (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`): `priority` está **deprecada** desde Next 16 a favor de `preload`; `width`/`height` solo fijan la relación de aspecto, el tamaño renderizado lo controla el CSS. La skill `clerk-custom-ui` no está instalada en este entorno: las claves de `appearance` (`variables`, `elements`) las debe verificar el developer contra los tipos de `@clerk/nextjs` 7.9.17 antes de usarlas (ver Riesgos).

## Objetivo

1. `/sign-in` y `/sign-up` pasan a **pantalla dividida** en escritorio: mitad izquierda, carrusel de 3 imágenes que cada 3 s se desliza hacia la izquierda en bucle; mitad derecha, el formulario de Clerk (`<SignIn />` / `<SignUp />`) con aspecto Nexora.
2. Carrusel accesible (reduced-motion, pausa, WCAG 2.2.2) sin dependencias nuevas.
3. Un **único** módulo de `appearance` de Clerk, coherente con 022a, reutilizado por sign-in y sign-up.

## Hechos verificados (código del repo, 2026-10-24)

| Hecho | Fuente |
|---|---|
| `sign-in` y `sign-up` son páginas de 5 líneas: `<main className="flex flex-1 items-center justify-center bg-[#F5F6F2] px-4 py-12"><SignIn /></main>` (sin `appearance`, sin props de redirección: las toman de `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `..._SIGN_UP_FORCE_REDIRECT_URL`, presentes en `.env.example`) | `src/app/sign-in/[[...sign-in]]/page.tsx`, `sign-up/...` |
| `layout.tsx` monta `SiteHeader` (Suspense) -> `{children}` -> `SiteFooter` -> `LiveAnnouncer` dentro de `<body class="min-h-full flex flex-col [&>main]:flex-1">`. Es el **único** root layout: ocultar header/footer desde un route group exigiría mover `layout.tsx` y todas las páginas (incluida `src/app/page.tsx`, que edita 022b) a dos root layouts | `src/app/layout.tsx` |
| 022a AC8 exige footer en **todas** las rutas, incluida `/sign-in` y `/sign-up`; el header (logo + chip "Modo de prueba" + "Iniciar sesión"/"Registrarse") ya vive en `SiteNav` | 022a |
| El chip "Modo de prueba" está en línea dentro de `site-nav.tsx` (no es un componente reutilizable); 022b edita `site-nav.tsx`, `site-header.tsx` y `src/app/page.tsx` en paralelo | `site-nav.tsx:97`, 022b |
| `src/proxy.ts` solo aplica `clerkMiddleware` con CSP Report-Only; el `matcher` **excluye** `.webp`, así que `/auth/*.webp` no pasa por el middleware (se sirven como estáticos) | `src/proxy.ts` |
| `/onboarding` (`src/app/onboarding/page.tsx`): tarjeta centrada `max-w-lg` con hex sueltos, sin diseño propio | código |
| No existe un hook de `prefers-reduced-motion` ni un carrusel en `src/` (Grep de `matchMedia`/`prefers-reduced`: solo `globals.css`); `vitest.setup.ts` no define `matchMedia` (jsdom no lo trae) | grep |
| Cobertura (`vitest.config.mts`): `src/modules/**`, `src/lib/**`, `src/app/api/**`; `src/components/**` y `src/hooks/**` quedan fuera del umbral, pero llevan test igualmente (lógica real) | config |
| Imágenes `docs/assets/4-images/imagen-login{1,2,3}.webp`, 800x800 (cuadradas), escritorios de trabajo: 1 = azul oscuro con monitor/laptop de código y lámpara; 2 = madera clara, laptop, planta y cuaderno; 3 = lámpara cálida de noche con cuaderno y taza. Sin texto ni caras; los motivos relevantes están en el tercio central/inferior, y el 1 tiene el monitor arriba-centro | lectura de las imágenes |

## Decisiones (con justificación; las dudas van a "Preguntas abiertas")

1. **Estructura: mantener header y footer globales y dividir solo `<main>`** (no route group, no ocultarlos).
   - Un route group `(auth)` no puede quitar header/footer porque el root layout único los monta; habría que partir `layout.tsx` en dos root layouts y mover páginas (rompe 022b en paralelo, 022a AC8 y duplica `ClerkProvider`/fuentes).
   - Ocultarlos con CSS (`body:has(...)`) o con un flag en `SiteNav` obliga a tocar `globals.css`/`site-nav.tsx` (archivos de 022a/022b) y deja un header servido sin verse.
   - Mantenerlos conserva sin trabajo extra el logo, el chip "Modo de prueba", el enlace a Proyectos y 022a AC8, y **no se edita ningún archivo de 022b**. Coste: el footer queda bajo el bloque dividido (aceptable; el bloque ocupa al menos el alto restante del viewport).
   - Como el logo y el chip ya están en el header, **no** se pone logo sobre la imagen (las fotos son oscuras/cálidas, el símbolo no contrastaría de forma consistente y duplicaría marca).
2. **Layout dividido** (`AuthSplitLayout`, servidor): `<main>` con `md:grid md:grid-cols-2`, `flex-1`. Izquierda: `AuthCarousel` envuelto en un panel `hidden md:block` con `min-h-[32rem]`, fondo `--brand-deep` (visible mientras carga la imagen). Derecha: contenedor con `bg-background`, `px-4 py-10`, formulario centrado. **En móvil (< 768 px) el carrusel se oculta** (`display: none`): el formulario ocupa todo y no se descargan imágenes decorativas pesadas en datos móviles (con `display:none` y `loading="lazy"` el navegador no las pide).
3. **Imágenes**: `object-cover` (las fotos son cuadradas y el panel suele ser 720x~700 en 1440 px; el recorte es mínimo y los motivos están centrados), `object-position: center`. Rutas estables `public/auth/login-1.webp`, `login-2.webp`, `login-3.webp` (copias de `imagen-login1..3.webp`; mismo origen, sin tocar CSP). Se usan con `next/image` (`fill`, `sizes="(min-width: 768px) 50vw, 0px"`), que las optimiza desde `/_next/image` (mismo origen). Las originales de `docs/assets/4-images/` se conservan.
4. **Texto alternativo**: las fotos son ambientales y no transmiten información: `alt=""` y el contenedor de diapositivas con `aria-hidden="true"`. El botón Pausar/Reproducir queda **fuera** del contenedor oculto, para seguir siendo accesible. (Si se prefiere descriptivas, los textos están propuestos en P5.)
5. **Precarga**: `priority` está deprecada en Next 16 (`preload` la sustituye) y precargaría la imagen también en móvil, donde está oculta. Recomendación: **sin `preload`**; la primera imagen con `loading="eager"` y las otras dos con `loading="lazy"` (por defecto). El LCP de la página es el formulario de Clerk, no la foto.
6. **Clerk: solo `appearance`, sin flujos propios**. Módulo único `src/modules/auth/clerk-appearance.ts` exporta `clerkAppearance` (objeto tipado con `Appearance` de `@clerk/nextjs`), con:
   - `variables`: `colorPrimary: "#183D30"`, `colorText: "#1F2420"`, `colorTextSecondary: "#535E56"`, `colorBackground: "#FFFFFF"`, `colorInputBackground: "#FFFFFF"`, `colorDanger: "#B42318"`, `fontFamily: "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif"` (si Clerk no resuelve `var()`, usar `"Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"`; ver Riesgos), `borderRadius: "0.625rem"`. Los valores replican los tokens de 022a (Clerk no lee las variables CSS de Tailwind; por eso se declaran como literales **en un solo lugar**, con un comentario que apunte a `globals.css`).
   - `elements`: `rootBox: "w-full"`, `cardBox: "w-full max-w-md shadow-none"`, `card: "shadow-none border-0 bg-transparent p-0"` (la tarjeta de Clerk se funde con el panel derecho), `formButtonPrimary`: `min-h-11` y foco visible (`focus-visible:ring-3 focus-visible:ring-ring/40`), `socialButtonsBlockButton` y `formFieldInput`: `min-h-11`, `footerActionLink`: `min-h-11 inline-flex items-center` con foco visible y color `primary`. Solo clases Tailwind (ya incluidas en el CSS compilado), sin CSS nuevo en `globals.css`.
   - Alcance de reutilización: sign-in y sign-up. `UserButton` (en `site-nav.tsx`, archivo de 022b) **no** se toca aquí; ver P4.
7. **Límites de Clerk**: los textos del formulario siguen en inglés (localizarlos exige `@clerk/localizations`, dependencia nueva: **no se incluye**, ver P3); la etiqueta "Secured by Clerk" y "Development mode" dependen del plan/instancia y no se pueden ocultar de forma fiable con `appearance` (no se intenta).
8. **Se mantienen intactos**: URLs `/sign-in` y `/sign-up` (rutas catch-all `[[...sign-in]]`/`[[...sign-up]]`), el parámetro `redirect_url` (lo gestiona Clerk; el landing 022b enlaza `/sign-in?redirect_url=...`), `signInFallbackRedirectUrl`/`signUpForceRedirectUrl` por variables de entorno (**no** se pasan por props: igual que hoy), el flujo `/onboarding`, `src/proxy.ts` y la CSP.

## Alcance

- Incluye:
  - Copia de las 3 imágenes a `public/auth/`.
  - Hook `usePrefersReducedMotion` y componente compartido `ImageCarousel` (genérico, sin lógica de auth) con tests.
  - `AuthSplitLayout` (composición de servidor), lista de diapositivas `auth-slides.ts` y `clerk-appearance.ts`.
  - `sign-in` y `sign-up` `page.tsx` delgados que componen `AuthSplitLayout` + `<SignIn appearance={clerkAppearance} />` / `<SignUp ... />`.
  - Sección nueva en `docs/MANUAL-TESTS.md`.
- No incluye:
  - Editar `layout.tsx`, `globals.css`, `site-nav.tsx`, `site-header.tsx`, `src/app/page.tsx`, `ui/**`, `proxy.ts`, `next.config.ts`, `package.json`.
  - Ocultar header/footer globales (ver Decisión 1 y P1).
  - Localizar Clerk, flujos propios con `useSignIn`/`useSignUp`, modo oscuro, logo sobre la imagen, indicadores de posición, controles de siguiente/anterior (YAGNI: solo Pausar/Reproducir).
  - Cambios en `/onboarding` (ver P2).
  - Cambios de auth, servicios, schemas, permisos o migraciones.

## Reutilizar

| Existente | Uso |
|---|---|
| Tokens de 022a (`--brand-deep`, `--background`, `--primary`, `--ring`, `--border`), `max-w-page`, `surface` | Fondo del panel, foco y colores del contenedor; los mismos valores se replican como literales en `clerk-appearance.ts` |
| `src/components/ui/button.tsx` (`buttonVariants`, `size="touch"`) | Botón Pausar/Reproducir del carrusel (variante `outline` o `ghost`, 44 px) |
| `useSyncExternalStore` con `subscribeNoop` (patrón de `site-nav.tsx`) | Referencia para leer `matchMedia` sin `useEffect`+`setState` en el hook |
| `cn` (`@/lib/utils`) | Clases condicionales |
| `next/image` | Imágenes locales con `fill` (sin remote patterns ni dependencias) |
| Header/footer globales (022a), `LiveAnnouncer` | Siguen sin cambios; logo y chip "Modo de prueba" se ven en el header |
| shadcn (`npx shadcn@latest search @shadcn -q carousel`): existe `carousel` (basado en Embla, dependencia nueva) | **No se usa**: exige `embla-carousel-react` y es excesivo para 3 diapositivas automáticas (YAGNI); se resuelve con CSS `transform` + `setInterval` |

No existe un componente de carrusel, de split layout ni un módulo de `appearance` de Clerk (Glob/Grep de `src/`): se crean.

## Contratos (solo UI; sin servicios, schemas ni permisos)

### `src/hooks/use-prefers-reduced-motion.ts` (T1)

```ts
export function usePrefersReducedMotion(): boolean;
// useSyncExternalStore sobre window.matchMedia("(prefers-reduced-motion: reduce)"):
// getServerSnapshot -> false (ver nota); reacciona al evento "change"; limpia el listener al desmontar.
```

Nota: en servidor devuelve `false`, así que un usuario con reduced-motion ve la primera pintura con animación habilitada solo hasta la hidratación; para evitarlo, el carrusel **no arranca el temporizador antes de hidratar** (el `setInterval` vive en `useEffect`) y la transición CSS se aplica solo con `motion` permitido (`motion-safe:` de Tailwind **además** del hook). Si `matchMedia` no existe (jsdom sin mock), el hook devuelve `false`.

### `src/components/shared/image-carousel.tsx` (T1, cliente)

```tsx
type CarouselSlide = { src: string; alt?: string };     // alt por defecto ""
type ImageCarouselProps = {
  slides: CarouselSlide[];          // >= 2; con 1 solo, imagen estática sin controles
  intervalMs?: number;              // 3000 por defecto
  className?: string;
  sizes?: string;                   // para next/image
};
export function ImageCarousel(props: ImageCarouselProps): JSX.Element;
```

Comportamiento:

- Estado: `index` (0..n-1), `playing` (Reproducir/Pausar manual, inicia `true`), `hovered/focused` (pausa temporal). El temporizador corre solo si `n >= 2 && playing && !hovered && !focused && !reducedMotion`; `useEffect` con `setInterval(() => setIndex(i => (i+1) % n), intervalMs)` y `clearInterval` en la limpieza (cubre desmontaje y cambios de estado).
- Deslizamiento **siempre hacia la izquierda** y en bucle: cada diapositiva se posiciona con `translateX` según `offset = (i - index + n) % n`: `0` = visible, `1` = esperando a la derecha (`100%`), `n-1` = ya salió a la izquierda (`-100%`). La diapositiva que pasa de `-100%` a `100%` al dar la vuelta debe **saltar sin transición** (`transition: none` cuando `offset === 1`; `transform 600ms ease-in-out` en las demás, solo bajo `motion-safe:`). Con 3 diapositivas no hay saltos visibles. Contenedor `relative overflow-hidden`.
- `prefers-reduced-motion: reduce`: **sin avance automático, sin transición**, se muestra la primera imagen estática y **no se muestra** el botón Pausar/Reproducir (no hay nada que pausar).
- Pausa: `onMouseEnter`/`onMouseLeave` y `onFocus`/`onBlur` (foco dentro del contenedor) pausan temporalmente; el botón conmuta `playing`. Botón `type="button"`, 44 px, esquina inferior, foco visible, `aria-pressed` no (el texto cambia): `aria-label` = "Pausar carrusel" cuando reproduce / "Reproducir carrusel" cuando está pausado, con icono SVG `aria-hidden`.
- Accesibilidad: contenedor de diapositivas `aria-hidden="true"` (decorativas, `alt=""`); el carrusel entero no es un `region`/`aria-live` (no hay información que anunciar). Solo la primera imagen `loading="eager"`; el resto `lazy`; sin `preload`.
- `slides.length < 2`: sin temporizador ni botón.

### `src/modules/auth/content/auth-slides.ts` (T2)

```ts
export const authSlides: CarouselSlide[] = [
  { src: "/auth/login-1.webp" }, { src: "/auth/login-2.webp" }, { src: "/auth/login-3.webp" },
];
```

### `src/modules/auth/clerk-appearance.ts` (T2)

```ts
import type { Appearance } from "@clerk/nextjs/types"; // ruta de import a confirmar en los tipos de 7.9.17
export const clerkAppearance: Appearance = { variables: {...}, elements: {...} }; // ver Decisión 6
```

### `src/modules/auth/components/auth-split-layout.tsx` (T2, servidor)

```tsx
export function AuthSplitLayout({ children }: { children: React.ReactNode }): JSX.Element;
// <main className="flex-1 md:grid md:grid-cols-2">
//   <div className="relative hidden bg-brand-deep md:block min-h-[32rem]"><ImageCarousel slides={authSlides} sizes="(min-width: 768px) 50vw, 0px" className="absolute inset-0" /></div>
//   <div className="flex items-center justify-center bg-background px-4 py-10">{children}</div>
// </main>
```

### Páginas (T3, delgadas)

```tsx
// sign-in/[[...sign-in]]/page.tsx (metadata sin cambios: "Iniciar sesión | Nexora")
<AuthSplitLayout><SignIn appearance={clerkAppearance} /></AuthSplitLayout>
// sign-up/[[...sign-up]]/page.tsx (metadata sin cambios: "Crear cuenta | Nexora")
<AuthSplitLayout><SignUp appearance={clerkAppearance} /></AuthSplitLayout>
```

Sin props `routing`, `path`, `signInUrl`, `redirectUrl` ni `fallbackRedirectUrl`/`forceRedirectUrl` nuevas: se conserva el comportamiento actual por variables de entorno y `redirect_url`.

## Archivos

| Archivo | N/M/E | Tarea |
|---|---|---|
| `public/auth/login-1.webp`, `login-2.webp`, `login-3.webp` | N (copias de `docs/assets/4-images/imagen-login1..3.webp`) | T0 |
| `src/hooks/use-prefers-reduced-motion.ts`, `src/hooks/use-prefers-reduced-motion.test.ts` | N | T1 |
| `src/components/shared/image-carousel.tsx`, `src/components/shared/image-carousel.test.tsx` | N | T1 |
| `src/modules/auth/clerk-appearance.ts` | N | T2 |
| `src/modules/auth/content/auth-slides.ts` | N | T2 |
| `src/modules/auth/components/auth-split-layout.tsx` | N | T2 |
| `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx` | M | T3 |
| `docs/MANUAL-TESTS.md` | M (sección nueva) | T4 |

Sin cambios: `src/app/layout.tsx`, `src/app/globals.css`, `src/components/shared/site-nav.tsx` y su test, `src/modules/auth/components/site-header.tsx`, `src/app/page.tsx`, `src/app/onboarding/**`, `src/proxy.ts`, `src/lib/security-headers.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `drizzle/**`, servicios, schemas y `ui/**`. Si `src/hooks/` no existe, el developer lo crea (alias `@/hooks` ya configurado en `components.json`).

## Criterios de aceptación

- AC1: A >= 768 px, `/sign-in` y `/sign-up` muestran dos mitades iguales: carrusel a la izquierda y formulario de Clerk a la derecha, sin scroll horizontal; el header y el footer globales siguen presentes, con el logo y el chip "Modo de prueba" visibles en el header.
- AC2: El carrusel muestra `login-1`, `login-2`, `login-3` y avanza cada 3 s (`intervalMs` por defecto 3000) deslizándose **hacia la izquierda**, en bucle infinito; la diapositiva que da la vuelta no cruza la vista (sin parpadeo ni retroceso visibles).
- AC3: Con `prefers-reduced-motion: reduce` no hay avance automático ni transición: se ve la primera imagen estática y el botón Pausar/Reproducir no se muestra.
- AC4: El botón "Pausar carrusel" detiene el avance y pasa a "Reproducir carrusel" (y viceversa); medir >= 44 px y foco visible; alcanzable con Tab; funciona con Enter/Espacio. Pasar el ratón por encima o poner el foco dentro del carrusel pausa el avance y al salir se reanuda (si no se pausó manualmente). Cumple WCAG 2.2.2.
- AC5: Las imágenes son decorativas (`alt=""`, contenedor `aria-hidden`); el único elemento accesible del carrusel es el botón de pausa; el lector de pantalla no anuncia cambios de diapositiva.
- AC6: A < 768 px el carrusel no se muestra (`display:none`), el formulario ocupa todo el ancho útil sin scroll horizontal (320 y 390 px) y la pestaña Network no descarga `/auth/*` ni `/_next/image?...login-*` en ese ancho.
- AC7: Las imágenes se sirven del mismo origen (`/_next/image` o `/auth/*.webp`); no hay peticiones a dominios nuevos ni violaciones nuevas de CSP en consola; no hay advertencias de `next/image` (p. ej. `sizes`/`fill`) ni de `priority` deprecada.
- AC8: `clerkAppearance` existe en un único módulo y lo importan sign-in y sign-up (ningún otro archivo define `appearance` para esos componentes); el formulario usa verde `#183D30` en el botón primario, Plus Jakarta Sans y radio de 10 px; inputs, botones sociales, botón primario y enlaces del pie de Clerk miden >= 44 px de alto y muestran foco visible.
- AC9: No cambian: URLs, `redirect_url` (iniciar sesión desde `/sign-in?redirect_url=/projects` vuelve a `/projects`), redirecciones por variables de entorno, flujo `/onboarding` tras registrarse, `src/proxy.ts`, CSP, auth, servicios, schemas, permisos ni migraciones; `package.json` no cambia.
- AC10: Los textos del formulario siguen en inglés (límite documentado); `<html lang="es">` y los títulos "Iniciar sesión | Nexora" y "Crear cuenta | Nexora" se conservan.
- AC11: `npm run lint`, `npm run test` y `npm run build` pasan; los tests existentes pasan sin modificarse (en especial `site-nav.test.tsx`); `npm run test:coverage` no cae por debajo de los umbrales vigentes.

## Tests requeridos

Vitest + RTL, junto al archivo, con `vi.useFakeTimers()` y `matchMedia` simulado con `vi.stubGlobal`/`window.matchMedia = ...` dentro del propio test (no se toca `vitest.setup.ts`).

- `src/hooks/use-prefers-reduced-motion.test.ts` (AC3): devuelve `false` si `matchMedia` no coincide, `true` si coincide, reacciona al evento `change` y quita el listener al desmontar; sin `matchMedia` devuelve `false`.
- `src/components/shared/image-carousel.test.tsx` (AC2, AC3, AC4, AC5):
  - Inicia en la primera diapositiva; tras `advanceTimersByTime(3000)` la activa es la segunda; tras 3 intervalos vuelve a la primera (bucle).
  - Respeta un `intervalMs` personalizado.
  - Botón "Pausar carrusel": al pulsarlo no avanza aunque pase el tiempo y el nombre cambia a "Reproducir carrusel"; al pulsarlo de nuevo reanuda.
  - `mouseEnter` / `focus` pausan, `mouseLeave` / `blur` reanudan; una pausa manual no se reanuda con `mouseLeave`.
  - Con `matchMedia("(prefers-reduced-motion: reduce)")` en `true`: no avanza nunca y no existe el botón.
  - Con una sola diapositiva: sin temporizador ni botón.
  - Limpieza: al desmontar no quedan temporizadores (`vi.getTimerCount() === 0`).
  - Imágenes con `alt=""` y contenedor `aria-hidden="true"`.
  - Las aserciones usan atributos de estado (p. ej. `data-active`, `aria-hidden` por diapositiva), no estilos computados (jsdom no ejecuta transiciones).
- Sin test unitario (presentacionales/composición, SETUP §3): `auth-split-layout.tsx`, `auth-slides.ts`, `clerk-appearance.ts` (constante de configuración) y las dos `page.tsx`. Lo visual y el flujo real se verifican con la lista manual.

## Tareas

### T0 — Assets (serial, primero)

- Archivos: `public/auth/login-1.webp`, `public/auth/login-2.webp`, `public/auth/login-3.webp`
- Depende de: —
- Paralelizable: no (serial al inicio; es la única tarea con assets compartidos)
- Cubre: AC7 (origen de las imágenes)
- Notas: copiar con `cp` desde `docs/assets/4-images/imagen-login1..3.webp`; no mover ni borrar los originales. No hay cambios en `package.json`, `layout.tsx` ni `globals.css`.

### T1 — Hook de reduced-motion y carrusel

- Archivos: `src/hooks/use-prefers-reduced-motion.ts`, `src/hooks/use-prefers-reduced-motion.test.ts`, `src/components/shared/image-carousel.tsx`, `src/components/shared/image-carousel.test.tsx`
- Depende de: T0 (solo por el orden de arranque; no usa los assets en tests)
- Paralelizable: sí (con T2 y T4)
- Cubre: AC2, AC3, AC4, AC5

### T2 — Appearance de Clerk, diapositivas y layout dividido

- Archivos: `src/modules/auth/clerk-appearance.ts`, `src/modules/auth/content/auth-slides.ts`, `src/modules/auth/components/auth-split-layout.tsx`
- Depende de: T0 (rutas de imágenes). `auth-split-layout.tsx` importa `ImageCarousel` de T1: el developer de T2 puede escribirlo contra el contrato y se valida al integrar con T1.
- Paralelizable: sí (con T1 y T4), con la salvedad anterior
- Cubre: AC1, AC6, AC7, AC8, AC10

### T3 — Páginas de sign-in y sign-up

- Archivos: `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx`
- Depende de: T1, T2
- Paralelizable: no (integra T1 y T2)
- Cubre: AC1, AC8, AC9, AC10, AC11
- Notas: conservar `metadata`; no añadir props de redirección.

### T4 — Lista manual

- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: T3 (para validar la lista). **Conflicto de archivo:** 022b también añade una sección en este archivo; implementar T4 después de que 022b `done` o, si coinciden, serializar y añadir solo la sección nueva sin tocar el resto (el árbol puede tener cambios sin commitear de otras specs).
- Paralelizable: no respecto a 022b; sí respecto a T1/T2
- Cubre: AC1-AC9 (verificación manual documentada)
- Detalle: añadir tras la última sección `8x` existente en ese momento (y antes de la 9) la sección "Spec 022e — Login y registro a pantalla dividida", y actualizar `**Cubre:**` con 022e.

### Lista manual (texto para `docs/MANUAL-TESTS.md`)

Cuentas: visitante (incógnito) y una cuenta de prueba de Clerk (Test Mode). Probar a **1440 px** y **390 px** (modo dispositivo de DevTools).

- [ ] (a) **1440 px, `/sign-in` y `/sign-up`:** dos mitades iguales; izquierda, carrusel; derecha, formulario de Clerk fundido con el panel (sin tarjeta con sombra), botón primario verde `#183D30`, tipografía Plus Jakarta Sans, esquinas de 10 px; header y footer visibles, con el chip "Modo de prueba".
- [ ] (b) **Carrusel:** cada 3 s la imagen se desliza hacia la izquierda; las tres imágenes rotan en bucle sin parpadeo ni retroceso al dar la vuelta.
- [ ] (c) **Pausa:** el ratón sobre el carrusel lo detiene y al salir se reanuda; "Pausar carrusel" lo detiene y el botón pasa a "Reproducir carrusel"; el botón se alcanza con Tab, se activa con Enter/Espacio, mide >= 44 px y muestra foco.
- [ ] (d) **Reduced-motion:** activar "Reducir movimiento" en el SO (o Rendering -> Emulate `prefers-reduced-motion: reduce` en DevTools) y recargar: imagen estática, sin avance, sin botón de pausa.
- [ ] (e) **Teclado y foco:** Tab recorre header, campos, botón primario y enlace "Sign up"/"Sign in" del pie de Clerk con foco visible y orden lógico; cada control mide >= 44 px; el foco nunca queda atrapado en el carrusel.
- [ ] (f) **390 px:** el carrusel no se ve; el formulario ocupa todo el ancho útil; sin scroll horizontal (también a 320 px); Network no descarga `/auth/*` ni `/_next/image` de `login-*`.
- [ ] (g) **Flujo real login:** desde el landing/Proyectos, "Iniciar sesión" -> `/sign-in?redirect_url=...` -> iniciar sesión con la cuenta de prueba vuelve a la página de origen; sin sesión previa, redirige según las variables de entorno (comportamiento igual que antes de 022e).
- [ ] (h) **Flujo real registro:** crear una cuenta de prueba en `/sign-up` -> llega a `/onboarding` (elegir rol) y de ahí al panel, sin errores.
- [ ] (i) **Consola y red:** sin violaciones nuevas de CSP (Report-Only), sin advertencias de `next/image` ni errores de hidratación; las imágenes vienen del propio origen.
- [ ] (j) **Límites conocidos:** el formulario de Clerk está en inglés (decisión documentada, P3) y puede mostrar "Secured by Clerk"/"Development mode" según la instancia.

## Riesgos

- R1. `appearance`: no pude verificar en el repo los nombres exactos de `elements`/`variables` ni si `fontFamily` acepta `var(--x)` (la skill `clerk-custom-ui` no está disponible). El developer de T2 los confirma en los tipos de `@clerk/nextjs` 7.9.17 antes de escribir y, si `var()` no se resuelve, usa el nombre literal de la fuente (el fallback ya está en la Decisión 6). Ninguna otra parte de la spec depende de ello.
- R2. Si Clerk renderiza un contenedor con alto propio, el formulario puede quedar pegado arriba en la mitad derecha en pantallas muy altas: se resuelve con `items-center` (ya incluido) y se valida en la lista manual.
- R3. Header y footer globales significan menos altura útil; en 1440x900 el bloque dividido ocupa `calc(100dvh - header)` como mínimo en la práctica, y el footer asoma al hacer scroll.

## Preguntas abiertas

- P1. **¿Ocultar header y footer globales en `/sign-in` y `/sign-up` para una pantalla dividida a sangre?** Recomendación: **no** (Decisión 1: mantiene logo, chip "Modo de prueba", 022a AC8 y evita editar archivos de 022b). Si se quiere a sangre, la vía mínima es una regla `body:has([data-auth-split]) > header, body:has([data-auth-split]) > footer { display: none }` en `globals.css` (T0) más un logo y un chip propios en la mitad del formulario, lo que **duplica el chip** de `site-nav.tsx` (extraerlo a un componente compartido exige editar `site-nav.tsx`). En ese caso: implementar 022e **después de 022b `done`** y tocar 022a (nota mínima, `done`) y su AC8.
- P2. **`/onboarding`**: ¿usa el mismo layout dividido? Recomendación: **no** en esta spec (es un paso de elección de rol con tarjeta propia; ya hereda tokens, header y footer). `AuthSplitLayout` queda listo para reutilizarse con un cambio de 2 líneas en `onboarding/page.tsx` si se aprueba.
- P3. **Localizar Clerk al español**: exige `@clerk/localizations` (dependencia nueva, +~30-60 kB de JS en el bundle de auth, prop `localization={esES}` en `ClerkProvider` o por componente, y revisar los mensajes de error). Recomendación: **no incluirla**; spec aparte si se quiere (cubre también `UserButton`).
- P4. **`UserButton`** (en `site-nav.tsx`) usa su propio `appearance` en línea. Para unificarlo con `clerkAppearance` hay que editar `site-nav.tsx`, archivo que toca 022b. Recomendación: **no** en 022e; hacerlo tras 022b `done` en una spec o ajuste mínimo.
- P5. **Texto alternativo**: ¿decorativo (`alt=""`, recomendado) o descriptivo? Si descriptivo, propuestos: 1 "Escritorio de trabajo nocturno con monitor y portátil mostrando código", 2 "Escritorio luminoso con portátil, planta, taza de café y cuaderno", 3 "Escritorio con lámpara encendida, cuaderno abierto y taza de café por la noche". Con alt descriptivo habría que quitar `aria-hidden` y anunciar cambios de forma controlada (más ruido para lectores de pantalla); por eso se recomienda decorativo.
- P6. **Precarga**: ¿`preload` en la primera imagen? Recomendación: **no** (precargaría también en móvil, donde está oculta; el LCP es el formulario). Si se prefiere, usar `preload` (no `priority`, deprecada en Next 16) aceptando la descarga en móvil.
- P7. **Altura del panel**: `min-h-[32rem]` y fondo `--brand-deep` mientras carga. ¿Altura fija a la ventana (`sticky top-0 h-[calc(100dvh-4rem)]`)? Recomendación: **no**, el panel crece con el formulario (más simple); revisar con la lista manual.
- P8. **Orden de implementación respecto a 022b**: 022e **no** edita `site-nav.tsx`, `site-header.tsx` ni `src/app/page.tsx`, así que T0-T3 pueden correr en paralelo con 022b. Único punto de contacto: `docs/MANUAL-TESTS.md` (T4): serializar o ejecutar T4 tras 022b `done`.
- P9. **Velocidad del deslizamiento**: transición de 600 ms con `ease-in-out`. ¿Ajustar? Recomendación: dejar 600 ms.

## Próximas fases

- Opcional: localización de Clerk (P3), `appearance` compartido con `UserButton` (P4), `/onboarding` con layout dividido (P2), indicadores de posición o botones siguiente/anterior si se piden, modo oscuro diseñado.

## Corrección posterior (2026-10-24, modo BUILD, decidida por el humano)

P1 invertida: en `/sign-in` y `/sign-up` se **oculta el footer global** y el header pasa a ser mínimo (solo logo y chip "Modo de prueba", sin enlaces ni botones). Implementado con `isAuthPath` (`src/lib/is-auth-path.ts`), `HideOnAuthRoutes` (envuelve `SiteFooter` en `layout.tsx`) y una rama de `SiteNav` para esas rutas. El test de `site-nav` que comprobaba "Registrarse" marcado en `/sign-up` se sustituyó porque describía el header completo, que ya no se muestra ahí.


# Rediseño visual, fase A: tema, fuente, metadata, favicon, header y footer globales

Estado: done

> **Ajuste en la aprobación (2026-10-24, decidido por el humano):** existe `docs/assets/logo_dark.png` (1024x1024, RGBA), versión del símbolo para **fondos oscuros**. `logo.png` sigue siendo el logo original y el predeterminado (header, favicon). Se copia a `public/logo-dark.png` y el footer (fondo oscuro) usa esa variante en lugar de `logo.png`. El resto de la spec queda igual.

Spec 022a. Es la **base** del rediseño visual (UI) de Nexora y la parte de 4 fases (`022a` a `022d`) que las demás consumen. **Las fases B, C y D dependen de esta**: `022b-landing-and-projects-list`, `022c-dashboards-and-payment`, `022d-profiles-and-project-forms` no pueden empezar a implementarse hasta que 022a esté `done`. Entre B, C y D no hay dependencia de código (archivos disjuntos); solo comparten `docs/MANUAL-TESTS.md` (ver "Tareas").

Es una spec **solo de interfaz** sobre funcionalidad ya probada: no cambia lógica de negocio, servicios, schemas, permisos, base de datos ni migraciones, y no modifica el contenido de specs `done` (ver Preguntas abiertas, P3). Arquitectura: no aplica ninguna sección de `system-design.md` (los roles y el enlace de dashboard del header siguen siendo los de `system-design.md §6` vía 009b/013/019, sin cambios). Guías de Next 16 leídas en `node_modules/next/dist/docs/01-app/03-api-reference/`: `02-components/font.md` (`next/font/google`, variable font con `variable`), `03-file-conventions/01-metadata/app-icons.md` (`icon.png`, `apple-icon.png`, `favicon.ico`) y `04-functions/generate-metadata.md` (objeto `metadata`).

Diseños de referencia (aprobados; son HTML con estilos inline: referencia visual y de contenido, no código final): `docs/assets/LEEME-CLAUDE-CODE.md`, header de `docs/assets/3-paneles/Main.dc.html`, footer de `docs/assets/2-landing/Main.dc.html`. Logos: `docs/assets/logo.png` (símbolo 283x283 RGBA, el original), `docs/assets/logo_dark.png` (símbolo 1024x1024 RGBA para fondos oscuros) y `docs/assets/logo_nexora.png` (símbolo + palabra, con mucho margen; **no se usa**).

## Objetivo

1. Definir el tema (tokens de color, radios, sombras, contenedor y tipografía) en `src/app/globals.css` a partir de los diseños, de modo que B, C y D construyan las pantallas con tokens y no con hex sueltos.
2. Plus Jakarta Sans en **todas** las pantallas (unifica Bricolage Grotesque / Instrument Sans de los artboards), vía `next/font/google` en `src/app/layout.tsx`, reemplazando Geist sans y manteniendo Geist Mono; no se carga JetBrains Mono.
3. `<html lang="es">` y `metadata.title` / `description` propios de Nexora.
4. Favicon: el símbolo (`logo.png`) como icono; se deja de servir el icono por defecto.
5. Header único para todas las páginas (el de 3-paneles: logo símbolo + texto "nexora", navegación por rol existente, chip "Modo de prueba", menú de usuario de Clerk con el fix de hidratación de `site-nav.tsx`) y footer global discreto (el del landing, simplificado).
6. Retirar de `public/` los SVG de la plantilla que nada usa.

## Hechos verificados (código del repo, 2026-10-24)

| Hecho | Fuente |
|---|---|
| `layout.tsx` usa `lang="en"`, `title: "Create Next App"`, `Geist` + `Geist_Mono`; ya monta `SiteHeader` (en `Suspense`) y `LiveAnnouncer` | `src/app/layout.tsx` |
| `globals.css` declara `--font-sans: var(--font-sans)` (autorreferencia) y `--font-mono: var(--font-geist-mono)`: **`--font-geist-sans` no se enlaza a `--font-sans`**, así que hoy Geist sans no se aplica realmente. Tras 022a toda la app cambia de tipografía (cambio visible esperado) | `globals.css:10-12` |
| Tokens actuales shadcn neutros (`oklch`, `--primary` casi negro, `--background` blanco). El bloque `.dark` existe, pero no hay selector de tema ni clase `dark` aplicada | `globals.css:51-118` |
| ~137 ocurrencias de `#183D30` y decenas de `#E3E8E3`/`#535E56`/`#202522` como hex literales en `src/**/*.tsx`. **No se reemplazan en masa** (riesgo y ruido): B, C y D cambian a tokens solo en los archivos que restilizan | `grep` |
| `SiteNav` (cliente) ya implementa: lista única `#site-nav-list`, `getActiveHref` (un solo `aria-current`, spec 014), menú móvil con `Escape`, `UserButton` montado tras hidratación con marcador `size-11` (`useSyncExternalStore`), objetivos de 44 px. Fondo actual `#F5F6F2`, logo de texto "Nexora" | `src/components/shared/site-nav.tsx` |
| `site-nav.test.tsx` busca el enlace del logo por nombre accesible exacto `"Nexora"` (`:81`) y `["/", ["Nexora"]]` (`:30`) | `site-nav.test.tsx` |
| `SiteHeader` (servidor) compone `links` = Proyectos, enlace de dashboard, "Mi cuenta" (solo developer) y `SiteHeaderFallback` | `src/modules/auth/components/site-header.tsx` |
| `public/` contiene `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`. **Grep de `next.svg|vercel.svg|file.svg|globe.svg|window.svg` en todo el repo (excluyendo `node_modules`, `.next`, `.git` y `docs/assets`)**: solo `src/app/page.tsx` referencia `next.svg` y `vercel.svg`; `file.svg`, `globe.svg` y `window.svg` **no tienen ninguna referencia** (ni en `src`, ni en config, ni en docs) | `grep` 2026-10-24 |
| `src/app/favicon.ico` (plantilla) existe. Con Next 16, si coexisten `favicon.ico` e `icon.png` se emiten ambos `<link rel="icon">` | `app-icons.md` |
| `getInitials(displayName)` vive en `profile/services/avatar-initials.ts` y solo lo importan `profile` y `app/dashboard/account/page.tsx`; los diseños usan iniciales en avatares de tablas, pago y propuestas (módulos `dashboard`, `payments`, `proposals`, que no pueden depender de `profile`, `system-design.md §4`) | `grep` |
| Seguridad: CSP en Report-Only mezclada por `clerkMiddleware` (015); `next/font/google` sirve la fuente desde el propio origen en build y `next/image` de un PNG local sirve desde `/_next/image` (mismo origen) | `src/lib/security-headers.ts`, doc de `next/font` |

## Alcance

- Incluye:
  - Tokens en `globals.css` (tabla de abajo), utilidad `surface` (aspecto de tarjeta), contenedor `max-w-page`, `scroll-behavior: smooth` solo con `prefers-reduced-motion: no-preference`, `font-variant-numeric: tabular-nums` en `body` (los diseños lo aplican en la raíz).
  - Fuente Plus Jakarta Sans (variable, `subsets: ["latin"]`), `lang="es"`, `metadata`.
  - Icono (`src/app/icon.png`), logo (`public/logo.png`), eliminación de `src/app/favicon.ico` y de los 3 SVG sin uso.
  - Ajuste de base (solo clases/variantes, sin cambiar APIs) de `button.tsx` (hover con token, tamaños `touch` 44 px y `hero` 52 px), `badge.tsx` (variantes de tono `success | warning | danger | neutral`) y de los controles `input.tsx`, `textarea.tsx`, `native-select.tsx` y `label.tsx` (alto 44 px, radio 10 px, borde `input`, fondo de tarjeta). Todos los usos actuales sobrescriben con `className`, por lo que siguen igual.
  - Componentes compartidos nuevos: `SiteFooter` y `InitialsAvatar` (avatar de iniciales decorativo), más `getInitials` en `src/lib`.
  - Header: restilizado (fondo blanco, logo símbolo + "nexora", chip "Modo de prueba", orden de enlaces del diseño, estado activo del diseño) sin cambiar la lógica de roles.
- No incluye:
  - Landing, `/projects`, paneles, pago, propuestas, perfiles, formularios (fases B, C y D). Hasta que existan, esas pantallas heredan tokens, fuente, header y footer nuevos pero conservan su maquetación actual.
  - Enlaces ancla del landing y el botón "Publicar proyecto"/"Ir a mi panel" del header: los entrega 022b (conoce los `id` de sección).
  - Modo oscuro (el bloque `.dark` se conserva sin tocar ni diseñar), `metadataBase`, imágenes Open Graph, `apple-icon`, `manifest`, `themeColor`.
  - Cambios en `dashboard-link.ts`, `nav-viewer.service.ts`, `current-user.service.ts`, permisos, schemas, servicios, `package.json`, `drizzle/**`, `src/proxy.ts`, `next.config.ts`.
  - Reemplazo masivo de hex por tokens; localización de Clerk (ver P4).

## Tokens (contrato de `globals.css`)

Valores extraídos de los `.dc.html` (3-paneles, 2-landing, 1-perfiles). `:root` define variables y `@theme inline` las expone como utilidades. Los nombres shadcn existentes se **mantienen** (los componentes `ui/**` los consumen); solo cambian sus valores.

| Token | Valor | Utilidad / uso |
|---|---|---|
| `--background` | `#F5F6F2` | fondo de página |
| `--foreground` | `#1F2420` | texto principal |
| `--card`, `--popover` | `#FFFFFF` | tarjetas, tablas, diálogos |
| `--card-foreground`, `--popover-foreground` | `#1F2420` | |
| `--primary` / `--primary-foreground` | `#183D30` / `#FFFFFF` | botón primario, enlaces de marca |
| `--primary-hover` (nuevo) | `#0F2A20` | `hover:bg-primary-hover` |
| `--secondary` / `--secondary-foreground`, `--accent` / `--accent-foreground` | `#DCE6DE` / `#183D30` | pestaña activa de la navegación, pastillas suaves |
| `--muted` | `#F1F2EF` | fondos neutros |
| `--muted-foreground` | `#535E56` | texto secundario (contraste 6,2:1 sobre `#F5F6F2`) |
| `--destructive` | `#B42318` | errores (texto/borde) |
| `--border` | `#E3E8E3` | bordes de tarjeta y divisores |
| `--input` | `#C9D3CB` | borde de controles y botones secundarios |
| `--ring` | `#183D30` | foco: `ring-3 ring-ring/40` |
| `--divider` (nuevo) | `#EEF1EC` | separadores internos de listas/tablas |
| `--surface-subtle` / `--surface-soft` (nuevos) | `#F7F8F5` / `#F2F6F1` | cabeceras de tabla, fila seleccionada |
| `--text-body` (nuevo) | `#3A423C` | párrafos largos |
| `--chip` / `--chip-border` (nuevos) | `#EDF2EC` / `#D5E0D7` | etiquetas de tecnología |
| `--brand-deep` / `--brand-deep-border` / `--on-dark` (nuevos) | `#21483A` / `#2E5A4A` / `#C7D6CB` | paneles verdes oscuros y su texto |
| `--footer-border` (nuevo) | `#353D37` | línea del footer (fondo = `--foreground`) |
| `--star` / `--star-on-dark` (nuevos) | `#B7791F` / `#E9B54C` | estrellas de valoración |
| Tonos de estado (nuevos): `--success-bg/-fg/-border` | `#E3EFE6` / `#1E5236` / `#BFD8C6` | pago completado, publicado |
| `--warning-bg/-fg/-border`, `--warning-strong`, `--warning-icon` | `#FBF1DC` / `#7A4D0B` / `#EBD3A0`, `#5C3A08`, `#8A5A12` | pendiente, "Modo de prueba" |
| `--danger-bg/-fg/-border` | `#FBE7E4` / `#8F2A1C` / `#EFC2BA` | fallido |
| `--neutral-bg/-fg/-border` | `#F1F2EF` / `#4A534C` / `#DADFD9` | no iniciado, sin iniciar |
| `--radius` | `0.625rem` (10 px, sin cambio: botones/controles = `rounded-lg`); `--radius-card: 1rem` (nuevo: `rounded-card`, tarjetas de 16 px) | |
| `--shadow-hero` / `--shadow-float` (nuevos) | `0 24px 48px -24px rgb(24 61 48 / .35)` / `0 16px 32px -16px rgb(24 61 48 / .6)` | vista previa del landing |
| `--container-page` (nuevo) | `75rem` (1200 px) | `max-w-page` |
| `--font-sans` | `var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif` | |
| `--font-heading` | `var(--font-sans)` | |
| `--font-mono` | `var(--font-geist-mono)` | sin cambio |

Utilidad `@utility surface`: `border: 1px solid var(--border); background: var(--card); border-radius: var(--radius-card)` (tarjeta del diseño; se compone con `p-*`, `overflow-hidden`, etc.).

Guía tipográfica para B, C y D (no son tokens; usar clases Tailwind): h1 de landing 56/1,05/800/-0,035 em; h1 de página 32-36/1,15/800/-0,02 em; h2 de sección del landing 36/800; h2 de tarjeta o panel 16/700; "eyebrow" 13/700 mayúsculas con 0,08 em y `text-muted-foreground`; cuerpo 14-16 (`text-body`); notas 12-13.

## Reutilizar

| Existente | Uso |
|---|---|
| `src/components/shared/site-nav.tsx` y su test | Se **restiliza** y se amplía; se conserva toda su lógica (`getActiveHref`, menú móvil, `Escape`, `aria-expanded`, fix de hidratación de `UserButton`) |
| `src/modules/auth/components/site-header.tsx`, `dashboard-link.ts` (`getDashboardLink`, `getAccountLink`) | La lógica de roles no se toca; solo cambia el **orden** en que `site-header.tsx` arma `links` |
| `src/components/ui/{button,badge,input,textarea,native-select,label}.tsx` | Ajuste de base (T0). `badge` ya lo usan `project-status-badge`, `proposal-status-badge` y pagos: no cambian de aspecto en esta fase |
| `src/modules/profile/services/avatar-initials.ts` (`getInitials`) | Se mueve la función a `src/lib/initials.ts`; el archivo de `profile` pasa a **re-exportarla** (una línea) para no tocar ni sus importadores ni su test |
| `src/components/shared/live-announcer.tsx` (014) y la corrección posterior | **Sin cambios**; sigue montado en el layout tras el footer |
| `docs/assets/logo.png` | Origen de `public/logo.png` y `src/app/icon.png` (copias) |
| shadcn (`npx shadcn@latest search @shadcn`): `card`, `table`, `breadcrumb`, `avatar`, `tabs`, `accordion` existen en el registro | Aquí **no se añade ninguno**: se resuelve con la utilidad `surface` y `InitialsAvatar` (YAGNI); `table` y `breadcrumb` los añade 022c y `tabs` 022b |

No existe un componente de footer ni de avatar decorativo de iniciales (Glob de `src/components` y `src/modules/*/components`): se crean.

## Contratos (solo props/UI; sin cambios de servicios, schemas ni permisos)

### `src/app/layout.tsx` (T0)

```tsx
const plusJakarta = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexora — Encuentra al desarrollador para tu proyecto",
  description:
    "Publica lo que necesitas construir, recibe propuestas con precio y plazo, compara perfiles y valoraciones, y contrata con un pago a través de Stripe en modo de prueba.",
};
// <html lang="es" className={`${plusJakarta.variable} ${geistMono.variable} h-full antialiased`}>
// body: SiteHeader (Suspense) -> {children} -> <SiteFooter /> -> <LiveAnnouncer />
```

Sin `title.template`: las páginas ya fijan `title: "… | Nexora"` completo y una plantilla lo duplicaría. `Geist` (sans) deja de importarse.

### `src/components/shared/site-footer.tsx` (T0, servidor, sin props, sin sesión)

`<footer>` único por página (landmark `contentinfo`), fondo `--foreground`, texto `#C9D3CB`, contenedor `max-w-page`, una fila compacta (`py-6`) que se apila en 390 px:

- Marca: símbolo `/logo-dark.png` (variante para fondo oscuro, 28 px, `alt=""`; mostrarlo con `next/image` `width={28} height={28}` escalado desde 1024 px) + "nexora" (texto "Nexora" con `lowercase`) y la frase "Conecta proyectos de software con los desarrolladores que pueden hacerlos realidad."
- `<nav aria-label="Pie de página">` con un único enlace "Proyectos" (`/projects`, objetivo >= 44 px, foco visible con anillo claro). Sin enlaces ancla (los `id` del landing los entrega 022b) y sin enlaces dependientes de la sesión.
- Línea legal (borde superior `--footer-border`): "© {año} Nexora. Proyecto de demostración." (año con `new Date().getFullYear()`) y "Pagos procesados por Stripe en modo de prueba."

### `src/components/shared/initials-avatar.tsx` (T0) y `src/lib/initials.ts` (T0)

```ts
export function getInitials(displayName: string): string;      // misma función de profile; "?" si vacío
type InitialsAvatarProps = { name: string; size?: "sm" | "md" | "lg"; className?: string };
export function InitialsAvatar(props: InitialsAvatarProps): JSX.Element;
// círculo bg-secondary text-primary font-extrabold; decorativo: aria-hidden="true" (el nombre ya está en el texto contiguo)
```

`sm` = 30 px (tablas), `md` = 36-40 px, `lg` = 52-56 px. `DeveloperAvatar` (profile, con `role="img"`) no cambia aquí; lo restiliza 022d.

### `SiteNav` y `SiteHeader` (T1)

`SiteNavProps` **no cambia de forma** (`links`, `signedIn`). Cambios de UI:

- `<header>`: `bg-card`, `border-b border-border`, contenedor `max-w-page`, altura mínima 64 px.
- Logo (`Link href="/"`, `aria-current` en `/`): `next/image` `/logo.png` 30x30 `alt=""` + `<span className="lowercase">Nexora</span>` en 22 px, peso 800, `tracking-[-0.03em]`, color `foreground`. El texto del nodo sigue siendo "Nexora" (nombre accesible igual, el test existente no cambia); el `lowercase` solo es visual.
- Enlaces de la lista: activo = `bg-secondary text-primary font-bold rounded-lg` (en lugar del subrayado) con `aria-current="page"` solo en el más específico (sin cambio de lógica); inactivo `text-muted-foreground font-semibold hover:text-primary`. Foco visible y `min-h-11` se conservan.
- Chip "Modo de prueba": `<span>` no interactivo con tonos `warning-*`, `text-xs font-bold`, `rounded-full`, visible **siempre** (con y sin sesión, en escritorio y móvil), a la derecha antes del `UserButton`/"Registrarse". Texto fijo en el componente (la app solo opera en Test Mode, ver P1).
- `UserButton` de Clerk con `useSyncExternalStore` y marcador `size-11`: **intacto**. "Registrarse" usa `buttonVariants` con `size="touch"` y los tokens de `primary`.
- `SiteHeaderFallback` se actualiza al mismo aspecto y altura (símbolo + "nexora").
- **Orden** (en `site-header.tsx`): enlace de dashboard primero, luego "Proyectos", luego "Mi cuenta" (como el diseño 3-paneles: "Mi panel · Proyectos · Mi cuenta"); para visitante solo "Proyectos" (+ "Iniciar sesión" que añade `SiteNav`). `getDashboardLink`/`getAccountLink` no cambian.
- A 390 px: logo + chip + (avatar de Clerk o "Registrarse") + botón de menú no desbordan; si no cabe, el developer mueve "Registrarse" al panel del menú móvil por debajo de `sm`, nunca oculta el chip ni provoca scroll horizontal (ver P8).

## Conflictos entre el diseño y la funcionalidad existente

| # | Diseño | Existente | Decisión |
|---|---|---|---|
| 1 | Tres headers distintos: 1-perfiles (fondo `#F5F6F2`, texto "Nexora" en Bricolage, sin chip, avatar "CL"), 2-landing (anclas y "Iniciar sesión"/"Publicar proyecto") y 3-paneles (blanco, logo + "nexora", chip) | Un solo `SiteNav` global (009b) | Header único (decisión 6): el de 3-paneles; el del landing se completa en 022b |
| 2 | Avatar del header = botón con iniciales | `UserButton` de Clerk (menú de cuenta y cierre de sesión) | Se conserva Clerk |
| 3 | Orden "Mi panel · Proyectos · Mi cuenta" | "Proyectos · Mi panel · Mi cuenta" | Se sigue el diseño (solo orden en `site-header.tsx`) |
| 4 | Estado activo con píldora verde suave | Subrayado | Se sigue el diseño; `aria-current` y `getActiveHref` intactos |
| 5 | Logo en minúscula "nexora" | Test busca "Nexora" | `lowercase` por CSS; texto y nombre accesible "Nexora" |
| 6 | Header de 1-perfiles muestra "Mis proyectos"/"Mis propuestas" como etiquetas | Etiquetas vigentes: "Mi panel", "Mi cuenta" (009b/012/013/019) | Se conservan las vigentes |
| 7 | Footer grande de 3 columnas con "Cuenta" y "Preguntas frecuentes" | Sin footer | Versión simplificada, sin enlaces de sesión ni anclas |
| 8 | Fuentes Bricolage Grotesque / Instrument Sans / JetBrains Mono en 1-perfiles | Decisión 3 | Plus Jakarta Sans en todo; mono = Geist Mono |

## Archivos

| Archivo | N/M/E | Tarea |
|---|---|---|
| `src/app/globals.css` | M | T0 |
| `src/app/layout.tsx` | M | T0 |
| `src/app/icon.png` | N (copia de `docs/assets/logo.png`) | T0 |
| `src/app/favicon.ico` | E | T0 |
| `public/logo.png` | N (copia de `docs/assets/logo.png`) | T0 |
| `public/logo-dark.png` | N (copia de `docs/assets/logo_dark.png`; solo para fondos oscuros, p. ej. el footer) | T0 |
| `public/file.svg`, `public/globe.svg`, `public/window.svg` | E (sin referencias, ver Hechos) | T0 |
| `src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `native-select.tsx`, `label.tsx` | M (variantes/base) | T0 |
| `src/components/shared/site-footer.tsx` | N | T0 |
| `src/components/shared/initials-avatar.tsx` | N | T0 |
| `src/lib/initials.ts`, `src/lib/initials.test.ts` | N | T0 |
| `src/modules/profile/services/avatar-initials.ts` | M (re-exporta `getInitials` desde `@/lib/initials`) | T0 |
| `src/components/shared/site-nav.tsx`, `site-nav.test.tsx` | M | T1 |
| `src/modules/auth/components/site-header.tsx` | M (orden de enlaces, fallback) | T1 |
| `docs/MANUAL-TESTS.md` | M (sección "8m. Spec 022a" y nota en §10) | T2 |

Sin cambios (y fuera de alcance): `public/next.svg` y `public/vercel.svg` (los usa `src/app/page.tsx` hasta que 022b lo reemplace; los borra 022b), `src/app/page.tsx`, todos los servicios y schemas, `drizzle/**`, `package.json` y `package-lock.json` (no hay dependencias nuevas: `next/font/google` viene con Next), `.dark` de `globals.css`.

## Criterios de aceptación

- AC1: `globals.css` define los tokens de la tabla con esos valores exactos, `--radius-card`, `--shadow-*`, `--container-page` (`max-w-page`) y la utilidad `surface`; se conserva el bloque `.dark` sin cambios; `body` usa `bg-background text-foreground` y `tabular-nums`; `scroll-behavior: smooth` solo bajo `prefers-reduced-motion: no-preference`.
- AC2: Todas las páginas se renderizan en Plus Jakarta Sans (`getComputedStyle(body).fontFamily` incluye la fuente; DevTools -> Fonts) y la red no pide `fonts.googleapis.com` ni `fonts.gstatic.com` en tiempo de ejecución (autoalojada por `next/font`). `Geist` (sans) ya no se importa; `Geist_Mono` sigue disponible como `--font-mono`; no se carga JetBrains Mono.
- AC3: `<html lang="es">`; `document.title` de `/` es el `title` de la tabla y la meta `description` coincide; las páginas que ya definen `title` conservan el suyo.
- AC4: `src/app/icon.png` existe y `src/app/favicon.ico` no; el `<head>` contiene `<link rel="icon" … type="image/png">` y ninguna referencia a `/favicon.ico`; la pestaña muestra el símbolo de Nexora y no el icono por defecto de Next (comprobación con recarga forzada).
- AC5: `public/file.svg`, `public/globe.svg` y `public/window.svg` se eliminan tras repetir el grep de "Hechos verificados" sin resultados; `next.svg` y `vercel.svg` siguen en `public/` (los retira 022b). El build no referencia ninguno de los tres eliminados.
- AC6: Header: fondo blanco con borde inferior; logo símbolo + "nexora" (nombre accesible "Nexora", enlace a `/`); chip "Modo de prueba" visible con y sin sesión; orden Mi panel · Proyectos · Mi cuenta para developer, Mi panel · Proyectos para client, Proyectos para visitante; exactamente un `aria-current="page"` (el más específico) con el estilo de píldora; `UserButton` sigue montándose tras hidratación sin errores de hidratación en consola.
- AC7: A 390 px (y 320 px) el header no tiene scroll horizontal, muestra logo, chip y avatar o "Registrarse", y el menú móvil conserva `aria-expanded`/`aria-controls`, cierre por enlace, `Escape` y segundo clic; a >= 768 px los enlaces van en línea; todos los controles del header (logo, enlaces, "Registrarse", botón de menú, disparador de `UserButton`) miden >= 44 px y tienen foco visible.
- AC8: El footer aparece en todas las rutas, incluidos `/sign-in`, `/sign-up`, `/onboarding` y el 404, queda al final del viewport en páginas cortas (el `main` es `flex-1`), hay un único `contentinfo` y un único `banner` por página, contiene los textos del contrato, el enlace "Proyectos" funciona con teclado y los contrastes cumplen 4,5:1.
- AC9: `InitialsAvatar` es decorativo (`aria-hidden`) y `getInitials` desde `@/lib/initials` y desde `@/modules/profile/services/avatar-initials` devuelven lo mismo (el test existente de `avatar-initials` pasa sin cambios).
- AC10: La lógica de roles no cambia: `dashboard-link.ts`, `nav-viewer.service.ts`, `current-user.service.ts` y sus tests no se modifican; ningún servicio, schema, permiso ni migración cambia; `package.json` no cambia.
- AC11: Comparado con el artboard de header de `3-paneles/Main.dc.html` a 1440 px y 390 px, el resultado coincide en estructura, colores, tamaños y estados (con las salvedades de la tabla de conflictos).
- AC12: `npm run lint`, `npm run test` y `npm run build` pasan; los tests existentes pasan **sin modificarse** (solo se amplía `site-nav.test.tsx`); `npm run test:coverage` no cae por debajo de los umbrales vigentes (no se bajan). La consola no muestra violaciones nuevas de CSP.

## Tests requeridos

Vitest, junto al archivo (SETUP §3: solo donde hay lógica).

- `src/lib/initials.test.ts` (AC9): casos de `getInitials` (dos palabras, una palabra, acentos, vacío -> `"?"`). El test existente `avatar-initials.test.ts` se mantiene intacto.
- `src/components/shared/site-nav.test.tsx` (AC6, AC7): se **añaden** casos sin modificar los existentes: el chip "Modo de prueba" aparece con `signedIn` true y false; el enlace del logo conserva el nombre accesible "Nexora"; sigue habiendo un solo `aria-current` con las rutas de 014.
- Sin test unitario (presentacionales, SETUP §3): `site-footer.tsx`, `initials-avatar.tsx`, `site-header.tsx` (composición de servidor), `layout.tsx`, variantes de `ui/**`. El reviewer verifica con `grep` la ausencia de `favicon.ico`, de `Geist(` y de los tres SVG, y corre lint/test/build.

## Tareas

### T0 — Base compartida: tema, fuente, metadata, assets, controles y componentes compartidos (serial, primero)

- Archivos: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/icon.png`, `src/app/favicon.ico` (eliminar), `public/logo.png`, `public/logo-dark.png`, `public/file.svg`, `public/globe.svg`, `public/window.svg` (eliminar), `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/native-select.tsx`, `src/components/ui/label.tsx`, `src/components/shared/site-footer.tsx`, `src/components/shared/initials-avatar.tsx`, `src/lib/initials.ts`, `src/lib/initials.test.ts`, `src/modules/profile/services/avatar-initials.ts`
- Depende de: —
- Paralelizable: no (serial al inicio: contiene `layout.tsx`, `globals.css` y `src/components/ui/**`; nadie corre `npm install` ni `npm run build` durante el bloque paralelo posterior)
- Cubre: AC1, AC2, AC3, AC4, AC5, AC8 (footer), AC9, AC10 (parte)
- Notas: copiar los PNG con `cp`; las variantes añadidas a `ui/**` son extensiones por variante (SETUP §2 "Open/Closed"); dejar un comentario de una línea en cada archivo `ui/**` modificado indicando que hay variantes propias que una regeneración con la CLI sobrescribiría.

### T1 — Header

- Archivos: `src/components/shared/site-nav.tsx`, `src/components/shared/site-nav.test.tsx`, `src/modules/auth/components/site-header.tsx`
- Depende de: T0
- Paralelizable: sí (con T2)
- Cubre: AC6, AC7, AC10, AC11

### T2 — Documentación y lista manual

- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: T0 (y T1 para validar la lista)
- Paralelizable: sí (con T1; archivo disjunto)
- Cubre: AC11 (verificación manual documentada)
- Detalle: añadir tras la sección 8l y antes de la 9 la sección "8m. Spec 022a — Tema, header y footer globales" con el texto de abajo; actualizar `**Cubre:**`; en §10 reemplazar la frase sobre "el landing de `/` y la metadata global siguen pendientes" por: metadata global, `lang` y favicon resueltos en 022a; landing pendiente de 022b. Solo se añade o reemplaza lo indicado: el árbol tiene cambios sin commitear en este archivo (corrección posterior de 014) que no se tocan.

### Lista manual (texto para `docs/MANUAL-TESTS.md`, "8m. Spec 022a")

Compara cada punto con `docs/assets/3-paneles/Main.dc.html` (header) a **1440 px** y a **390 px** (modo dispositivo de DevTools). Cuentas: visitante (incógnito), Cliente y Desarrollador A.

- [ ] (a) **Fuente:** en `/`, `/projects`, `/dashboard`, `/sign-in` y un 404 el texto se ve en Plus Jakarta Sans (DevTools -> Rendered Fonts); en la pestaña Network no hay peticiones a `fonts.googleapis.com`.
- [ ] (b) **Idioma y título:** `document.documentElement.lang` es `es`; el título de la pestaña en `/` es el de Nexora (no "Create Next App"); las demás páginas conservan su título.
- [ ] (c) **Favicon:** la pestaña muestra el símbolo verde/negro de Nexora (recarga forzada, Ctrl+F5); no aparece el icono de Next.
- [ ] (d) **Header (1440 px):** fondo blanco, símbolo + "nexora", chip "Modo de prueba" siempre visible, y para Cliente "Mi panel · Proyectos", para Desarrollador "Mi panel · Proyectos · Mi cuenta", para visitante "Proyectos · Iniciar sesión" + "Registrarse"; la página actual aparece con píldora verde suave y solo una.
- [ ] (e) **Header (390 px):** sin scroll horizontal; se ven símbolo, "nexora", chip, avatar (o "Registrarse") y botón de menú; el menú despliega todos los enlaces, se cierra con un enlace, con `Escape` y con un segundo clic; Escape devuelve el foco al botón.
- [ ] (f) **Teclado y foco:** Tab recorre logo, enlaces, avatar y botón de menú con anillo de foco visible y orden lógico; ningún control mide menos de 44 px (inspección).
- [ ] (g) **Clerk:** el menú del avatar abre y "Cerrar sesión" funciona; no hay errores de hidratación en consola al cargar con sesión iniciada ni al recargar.
- [ ] (h) **Footer:** aparece en todas las páginas (incluida `/sign-in` y el 404) pegado al final cuando el contenido es corto; muestra marca, frase, "Proyectos", "© año Nexora. Proyecto de demostración." y "Pagos procesados por Stripe en modo de prueba."; se ve bien a 390 px; el enlace "Proyectos" tiene foco visible.
- [ ] (i) **Sin regresiones funcionales:** los avisos de `LiveAnnouncer` (014) siguen apareciendo encima del footer; ningún dashboard, formulario ni diálogo pierde función (solo cambian color y tipografía hasta las fases B-D).
- [ ] (j) **Consola:** sin violaciones nuevas de CSP (Report-Only) ni advertencias de `next/image`.

## Preguntas abiertas

- P1. Chip "Modo de prueba": texto fijo en `SiteNav`. Recomendación: **fijo** (la app solo opera en Test Mode, BRIEF §7 reglas 14-15); si en el futuro hay entorno real, pasar a una variable pública (spec propia).
- P2. `apple-icon.png`: el símbolo es RGBA con fondo transparente y iOS lo rellena de negro. Recomendación: **no añadirlo** ahora (YAGNI; la decisión pide `icon.png` y "si procede" el apple-icon). Si lo quieres, se necesita una versión con fondo opaco de 180x180 (un archivo más en T0).
- P3. Esta spec cambia el aspecto del header definido en 009b (`done`), de 013 y de 014 sin editarlas. Recomendación: **no tocar** esas specs; 022a-022d son la traza. Si prefieres una nota de una línea en 009b ("restilizado en 022a"), se añade a T2.
- P4. Clerk (`SignIn`, `SignUp`, `UserButton`) seguirá en inglés dentro de una página `lang="es"`. Traducirlo exige `@clerk/localizations` (dependencia nueva). Recomendación: **no incluirlo** en este rediseño; abrir spec aparte si se quiere.
- P5. Orden de enlaces (conflicto 3): ¿seguir el diseño ("Mi panel" antes que "Proyectos") o conservar el actual? Recomendación: seguir el diseño.
- P6. Entre la fase A y la D las pantallas sin restilizar mezclan header/tipografía nuevos con maquetación vieja (fondo `#F5F6F2`, contenedores `max-w-5xl`). Recomendación: **publicar A-D juntas**, o aceptar la mezcla temporal en desarrollo.
- P7. `font-variant-numeric: tabular-nums` global (los artboards lo aplican en la raíz). Recomendación: **sí**, global.
- P8. En 390 px "Registrarse" + chip + menú puede no caber en visitante. Recomendación: mover "Registrarse" al panel del menú móvil por debajo de `sm`, dejando visibles chip y botón de menú.
- P9. Pantallas sin artboard (`/dashboard/projects`, `/dashboard/proposals`, `/dashboard/payouts`, `/onboarding`, `/sign-in`, `/sign-up`, 404): heredan tokens, header y footer, sin diseño propio. Recomendación: aceptar; si se quieren diseñadas, spec nueva.
- P10. `metadataBase` y Open Graph quedan fuera. Recomendación: aplazar a la spec de despliegue/SEO.

## Próximas fases

- 022b `landing-and-projects-list`, 022c `dashboards-and-payment`, 022d `profiles-and-project-forms` (dependen de esta).
- Opcional más adelante: modo oscuro diseñado, localización de Clerk, `apple-icon` opaco, Open Graph.

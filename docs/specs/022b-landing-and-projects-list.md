# Rediseño visual, fase B: landing (`/`) y listado público de proyectos (`/projects`)

Estado: borrador

Spec 022b. **Depende de 022a** (tokens, fuente, `surface`, `max-w-page`, controles `ui/**`, header y footer globales, `InitialsAvatar`): no se implementa hasta que 022a esté `done`. Es independiente de 022c y 022d (archivos disjuntos; solo comparten `docs/MANUAL-TESTS.md`, ver "Tareas").

Es una spec **solo de interfaz** sobre funcionalidad ya probada: no cambia servicios, schemas, permisos ni migraciones. Reutiliza el catálogo público de la spec 006 (`done`) y la navegación de 009b (`done`) sin editar sus specs. Arquitectura: `system-design.md §4` (se añade un módulo de solo UI `landing`, ver "Archivos") y `§6` (el "Enviar propuesta" por rol replica `can("proposal.create")` = solo `developer`, sin cambios de permisos).

Diseños de referencia (HTML de /design: referencia visual y de contenido, no código final; ignorar `<x-dc>`/`<helmet>`): `docs/assets/2-landing/Main.dc.html` (landing) y `docs/assets/3-paneles/Projects.dc.html` (listado). Se ignoran `docs/assets/nexora-landing-reference.png` y los HTML exportados de la raíz de `docs/assets`.

Decisiones del humano que esta spec aplica (no se reabren): 1 (sección "Proyectos publicados" con los 6 más recientes reales, enlace a `/projects`, botón "Enviar propuesta" con navegación real), 3 (fuente), 7 (landing con sesión: "Ir a mi panel"), 9 (reemplazar `src/app/page.tsx` y borrar los SVG de plantilla solo si el grep lo permite), 10 (solo modo claro).

## Objetivo

1. Sustituir la plantilla de Next en `/` por el landing de Nexora: hero, proyectos publicados reales, "Cómo funciona", "Por qué Nexora", "Para desarrolladores", preguntas frecuentes y llamada final; el footer es el global de 022a.
2. En el landing, el header global (022a) muestra además los enlaces ancla del diseño y, según la sesión, "Publicar proyecto" (visitante) o "Ir a mi panel" (cliente/desarrollador con sesión).
3. Restilizar `/projects` como en `3-paneles/Projects.dc.html`: franja verde con título y buscador, filtros en panel lateral, tarjetas y paginación, **sin cambiar** filtros, orden, paginación ni consultas.
4. "Enviar propuesta" en las tarjetas del landing con traducción a navegación real, sin modal.

## Hechos verificados (código del repo, 2026-10-24)

| Hecho | Fuente |
|---|---|
| `src/app/page.tsx` es la plantilla de `create-next-app` y usa `next.svg` y `vercel.svg`; ningún otro archivo del repo referencia los 5 SVG de `public/` (grep, ver 022a). 022a elimina `file.svg`, `globe.svg` y `window.svg`; esta spec elimina `next.svg` y `vercel.svg` al reemplazar la página | `src/app/page.tsx`, grep |
| `listPublicProjects(query)` devuelve `{ items, total, page, totalPages }`, orden por defecto `publishedAt desc, id desc`, **tamaño de página fijo 12** (`PUBLIC_CATALOG_PAGE_SIZE`); no admite un `limit`. `parsePublicCatalogQuery({})` da la consulta por defecto | `public-catalog.service.ts`, `public-catalog.schema.ts` |
| `PublicProjectSummary` (whitelist): categoría, título, resumen (240 car.), tecnologías, presupuesto mín/máx, plazo, `publishedAt`; sin cliente ni propuestas | `public-project.types.ts` |
| Categorías reales: Frontend & UI/UX, Backend & APIs, Full Stack, E-commerce, WordPress, Otros (no existe "Móvil") | `PROJECT_CATEGORIES` |
| Ordenación real del catálogo: `recent`, `budget_asc`, `budget_desc` (no hay "menor plazo"); plazo es un select 4/8/12/26 semanas; presupuesto máximo; tecnologías vía `TagPicker` (máx. 5, AND) | `public-catalog-filters.tsx`, `CATALOG_SORTS` |
| El filtro es un `<form method="get" action="/projects" role="search">` nativo: el estado vive en la URL y funciona sin JavaScript. Hoy el campo de búsqueda `q` está dentro de ese formulario | `public-catalog-filters.tsx` |
| `PublicProjectCard` usa enlace estirado (`after:absolute inset-0`) sobre el título y un "Ver detalles →" `aria-hidden` | `public-project-card.tsx` |
| `ProposalCta` (detalle) usa `/sign-in?redirect_url=<ruta del proyecto>` para visitante, `/onboarding` para sesión sin fila, y la sección `#propuesta` (`DeveloperProposalSection`, `id="propuesta"`) solo para `developer`; cliente y admin no proponen | `proposal-cta.tsx`, `developer-proposal-section.tsx` |
| `resolveNavViewer()` ya lo llama el header (cacheado por petición con `getCurrentUser`); `getDashboardLink(viewer)` ya mapea rol -> destino (`/dashboard` para client y developer, `/onboarding`, `null` para admin) | `nav-viewer.service.ts`, `dashboard-link.ts` |
| `PublicCatalogSkeleton` renderiza 6 tarjetas en rejilla de 3 columnas (reutilizable para la sección del landing) | `public-catalog-skeleton.tsx` |
| Como `layout.tsx` lee sesión (009b), `/` ya es dinámica; no hay prerender que perder | 009b hecho 3 |
| shadcn: `tabs` existe en el registro (`npx shadcn@latest search @shadcn -q tabs`) y se apoya en Base UI, que ya está instalado: **no hay dependencias nuevas** | CLI / `package.json` |

## Alcance

- Incluye:
  - Landing en `/` (módulo de solo UI `src/modules/landing`), `id` de sección `inicio`, `proyectos`, `como-funciona`, `desarrolladores`, `preguntas`.
  - Sección "Proyectos publicados": los 6 más recientes **reales** (`listPublicProjects` con la consulta por defecto y `items.slice(0, 6)`), enlace "Ver todos los proyectos" a `/projects`, filtros de categoría como **enlaces** a `/projects?category=...` (sin estado de cliente), estados vacío y de error, y acciones por tarjeta ("Ver detalle" y "Enviar propuesta") según el rol.
  - `getProposalAction(viewer, projectId)` (puro) y `getHomeCta(viewer)` (puro), con tests.
  - Header en `/`: enlaces ancla, "Publicar proyecto" / "Ir a mi panel" (props opcionales nuevas de `SiteNav`).
  - `/projects`: franja de cabecera con h1, subtítulo y buscador; panel lateral de filtros; tarjetas y esqueleto restilizados; paginación restilizada.
  - Eliminar `public/next.svg` y `public/vercel.svg`.
  - Pasos manuales en `docs/MANUAL-TESTS.md` y una línea en `system-design.md §4`.
- No incluye:
  - Cambios en `public-catalog.service.ts`, `public-catalog.schema.ts`, `public-viewer.service.ts`, en el detalle `/projects/[id]` (022d), permisos o schemas; ordenación "menor plazo", rango de plazo libre, categoría "Móvil" ni filtrado en cliente (el diseño es un prototipo con estado local).
  - Cifras, testimonios, logos de clientes, contadores o métricas inventadas; calificaciones de ejemplo.
  - Modal de inicio de sesión (es prototipo; ver "Enviar propuesta").
  - Modo oscuro, animaciones, imágenes de stock, SEO avanzado (Open Graph, JSON-LD).
  - Cambios en header/footer fuera de lo indicado, en `dashboard-link.ts` o en `nav-viewer.service.ts`.

## Contratos (solo props/UI; sin cambios de servicios, schemas ni permisos)

### `getHomeCta` — `src/modules/auth/services/home-cta.ts` (nuevo, puro, junto a `dashboard-link.ts`)

```ts
export type HomeCta =
  | { kind: "visitor" }                                  // sin sesión: CTAs de registro
  | { kind: "member"; label: string; href: string }      // con sesión: salto al panel
  | { kind: "none" };                                    // admin o degradado: sin CTA de cuenta

getHomeCta(viewer: NavViewer): HomeCta
// visitor                -> { kind: "visitor" }
// user client|developer  -> { kind: "member", label: "Ir a mi panel", href: <getDashboardLink(viewer).href> }  // "/dashboard"
// needs_onboarding       -> { kind: "member", label: "Completar registro", href: "/onboarding" }
// user admin | degraded  -> { kind: "none" }
```

Reutiliza `getDashboardLink` para el destino (única fuente del mapa rol -> ruta); solo sustituye la etiqueta en el caso `user`.

### `getProposalAction` — `src/modules/projects/services/proposal-action.ts` (nuevo, puro, sin `server-only`)

```ts
export type ProposalAction = { label: string; href: string; locked: boolean };

getProposalAction(viewer: NavViewer, projectId: string): ProposalAction | null
// visitor                -> { label: "Enviar propuesta", href: `/sign-in?redirect_url=${encodeURIComponent(`/projects/${projectId}`)}`, locked: true }
// needs_onboarding       -> { label: "Completar registro", href: "/onboarding", locked: true }
// user developer         -> { label: "Enviar propuesta", href: `/projects/${projectId}#propuesta`, locked: false }
// user client|admin | degraded -> null   (solo queda "Ver detalle")
```

Es la traducción de la decisión 1: el candado/diálogo del prototipo pasa a **navegación real** (visitante -> inicio de sesión con regreso al proyecto; desarrollador -> la sección de propuesta del detalle). `locked` solo decide el icono de candado. El cliente no ve el botón (como en `ProposalCta`: "Los clientes no envían propuestas"). La página de detalle es quien valida cobros activos, rol y propiedad (sin cambios).

### `PublicProjectCard` (M, T2)

```ts
type Props = { project: PublicProjectSummary; actions?: React.ReactNode };
```

- Aspecto del diseño: fila superior con categoría en mayúsculas pequeñas (`text-muted-foreground`, `tracking-wide`) y fecha (formato absoluto actual, **no** "Hace 2 días"); título 18/800; resumen de 3 líneas; etiquetas de tecnología con `--chip`/`--chip-border` (máx. 4 + "+N", como hoy); bloque `dl` con "Presupuesto" y "Plazo" con **rótulos visibles** (11 px mayúsculas) en lugar de `sr-only`.
- Sin `actions`: el enlace estirado del título sigue cubriendo la tarjeta y se muestra el pie "Ver detalle" (`aria-hidden`, como hoy "Ver detalles →"). Con `actions`: se renderiza bajo el `dl` dentro de un contenedor `relative z-10` para que sus enlaces queden por encima del enlace estirado; el pie por defecto no se muestra.

### `SiteNav` / `SiteHeader` en `/` (M, T3)

`SiteNavProps` gana dos props **opcionales** (sin ellas el comportamiento de 022a no cambia):

```ts
homeAnchors?: NavLinkItem[];   // se usan solo cuando usePathname() === "/"
homeCta?: HomeCta;             // se usa solo cuando usePathname() === "/"
```

- `site-header.tsx` pasa `homeAnchors = [{ "/#proyectos", "Explorar proyectos" }, { "/#como-funciona", "Cómo funciona" }, { "/#desarrolladores", "Para desarrolladores" }, { "/#preguntas", "Preguntas" }]` y `homeCta = getHomeCta(viewer)`.
- En `/`: los anclas **sustituyen** al enlace "Proyectos" (cubre "Explorar proyectos") y se agregan tras los demás enlaces; sin `aria-current` en los anclas; pulsar un ancla cierra el menú móvil. Cada ancla apunta a un `id` que existe en el landing.
- Botón de la derecha en `/`: visitante -> "Publicar proyecto" (`/sign-up`, primario; sustituye a "Registrarse"; "Iniciar sesión" sigue en la lista); `member` -> botón con su `label`/`href` junto al `UserButton`; `none` -> nada extra. Por debajo de `sm` ese botón va dentro del panel del menú (no en la barra) para no desbordar a 390 px junto al chip "Modo de prueba".

### Landing (`src/modules/landing`, T1 y T3)

La página (`src/app/page.tsx`, solo composición) resuelve `viewer = await resolveNavViewer()` y `cta = getHomeCta(viewer)` y compone, dentro de un único `<main>`:

```tsx
<LandingHero cta={cta} />                                   // id="inicio", único <h1>
<Suspense fallback={<PublicCatalogSkeleton />}><LandingProjects viewer={viewer} /></Suspense>   // id="proyectos"
<LandingHowItWorks />                                       // id="como-funciona" (shadcn Tabs: "Para clientes" / "Para desarrolladores")
<LandingBenefits cta={cta} />
<LandingDevelopers cta={cta} />                             // id="desarrolladores"
<LandingFaq />                                              // id="preguntas" (<details>/<summary> nativos)
<LandingFinalCta cta={cta} />
```

Contenido: `src/modules/landing/content/landing-content.ts` con los textos **verbatim** de `2-landing/Main.dc.html` (hero, lista de confianza, 4 pasos de cliente y de desarrollador, 6 beneficios, 4 puntos para desarrolladores, 5 preguntas, llamada final), revisados contra la funcionalidad real (propuestas ordenables por precio/plazo, perfiles y valoraciones de 019/020, descripciones Markdown de 018, Stripe Test Mode, transferencia de 011b): todos corresponden a funciones existentes. Excepciones:

- **Vista previa del hero** (propuestas de ejemplo): se conserva la composición, pero **sin nombres de personas ni valoraciones inventadas**: filas "Desarrollador A/B/C" con precio y plazo de ejemplo, con un rótulo visible "Ejemplo ilustrativo", `aria-hidden` y sin estrellas ni "N valoraciones". Se conserva la píldora "Pago confirmado · Verificado por el servidor" (describe el comportamiento real). Ver P2.
- **Proyectos publicados**: datos reales (abajo), no los 6 proyectos de ejemplo.
- **CTAs de cuenta** (según `cta`): hero "Publicar un proyecto", "Por qué Nexora" "Crear cuenta gratis", "Para desarrolladores" "Crear perfil de desarrollador" y llamada final "Publicar un proyecto": visitante -> `/sign-up`; `member` -> su `label` ("Ir a mi panel" o "Completar registro") y `href`; `none` -> no se renderiza ese botón. Los botones de exploración ("Soy desarrollador", "Ver proyectos", "Explorar proyectos") apuntan a `#proyectos` en todos los casos.

`LandingProjects({ viewer })` (servidor, asíncrono): `listPublicProjects(parsePublicCatalogQuery({}))` y `items.slice(0, 6)`; usa `PublicProjectCard` con `actions` (enlace "Ver detalle de {título}" + `getProposalAction(viewer, project.id)`; icono de candado si `locked`). Fila de categorías = enlaces a `buildCatalogHref(query, { category })` y "Todos" a `/projects` (`<nav aria-label="Filtrar por categoría">`). Nota informativa del diseño ("Cualquiera puede explorar…" y "Para enviar propuestas necesitas una cuenta de desarrollador con tus cobros de prueba configurados.") solo para `visitor` y `needs_onboarding`. Estados: sin proyectos -> textos de `PublicCatalogResults` ("Aún no hay proyectos publicados" / "Vuelve pronto para ver nuevas oportunidades."); error del servicio -> `console.error` con `safeErrorLog` y mensaje "No pudimos cargar los proyectos" con enlace "Reintentar" a `/` (el landing **no** falla si el catálogo falla, como hace `PublicCatalogResults`).

### `/projects` (T2)

- `src/app/projects/page.tsx` sigue siendo composición: franja `bg-primary text-primary-foreground` con `<h1>Proyectos publicados</h1>`, subtítulo "Encuentra proyectos que encajen con tus tecnologías y envía tu propuesta con precio y plazo." y el buscador (componente nuevo `PublicCatalogHero` en `projects/components`); debajo, `max-w-page` con el panel lateral de filtros (izquierda, `lg:w-[280px]`) y los resultados (derecha).
- **Un solo formulario GET**: `PublicCatalogFilters` mantiene `<form id="catalog-filters" method="get" action="/projects" role="search" aria-label="Buscar y filtrar proyectos">` con categoría, presupuesto, plazo, orden y tecnologías, más "Aplicar" y "Limpiar". El campo `q` (nombre `q`, mismo `maxLength`) **sale** del panel y se renderiza en `PublicCatalogHero` como `<input type="search" name="q" form="catalog-filters">` con su `label` (visible solo para lectores) y un botón "Buscar" `type="submit" form="catalog-filters"`; así buscar conserva los filtros y aplicar filtros conserva `q`, sin JavaScript.
- Panel lateral: tarjeta `surface`, h2 "Filtros" y enlace "Limpiar" (el existente) arriba; controles con el aspecto de los controles de 022a (44 px, radio 10 px); tecnologías dentro del `<details>` actual con `TagPicker` (solo tokens).
- Resultados: `role="status"` con "Mostrando N proyectos publicados" (texto existente) en un encabezado de resultados; rejilla `repeat(auto-fill, minmax(300px, 1fr))`; paginación con "Anterior"/"Siguiente" como botones del diseño (borde, `h-11`) y "Página X de Y", manteniendo `rel="prev"`/`rel="next"`; esqueleto y estados vacío/error con los textos actuales.

## Conflictos entre el diseño y la funcionalidad existente

| # | Diseño | Existente | Decisión |
|---|---|---|---|
| 1 | Landing: filtros de categoría que filtran en el lugar (estado local) y 6 proyectos de ejemplo | Catálogo servidor, categorías reales | Los chips son **enlaces** a `/projects?category=`; los 6 proyectos son reales; categorías reales (sin "Móvil", con E-commerce, WordPress, Otros) |
| 2 | Botón "Enviar propuesta" abre un modal "Inicia sesión…" | Rutas de login/registro y `#propuesta` | Navegación real por rol (`getProposalAction`), sin modal |
| 3 | Hero con vista previa: nombres, "★ 4.8 · 12 valoraciones" | No hay datos de ejemplo permitidos | Mock ilustrativo rotulado, sin nombres ni valoraciones |
| 4 | Listado filtra en vivo, plazo máx. numérico, "Ordenar por: Menor plazo", chips de tecnología fijas | Formulario GET con "Aplicar", plazo 4/8/12/26, orden `recent`/`budget_asc`/`budget_desc`, tecnologías del catálogo con `TagPicker` | Se conserva la funcionalidad existente; solo cambia el aspecto. "Menor plazo" no se añade (sería cambio de servicio/schema) |
| 5 | "Ordenar por" junto al conteo de resultados | `Ordenar por` dentro del formulario | Se queda en el panel de filtros: sin JavaScript no se puede autoenviar al cambiarlo |
| 6 | Buscador en la franja superior, panel lateral con "Limpiar" como botón | Buscador dentro del formulario; "Limpiar" es un enlace | Un solo formulario con `form="catalog-filters"`; "Limpiar" sigue siendo enlace |
| 7 | Fechas "Hace 2 días" | Fecha absoluta (`PUBLIC_DATE_FORMATTER`) | Se conserva la absoluta (determinista y sin hidratación) |
| 8 | Título del listado "Proyectos publicados" y subtítulo | h1 "Explorar proyectos" | **El diseño manda en títulos y subtítulos de página**; lo existente manda en etiquetas de acciones, estados y mensajes (regla común a 022a-022d). Ningún test cubre ese h1 |
| 9 | Botón "Publicar proyecto" fijo en el header del landing con sesión | Decisión 7 | Con sesión: "Ir a mi panel" (cliente/desarrollador); "Completar registro" si falta el rol; nada para admin |

## Reutilizar

| Existente | Uso |
|---|---|
| `projects/services/public-catalog.service.ts` (`listPublicProjects`), `schemas/public-catalog.schema.ts` (`parsePublicCatalogQuery`, `buildCatalogHref`, `PUBLIC_CATALOG_PAGE_SIZE`), `PROJECT_CATEGORIES` | Datos del landing y del listado; sin cambios |
| `projects/components/public-project-card.tsx` (`PublicProjectCard`, `formatBudgetRange`, `PUBLIC_DATE_FORMATTER`), `public-catalog-filters.tsx`, `public-catalog-results.tsx`, `public-catalog-skeleton.tsx`, `src/components/shared/{tag-picker,empty-state}.tsx` | Se restilizan; el skeleton se reutiliza en el landing |
| `auth/services/{nav-viewer.service,dashboard-link}.ts`, `auth/types/nav-viewer.types.ts` | `resolveNavViewer`, `getDashboardLink`, tipo `NavViewer` (el landing depende de `auth` y de `projects`; nadie depende de `landing` salvo `src/app`) |
| `src/components/shared/site-nav.tsx` y `site-header.tsx` (022a) | Se amplían con props opcionales |
| `src/lib/{safe-error-log,utils}.ts`, `src/components/ui/{button,badge,input,native-select,label}.tsx`, tokens y `surface` de 022a | Estilos y utilidades |
| `<details>`/`<summary>` nativos (ya usado en `public-catalog-filters.tsx`) | Preguntas frecuentes (sin accordion: YAGNI y sin JS) |
| shadcn `tabs` (nuevo vía CLI en T0) | Pestañas "Para clientes / Para desarrolladores" de "Cómo funciona" (`role=tablist`, flechas de teclado de Base UI) |

No existe módulo, componente ni helper de landing (Glob/Grep en `src/**`): se crean.

## Archivos

| Archivo | N/M/E | Tarea |
|---|---|---|
| `src/components/ui/tabs.tsx` (`npx shadcn@latest add tabs`) | N | T0 |
| `src/modules/auth/services/home-cta.ts`, `home-cta.test.ts` | N | T1 |
| `src/modules/projects/services/proposal-action.ts`, `proposal-action.test.ts` | N | T1 |
| `src/modules/landing/content/landing-content.ts` | N | T1 |
| `src/modules/landing/components/landing-hero.tsx`, `landing-how-it-works.tsx`, `landing-benefits.tsx`, `landing-developers.tsx`, `landing-faq.tsx`, `landing-final-cta.tsx` | N | T1 |
| `src/modules/projects/components/public-project-card.tsx`, `public-project-card.test.tsx` (nuevo) | M / N | T2 |
| `src/modules/projects/components/public-catalog-filters.tsx`, `public-catalog-results.tsx`, `public-catalog-skeleton.tsx`, `public-catalog-hero.tsx` (nuevo) | M / N | T2 |
| `src/app/projects/page.tsx` | M | T2 |
| `src/modules/landing/components/landing-projects.tsx` | N | T3 |
| `src/app/page.tsx` | M (reemplazo total) | T3 |
| `src/components/shared/site-nav.tsx`, `site-nav.test.tsx`, `src/modules/auth/components/site-header.tsx` | M | T3 |
| `public/next.svg`, `public/vercel.svg` | E (tras el grep) | T3 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md` | M | T4 |

Sin cambios: `package.json`, `package-lock.json`, `drizzle/**`, `public-catalog.service.ts`, `public-catalog.schema.ts`, `public-viewer.service.ts`, `dashboard-link.ts`, `nav-viewer.service.ts`, `layout.tsx`, `globals.css`, `src/app/projects/[id]/**`.

## Criterios de aceptación

- AC1: `getHomeCta` devuelve `{ kind: "visitor" }` sin sesión, `{ member, "Ir a mi panel", "/dashboard" }` para `client` y `developer`, `{ member, "Completar registro", "/onboarding" }` para `needs_onboarding`, y `{ kind: "none" }` para `admin` y `degraded`; el destino sale de `getDashboardLink` (no hay una segunda tabla rol -> ruta).
- AC2: `getProposalAction` cumple la tabla: visitante -> inicio de sesión con `redirect_url` codificado del proyecto y `locked: true`; `needs_onboarding` -> `/onboarding`, `locked: true`; `developer` -> `/projects/<id>#propuesta`, `locked: false`; `client`, `admin` y `degraded` -> `null`.
- AC3: `/` ya no es la plantilla: se ve el landing completo con las secciones y `id` indicados, un único `<h1>` y un único `<main>`; `src/app/page.tsx` es solo composición y no contiene `next.svg`/`vercel.svg`.
- AC4: "Proyectos publicados" muestra como máximo los **6 proyectos publicados más recientes reales** (mismo orden que `/projects`), con categoría, fecha, título, resumen, tecnologías, presupuesto y plazo; un proyecto despublicado, borrador o cerrado no aparece; sin proyectos se muestra el estado vacío; si el servicio falla el resto del landing carga y se ve el mensaje de error con "Reintentar".
- AC5: "Ver todos los proyectos" lleva a `/projects`; cada chip de categoría lleva a `/projects?category=<categoría>` (categorías reales) y "Todos" a `/projects`.
- AC6: "Enviar propuesta": visitante -> `/sign-in?redirect_url=%2Fprojects%2F<id>` (con candado); desarrollador -> `/projects/<id>#propuesta` (la página de detalle abre la sección); cliente y admin no ven el botón; sesión sin fila -> "Completar registro". "Ver detalle" siempre lleva a `/projects/<id>`. No hay modal.
- AC7: Header en `/`: los 4 anclas del diseño aparecen y llevan a secciones existentes (con desplazamiento suave solo sin `prefers-reduced-motion`); "Proyectos" no se duplica; visitante ve "Iniciar sesión" y "Publicar proyecto"; cliente/desarrollador con sesión ven "Ir a mi panel" (-> `/dashboard`) y el avatar de Clerk; sesión sin fila, "Completar registro"; admin no ve CTA de cuenta. En cualquier otra ruta el header es el de 022a sin cambios. A 390 px el CTA va dentro del menú y no hay scroll horizontal.
- AC8: Con sesión, los botones de cuenta del cuerpo del landing (hero, "Por qué Nexora", "Para desarrolladores", llamada final) pasan a "Ir a mi panel"/"Completar registro" o se ocultan según `HomeCta`; los botones de exploración siguen igual.
- AC9: No hay cifras, testimonios, nombres de personas ni valoraciones inventadas: la vista previa del hero es ilustrativa y está rotulada, y `aria-hidden`.
- AC10: "Cómo funciona" usa pestañas accesibles (`tablist`/`tab`/`tabpanel`, flechas de teclado, foco visible); las preguntas usan `<details>` con `summary` de >= 44 px de alto y foco visible; todos los enlaces y botones miden >= 44 px de alto (hero >= 52 px donde indica el diseño).
- AC11: `/projects`: franja verde con h1 y buscador, panel lateral de filtros y tarjetas como el diseño; **toda** la funcionalidad existente se conserva: búsqueda, categoría, presupuesto máximo, plazo, orden, tecnologías (máx. 5, AND), "Aplicar", "Limpiar" y paginación con "Anterior/Siguiente/Página X de Y"; el estado sigue en la URL y funciona con JavaScript deshabilitado.
- AC12: Buscar desde la franja conserva los filtros activos en la URL, y aplicar filtros conserva `q`; existe un único `role="search"` y un único campo `name="q"`.
- AC13: `PublicProjectCard` sin `actions` mantiene el enlace estirado del título (la tarjeta entera es clicable) y, con `actions`, sus enlaces son clicables y alcanzables con teclado por encima del enlace estirado (sin enlaces anidados dentro del `<a>` del título).
- AC14: Todos los textos funcionales existentes (estados vacío/error, "Aplicar", "Limpiar", "Mostrando N proyectos publicados", "Cargando proyectos…") se conservan; los archivos tocados usan tokens (`bg-card`, `text-muted-foreground`, `border-border`…) y no introducen hex nuevos con token equivalente.
- AC15: `public/next.svg` y `public/vercel.svg` se eliminan tras repetir el grep (ver 022a) sin resultados; no queda ninguna referencia a los 5 SVG de plantilla; no se añaden dependencias (`package.json` sin cambios, `tabs` usa `@base-ui/react`).
- AC16: Diseño: comparado con `2-landing/Main.dc.html` y `3-paneles/Projects.dc.html` a 1440 px y 390 px, la estructura, jerarquía tipográfica, colores y espaciados coinciden (con las salvedades de la tabla de conflictos); sin scroll horizontal a 390 px.
- AC17: `npm run lint`, `npm run test` y `npm run build` pasan; los tests existentes pasan sin modificarse (solo se amplía `site-nav.test.tsx`); `npm run test:coverage` no cae por debajo de los umbrales; ningún servicio, schema, permiso ni migración cambia.

## Tests requeridos

Vitest, junto al archivo (SETUP §3: lógica de decisión sí; JSX presentacional no).

- `src/modules/auth/services/home-cta.test.ts` (AC1): tabla completa de `NavViewer` (`visitor`, `client`, `developer`, `admin`, `needs_onboarding`, `degraded`); el `href` de `member` coincide con `getDashboardLink`.
- `src/modules/projects/services/proposal-action.test.ts` (AC2): tabla completa, con un `projectId` que exige codificación (`redirect_url` correctamente escapado).
- `src/components/shared/site-nav.test.tsx` (AC7): se **añaden** casos sin tocar los existentes: en `/` con `homeAnchors` se muestran los anclas y no "Proyectos"; en otra ruta no se muestran; `homeCta` visitante/`member`/`none` en `/`; sin las props nuevas el comportamiento de 022a no cambia; pulsar un ancla cierra el menú móvil.
- `src/modules/projects/components/public-project-card.test.tsx` (AC13): sin `actions` hay un único enlace (el del título) y el pie por defecto; con `actions` aparecen sus enlaces y no el pie por defecto; no hay `<a>` anidados.
- Sin test unitario obligatorio: secciones del landing, `landing-content.ts`, `public-catalog-*` (presentacionales), `src/app/**`. Los tests existentes (`site-nav`, `tag-picker`, etc.) pasan sin cambios.

## Tareas

Máximo 5. Durante el bloque paralelo (T1 y T2) nadie corre `npm install` ni `npm run build`; el reviewer corre lint, test y build al final.

### T0 — Componente shadcn `tabs` (serial, primero)

- Archivos: `src/components/ui/tabs.tsx` (`npx shadcn@latest add tabs`)
- Depende de: 022a `done`
- Paralelizable: no
- Cubre: AC10 (parte), AC15 (parte)

### T1 — Lógica de CTAs y secciones del landing

- Archivos: `src/modules/auth/services/home-cta.ts`, `home-cta.test.ts`, `src/modules/projects/services/proposal-action.ts`, `proposal-action.test.ts`, `src/modules/landing/content/landing-content.ts`, `src/modules/landing/components/landing-hero.tsx`, `landing-how-it-works.tsx`, `landing-benefits.tsx`, `landing-developers.tsx`, `landing-faq.tsx`, `landing-final-cta.tsx`
- Depende de: T0
- Paralelizable: sí (con T2)
- Cubre: AC1, AC2, AC8, AC9, AC10, AC14

### T2 — Tarjeta y listado `/projects`

- Archivos: `src/modules/projects/components/public-project-card.tsx`, `public-project-card.test.tsx`, `public-catalog-filters.tsx`, `public-catalog-results.tsx`, `public-catalog-skeleton.tsx`, `public-catalog-hero.tsx`, `src/app/projects/page.tsx`
- Depende de: 022a (no de T0/T1)
- Paralelizable: sí (con T1)
- Cubre: AC11, AC12, AC13, AC14

### T3 — Proyectos del landing, página `/`, header en `/` y limpieza de SVG

- Archivos: `src/modules/landing/components/landing-projects.tsx`, `src/app/page.tsx`, `src/components/shared/site-nav.tsx`, `src/components/shared/site-nav.test.tsx`, `src/modules/auth/components/site-header.tsx`, `public/next.svg` (eliminar), `public/vercel.svg` (eliminar)
- Depende de: T1, T2
- Paralelizable: no (integra T1 y T2; reemplaza `page.tsx`)
- Cubre: AC3, AC4, AC5, AC6, AC7, AC15, AC16

### T4 — Documentación y lista manual

- Archivos: `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`
- Depende de: T3
- Paralelizable: no
- Cubre: AC16, AC17 (verificación manual y arquitectura)
- Detalle: en `MANUAL-TESTS.md`, sección nueva "8n. Spec 022b — Landing y listado de proyectos" (texto abajo) tras la sección de 022a (o tras la 8l si 022a aún no está) y antes de la 9; actualizar `**Cubre:**`; en §10 reemplazar la frase del landing pendiente por "landing resuelto en 022b". En `system-design.md §4`: añadir `landing/ -> solo UI del landing público (spec 022b)` al árbol y la fila `landing | auth, projects (solo lectura vía servicio público de catálogo); nadie depende de landing salvo src/app`. Solo se añade o reemplaza lo indicado: el árbol tiene cambios sin commitear en `MANUAL-TESTS.md`.

### Lista manual (texto para `docs/MANUAL-TESTS.md`, "8n. Spec 022b")

Compara con `docs/assets/2-landing/Main.dc.html` y `docs/assets/3-paneles/Projects.dc.html` a **1440 px** y **390 px**. Cuentas: visitante (incógnito), Cliente, Desarrollador A, y (opcional) Administrador. Prepara al menos 8 proyectos publicados con tecnologías distintas y uno en borrador.

- [ ] (a) **Landing visitante:** `/` muestra hero, proyectos publicados, cómo funciona, por qué Nexora, para desarrolladores, preguntas, llamada final y footer; un solo `h1`; la vista previa del hero dice "Ejemplo ilustrativo" y no muestra nombres ni valoraciones.
- [ ] (b) **Proyectos reales:** la sección muestra exactamente los 6 publicados más recientes (compara con `/projects`); el borrador y los cerrados no aparecen; con 0 publicados aparece el estado vacío.
- [ ] (c) **Enlaces:** "Ver todos los proyectos" -> `/projects`; cada categoría -> `/projects?category=...` con el filtro aplicado; "Todos" -> `/projects`; "Ver detalle" abre el proyecto.
- [ ] (d) **Enviar propuesta:** visitante -> `/sign-in` (tras entrar como desarrollador vuelve al proyecto); desarrollador -> detalle del proyecto con la sección "Enviar una propuesta" visible; cliente: no hay botón; cuenta sin rol: "Completar registro".
- [ ] (e) **Header en `/`:** anclas "Explorar proyectos · Cómo funciona · Para desarrolladores · Preguntas" desplazan a su sección (suave; sin movimiento con "reducir movimiento" activo); visitante ve "Iniciar sesión" y "Publicar proyecto"; Cliente/Desarrollador ven "Ir a mi panel" (-> `/dashboard`) y el avatar; sin rol, "Completar registro"; admin ninguno. En otras páginas el header es el normal.
- [ ] (f) **Cuerpo con sesión:** con sesión los botones "Publicar un proyecto"/"Crear cuenta gratis"/"Crear perfil de desarrollador" pasan a "Ir a mi panel"; "Soy desarrollador"/"Ver proyectos"/"Explorar proyectos" siguen yendo a `#proyectos`.
- [ ] (g) **Cómo funciona:** pestañas "Para clientes"/"Para desarrolladores" cambian el contenido; navegables con flechas y Tab; anunciadas como pestañas por el lector de pantalla.
- [ ] (h) **Preguntas:** cada `details` abre/cierra con Enter/Espacio y tiene foco visible.
- [ ] (i) **`/projects`:** franja verde con título y buscador; buscar "react" mantiene los filtros que tenías; aplicar filtros mantiene la búsqueda; categoría, presupuesto, plazo, orden, tecnologías (hasta 5), "Aplicar", "Limpiar" y paginación funcionan igual que antes; con JavaScript deshabilitado también.
- [ ] (j) **Tarjetas:** toda la tarjeta es clicable y por teclado el foco visible va al título; en el landing los dos botones de la tarjeta son clicables y accesibles con Tab.
- [ ] (k) **Responsive:** a 390 px no hay scroll horizontal en `/` ni en `/projects`; el CTA del header va dentro del menú; panel de filtros arriba de los resultados.
- [ ] (l) **Teclado y foco:** recorrido completo con Tab (header, hero, tarjetas, pestañas, preguntas, footer) con foco visible y objetivos >= 44 px.
- [ ] (m) **Fallo del catálogo:** con `DATABASE_URL` inválida temporalmente el landing carga y la sección de proyectos muestra "No pudimos cargar los proyectos" con "Reintentar".
- [ ] (n) **Plantilla fuera:** `/` ya no muestra "To get started, edit the page.tsx"; `public/` ya no contiene los SVG de Next.

## Preguntas abiertas

- P1. Landing: 6 proyectos con la consulta por defecto (página de 12 y `slice(0, 6)`). Recomendación: **sin tocar el servicio** (coste de leer 12 filas, aceptable); añadir un `limit` sería un cambio de servicio de 006.
- P2. Vista previa del hero (conflicto 3): ¿ejemplo ilustrativo rotulado con precios y plazos de muestra (recomendado), o quitar la tarjeta y dejar el hero solo con texto? Los precios de ejemplo no son datos reales.
- P3. Pestañas de "Cómo funciona": shadcn `tabs` (recomendado, `npx shadcn@latest add tabs`) o mostrar las dos listas apiladas sin JavaScript (más simple, sin cambio de contenido).
- P4. "Publicar proyecto" del visitante va a `/sign-up`. Recomendación: **`/sign-up`** (tras registrarse, `/onboarding` pide el rol); alternativa: `/projects/new`, que redirige al login pero pierde el contexto si es desarrollador.
- P5. Títulos de página tomados del diseño ("Proyectos publicados" en vez de "Explorar proyectos"; conflicto 8). Recomendación: seguir el diseño en títulos y mantener lo existente en acciones/estados/mensajes.
- P6. Aviso de sección de proyectos: se muestra solo a visitante y a sesión sin rol. Recomendación: sí (a un desarrollador con sesión le sobra "inicia sesión como desarrollador").
- P7. Se descarta el filtrado en cliente del diseño y "Ordenar por: Menor plazo". Recomendación: aceptar; si se quiere "menor plazo", es una spec de catálogo (servicio + schema).
- P8. Las specs `done` 006 y 009b no se editan; esta spec es la traza del cambio visual. Recomendación: no tocarlas.
- P9. `site-nav.tsx` y `site-header.tsx` los edita también 022a (secuencial, A antes que B). Recomendación: implementar A, aprobarla y luego B, para no tener conflictos de archivo.

## Próximas fases

- 022c `dashboards-and-payment` y 022d `profiles-and-project-forms` (independientes de esta; dependen de 022a).
- Opcional: Open Graph y datos estructurados del landing (spec de SEO/despliegue); un catálogo con orden por plazo (spec de catálogo).

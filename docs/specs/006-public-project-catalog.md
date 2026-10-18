# Catálogo público de proyectos y detalle (Fase 2 de Nexora)

Estado: done

Sigue la plantilla mínima de 14 puntos de `docs/SDD-PLAN.md §10`. Requisitos de origen: `docs/SDD-PLAN.md §5` (Spec 006), `docs/BRIEF.md §6.2` y `§7` (reglas 1, 3, 8). Dominio: `docs/architecture/system-design.md §2` (entidad proyecto), `§3` (propiedad de datos), `§4` (módulos y dependencias), `§6` (permisos: "Ver catálogo y detalle de proyectos `published`" = sí para todos); `docs/architecture/state-machines.md §1` (solo `published` admite propuestas). Esquema usado: `src/modules/projects/schema/projects.table.ts` (spec 003, done; índices `projects_catalog_recent_idx` y `projects_catalog_category_idx`). Autorización: spec 004 (done; RF4 ya declara `/projects` y `/projects/[id]` públicas). Base reutilizada: spec 005 (done). Diseño visual de referencia: artboards "Catálogo de proyectos", "Detalle de proyecto + propuesta" y sus dos vistas móviles (https://claude.ai/artifact/VmUpQeQu1q9LscALC9g5Wm). **Nota: el agente spec no pudo abrir ese artifact (no hay herramienta para leerlo en esta sesión); esta spec se apoya en los tokens de `docs/NEXORA-LANDING-DESIGN.md` y en los nombres de los artboards. El humano debe contrastar la UI final con los artboards (AC17).**

## 1. Objetivo

Que cualquier visitante o usuario autenticado pueda explorar los proyectos `published` y abrir el detalle de uno, sin exponer jamás datos privados, con filtros, orden y paginación resueltos en servidor. Entrega:

- Servicio de lectura pública `src/modules/projects/services/public-catalog.service.ts` (lista paginada, detalle, comprobación de propiedad) con proyección explícita de campos públicos.
- Schema Zod de los `searchParams` del catálogo (defaults con `.catch`) y escape de comodines `LIKE`.
- Páginas públicas `/projects` y `/projects/[id]` con metadata, estados vacío/error y responsive a 390 px.
- Estado por rol en el detalle (visitante, sin onboarding, desarrollador, cliente dueño, cliente ajeno, admin) con un **punto de extensión** explícito (`ProposalCta`) para la spec 007.
- Header público mínimo (`SiteHeader`) sin tocar el layout global.

No define el envío de propuestas (007), la selección (008), pagos (009-011), paneles (012/013) ni el landing completo.

## 2. Contexto y alcance

Decisiones humanas ya aprobadas: catálogo y detalle son PÚBLICOS para visitantes y autenticados (BRIEF §7 regla 1); solo `published` se ve como oportunidad; recurso inexistente o no publicado -> 404 sin revelar existencia; autorización siempre en servidor; dinero en centavos (`formatUsd`); `clientId`, email, nombre del cliente y contacto nunca se muestran (el contacto se comparte solo con la propuesta ganadora, fuera de esta spec); 007 define el envío de propuestas; Stripe Connect al final.

- Incluye:
  - Servicio de lectura, schema de query, tipos, helper de URL del catálogo.
  - Resolución del estado del visitante para el detalle (`public-viewer.service.ts`).
  - Páginas `/projects` y `/projects/[id]`, componentes presentacionales, `SiteHeader` mínimo.
  - Búsqueda por texto (título, descripción, tecnologías), filtros (categoría, presupuesto máximo, plazo), orden y paginación.
- No incluye:
  - Formulario/envío/edición de propuestas, lista de propuestas, selección, pagos (007-011). El detalle solo deja el punto de extensión y mensajes por rol.
  - Header/landing global, `src/app/layout.tsx`, `src/app/page.tsx`, `not-found` global (ver D-H). Metadata global del layout ("Create Next App", `lang="en"`) queda como está.
  - Cambios de esquema, migraciones, índices nuevos, `pg_trgm`, full-text (ver D-A).
  - Perfil público del cliente, número de propuestas, contador de vistas, favoritos, RSS/sitemap, OG images, JSON-LD.
  - Caché entre peticiones (`use cache`, `unstable_cache`, ISR): ver RF8.
  - Dependencias npm nuevas (ver 12).

### Reutilizar (inventario verificado con Glob/Read)

| Existente | Uso en 006 |
|---|---|
| `src/modules/projects/schemas/project.schema.ts`: `PROJECT_CATEGORIES`, `PROJECT_LIMITS` | Reutilizar sin cambios: lista de categorías del filtro y límites del presupuesto aceptable en el filtro. El schema nuevo importa de aquí; no se redefine nada |
| `src/modules/projects/schema/projects.table.ts` | Solo lectura; `status = 'published'` activa los índices parciales de 003 |
| `src/lib/money.ts`: `usdToCents`, `formatUsd` | Parseo del filtro de presupuesto (USD -> centavos) y presentación |
| `src/components/ui`: `button` (`buttonVariants`), `input`, `label`, `native-select`, `badge` | Filtros y tarjetas. No se añaden componentes shadcn |
| `src/components/shared/empty-state.tsx` | Estados vacíos (catálogo vacío, sin resultados, página fuera de rango) y error inline |
| `src/lib/utils.ts` (`cn`), tokens hex de 005 (`#183D30`, `#F5F6F2`, `#DCE6DE`, `#202522`, `#535E56`, `#E3E8E3`) | Estilos coherentes con las pantallas privadas |
| `src/modules/auth/services/current-user.service.ts` (`getCurrentUser`), `clerk-identity.service.ts` (`getSessionUserId`), `permissions.ts` (`can(null, "catalog.view")`) | Solo en `public-viewer.service.ts` y solo para el estado por rol del detalle. El catálogo nunca llama a `requireUser`/`requireRole` (spec 004 RF4) |
| Patrón de test de `project.service.test.ts` (PGlite `createTestDb`, mock de `@/lib/db/client` con `Proxy`, mock de `server-only`) | Se replica |
| Patrón `searchParams` + `.catch` + enlaces de paginación de `project-list.tsx` / `projectListQuerySchema` | Mismo patrón; no se reutiliza el componente (ver abajo) |

**No se reutiliza (separación UI pública/privada):**

- `ProjectStatusBadge` y `PROJECT_STATUS_LABELS`: modelan estados privados ("En contratación", "Borrador"); en lo público todo es `published` y no se muestra estado. Mostrarlo acoplaría la UI pública a un vocabulario privado.
- `project-list.tsx`, `project-lifecycle-actions.tsx`, `project-form.tsx`: acciones del dueño (editar, publicar, cerrar). El catálogo es solo lectura.
- `buildHref` de `project-list.tsx` es una función privada con otros parámetros; se escribe `buildCatalogHref` propio (pequeño y probado). Generalizar ahora sería YAGNI (SETUP §2: se generaliza con el segundo caso real; aquí los parámetros difieren).
- Tipos `Project`/`ProjectDetail`/`ProjectListItem` (incluyen `clientId`, `status`, fechas internas): el contrato público usa tipos propios para que el compilador impida filtrar campos privados a los componentes públicos.

## 3. Requisitos funcionales

### RF1. Ubicación del servicio y dependencias (punto 1)

Decisión: **no se crea un módulo nuevo**. El servicio vive en `src/modules/projects/services/public-catalog.service.ts`.

Justificación: `system-design.md §4` asigna a `projects` "proyectos y su ciclo de vida (specs 005-006)"; el catálogo es una lectura del mismo agregado. Un módulo `catalog/` sería una indirección sin segundo consumidor (YAGNI) y obligaría a documentar una dependencia nueva. Se separa del `project.service.ts` privado en un archivo propio porque tienen contratos distintos: el privado exige `actor` y devuelve filas completas; el público no recibe actor, nunca autoriza ni devuelve `clientId`.

Dependencias (sin ciclos, verificadas contra `§4`):

- `public-catalog.service.ts` importa solo `@/lib/db/client`, `projects.table` y los schemas/tipos de `projects`. **No importa `auth`, `proposals`, `payments` ni `users`**: no puede filtrar datos de esos dominios y es seguro de cachear en el futuro.
- `public-viewer.service.ts` importa `auth` (permitido: `projects -> users, auth`) y `public-catalog.service.ts`. Ningún módulo importa de `projects/services/public-*` salvo `src/app` y los componentes de `projects`.
- Sin cambios en la tabla de dependencias de `§4`; no se toca `system-design.md`.

### RF2. Proyección pública explícita (punto 2)

Lista blanca; nunca `select()` sin columnas ni `returning()` aquí. Las consultas declaran columna por columna (como `listMyProjects`). Tipos en `src/modules/projects/types/public-project.types.ts`:

```ts
type PublicProjectSummary = {      // tarjeta del catálogo
  id: string; title: string; category: string;
  summary: string;                 // left(description, 240) calculado en SQL
  budgetMinCents: number; budgetMaxCents: number; timelineWeeks: number;
  technologies: string[]; publishedAt: Date | null;
};
type PublicProject = Omit<PublicProjectSummary, "summary"> & { description: string };  // detalle
type PublicCatalogPage = { items: PublicProjectSummary[]; total: number; page: number; pageSize: number; totalPages: number };
type PublicViewer =
  | { kind: "visitor" }
  | { kind: "needs_onboarding" }
  | { kind: "user"; role: Role; isOwner: boolean };
```

- **Excluidos siempre:** `clientId`, `status`, `currency` (siempre USD; se presenta con `formatUsd`), `contractedAt`, `closedAt`, `createdAt`, `updatedAt`, y cualquier dato de `users`, `proposals`, `payment_attempts`. No se hace `join` con `users`: el nombre/email del cliente ni siquiera se lee.
- `summary` se recorta en SQL (`left("projects"."description", 240)`) para no enviar 5000 caracteres por tarjeta. Escribir la columna calificada en el SQL crudo (como `proposalCountSql` en `project.service.ts`).
- `PublicProject` no incluye contador de propuestas (dato competitivo; ver pregunta abierta P3).
- Predicado base único: constante `isPublished = eq(projects.status, "published")` usada por **las tres funciones** del servicio (lista, count, detalle). Es lo que hace imposible listar o abrir un no publicado.

### RF3. Estados visibles (punto 12, estados)

Confirmado contra `state-machines.md §1`: "Solo `published` admite nuevas propuestas".

| Estado | ¿En el catálogo? | ¿Detalle público? |
|---|---|---|
| `published` | Sí | Sí |
| `draft` | No | 404 |
| `proposal_selected` | No (ya no admite propuestas) | 404 |
| `contracted` | No | 404 |
| `closed` | No | 404 |

"Admite propuestas" = `published`; "se muestra" = `published`. Los dos conjuntos coinciden, no hay estados "visibles pero cerrados" (sin `closed` público: no hay historial público en el MVP). Consecuencia aceptada: un desarrollador que ya propuso y cuyo proyecto pasa a `proposal_selected` recibe 404 en el enlace público; verá su propuesta en su panel (spec 013).

### RF4. Consulta del catálogo (puntos 3 y 4)

```ts
listPublicProjects(query: PublicCatalogQuery): Promise<PublicCatalogPage>
getPublicProject(id: string): Promise<PublicProject | null>      // null = inexistente, no publicado o id mal formado
isProjectOwner(projectId: string, userId: string): Promise<boolean>
export const PUBLIC_CATALOG_PAGE_SIZE = 12;
```

Todas `import "server-only"`.

**Filtros** (todos opcionales, combinados con AND, siempre sobre `isPublished`):

| Filtro | Param URL | Valores | Semántica |
|---|---|---|---|
| Texto | `q` | texto libre, recortado, <= 80 caracteres | Se separa por espacios en hasta 5 términos (cada uno <= 40). Cada término debe aparecer (AND) en título **o** descripción **o** alguna tecnología (OR). Ver "Búsqueda" |
| Categoría | `category` | `all` o un elemento de `PROJECT_CATEGORIES` | Igualdad de texto. `Otros` incluye además las categorías históricas (RF11) |
| Presupuesto máximo | `budgetMax` | USD con hasta 2 decimales (`usdToCents`), entre `PROJECT_LIMITS.budgetCents` | `projects.budget_max_cents <= X`: proyectos cuyo tope de presupuesto no supera X (ver D-D) |
| Plazo | `weeks` | `4`, `8`, `12`, `26` (select con opciones fijas) | `projects.timeline_weeks <= N` ("hasta N semanas") |

**Búsqueda: ILIKE, no full-text (decisión D-A).**

- Spec 003 (alcance) descartó expresamente "búsqueda de texto completo, índice GIN de tecnologías" por YAGNI; los únicos índices del catálogo son los dos parciales btree (`projects_catalog_recent_idx` sobre `(published_at desc, id desc) where status='published'` y `projects_catalog_category_idx` sobre `(category, published_at desc) where status='published'`). Ningún índice btree sirve a `ILIKE '%x%'`, y full-text exigiría una migración (columna `tsvector`/índice GIN, configuración de idioma `spanish` vs. términos técnicos como "Node.js", "C#") que esta spec prohíbe.
- Con `ILIKE`, el conjunto escaneado ya está acotado por los índices parciales a las filas `published` (el catálogo, no la tabla completa). A volúmenes de MVP (cientos o pocos miles de proyectos publicados) es suficiente.
- Umbral de revisión: si el catálogo publicado supera unos pocos miles de filas o la latencia de `/projects?q=` se degrada, abrir spec con `pg_trgm` + índice GIN (migración) antes que full-text (preserva la semántica de subcadena y términos técnicos).
- Tecnologías: `exists (select 1 from unnest("projects"."technologies") as tech where tech ilike $p)` por término (no `array_to_string`, para no emparejar a través de separadores). Columnas calificadas en el SQL crudo.
- Escape de comodines (punto 5): `escapeLikeTerm(term)` reemplaza `\` -> `\\`, `%` -> `\%`, `_` -> `\_`; el patrón es `%${escaped}%`. PostgreSQL usa `\` como escape por defecto en `LIKE/ILIKE` y el valor viaja siempre como parámetro (nunca interpolado): sin inyección SQL ni comodines del usuario. Se usa `ilike()` de drizzle con ese patrón; el test PGlite demuestra que `%` y `_` literales funcionan y que `50%` no equivale a `50` + cualquier cosa.

**Orden** (`sort`): `recent` (default): `published_at desc, id desc` (coincide con `projects_catalog_recent_idx`); `budget_asc` / `budget_desc`: `budget_max_cents asc|desc, published_at desc, id desc`. Desempate por `id` siempre (orden total estable, sin duplicados ni saltos entre páginas). Los órdenes por presupuesto no usan índice (aceptado a este volumen).

**Paginación: offset (decisión D-B).** `page` (>= 1), tamaño fijo 12 (constante; no controlable por URL; encaja en la rejilla 1/2/3 columnas del diseño), `limit 12 offset (page-1)*12`, más `count(*)::int` con el mismo `where`. Se descarta keyset/cursor: la UI es "Anterior / Página X de Y" con salto directo, el orden es variable (recientes o presupuesto) y combinado con filtros arbitrarios el cursor exigiría un cursor por cada orden sin beneficio a este volumen (misma justificación que 005 RF6). Riesgo conocido: con inserciones concurrentes una tarjeta puede repetirse o saltarse entre páginas; aceptable en un catálogo público de bajo volumen.

**Página fuera de rango:** `page > totalPages` con `total > 0` devuelve `items: []` y `page` tal cual (la UI lo muestra, RF9); `page` se limita a 1..10_000 en el schema (evita offsets enormes).

### RF5. Validación de `searchParams` (punto 5)

`src/modules/projects/schemas/public-catalog.schema.ts` (mismo patrón que `projectListQuerySchema`: valores inválidos o ausentes caen al default con `.catch`, nunca error ni 400):

```ts
parsePublicCatalogQuery(raw: Record<string, string | string[] | undefined>): PublicCatalogQuery
// PublicCatalogQuery = { q: string; terms: string[]; category: "all" | ProjectCategory; budgetMaxCents: number | null;
//                        weeks: 4 | 8 | 12 | 26 | null; sort: "recent" | "budget_asc" | "budget_desc"; page: number }
escapeLikeTerm(term: string): string
buildCatalogHref(query: PublicCatalogQuery, patch?: Partial<PublicCatalogQuery>): string   // "/projects" + params no-default; cambiar un filtro reinicia page a 1
```

- Arrays (`?q=a&q=b`): se toma el primer valor (normalización antes del schema).
- `q`: `trim`, espacios colapsados, truncado a 80, términos únicos (sin distinguir mayúsculas), máx. 5. Vacío -> sin filtro.
- `category`: `z.enum(["all", ...PROJECT_CATEGORIES]).catch("all")` (un texto no incluido en la lista, incluido el histórico, no es un valor válido de filtro).
- `budgetMax`: `usdToCents`; `null` si no parsea o está fuera de `PROJECT_LIMITS.budgetCents` (se ignora el filtro, sin error).
- `weeks`: enum de strings -> número; otro valor -> `null`.
- `sort`, `page`: como arriba.
- `buildCatalogHref` omite parámetros con valor por defecto (URLs limpias y canónicas) y serializa `budgetMax` con `centsToUsd`.

### RF6. Rutas y colisión con rutas privadas (punto 6)

| Ruta | Archivo | Acceso |
|---|---|---|
| `/projects` | `src/app/projects/page.tsx` | pública, sin guard |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | pública, sin guard (el guard sigue en `/projects/[id]/edit`, spec 005) |

- Colisión con `/projects/new` (D-I de 005): en App Router un segmento estático (`new`) tiene prioridad sobre uno dinámico (`[id]`) en el mismo nivel; `/projects/new` sigue resolviendo a `src/app/projects/new/page.tsx` y `/projects/[id]/edit` es un sub-segmento distinto de `/projects/[id]`. Defensa adicional independiente: `[id]` se valida con `z.uuid()` y `"new"` no es un UUID, así que aunque el enrutado cambiara nunca llegaría a BD (404). AC11 lo verifica con `npm run build` (la tabla de rutas muestra las cuatro) y manualmente.
- Alcance de las convenciones de archivo: `loading.tsx`, `error.tsx` y `not-found.tsx` colocados en `src/app/projects/` o en `src/app/projects/[id]/` se aplicarían también a `/projects/new` y `/projects/[id]/edit` (privadas, spec 005) y cambiarían su comportamiento. Por eso **esta spec no crea ninguno de esos tres archivos**: la carga se resuelve con `<Suspense>` dentro de la página, el error del catálogo se muestra inline, y el 404 usa el de Next por defecto (D-H). Además, según `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` (Status Codes), una página con `loading.tsx` que llame a `notFound()` responde HTTP 200 + `noindex`; sin `loading.tsx` en `[id]` el 404 del detalle conserva el estado HTTP 404.
- `params` y `searchParams` son `Promise` (Next 16): se hace `await`.
- Páginas delgadas: validan/parsean, llaman al servicio (o componente de módulo) y componen. Sin lógica de negocio.

### RF7. Metadata/SEO básica (punto 7)

- `/projects`: `export const metadata` estático: título "Proyectos de desarrollo web | Nexora", descripción corta en español. Sin canonical ni OG images (el layout raíz no define `metadataBase`; añadirlo es decisión de la spec de landing/despliegue).
- `/projects/[id]`: `generateMetadata({ params })` con `getPublicProject(id)`. Si existe: `title: "<título> | Nexora"`, `description` = primeros ~160 caracteres de la descripción con saltos de línea colapsados, `openGraph: { title, description, type: "website" }`. Si es `null` (inexistente, no publicado o id inválido): `title: "Proyecto no encontrado | Nexora"` idéntico para los tres casos (no revela existencia). La página llama a `notFound()`.
- `getPublicProject` se envuelve con `cache` de React (patrón de `getCurrentUser`) para que `generateMetadata` y la página compartan una sola consulta por petición (guía "Metadata", sección de deduplicación). Los argumentos son primitivos (`id`), por lo que `cache` los memoiza.
- Texto del usuario siempre como texto de React (sin `dangerouslySetInnerHTML`); la metadata la escapa Next.

### RF8. Render y caché en Next 16 (punto 8)

Verificado en `node_modules/next/dist/docs/` (Next `16.3.8`): `next.config.ts` **no** activa `cacheComponents`; aplica el "modelo anterior" (`02-guides/caching-without-cache-components.md`): sin `fetch`, nada se cachea entre peticiones salvo que se use `unstable_cache`/segment config; `use cache` solo existe con `cacheComponents` (`01-getting-started/08-caching.md`).

Decisión (D-C): **render dinámico por petición, sin caché entre peticiones en esta spec.**

- `/projects` lee `searchParams` (dinámico por definición) y `/projects/[id]` lee la sesión de Clerk (cookies, dinámico). Ambas páginas son dinámicas y la proyección pública se consulta en cada petición.
- Por qué no cachear ahora: (1) la consistencia importa más que el ahorro: un proyecto que pasa a `proposal_selected`/`closed` debe desaparecer del catálogo de inmediato (R3, BRIEF §7 regla 3); con revalidación temporal un desarrollador podría ver y abrir una oportunidad ya cerrada; (2) cachear exigiría `revalidatePath`/`revalidateTag` desde las actions de 005 y de 008-010 (acoplamiento nuevo); (3) las consultas son PK/índice parcial sobre pocas filas.
- Cómo se evita filtrar datos privados o cachear contenido por usuario: la separación es estructural. `public-catalog.service.ts` (datos públicos, sin actor, sin auth) y `public-viewer.service.ts` (estado del usuario) son archivos distintos; el estado por rol vive solo en `proposal-cta.tsx`, que no recibe datos del proyecto salvo `projectId`. Los datos del proyecto nunca dependen del usuario, así que si en el futuro se cachea (`use cache` con `cacheComponents` o `unstable_cache`), se cachea únicamente `getPublicProject`/`listPublicProjects` (claves = `id`/`query`), nunca `public-viewer`. Regla para specs futuras: no leer `cookies()`/`headers()`/`auth()` dentro de una función cacheada.
- `revalidatePath` público (mencionado en "Próximas fases" de 005): **no es necesario** mientras no haya caché. 005 no se modifica.
- Streaming: la lista de resultados va en un `<Suspense key={<query serializada>}>` dentro de la página (filtros y cabecera se pintan de inmediato) con un skeleton propio (RF9). No se usa `loading.tsx` (ver RF6).

### RF9. Estados vacío / carga / error / fuera de rango, accesibilidad y responsive (punto 9)

Estados del catálogo (`EmptyState`; el componente usa `<h2>`, los títulos de página son `<h1>`):

| Situación | UI |
|---|---|
| Carga de resultados | Skeleton de 6 tarjetas (`animate-pulse`, bloques simples; respeta `prefers-reduced-motion` con `motion-reduce:animate-none`) dentro del `Suspense` |
| Sin proyectos publicados y sin filtros | "Aún no hay proyectos publicados" + texto "Vuelve pronto para ver nuevas oportunidades" |
| Filtros sin resultados | "No encontramos proyectos con estos filtros" + enlace "Limpiar filtros" (`/projects`) |
| `page > totalPages` | "No hay proyectos en esta página" + enlace "Ir a la primera página" (mismo patrón que 005); HTTP 200 |
| Error de BD al listar | `try/catch` dentro del componente de resultados: `EmptyState` con "No pudimos cargar los proyectos" y enlace "Reintentar" a la misma URL; sin detalles técnicos; error registrado en servidor |
| Detalle inexistente/no publicado/id inválido | `notFound()` (404 de Next, igual en los tres casos) |
| Error de BD en el detalle | Propaga al manejador de errores por defecto de Next (sin `error.tsx` propio, ver RF6) |

Accesibilidad y responsive (la UI sigue los artboards; a 390 px una sola columna sin scroll horizontal):

- Landmarks: `<header>` (SiteHeader con `<nav aria-label="Principal">`), `<main>`, un único `<h1>` por página. Filtros en `<form role="search" method="get" action="/projects">` (funciona sin JavaScript: sin componente cliente), cada control con `<Label>` asociado; botón "Aplicar" y enlace "Limpiar".
- Tarjeta: el título es el único enlace (con `after:absolute after:inset-0` para que toda la tarjeta sea clicable), foco visible (`focus-visible:ring-3 ring-[#183D30]/40`), "Ver detalles" decorativo (`aria-hidden`); tecnologías como lista (`<ul>`) con máximo 4 visibles y "+N" si hay más; presupuesto "min – max" (un solo valor si son iguales) y plazo en semanas; fecha de publicación absoluta con `Intl.DateTimeFormat("es", { dateStyle: "medium" })` (determinista, sin fecha relativa).
- Rejilla de resultados: 1 columna (< 640 px), 2 (`sm`/`md`), 3 (`lg`). Filtros apilados a 390 px, en fila desde `md`. Controles de >= 40 px de alto. Paginación como `<nav aria-label="Paginación">` con enlaces "Anterior"/"Siguiente", "Página X de Y" y `aria-current="page"` donde aplique.
- Detalle: dos columnas en escritorio (descripción a la izquierda; panel con presupuesto, plazo, categoría y `ProposalCta` a la derecha); en móvil una columna con el panel antes de la descripción larga. Enlace "Volver a proyectos".
- Contraste: texto `#202522`/`#535E56` sobre `#F5F6F2`/blanco; primario `#183D30`; bordes `#E3E8E3`; chips `#DCE6DE`. Tarjetas con radio 10-14 px, sin sombras pesadas (NEXORA-LANDING-DESIGN §3).
- Contenido en español, sin afirmar verificación de desarrolladores, custodia, ni garantías.

### RF10. Header público mínimo y recomendación de landing (punto 10)

`src/components/shared/site-header.tsx` (en `shared`: sin lógica de dominio, solo navegación):

- Wordmark "Nexora" (enlace a `/`), enlace "Proyectos" (`/projects`, `aria-current` cuando aplica), y a la derecha: sin sesión -> "Iniciar sesión" (`/sign-in`) y "Registrarse" (`/sign-up`); con sesión -> el control de usuario de Clerk (`UserButton`).
- Para mostrar una u otra variante se usan los componentes de sesión de `@clerk/nextjs` (instalado `^7.9.17`; el developer verifica en `node_modules/@clerk/nextjs` si en esa versión el componente es `Show`/`SignedIn`/`SignedOut`) para no consultar la BD de usuarios en el catálogo.
- Responsive: una sola fila compacta a 390 px (wordmark + enlace + acciones; textos cortos; sin menú hamburguesa, YAGNI con 3-4 elementos).
- **Se renderiza dentro de las dos páginas públicas, no en `src/app/layout.tsx`.** Razón: el layout raíz envuelve también las páginas privadas de 005 (`/dashboard/projects`, `/projects/new`, `/projects/[id]/edit`), que hoy no tienen header; modificarlo cambiaría pantallas fuera del alcance. Sin "Publicar proyecto" en el header (a un `developer`, `/projects/new` le daría 404; el CTA correcto por rol pertenece al header completo, D-H).
- Recomendación de cuándo incorporar landing/header completo: ver D-H.

### RF11. Categoría histórica fuera de la lista (punto 11; nota del reviewer de 005)

`category` es texto libre en BD y `publishProject` valida contra `PROJECT_CATEGORIES`, pero una lista modificada en el futuro puede dejar filas `published` con una categoría que ya no está en la lista. Comportamiento (D-E):

- Catálogo sin filtro de categoría: se muestra normalmente, con el texto guardado como chip de categoría (no se oculta ni se reescribe). Nunca lanza error.
- Filtro `category=<elemento de la lista>`: igualdad de texto.
- Filtro `category=Otros`: coincide con `category = 'Otros' OR category NOT IN (<PROJECT_CATEGORIES>)`, de modo que los históricos son localizables en un único cubo y no quedan huérfanos. El chip de la tarjeta sigue mostrando el texto original.
- Una URL con `category=<valor no listado>` cae a `all` (el filtro solo acepta valores de la lista).
- El detalle muestra el texto guardado. Sin migración ni normalización de datos.

## 4. Requisitos no funcionales

- `public-catalog.service.ts` y `public-viewer.service.ts` importan `server-only`. La lógica (predicado `published`, filtros, escape, proyección) vive en el servicio, no en páginas ni componentes.
- Sin dependencias npm nuevas, sin variables de entorno nuevas, sin migraciones, sin `layout.tsx`/`globals.css`/`next.config.ts` tocados.
- Sin JavaScript de cliente propio: filtros por formulario GET y enlaces; solo hidratan los componentes de Clerk del header.
- Rendimiento: 2 consultas por catálogo (count + página) y 1 por detalle (+1 PK para el estado de propiedad solo si el visitante es `client`).
- Archivos pequeños y por responsabilidad (SETUP §2): schema valida/serializa URL, servicio consulta, componentes renderizan, páginas componen.

## 5. Reglas de negocio

- R1. Solo `published` es visible en catálogo y detalle (BRIEF §7 reglas 1 y 3; `state-machines.md §1`).
- R2. Visibilidad pública para visitantes y autenticados de cualquier rol (`can(null, "catalog.view")` es `true`).
- R3. Ningún dato privado sale del servicio (RF2); la lista blanca es parte del contrato y está probada.
- R4. Un proyecto deja de mostrarse en el mismo instante en que deja de estar `published` (sin caché, RF8).
- R5. Recurso inexistente, no publicado o id mal formado: respuesta indistinguible (404 y mismo título de metadata).
- R6. El detalle no ofrece acciones sobre propuestas por sí mismo: solo mensajes y enlaces por rol hacia flujos existentes; el envío es de 007.
- R7. Ningún texto menciona pagos, custodia, garantías ni dinero real (I5, BRIEF §6.5).

## 6. Modelo de datos y migraciones

Sin cambios de esquema ni migraciones. Se usan las columnas de `projects` ya existentes y los índices parciales de la spec 003 (`projects_catalog_recent_idx`, `projects_catalog_category_idx`). El plan de búsqueda/índices adicionales está diferido (D-A).

## 7. Contratos de servidor o API

Servicios (RF4 y RF1). Sin route handlers ni server actions nuevos (solo lectura; el formulario del catálogo es un GET a la propia página).

```ts
// public-catalog.service.ts (sin actor; nunca lanza AuthError)
listPublicProjects(query: PublicCatalogQuery): Promise<PublicCatalogPage>
getPublicProject(id: string): Promise<PublicProject | null>         // React cache()
isProjectOwner(projectId: string, userId: string): Promise<boolean> // solo booleano; clientId nunca sale del servicio

// public-viewer.service.ts
resolvePublicViewer(projectId: string): Promise<PublicViewer>
// getCurrentUser() -> usuario: { kind:"user", role, isOwner: role==="client" && await isProjectOwner(...) }
// sin fila pero con sesión (getSessionUserId) -> { kind:"needs_onboarding" }
// sin sesión -> { kind:"visitor" }
```

Estado por rol en el detalle (componente `ProposalCta`, recibe `{ projectId, viewer }`; **este archivo es el punto de extensión de 007**: la spec 007 lo modifica para el caso `developer` y no toca nada más del detalle):

| `PublicViewer` | Qué muestra |
|---|---|
| `visitor` | "Inicia sesión para enviar una propuesta" + enlace a `/sign-in?redirect_url=/projects/<id>` (ver D-G) y a `/sign-up` |
| `needs_onboarding` | "Completa tu registro para enviar propuestas" + enlace a `/onboarding` |
| `user` con `developer` | Placeholder no interactivo: "El envío de propuestas estará disponible pronto" (sin botón falso). 007 lo sustituye por el formulario/estado de su propuesta |
| `user` con `client` y `isOwner` | "Este es tu proyecto" + enlaces a `/projects/<id>/edit` y `/dashboard/projects` (rutas ya existentes de 005) |
| `user` con `client` y no dueño | "Los clientes no envían propuestas" (texto neutro, sin revelar nada del dueño) |
| `user` con `admin` | No muestra CTA (solo lectura, D8) |

El componente no recibe `clientId`, estado ni propuestas; no existe lógica de propuestas en 006.

## 8. Permisos y seguridad

- Autorización en servidor: lectura pública para todos; ninguna escritura. El servicio no confía en la UI para filtrar: el predicado `published` y la proyección están en SQL.
- Privacidad (BRIEF §7 regla 8, system-design §3): nunca se leen ni exponen `clientId`, nombre, email ni contacto; `isProjectOwner` devuelve un booleano calculado en SQL.
- Entradas: todo `searchParams` pasa por Zod con `.catch`; `id` de ruta por `z.uuid()` (en la página y dentro de `getPublicProject`, que devuelve `null` ante un id inválido para no depender del llamador y no provocar un error de cast `uuid` en Postgres).
- Inyección: consultas siempre parametrizadas (drizzle); escape de `%`, `_`, `\` para `ILIKE`. Longitud de `q` y número de términos acotados (anti-abuso del patrón `%...%`).
- XSS: solo texto de React.
- Enumeración: 404 indistinguible entre inexistente y no publicado; `generateMetadata` no varía.
- Sin `requireUser` en rutas públicas (spec 004 RF4); `proxy.ts` no cambia (el matcher ya pasa estas rutas por `clerkMiddleware()` sin protegerlas, solo para exponer la sesión a `auth()`).
- Rate limiting de la búsqueda pública: spec 015.

## 9. Estados, errores y casos límite

- `q` con solo comodines (`%`, `_`, `\`) -> se escapan y buscan literalmente; con solo espacios -> sin filtro.
- `q` de 200 caracteres -> se trunca a 80; más de 5 términos -> se usan los 5 primeros.
- `budgetMax=abc`, `-1`, `1,000`, `1e3`, `0.001` -> filtro ignorado. `budgetMax` por encima del máximo del dominio -> ignorado.
- `weeks=7` -> ignorado. `sort=foo` -> `recent`. `page=0`, `page=-3`, `page=abc`, `page=999999` -> `1` (o fuera de rango con `items: []` si es válida pero excede `totalPages`).
- Parámetros repetidos (`?category=a&category=b`) -> primer valor.
- Proyecto publicado cuya categoría ya no está en la lista (RF11) -> visible; localizable con `Otros`.
- Proyecto `published` con `publishedAt` nulo (no lo produce 005, pero la columna es nullable): se lista (ordena al principio por `desc`, comportamiento de Postgres); la UI omite la fecha. No se endurece el esquema aquí.
- Proyecto que se despublica/cierra entre que el usuario ve el catálogo y abre el detalle: 404 (R4).
- Usuario con sesión pero sin onboarding en el detalle: `needs_onboarding`, nunca error.
- `getCurrentUser()` falla (BD de usuarios caída) en el detalle: propaga a la página de error de Next; los datos públicos no deben degradarse por el estado del usuario -> `resolvePublicViewer` captura el error y devuelve `{ kind: "visitor" }` solo para fallos inesperados no-`AuthError` (el detalle público sigue legible; se registra el error). Se prueba.
- Descripción con saltos de línea: el detalle los respeta (`whitespace-pre-line`); la tarjeta y la metadata los colapsan.
- Doble clic/navegación atrás: sin estado cliente, sin efectos.

## 10. Criterios de aceptación verificables

- AC1. `listPublicProjects` devuelve solo proyectos `published`; con proyectos sembrados en `draft`, `proposal_selected`, `contracted` y `closed` ninguno aparece ni cuenta en `total`.
- AC2. Cada elemento de `items` tiene exactamente las claves de `PublicProjectSummary` (`id, title, category, summary, budgetMinCents, budgetMaxCents, timelineWeeks, technologies, publishedAt`) y el resultado de `getPublicProject` exactamente las de `PublicProject`; ninguno contiene `clientId`, `status`, `currency`, `createdAt`, `updatedAt`, `closedAt`, `contractedAt` ni datos de usuario (comparación de `Object.keys`). `summary` tiene <= 240 caracteres.
- AC3. `getPublicProject` devuelve `null` para un proyecto `draft`, `proposal_selected`, `contracted` o `closed`, para un UUID inexistente y para un id mal formado (sin lanzar); devuelve la proyección para uno `published`.
- AC4. Filtros: `category` devuelve solo esa categoría; `Otros` incluye también un `published` con categoría histórica fuera de la lista; `budgetMaxCents` devuelve solo proyectos con `budget_max_cents <=` el valor; `weeks` solo `timeline_weeks <=` el valor; los filtros se combinan con AND.
- AC5. Búsqueda: encuentra por título, por descripción y por tecnología, sin distinguir mayúsculas; varios términos exigen todos (AND) en cualquier campo; un término con `%` o `_` se trata literalmente (`"100%"` no encuentra un título que solo contiene `1005`; `"a_b"` no encuentra `"aXb"`); un término con `\` no rompe la consulta; un texto con comillas/`;` no altera la consulta.
- AC6. Orden: `recent` por `publishedAt` desc con desempate por `id` desc; `budget_asc`/`budget_desc` por `budget_max_cents` con desempate estable; dos proyectos con el mismo `publishedAt` o presupuesto mantienen orden determinista entre páginas.
- AC7. Paginación: páginas de 12; `total` y `totalPages` correctos; la página 2 no repite elementos de la 1; una página fuera de rango devuelve `items: []` sin error.
- AC8. `parsePublicCatalogQuery`: defaults ante cualquier entrada inválida (tabla de casos de la sección 9), primer valor de arrays, `q` normalizada/truncada y con <= 5 términos, `budgetMax` convertido a centavos con `usdToCents` y ignorado fuera de rango; `escapeLikeTerm` escapa `\`, `%`, `_`; `buildCatalogHref` omite defaults y reinicia `page` al cambiar un filtro (y round-trip con `parsePublicCatalogQuery`).
- AC9. `isProjectOwner` devuelve `true` solo para el cliente dueño y `false` para otro usuario o un proyecto inexistente. `resolvePublicViewer` devuelve `visitor` sin sesión, `needs_onboarding` con sesión sin fila, `user` con `isOwner` correcto para `client` y `isOwner: false` para `developer`/`admin`, y `visitor` si `getCurrentUser` lanza un error inesperado.
- AC10. `/projects` y `/projects/[id]` responden 200 sin sesión (verificación manual y build); `/projects/[id]` con un proyecto no publicado y con un UUID inexistente responden 404 con la misma página; `/projects/not-a-uuid` responde 404; `curl -I` de un id inexistente devuelve estado 404 (no 200).
- AC11. `/projects/new` y `/projects/[id]/edit` siguen resolviendo a las páginas privadas de 005 (con sesión `client`: formulario; sin sesión: redirigen a `/sign-in`), y la tabla de rutas de `npm run build` lista `/projects`, `/projects/[id]`, `/projects/new` y `/projects/[id]/edit`. Esta spec no crea `loading.tsx`, `error.tsx` ni `not-found.tsx` en `src/app/projects/**`.
- AC12. El detalle muestra el estado correcto por rol (tabla de la sección 7): visitante, sin onboarding, `developer`, `client` dueño (enlaces a `/projects/<id>/edit` y `/dashboard/projects`), `client` ajeno y `admin`; no contiene formulario ni lógica de propuestas; `proposal-cta.tsx` es el único punto de variación (verificación manual con cada rol + revisión de código).
- AC13. Estados: skeleton durante la carga, vacío (sin proyectos / filtros sin resultados / página fuera de rango) y error inline con "Reintentar" funcionan; los filtros son un formulario GET que conserva su estado en la URL y funciona sin JavaScript; paginación/orden/filtros son enlaces que reflejan `searchParams`.
- AC14. Metadata: `/projects` tiene `title` y `description`; `/projects/[id]` genera `title` con el título del proyecto, `description` recortada y `openGraph`; para el no encontrado el `title` es genérico e idéntico en los tres casos de 404; `getPublicProject` se consulta una sola vez por petición (`cache`).
- AC15. Ningún texto de la UI pública menciona clientes por nombre, email, contacto, pagos, custodia o garantías; el HTML renderizado de ambas páginas no contiene `clientId` ni el email/nombre del cliente (inspección de fuente, dueño sembrado con nombre y email identificables).
- AC16. Accesibilidad y responsive a 390 px: sin scroll horizontal, un `<h1>` por página, controles etiquetados, foco visible en enlaces/controles, tarjeta clicable por su título, tamaños táctiles >= 40 px, `aria-current` en paginación y navegación (verificación manual en 390, 768 y 1280 px).
- AC17. La UI coincide con los artboards "Catálogo de proyectos", "Detalle de proyecto + propuesta" y sus vistas móviles en jerarquía y tokens (revisión humana; el agente spec no pudo abrir el artifact).
- AC18. `npm run lint`, `npm run test` y `npm run build` pasan; ningún test usa red, Clerk ni Neon reales; `package.json`, `package-lock.json`, `src/app/layout.tsx`, `next.config.ts` y `src/proxy.ts` no cambian; no se añadieron componentes shadcn.

## 11. Pruebas requeridas

Vitest, junto al archivo, `// @vitest-environment node` donde no haya DOM (SETUP §3: sí tests en services y schemas; no obligatorios en componentes presentacionales ni páginas).

- `src/modules/projects/schemas/public-catalog.schema.test.ts` (AC8): defaults por cada parámetro inválido, arrays, bordes de `q` (80 caracteres, 5 términos, solo espacios, solo comodines), `budgetMax` (`"1500"`, `"1500.5"`, `"abc"`, `"1,5"`, `"-1"`, `"1e3"`, fuera de rango), `weeks`, `sort`, `page` (0, -1, `abc`, 10001), `category` válida/inválida; `escapeLikeTerm`; `buildCatalogHref` (omisión de defaults, reinicio de página, codificación de `Frontend & UI/UX`, round-trip).
- `src/modules/projects/services/public-catalog.service.test.ts` con `createTestDb()` (PGlite, migraciones reales; mock de `@/lib/db/client` y `server-only` como en `project.service.test.ts`), sembrando un cliente y proyectos en los cinco estados, varias categorías (incluida una histórica no listada), presupuestos, plazos, tecnologías, títulos con `%`, `_`, `\`, y `publishedAt` repetidos: AC1-AC7 y la parte de `isProjectOwner` de AC9. Verifica además que una descripción de 5000 caracteres produce `summary` <= 240.
- `src/modules/projects/services/public-viewer.service.test.ts` (AC9): `getCurrentUser`, `getSessionUserId` y `isProjectOwner` mockeados en el borde (módulos `@/modules/auth/services/current-user.service`, `@/modules/auth/services/clerk-identity.service` y `./public-catalog.service`); `server-only` mockeado.
- No requieren test unitario: componentes presentacionales (`public-project-card`, `public-catalog-filters`, `public-catalog-skeleton`, `public-project-detail`, `proposal-cta`, `public-catalog-results`, `site-header`) y las dos páginas. Si el developer lo considera valioso, un test RTL de `proposal-cta.tsx` (6 variantes de `PublicViewer`) aporta porque es la tabla de decisión por rol de AC12 y el punto de extensión de 007; es opcional.
- Verificación manual (humano tras T4): AC10-AC17 con sesión de visitante, `developer`, `client` dueño, `client` ajeno y `admin`; probar `/projects?q=100%25`, un filtro por categoría con `&`, y `curl -I` de un id inexistente.

## 12. Dependencias y riesgos

- Dependencias npm: **ninguna**. Se descartan `react-query`/`axios` (lecturas en Server Components), `@tanstack/react-table` (rejilla de tarjetas con enlaces), `nuqs` o similares (los `searchParams` se parsean con Zod, como en 005), `react-hook-form` (el formulario de filtros es un GET nativo). Componentes shadcn: ninguno nuevo (`button`, `input`, `label`, `native-select`, `badge` ya generados en 005).
- Riesgos:
  1. `ILIKE '%x%'` sin índice: aceptado a volumen de MVP; umbral y alternativa (`pg_trgm`) en D-A.
  2. Offset con inserciones concurrentes puede repetir/saltar una tarjeta (D-B); aceptado.
  3. Sin caché cada visita consulta la BD (D-C); aceptado a este volumen; el diseño permite cachear después solo la parte pública.
  4. `notFound()` dentro de un segmento con `loading.tsx` daría 200 + `noindex`: se evita no creando `loading.tsx` (RF6); si en el futuro se añade, revisar.
  5. Header duplicado por página hasta que exista el layout global (D-H); deuda corta y acotada (un componente).
  6. El `redirect_url` de Clerk puede no estar habilitado con la configuración de 004 (D-G).
  7. No se pudo abrir el artifact de diseño: posibles diferencias de detalle visual, cubiertas por AC17.
  8. Un 404 por defecto de Next no tiene marca Nexora (D-H).

## 13. Tareas y archivos

Máximo 5; cada archivo pertenece a una sola tarea. No hay T0: no se instala nada, no se tocan `package.json`, `layout.tsx`, `globals.css` ni `src/components/ui`. Durante el bloque paralelo nadie corre `npm install` ni `npm run build`; el reviewer corre el build al final.

### T1 — Tipos y schema de query (serial, contrato base)

- Archivos: `src/modules/projects/types/public-project.types.ts`, `src/modules/projects/schemas/public-catalog.schema.ts`, `src/modules/projects/schemas/public-catalog.schema.test.ts`.
- Depende de: —
- Paralelizable: no (T2 y T3 importan sus contratos)
- Cubre: AC8

### T2 — Servicios de lectura pública y estado del visitante

- Archivos: `src/modules/projects/services/public-catalog.service.ts`, `src/modules/projects/services/public-catalog.service.test.ts`, `src/modules/projects/services/public-viewer.service.ts`, `src/modules/projects/services/public-viewer.service.test.ts`.
- Depende de: T1
- Paralelizable: sí (con T3: archivos disjuntos; T3 solo usa los tipos de T1)
- Cubre: AC1-AC7, AC9

### T3 — Componentes presentacionales y header

- Archivos: `src/modules/projects/components/public-project-card.tsx`, `src/modules/projects/components/public-catalog-filters.tsx`, `src/modules/projects/components/public-catalog-skeleton.tsx`, `src/modules/projects/components/public-project-detail.tsx`, `src/modules/projects/components/proposal-cta.tsx`, `src/components/shared/site-header.tsx`.
- Depende de: T1 (tipos, `buildCatalogHref`, `PROJECT_CATEGORIES`)
- Paralelizable: sí (con T2)
- Cubre: AC12 (parte de UI), AC13 (parte), AC15, AC16 (verificación manual; sin tests obligatorios)

### T4 — Resultados del catálogo y páginas

- Archivos: `src/modules/projects/components/public-catalog-results.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`.
- Depende de: T1, T2, T3
- Paralelizable: no (integra los tres anteriores)
- Cubre: AC10, AC11, AC12-AC14, AC17, AC18 (verificación manual y build)

## 14. Decisiones pendientes (con recomendación) y estado de aprobación

Estado de aprobación: **aprobada** por el humano con las recomendaciones por defecto de D-A a D-J. Respuestas a las preguntas abiertas: se aplican las recomendaciones de la spec (categoría de selección única, plazo con umbrales "hasta N", sin conteo de propuestas en el detalle, fecha absoluta); el artboard es solo referencia visual, no un contrato.

- D-A. Búsqueda de texto. Recomendación: `ILIKE` por términos sobre título, descripción y tecnologías, sin cambios de esquema (spec 003 descartó full-text y GIN; los índices del catálogo son btree parciales que no sirven a subcadenas). Alternativa: `pg_trgm` + GIN (migración, preserva subcadenas y términos técnicos como "Node.js") cuando el catálogo crezca; full-text `spanish` (peor para términos técnicos, migración y columna `tsvector`). Umbral de revisión: unos pocos miles de proyectos `published` o latencia de búsqueda degradada.
- D-B. Paginación. Recomendación: offset, 12 por página (rejilla 1/2/3), `count` aparte, desempate por `id`. Alternativa: keyset/cursor; descartado por orden variable, UI "Página X de Y" y volumen bajo.
- D-C. Render y caché. Recomendación: dinámico por petición y sin caché entre peticiones (Next 16.3.8 sin `cacheComponents`; frescura inmediata al pasar a `proposal_selected`/`closed`); separación estructural de datos públicos (cacheables en el futuro) y estado por usuario (nunca cacheable). Alternativa: `unstable_cache` con tags + `revalidateTag` desde las actions de 005/008-010; más rápido pero acopla specs y arriesga mostrar oportunidades cerradas.
- D-D. Semántica del filtro "presupuesto máximo". Recomendación: `budget_max_cents <= X` (el tope del proyecto no supera X; coincide literalmente con el nombre). Alternativa: `budget_min_cents <= X` (proyectos que "empiezan" por debajo de X, más inclusivo) o dos controles mín./máx. (más UI). Confirmar contra el artboard.
- D-E. Categoría histórica. Recomendación: visible en el catálogo, agrupada bajo el filtro `Otros` (`= 'Otros' OR NOT IN (lista)`), texto original en la tarjeta. Alternativa: ocultarla de los filtros y solo mostrarla sin filtro (más simple, pero localizable solo con búsqueda o sin filtro).
- D-F. Plazo como select de umbrales fijos (`4, 8, 12, 26` semanas, "hasta N"). Recomendación: opciones fijas (sin campo numérico libre, UI simple en 390 px). Alternativa: entero libre `1-104` con validación.
- D-G. Retorno tras iniciar sesión desde el detalle. Recomendación: enlace a `/sign-in?redirect_url=/projects/<id>`; si la configuración de Clerk de 004 no lo respeta, degradar a `/sign-in` simple (verificación manual). Alternativa: no pasar `redirect_url` (más simple, peor UX).
- D-H. Header/landing completo. Recomendación: **spec propia (sin número en SDD-PLAN; proponer `006b-landing-and-site-header`) inmediatamente después de 006 y antes o en paralelo con 007** (archivos disjuntos: `src/app/page.tsx`, `src/app/layout.tsx`, header). Motivos: (1) el landing ya puede mostrar "Proyectos recientes" reales y categorías enlazadas con `listPublicProjects` y los parámetros de `buildCatalogHref` (contrato estable: `q`, `category`, `budgetMax`, `weeks`, `sort`, `page`); NEXORA-LANDING-DESIGN §4.3/4.6 prohíbe inventar datos y rutas, algo que solo es posible una vez existe 006; (2) el header global con "Publicar proyecto" y menú por rol necesita `/dashboard` y rutas finales (012/013) para no enlazar a destinos inexistentes, por lo que esa spec puede acotarse a lo que ya existe; (3) al promover `SiteHeader` a `layout.tsx` hay que revisar su efecto en las páginas privadas de 005 y retirar el render por página. Esa spec también absorbe: metadata global (título "Create Next App", `lang="en"` -> `es`, `metadataBase`), 404 global con marca y el menú móvil. No se implementa nada de esto en 006. Alternativa: hacerlo después de 007 (así el header ya conoce el flujo de propuestas), con el coste de mantener el header mínimo por página más tiempo.
- D-I. Orden por presupuesto. Recomendación: por `budget_max_cents` (consistente con el filtro de D-D); alternativa: por `budget_min_cents`.
- D-J. Texto del estado `developer` en el detalle (antes de 007). Recomendación: texto no interactivo "El envío de propuestas estará disponible pronto" (sin botón que no hace nada, NEXORA-LANDING-DESIGN §6). Alternativa: ocultar el panel para `developer` hasta que exista 007.

## Preguntas abiertas

- P1. ¿Los artboards muestran un número de resultados, contador de propuestas, o filtros adicionales (p. ej. rango mínimo de presupuesto)? El agente no pudo abrir el artifact; si hay diferencias con RF4/RF9, ajustar antes de aprobar.
- P2. ¿El filtro "plazo" del diseño es "hasta N semanas" (D-F) o rangos (p. ej. 1-4, 5-8)? Con rangos habría que añadir un límite inferior.
- P3. ¿Debe el detalle público mostrar cuántas propuestas lleva el proyecto? Recomendación: no (dato competitivo y no pedido por el brief; evitaría además cruzar `proposals` en el servicio público). Requiere confirmación si el diseño lo incluye.
- P4. ¿La fecha de publicación se muestra absoluta ("17 oct 2026") o relativa ("hace 3 días")? Recomendación: absoluta (determinista, ya usada en 005).
- P5. ¿Se quiere `noindex` para URLs con filtros/página > 1 (evita contenido duplicado)? No incluido para mantener la metadata básica; añadirlo requiere `generateMetadata` con `searchParams` en `/projects`.

## Próximas fases

- 007 (`proposal-management`): modifica `proposal-cta.tsx` para el caso `developer` y puede añadir una sección de su propia propuesta; inserta propuestas comprobando `status = 'published'` bajo bloqueo (R6 de 005). Hereda el contrato de `PublicViewer`.
- Spec de landing y header global (D-H): usa `listPublicProjects` para "Proyectos recientes", `PROJECT_CATEGORIES` + `buildCatalogHref` para "Categorías populares", promueve `SiteHeader` al layout.
- 008-010: al mover un proyecto fuera de `published` desaparece del catálogo sin acciones adicionales (R4); si se introduce caché (D-C), añadir invalidación en esas transiciones.
- 013: panel del desarrollador con propuestas enviadas (incluye enlaces a proyectos que ya no son públicos).
- 014: refinar estados de carga/error/vacío con el resto de la app (diálogos, mensajes).
- 015: rate limiting de `/projects?q=` y revisión de privacidad de la proyección pública.
- Posible: `pg_trgm` + índice GIN y sitemap/OG/JSON-LD cuando haya dominio y volumen.

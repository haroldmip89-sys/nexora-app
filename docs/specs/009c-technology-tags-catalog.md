# Catálogo de tecnologías (tags) para proyectos

Estado: done. Aprobada por el humano con las recomendaciones por defecto en todas las decisiones y preguntas abiertas (P1–P9).

## Objetivo

Reemplazar el campo libre de tecnologías de un proyecto (hoy `projects.technologies text[]`, texto separado por comas, spec 005 D-H) por una **lista cerrada y compartida** de tags guardada en la base de datos: lenguajes, frameworks, tecnologías y bases de datos mezclados en una sola lista, con una fila final «Otros» para lo que no esté. Así "Java" es siempre el mismo tag (no "java"/"jaba"), los tags son útiles para filtrar y la UI los muestra como botones-mosaico.

Entrega:

- Tablas `technologies` (catálogo, ~50 filas sembradas por migración) y `project_technologies` (N:M), migración Drizzle con seed y conversión de los datos existentes, y retiro de `projects.technologies`.
- Selector multi-tag reutilizable (botones-mosaico) usado en `/projects/new` y `/projects/[id]/edit`.
- Filtro por tags (botones-mosaico) en el catálogo público `/projects`, combinado con los filtros, orden y paginación existentes.
- Tarjetas y detalle público siguen mostrando los tags (por nombre), sin cambios de código en esos componentes.

Contexto de arquitectura consultado: `docs/architecture/system-design.md §2` (entidad proyecto), `§3` (datos en Neon), `§4` (módulos y dependencias; sin módulo nuevo, ver D-C), `§8` (decisiones; se añade D11 en T4). Specs que se extienden: 003 (esquema; `technologies text[]` queda superseded), 005 (formulario, locks de edición en `published`, D-H superseded), 006 (catálogo; la búsqueda por texto sobre tecnologías cambia de implementación, el contrato público no). Orden de specs: va **antes** de 010 (webhooks) y **después** de 009b-global-navigation (ver "Dependencias de orden").

## Alcance

- Incluye:
  - Modelo de datos, migraciones (tablas, seed, backfill, drop de columna) y tests PGlite (`migrations.test.ts`, `constraints.test.ts`, test de backfill).
  - Schemas Zod, tipos, servicios y server actions de `projects` adaptados (`technologies` pasa a ser lista de slugs del catálogo).
  - Componente compartido `TagPicker`, formulario de proyecto, páginas `new`/`edit` (solo para cargar el catálogo).
  - Filtro por tags en `/projects` (parámetro `tech`), estado vacío con filtros, `buildCatalogHref`.
  - Pasos manuales en `docs/MANUAL-TESTS.md`, entidad y decisión en `docs/architecture/system-design.md`.
- No incluye:
  - Perfil del desarrollador: `developer_profiles.technologies` queda igual (texto libre), fuera de alcance.
  - UI de administración del catálogo (alta/baja/renombre de tags): se hace con migraciones SQL (D-F).
  - Texto libre asociado a «Otros»: «Otros» es solo una etiqueta, no se guarda ningún texto.
  - Tags en propuestas, búsqueda por tag desde la tarjeta/detalle (los tags de tarjeta y detalle no son enlaces), sugerencias/autocompletado, categorías o grupos de tags, tags por rol.
  - Cambios en `src/app/layout.tsx`, `src/components/shared/site-header.tsx` (los gestiona 009b), `src/components/ui/**`, `package.json`, `globals.css`. Sin dependencias nuevas ni componentes shadcn nuevos.

## Decisiones de diseño (con recomendación por defecto)

- **D-A. Modelo de datos.** Recomendado: tabla `technologies` + N:M `project_technologies` y **eliminar** `projects.technologies`.

  | Criterio | Tabla + N:M (recomendado) | Conservar `text[]` validado contra la lista |
  |---|---|---|
  | Integridad | FK real: no existe un tag fuera del catálogo; borrar/renombrar un tag es seguro | Nada impide texto inválido en BD (solo la app); renombrar exige reescribir todos los arreglos |
  | Filtro por tag | `exists`/join por `(technology_id, project_id)` con índice btree | Operador `@>`/`&&` sobre `text[]`: sin GIN es secuencial (spec 003 descartó GIN); con GIN exige un índice más |
  | Nombre mostrado | Sale del catálogo (un solo lugar para corregirlo) | Se duplica en cada fila |
  | Coste de cambio | Alto: servicios, form, ~10 archivos de tests con siembra, migración de datos | Bajo: card/detail/búsqueda sin cambios |

  Se asume el coste: es lo que da integridad ("Java único") y base para filtros/estadísticas. El contrato público (`technologies: string[]` de nombres) no cambia, lo que acota el impacto en UI.
- **D-B. Identificador usado en formularios y URL.** El **slug** (`nodejs`, `c-sharp`): estable, legible, sin exponer uuid. El formulario envía `name="technologies"` repetido con el slug; el filtro usa `?tech=react&tech=nodejs`. El servicio resuelve slug -> id.
- **D-C. Ubicación.** Las tablas viven en el módulo `projects` (`src/modules/projects/schema/`). No se crea módulo `technologies` (YAGNI: un solo consumidor; el perfil del desarrollador queda fuera). Si el perfil lo adopta después, se extrae a su módulo con una spec que actualice `system-design.md §4`. El `drizzle.config.ts` ya recoge `src/modules/*/schema/*.table.ts`.
- **D-D. Mínimo y máximo por proyecto.** Mínimo **1** (se mantiene la regla actual de 005), máximo **10** (hoy 15 por ser texto libre; con mosaicos 10 es suficiente y evita proyectos con "todo el catálogo"). «Otros» cuenta como un tag más. El máximo se aplica en el schema Zod y en el servicio, no en la BD.
- **D-E. Semántica del filtro por tags: "todos" (AND).** Seleccionar React y PostgreSQL devuelve proyectos que tienen **ambos**, igual que el resto de filtros del catálogo se combinan con AND. Máximo 5 tags en el filtro (como `maxTerms`). Slug desconocido en la URL = ningún proyecto lo tiene = 0 resultados (no se ignora en silencio). Alternativa (any/OR): ver P2.
- **D-F. Alta de nuevos tags.** Solo por migración (`drizzle-kit generate --custom`). «Otros» siempre al final con `sort_order = 9999`; los demás ordenados por grupo lógico (lenguajes, frontend, backend, bases de datos, móvil, CMS/e-commerce, infraestructura) con `sort_order` de 10 en 10 para poder intercalar. Sin columna de grupo (YAGNI).
- **D-G. Selector con checkboxes nativos, no `aria-pressed`.** Cada mosaico es un `<input type="checkbox">` (clase `sr-only peer`) dentro de un `<label>` con aspecto de botón. Ventajas: funciona sin JavaScript (formulario de server action y GET del catálogo), el estado se envía solo en `FormData`/URL, el estado inicial es `defaultChecked`, y el lector de pantalla anuncia "casilla, marcada" (semántica correcta de selección múltiple). `aria-pressed` sobre un checkbox sería incorrecto y un botón con `aria-pressed` obligaría a estado cliente + inputs ocultos. Se descarta `toggle-group` de shadcn por lo mismo (estado cliente, sin necesidad). El requisito visual ("botones-mosaico como el filtro todos/borrador/publicado") se cumple reutilizando exactamente los tokens del `Chip` de `project-list.tsx`.

## Reutilizar

| Existente | Uso |
|---|---|
| `src/modules/projects/components/project-list.tsx` `Chip` (privado, basado en `Link`) | Referencia de estilo: `inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors`; activo `border-[#183D30] bg-[#183D30] font-medium text-white`; inactivo `border-[#E3E8E3] bg-white text-[#535E56] hover:border-[#183D30]/50`; foco `focus-visible:ring-3 focus-visible:ring-[#183D30]/40`. No se puede importar (privado y atado a `Link`): `TagPicker` copia esas clases como constante propia. No se toca `project-list.tsx`. Posible refactor DRY a un módulo de estilos compartido en una fase posterior |
| `src/modules/projects/schemas/project.schema.ts`: `PROJECT_LIMITS`, `projectInputSchema`, `parseProjectForm`, `dedupeTechnologies`, `PROJECT_FORM_FIELDS` | Se modifican (no se duplican); la regex de slug se exporta desde aquí y la importa `public-catalog.schema.ts` |
| `src/modules/projects/schemas/public-catalog.schema.ts`: `parsePublicCatalogQuery`, `buildCatalogHref`, `PUBLIC_CATALOG_LIMITS` | Se extienden con `technologies` (patrón `.catch`, primer valor/arrays, URLs canónicas) |
| `src/modules/projects/services/project.service.ts`: `loadOwned(..., {lock:true})`, patrón `db.transaction` de `unpublishProject`, `ProjectError` | Escrituras de tags en transacción con el proyecto bloqueado |
| `src/modules/projects/services/public-catalog.service.ts`: `isPublished`, `buildWhere`, `termFilter`, SQL con columnas calificadas (patrón `proposalCountSql`) | Se extiende; el predicado `published` sigue siendo único |
| `src/components/shared/form-field.tsx` | No sirve para el grupo (su `Label htmlFor` apunta a un único control); `TagPicker` usa `fieldset/legend` y replica el patrón hint/error con `aria-describedby` |
| `src/components/shared/empty-state.tsx`, `src/components/ui/label.tsx`, `cn` | Estados vacíos y etiquetas; sin componentes shadcn nuevos (`toggle-group` y `checkbox` existen en el registro, se descartan por D-G) |
| `src/lib/db/test-db.ts` (`createTestDb`, aplica `./drizzle`) y patrón de `constraints.test.ts` / `migrations.test.ts` | Tests de integridad, seed y backfill con PGlite |
| Patrón de test de `public-catalog.service.test.ts` y `project.service.test.ts` (PGlite + mock de `@/lib/db/client` y `server-only`) | Servicios nuevos y modificados |
| `src/lib/db/client.ts` (Neon `Pool`, transacciones interactivas) | `db.transaction` para crear/editar proyecto + tags |

Verificado: no existe ningún catálogo, tag ni selector multi-opción en el repo. Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`): `searchParams` es `Promise<{ [key: string]: string | string[] | undefined }>` y los parámetros repetidos llegan como arreglo; `src/app/projects/page.tsx` ya hace `await searchParams`. Las server actions reciben `FormData`; los inputs repetidos se leen con `formData.getAll("technologies")`.

## Archivos

Nuevos:

- `src/modules/projects/schema/technologies.table.ts`
- `src/modules/projects/schema/project-technologies.table.ts`
- `drizzle/0001_*.sql` (generada: tablas, FKs, índices), `drizzle/0002_*.sql` (custom: seed + backfill), `drizzle/0003_*.sql` (generada: drop de `projects.technologies`) y su `meta/`
- `src/lib/db/technologies-backfill.test.ts`
- `src/components/shared/tag-picker.tsx`
- `src/modules/projects/services/technology.service.ts` y `technology.service.test.ts`

Modificados:

- `src/modules/projects/schema/projects.table.ts` (quitar `technologies`)
- `src/lib/db/migrations.test.ts`, `src/lib/db/constraints.test.ts`
- Tests con siembra de `technologies` en `projects` (solo quitar la propiedad): `src/modules/payments/services/payment-overview.service.test.ts`, `payment-checkout.service.test.ts`, `src/modules/proposals/services/proposal.service.test.ts`, `proposal-transitions.test.ts`, `proposal-selection.service.test.ts`, `proposal-accept.test.ts`, `src/modules/projects/services/project-transitions.test.ts`
- `src/modules/projects/schemas/project.schema.ts` y `.test.ts`, `src/modules/projects/types/project.types.ts`, `src/modules/projects/services/project-errors.ts`, `project.service.ts` y `.test.ts`, `src/modules/projects/actions/project.actions.ts` y `.test.ts`
- `src/modules/projects/schemas/public-catalog.schema.ts` y `.test.ts`, `src/modules/projects/types/public-project.types.ts`, `src/modules/projects/services/public-catalog.service.ts` y `.test.ts`
- `src/modules/projects/components/project-form.tsx`, `src/app/projects/new/page.tsx`, `src/app/projects/[id]/edit/page.tsx`
- `src/modules/projects/components/public-catalog-filters.tsx`, `public-catalog-results.tsx`, `src/app/projects/page.tsx`
- `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`

Sin cambios de código (se verifica que sigan funcionando): `public-project-card.tsx`, `public-project-detail.tsx` (el tipo público conserva `technologies: string[]` con los nombres).

## Contratos

### Modelo de datos (T0)

`technologies`:

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `slug` | text | NOT NULL, UNIQUE, CHECK `technologies_slug_format`: `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'` |
| `name` | text | NOT NULL; índice único `technologies_name_lower_idx` sobre `lower(name)` (único sin distinguir mayúsculas) |
| `sort_order` | integer | NOT NULL |

`project_technologies`:

| Columna | Tipo | Restricciones |
|---|---|---|
| `project_id` | uuid | NOT NULL, FK -> `projects.id` `ON DELETE CASCADE` |
| `technology_id` | uuid | NOT NULL, FK -> `technologies.id` `ON DELETE RESTRICT` |
| PK compuesta | `(project_id, technology_id)` | impide duplicar un tag en un proyecto; sirve a "tags de un proyecto" |
| Índice `project_technologies_technology_idx` | `(technology_id, project_id)` | sirve al filtro "proyectos con el tag X" |

Se elimina `projects.technologies`. Los índices parciales del catálogo (`projects_catalog_*`) no cambian. `RESTRICT` en `technology_id`: un tag en uso no se borra; `CASCADE` en `project_id`: si algún día se borra un proyecto (hoy restringido por propuestas) sus filas puente desaparecen.

### Seed (T0, migración `0002`)

Insertar con `INSERT ... VALUES` (slug, nombre, `sort_order`). Lista base (51 + «Otros»; el developer puede ajustar nombres, mantener 40-60 filas):

- Lenguajes (10-150): JavaScript `javascript`, TypeScript `typescript`, Python `python`, Java `java`, C# `c-sharp`, Go `go`, Rust `rust`, PHP `php`, Ruby `ruby`, Kotlin `kotlin`, Swift `swift`, C++ `c-plus-plus`, Dart `dart`, SQL `sql`, HTML y CSS `html-css`.
- Frontend (200-250): React `react`, Next.js `nextjs`, Vue.js `vuejs`, Angular `angular`, Svelte `svelte`, Tailwind CSS `tailwind-css`.
- Backend (300-350): Node.js `nodejs`, Express `express`, NestJS `nestjs`, Django `django`, FastAPI `fastapi`, Flask `flask`, Spring Boot `spring-boot`, .NET `dotnet`, Laravel `laravel`, Ruby on Rails `ruby-on-rails`, GraphQL `graphql`, API REST `rest-api`.
- Bases de datos (400-460): PostgreSQL `postgresql`, MySQL `mysql`, MongoDB `mongodb`, SQLite `sqlite`, Redis `redis`, Firebase `firebase`, Supabase `supabase`.
- Móvil (500-510): React Native `react-native`, Flutter `flutter`.
- CMS y e-commerce (600-620): WordPress `wordpress`, Shopify `shopify`, WooCommerce `woocommerce`.
- Infraestructura y servicios (700-750): Docker `docker`, AWS `aws`, Azure `azure`, Google Cloud `google-cloud`, Vercel `vercel`, Stripe `stripe`.
- Otros `otros`, `sort_order = 9999` (único con ese valor; fila garantizada).

### Conversión de datos existentes (T0, migración `0002`, antes del drop de `0003`)

Orden de migraciones (se genera en tres pasos para no editar SQL generado): (1) con el schema aún con la columna, `npm run db:generate` crea `0001` (tablas e índices); (2) `npx drizzle-kit generate --custom --name=technologies_seed_backfill` crea `0002` vacía y se rellena; (3) se quita la columna del schema y `npm run db:generate` crea `0003` (drop). Alternativa aceptable si el developer lo prefiere: una sola migración editando el SQL generado para insertar seed y backfill **entre** el `CREATE TABLE` y el `DROP COLUMN`. **El developer solo genera migraciones; el usuario aplica `npm run db:migrate`.**

Backfill (datos de prueba, sin distinguir mayúsculas; lo que no coincide va a «Otros»; varios no coincidentes en un proyecto colapsan en una sola fila «Otros» por la PK):

```sql
INSERT INTO project_technologies (project_id, technology_id)
SELECT DISTINCT p.id, COALESCE(t.id, o.id)
FROM projects p
CROSS JOIN LATERAL unnest(p.technologies) AS raw(name)
LEFT JOIN technologies t ON lower(btrim(raw.name)) = lower(t.name)
CROSS JOIN (SELECT id FROM technologies WHERE slug = 'otros') o
WHERE btrim(raw.name) <> '';
```

Sin alias (p. ej. "node", "js" caen en «Otros»; ver P4). Un proyecto con arreglo vacío queda sin tags. Un proyecto con más de 10 tags tras el backfill no se recorta (solo bloquea su publicación posterior con `INVALID_PROJECT`; datos de prueba).

### Schemas y tipos (T2)

- `PROJECT_LIMITS.technologies = { minItems: 1, maxItems: 10, slugMaxLength: 40 }` (se elimina `maxLength: 30`).
- `export const TECHNOLOGY_SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/` en `project.schema.ts`.
- `projectInputSchema.technologies`: arreglo de strings `trim`, minúsculas, que cumplen la regex y <= 40 caracteres, 1..10, deduplicado (se conserva `dedupeTechnologies`). El schema valida **forma**; la **existencia** en el catálogo la valida el servicio (la lista vive en BD, no se duplica en TypeScript).
- `ProjectFormValues`: `technologies` pasa de `string` a `string[]` (el resto sigue siendo `string`). `parseProjectForm` y `readValues` de `project.actions.ts` leen `formData.getAll("technologies")` (solo valores `string`). Se exporta un único helper de lectura para no duplicar la lógica entre schema y action.
- `ProjectDetail = Project & { proposalCount: number; technologies: string[] }` (slugs; `Project` ya no incluye `technologies` porque la columna desaparece). `TechnologyOption = { slug: string; name: string }`.
- `PublicCatalogQuery` añade `technologies: string[]` (slugs, ordenados alfabéticamente, únicos, <= 5). `PUBLIC_CATALOG_LIMITS.maxTechnologies = 5`. `PublicProjectSummary`/`PublicProject` no cambian de forma: `technologies: string[]` ahora son **nombres** del catálogo ordenados por `sort_order, name`.
- `ProjectErrorCode` añade `INVALID_TECHNOLOGY`. En la action se muestra como error del campo `technologies` ("Selecciona tecnologías de la lista.") en lugar de mensaje general.

### Servicios (T2)

`technology.service.ts` (`import "server-only"`):

```ts
listTechnologies(): Promise<TechnologyOption[]>                    // React cache(); order by sort_order, name; proyección {slug, name}
resolveTechnologyIds(executor, slugs: string[]): Promise<string[]> // lanza ProjectError("INVALID_TECHNOLOGY") si algún slug no existe
replaceProjectTechnologies(tx, projectId, slugs): Promise<void>    // delete + insert dentro del tx del llamador
getProjectTechnologySlugs(executor, projectId): Promise<string[]>
```

`project.service.ts`:

- `createProject`: `db.transaction` -> insertar proyecto -> `replaceProjectTechnologies`. Devuelve `Project`.
- `updateProject`: se envuelve en `db.transaction` con `loadOwned(tx, ..., { lock: true })` (mismo patrón que `unpublishProject`) y se reevalúa el estado bajo el lock; en `draft` actualiza campos + tags; en `published` solo título, descripción y **tags** (los campos bloqueados siguen dando `LOCKED_FIELDS`, ahora sin escribir nada: ni proyecto ni tags); otros estados `INVALID_STATE`. El reemplazo de tags y el update del proyecto confirman juntos (los lectores del catálogo nunca ven el proyecto sin tags).
- `publishProject`: carga los slugs con `getProjectTechnologySlugs` y valida `projectInputSchema.safeParse({ ...current, technologies })` (el row ya no trae tags).
- `getMyProject`: devuelve `technologies` (slugs) para el estado inicial del formulario.
- `listMyProjects`, `closeProject`, `unpublishProject`: sin cambios funcionales.

`public-catalog.service.ts` (columnas calificadas en SQL crudo, patrón `proposalCountSql`):

- Proyección `technologies`: `coalesce(array(select t."name" from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where pt."project_id" = "projects"."id" order by t."sort_order", t."name"), '{}')`, tipado `string[]`. Se mantiene el `isPublished` único, la whitelist de campos y las 2 consultas por catálogo / 1 por detalle.
- Búsqueda `q` (`termFilter`): el tercer OR pasa de `unnest(technologies)` a `exists (select 1 from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where pt."project_id" = "projects"."id" and t."name" ilike $pattern)`; se conserva `escapeLikeTerm`.
- Filtro `technologies` (si hay al menos uno): `"projects"."id" in (select pt."project_id" from "project_technologies" pt join "technologies" t on t."id" = pt."technology_id" where t."slug" in (<slugs parametrizados>) group by pt."project_id" having count(*) = <N>)` con `N = slugs.length`. Siempre parametrizado, nunca interpolado; combinado con AND con el resto.

### `searchParams` del catálogo (T2)

`?tech=react&tech=nodejs` (parámetro repetido, `Promise<...>` ya resuelto por la página). `parsePublicCatalogQuery`: tomar todos los valores (string o arreglo), `trim` + minúsculas, descartar los que no cumplan `TECHNOLOGY_SLUG_REGEX` o excedan 40, deduplicar, ordenar, quedarse con 5. `buildCatalogHref` emite `tech` repetido en orden alfabético (URL canónica; round-trip con el parser), omite si está vacío, y cambiar `technologies` reinicia `page` a 1 (regla existente para cualquier parche).

### UI (T1, T3, T4)

`TagPicker` (`src/components/shared/tag-picker.tsx`, sin lógica de dominio, sin `"use client"`; funciona dentro del formulario cliente y en un GET):

```ts
type TagOption = { value: string; label: string };
type TagPickerProps = {
  name: string;                  // "technologies" | "tech"; un input por tag con el mismo name
  legend: string;
  options: TagOption[];
  defaultSelected?: string[];    // estado inicial (edición, valores devueltos tras error, URL)
  disabled?: boolean;
  hint?: string; error?: string; // con ids y aria-describedby en el fieldset; error con role="alert"
  className?: string;
};
```

- `<fieldset aria-describedby>` + `<legend>`; lista de `<label>` envolviendo `<input type="checkbox" name value defaultChecked class="peer sr-only">` + `<span>` con las clases del `Chip` y variantes `peer-checked:` (activo), `peer-focus-visible:ring-3 ring-[#183D30]/40`, `peer-disabled:opacity-60`. Mosaicos con `flex flex-wrap gap-2`; objetivo táctil: altura 32 px como el Chip del dashboard (se acepta; el espaciado `gap-2` evita toques erróneos; ver P7).
- No limita el máximo en el cliente (no hay JS): el límite se informa en el `hint` ("Elige entre 1 y 10") y lo aplica el servidor.

Formulario (`project-form.tsx`, T3): sustituye el `Input` de tecnologías por `TagPicker name="technologies"`, `options` desde la prop `technologies: TechnologyOption[]`, `defaultSelected = values.technologies` (inicial: `project?.technologies ?? []`; tras error: los valores devueltos en `state.values`); `disabled` cuando `fullyReadOnly`; en `published` sigue editable. `EditableProject` cambia a `Pick<Project, ...sin technologies> & { technologies: string[] }`. `new/page.tsx` y `edit/page.tsx` llaman `listTechnologies()` y pasan la prop (no hay otra lógica nueva en las páginas).

Filtro (`public-catalog-filters.tsx`, T4): dentro del `<form method="get">` existente, un `<details>` ("Tecnologías", con contador de seleccionadas en el `<summary>`, `open` si `query.technologies.length > 0`) que contiene `<TagPicker name="tech" ... defaultSelected={query.technologies}>` con hint "Se muestran proyectos que usan todas las tecnologías elegidas (máx. 5)". El enlace "Limpiar" suma `technologies: []` al parche. `public-catalog-results.tsx`: `hasActiveFilters` incluye `technologies.length > 0`. `src/app/projects/page.tsx`: `await listTechnologies()` (con `try/catch` que registra el error y usa `[]`: el catálogo no debe caer si falla el catálogo de tags) y pasa `technologies` al filtro.

## Dependencias de orden

- Esta spec depende de **009b-global-navigation** (mueve `SiteHeader` al layout raíz y limpia el header por página). T4 edita `src/app/projects/page.tsx`: **debe ejecutarse después de que 009b esté aplicada** (done) para no pisar su limpieza de `<SiteHeader>`. Ninguna tarea de esta spec toca `src/app/layout.tsx` ni `site-header.tsx`. Si 009b no estuviera aplicada, T4 queda bloqueada (el resto, T0-T3, no depende de 009b).
- Va antes de 010 (webhooks); no se renumera. 010 no depende de tags.

## Criterios de aceptación

- AC1. Tras las migraciones existen `technologies` y `project_technologies` con las restricciones de "Modelo de datos"; `projects.technologies` ya no existe; `technologies` tiene entre 40 y 60 filas, incluida `otros` con el mayor `sort_order`; ningún `name` se repite sin distinguir mayúsculas; todos los `slug` cumplen el formato.
- AC2. Integridad (PGlite): slug duplicado, `name` duplicado distinto en mayúsculas ("java" vs "Java") y slug con formato inválido (`C#`, `a b`, `-x`) fallan; un par (proyecto, tag) repetido falla; un `project_technologies` con proyecto o tag inexistente falla (FK); borrar un tag en uso falla (`RESTRICT`); borrar un proyecto sin propuestas borra sus filas puente.
- AC3. Backfill: con proyectos preexistentes con `['react', ' JAVA ', 'Cobol', 'Rpg', '']`, tras `0002` el proyecto queda con `react`, `java` y una sola `otros`; un proyecto con arreglo vacío queda sin tags; tras `0003` la columna no existe.
- AC4. `projectInputSchema` acepta 1-10 slugs válidos y deduplica sin distinguir mayúsculas; rechaza 0, 11, slug con formato inválido o > 40 caracteres, y elementos vacíos. `parseProjectForm` lee `technologies` repetido de `FormData` (ninguno -> error "Indica al menos una tecnología") y devuelve en `values.technologies` lo enviado ante error.
- AC5. `createProject`/`updateProject` guardan los tags del input; un slug que no existe en el catálogo lanza `INVALID_TECHNOLOGY` y **no** deja el proyecto creado ni modificado (rollback). En `published`, `updateProject` cambia título, descripción y tags, y cambiar categoría/presupuesto/plazo lanza `LOCKED_FIELDS` sin cambiar tags. `publishProject` falla con `INVALID_PROJECT` si el proyecto no tiene tags. `getMyProject` devuelve los slugs actuales.
- AC6. `listPublicProjects`/`getPublicProject` devuelven `technologies` como nombres del catálogo ordenados por `sort_order, name`; las claves de `PublicProjectSummary`/`PublicProject` y la whitelist de privacidad (spec 006 AC2) no cambian; ningún campo nuevo expone ids internos.
- AC7. Filtro por tags: con `technologies: ["react"]` solo aparecen proyectos publicados con React; con `["react","postgresql"]` solo los que tienen ambos (AND); un slug inexistente devuelve 0 resultados sin error; se combina con `q`, categoría, presupuesto, plazo, orden y paginación (`total`/`totalPages` correctos); nunca expone proyectos no `published`.
- AC8. La búsqueda `q` sigue encontrando proyectos por el nombre de un tag (sin distinguir mayúsculas, con escape de `%`/`_`), y no duplica filas cuando varios tags coinciden.
- AC9. `parsePublicCatalogQuery`: `tech` ausente -> `[]`; arreglo y valor único; trim/minúsculas, descarta formato inválido, deduplica, ordena y limita a 5; `buildCatalogHref` emite `tech` repetido y canónico, reinicia `page` y hace round-trip.
- AC10. `/projects/new`: el formulario muestra el catálogo como mosaicos (checkboxes) en lugar del campo de texto; se pueden elegir varios y enviar el formulario con teclado (Tab, Espacio, Enter); con error de validación los tags elegidos permanecen marcados; guardar crea el proyecto con esos tags. `/projects/[id]/edit`: los tags guardados aparecen marcados; en `published` se pueden cambiar; en estados no editables el selector está deshabilitado.
- AC11. `/projects`: el filtro "Tecnologías" muestra los mosaicos con el mismo estilo que los botones de `/dashboard/projects` (activo verde `#183D30`, inactivo blanco con borde `#E3E8E3`), funciona sin JavaScript, conserva la selección en la URL tras "Aplicar", "Limpiar" la quita, el estado vacío con tags activos muestra "Limpiar filtros", y las tarjetas y el detalle muestran los tags del proyecto.
- AC12. Accesibilidad: cada grupo es un `fieldset` con `legend`, cada mosaico es una casilla con nombre accesible, foco visible, estado seleccionado perceptible sin depender solo del color (texto blanco sobre fondo oscuro y el estado `checked` nativo), sin scroll horizontal a 390 px.
- AC13. `npm run lint`, `npm run test` y `npm run build` pasan; sin dependencias nuevas, sin cambios en `package.json`, `src/app/layout.tsx`, `site-header.tsx`, `src/components/ui/**`; `developer_profiles.technologies` intacto; el developer no ejecuta `db:migrate`.

## Tests requeridos

Vitest, junto al archivo, `// @vitest-environment node` donde no hay DOM (SETUP §3).

- `src/lib/db/migrations.test.ts` (T0, AC1): reemplazar `has a single initial migration` por una verificación coherente con varias migraciones (el número de archivos `.sql` coincide con las entradas de `drizzle/meta/_journal.json`); añadir las dos tablas a la lista de tablas, los índices nuevos a la de índices, y el seed (40-60 filas, `otros` último, nombres únicos sin distinguir mayúsculas).
- `src/lib/db/constraints.test.ts` (T0, AC2): bloque `technologies` con las restricciones de AC2. La rama `developer_profiles.technologies` existente no se toca.
- `src/lib/db/technologies-backfill.test.ts` (T0, AC3): PGlite propio que aplica los `.sql` de `drizzle/` en orden hasta `0001`, siembra proyectos con `technologies text[]`, aplica `0002` y verifica el resultado, aplica `0003` y verifica que la columna no existe. (`createTestDb` solo sirve para el estado final.)
- `src/modules/projects/schemas/project.schema.test.ts` (T2, AC4): límites 1/10, formato de slug, deduplicado, `parseProjectForm` con `FormData` repetido; se actualizan los casos antiguos de texto con comas y de 30 caracteres.
- `src/modules/projects/schemas/public-catalog.schema.test.ts` (T2, AC9): `tech` en `parsePublicCatalogQuery` y `buildCatalogHref`; los objetos `PublicCatalogQuery` de los tests existentes añaden `technologies: []`.
- `src/modules/projects/services/technology.service.test.ts` (T2): `listTechnologies` ordenado y sin `Otros` fuera de lugar, `resolveTechnologyIds` (válidos, inexistente lanza `INVALID_TECHNOLOGY`), `replaceProjectTechnologies` (reemplaza, no duplica), `getProjectTechnologySlugs`.
- `src/modules/projects/services/project.service.test.ts` (T2, AC5): creación/edición con tags, rollback con slug inválido, `LOCKED_FIELDS` sin cambios de tags, `publishProject` sin tags, `getMyProject`. Se adaptan las siembras actuales.
- `src/modules/projects/actions/project.actions.test.ts` (T2): `FormData` con `technologies` repetido, error de campo para `INVALID_TECHNOLOGY`, `values.technologies` como arreglo.
- `src/modules/projects/services/public-catalog.service.test.ts` (T2, AC6-AC8): nombres de tags en la proyección y claves intactas, filtro AND con 1, 2 y slug inexistente, combinación con otros filtros y paginación, búsqueda por nombre de tag sin duplicados; siembra de tags vía slugs del catálogo real (ya sembrado por la migración).
- No requieren test obligatorio: `tag-picker.tsx`, `project-form.tsx`, `public-catalog-filters.tsx`, `public-catalog-results.tsx` y páginas (presentacionales/composición). Un test RTL de `TagPicker` (nombres repetidos, `defaultChecked`, `disabled`) es opcional pero recomendable.
- Verificación manual (humano): AC10-AC12 con pasos añadidos a `docs/MANUAL-TESTS.md` (T4).

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Nadie ejecuta `npm install` ni `npm run build` entre tareas; **T0 deja el typecheck roto** en `project.service.ts`/`public-catalog.service.ts` (usan la columna eliminada) hasta que T2 termine; el reviewer corre el build al final. El developer genera migraciones (`db:generate`, `drizzle-kit generate --custom`) pero **no** ejecuta `db:migrate`.

### T0 — Base de datos: tablas, seed, backfill y tests de BD (serial, primero)

- Archivos: `src/modules/projects/schema/technologies.table.ts`, `src/modules/projects/schema/project-technologies.table.ts`, `src/modules/projects/schema/projects.table.ts`, `drizzle/**` (migraciones `0001`-`0003` y `meta/`), `src/lib/db/migrations.test.ts`, `src/lib/db/constraints.test.ts`, `src/lib/db/technologies-backfill.test.ts`, y la eliminación de la propiedad `technologies` en las siembras de `src/modules/payments/services/payment-overview.service.test.ts`, `payment-checkout.service.test.ts`, `src/modules/proposals/services/proposal.service.test.ts`, `proposal-transitions.test.ts`, `proposal-selection.service.test.ts`, `proposal-accept.test.ts`, `src/modules/projects/services/project-transitions.test.ts`.
- Depende de: —
- Paralelizable: no (T2 depende de ella; T1 es independiente y puede ir en paralelo)
- Cubre: AC1, AC2, AC3

### T1 — Componente `TagPicker`

- Archivos: `src/components/shared/tag-picker.tsx` (y opcional `tag-picker.test.tsx`).
- Depende de: —
- Paralelizable: sí (con T0 y T2; solo recibe props, no usa servicios ni BD)
- Cubre: AC12 (parte de UI)

### T2 — Schemas, tipos, servicios y actions

- Archivos: `src/modules/projects/schemas/project.schema.ts` y `.test.ts`, `src/modules/projects/schemas/public-catalog.schema.ts` y `.test.ts`, `src/modules/projects/types/project.types.ts`, `src/modules/projects/types/public-project.types.ts`, `src/modules/projects/services/project-errors.ts`, `src/modules/projects/services/technology.service.ts` y `.test.ts`, `src/modules/projects/services/project.service.ts` y `.test.ts`, `src/modules/projects/services/public-catalog.service.ts` y `.test.ts`, `src/modules/projects/actions/project.actions.ts` y `.test.ts`.
- Depende de: T0
- Paralelizable: no con T0; sí con T1
- Cubre: AC4, AC5, AC6, AC7, AC8, AC9

### T3 — Formulario de proyecto con selector de tags

- Archivos: `src/modules/projects/components/project-form.tsx`, `src/app/projects/new/page.tsx`, `src/app/projects/[id]/edit/page.tsx`.
- Depende de: T1, T2
- Paralelizable: sí (con T4: archivos disjuntos)
- Cubre: AC10, AC12

### T4 — Filtro por tags en `/projects`, documentación y verificación manual

- Archivos: `src/modules/projects/components/public-catalog-filters.tsx`, `src/modules/projects/components/public-catalog-results.tsx`, `src/app/projects/page.tsx`, `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`.
- Depende de: T1, T2 y de **009b aplicada** (por `src/app/projects/page.tsx`)
- Paralelizable: sí (con T3)
- Cubre: AC11, AC12, AC13. Docs: `MANUAL-TESTS.md` (sección "Spec 009c": selector en `/projects/new` y edición, «Otros», máximo 10 y mínimo 1, tags conservados tras error, filtro en `/projects` solo/combinado/vacío/Limpiar, tarjetas y detalle, 390 px, teclado; ajustar la línea del formulario que dice "tecnologías" y la de búsqueda por tecnología si hace falta); `system-design.md §2` (fila de proyecto con "tecnologías (tags del catálogo)" y nueva fila "Tecnología (`technology`)" con relación N:M con proyecto), `§8` (D11: catálogo cerrado de tecnologías con N:M, «Otros» solo etiqueta, `developer_profiles` fuera de alcance). `SETUP.md §4` no cambia.

## Preguntas abiertas

- P1. Máximo de tags por proyecto: recomendado 10 (hoy 15), mínimo 1. Alternativa: mantener 15.
- P2. Semántica del filtro: recomendado "todos" (AND, consistente con el resto de filtros). Alternativa: "alguno" (OR) o un selector "todos/alguno" (más UI; YAGNI).
- P3. Parámetro de URL `tech` con slugs (recomendado) frente a `technologies`; nombre corto elegido solo por legibilidad de la URL.
- P4. Backfill sin alias: "node", "js", "reactjs" caen en «Otros». Recomendado: no añadir tabla/mapa de alias (datos de prueba). Alternativa: lista corta de alias en el SQL del backfill.
- P5. ¿«Otros» aparece también como mosaico de filtro? Recomendado sí (sin caso especial, lista única). Alternativa: ocultarlo del filtro (requiere un `filter` en el componente).
- P6. Altas de tags solo por migración; ¿se quiere una pantalla de admin más adelante? Recomendado diferirlo a una spec propia.
- P7. Objetivo táctil de los mosaicos: igual al `Chip` del dashboard (32 px de alto, consistencia visual pedida). Alternativa: 40 px en móvil (`h-10 sm:h-8`) para cumplir el criterio táctil de 006 (>= 40 px).
- P8. Alcance del `<details>` plegable en el filtro (recomendado, ~50 mosaicos ocuparían demasiado en 390 px) frente a mostrarlos siempre abiertos.
- P9. Ubicación de las tablas en `projects` (recomendado) frente a un módulo `technologies` propio desde ahora (obligaría a actualizar `system-design.md §4`).

## Próximas fases

- Perfil del desarrollador usando el mismo catálogo (extraer a módulo `technologies`, migrar `developer_profiles.technologies`) y ranking/matching proyecto-desarrollador por tags.
- Administración del catálogo (alta, renombre, orden) y alias de tags.
- Tags clicables en tarjeta y detalle que lleven a `/projects?tech=...`.
- Refactor DRY del estilo de mosaico/chip compartido entre `project-list.tsx` y `TagPicker`.
- Spec 014: pulido de estados y accesibilidad transversal; spec 016: pruebas de concurrencia contra Neon real (los tests PGlite no demuestran los bloqueos).

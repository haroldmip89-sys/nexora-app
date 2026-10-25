# Rediseño visual, fase D: perfil público, "Mi cuenta", detalle y editor de proyecto, formulario de propuesta y valoración

Estado: borrador

Spec 022d. **Depende de 022a** (tokens, fuente, `surface`, `max-w-page`, controles `ui/**`, `InitialsAvatar`, header y footer globales): no se implementa hasta que 022a esté `done`. Es independiente de 022b y 022c (archivos disjuntos; solo comparten `docs/MANUAL-TESTS.md`, ver "Tareas"). Una salvedad de contrato: 022c consume `RatingStars` (API sin cambios) y esta fase solo cambia su aspecto.

Es una spec **solo de interfaz** sobre funcionalidad ya probada y `done`: perfil y "Mi cuenta" (019), valoraciones (020), proyectos (005/006), descripción Markdown (018), propuestas (007) y accesibilidad (014). **No cambia** servicios, acciones, schemas, validaciones, permisos ni migraciones, ni edita esas specs. Arquitectura: `system-design.md §6` (los permisos de contacto y de valoración se aplican en servidor y no se tocan), `§3`/`§4` (sin imports nuevos entre módulos).

Diseños de referencia (HTML de /design: referencia visual y de contenido, no código final; ignorar `<x-dc>`/`<helmet>`) en `docs/assets/1-perfiles-y-proyectos/`: `Main.dc.html` (perfil público), `Account.dc.html` (Mi cuenta), `ProjectDetail.dc.html`, `ProjectEditor.dc.html`, `ProposalForm.dc.html` y `RateDeveloper.dc.html`. Esos artboards usan Bricolage Grotesque, Instrument Sans y JetBrains Mono: por la decisión 3 todo va en **Plus Jakarta Sans** y el texto de código en Geist Mono.

Decisión 2 del humano (no se reabre): **sin adjuntos** (la spec 021 está descartada): `ProposalForm` no lleva sección "Adjuntos" ni textos de archivos o revisión de archivos, y el detalle de proyecto no lleva "Puedes adjuntar tu cotización o plan de trabajo en PDF, Word o Excel."

## Objetivo

1. Restilizar el perfil público `/developers/[id]` y "Mi cuenta" `/dashboard/account` como los artboards, con su funcionalidad intacta.
2. Restilizar el detalle público `/projects/[id]` (descripción Markdown tipo README, panel de detalles, bloque de propuesta) y el formulario de propuesta, sin adjuntos.
3. Restilizar el editor de proyecto (`/projects/new`, `/projects/[id]/edit`) con el editor Markdown y una guía rápida.
4. Restilizar la valoración `/projects/[id]/rate`.
5. Conservar textos de estados, mensajes y etiquetas de acción, `aria-*`, foco, validación, anunciador y `ConfirmDialog`, y objetivos táctiles >= 44 px.

## Hechos verificados (código del repo, 2026-10-24)

| Hecho | Fuente |
|---|---|
| El perfil público ya tiene aside (avatar de iniciales, nombre, titular, ubicación, disponibilidad, valoración, "Editar mi perfil" si es el dueño) y columna de "Sobre mí" (Markdown seguro), Contacto (estados de privacidad de 019), Enlaces y Valoraciones (`RatingList`, `id="valoraciones"`) | `developer-profile-view.tsx`, `developers/[id]/page.tsx` |
| `PublicDeveloperProfile` solo trae nombre, iniciales, titular, ubicación, disponibilidad, bio, enlaces y estado de contacto; `DeveloperRatingSummary` solo `average` y `count`; `PublicDeveloperRating` solo `rating`, `comment`, `clientName`, `createdAt` (sin proyecto, sin distribución por estrellas, sin zona horaria, idiomas, tecnologías ni "proyectos contratados") | `developer-profile.types.ts`, `rating.types.ts` |
| No existe "Invitar a un proyecto" ni mensajería | Grep en `src/**` |
| "Mi cuenta" ya tiene: foto por defecto con iniciales y el texto "La subida de fotos llegará más adelante.", información básica (nombre de solo lectura, titular, ubicación, disponibilidad), biografía Markdown con contador, enlaces (tipo, URL, quitar, añadir), contacto (correo y visibilidad), valoración (`ratingSlot`), "Descartar cambios" y "Guardar perfil"; `PayoutsLinkCard` lleva a `/dashboard/payouts` | `developer-profile-form.tsx`, `account/page.tsx` |
| El detalle público (`PublicProject`, whitelist de 006) no trae cliente ni conteo de propuestas; ya muestra categoría, fecha absoluta, resumen lateral (presupuesto, plazo, categoría), `ProposalCta` y `MarkdownContent` con cabecera "Markdown" | `public-project-detail.tsx`, `public-project.types.ts` |
| El formulario de propuesta **ya está incrustado** en el detalle (`DeveloperProposalSection`, `id="propuesta"`, dentro del aside de 320 px vía `ProposalCta`); no existe una ruta de "enviar propuesta". No existe texto de adjuntos en `src/` (`grep -ri "adjunt\|attachment" src` solo da un test de otro tema) | `proposal-cta.tsx`, `developer-proposal-section.tsx`, `proposal-form.tsx`, grep |
| `ProjectForm` incluye título, categoría, descripción (editor Markdown con barra de formato y vista previa), presupuesto mín/máx, plazo y tecnologías (`TagPicker`), con modos borrador/publicado/solo lectura; el diseño del editor solo muestra título y descripción | `project-form.tsx`, `markdown-editor.tsx` |
| `RateDeveloperForm` ya tiene las estrellas de 52 px, el texto de valoración, el comentario con contador, el bloque "Antes de enviar" y los botones "Más tarde"/"Publicar valoración" (o "Volver a mis proyectos"/"Guardar cambios" en edición) | `rate-developer-form.tsx` |
| `MarkdownContent` (compartido: proyectos, propuestas, biografía) usa hex literales y `font-heading`; su test solo comprueba el contenedor `overflow-x-auto` de las tablas. `FormField` y `TagPicker` usan hex literales; `markdown-editor.test.tsx` y `tag-picker.test.tsx` existen | `markdown-content.tsx`, `form-field.tsx`, `tag-picker.tsx`, `*.test.tsx` |
| Tras 022a `--font-mono` = Geist Mono y los controles `ui/**` ya tienen la base de 44 px y radio 10 px | 022a |

## Alcance

- Incluye:
  - `/developers/[id]`, `/dashboard/account`, `/projects/[id]`, `/projects/new`, `/projects/[id]/edit`, `/projects/[id]/rate` restilizados; formulario de propuesta (en el detalle) y tarjeta "Tu propuesta" restilizados.
  - Estilo "README" de `MarkdownContent` (encabezados con línea inferior, citas, código y tablas con tokens) y tokens en `FormField`/`TagPicker`.
  - Componentes nuevos de solo UI: `AccountSectionNav` (navegación de secciones de "Mi cuenta") y `MarkdownHelpCard` (guía rápida del editor).
  - Tamaño `xl` (128 px) de `DeveloperAvatar` como variante aditiva.
  - Pasos manuales en `docs/MANUAL-TESTS.md`.
- No incluye:
  - Cambios en servicios, acciones, schemas Zod, `PROFILE_LIMITS`, validaciones, rate limiting, permisos, el cálculo de privacidad del correo ni el orden de las valoraciones.
  - Datos nuevos: "Invitar a un proyecto", "N proyectos contratados", zona horaria, idiomas, tecnologías del perfil, distribución de estrellas, proyecto de cada reseña, subida de foto, "Acceso y seguridad", cliente y número de propuestas en el detalle (ver "Conflictos" y Preguntas abiertas).
  - Una ruta nueva de "Enviar propuesta" (el formulario sigue incrustado), adjuntos de cualquier tipo, modo oscuro.
  - Cambios en `ConfirmDialog`, `LiveAnnouncer`, header/footer, `select-proposal-button`, `withdraw-proposal-button` y botones de pago.

## Contratos (solo props/UI; sin cambios de servicios, schemas ni permisos)

### Compartidos (T0)

- `src/components/shared/markdown-content.tsx` (visual): `h2`/`h3` con `border-b border-border` y `pb`; párrafo `text-[16px] leading-[1.7]` en contenedores normales (los contenedores con `text-sm` por `className` siguen mandando); citas con `border-l-4 border-input`; código en línea y bloques `pre` con `bg-muted`/`font-mono` (Geist Mono) y radio 6/10 px; tablas `th` con `bg-background`; colores por tokens (`text-primary`, `text-foreground`, `text-muted-foreground`, `border-border`). **Se conservan** el saneado de URLs, el renderizado de listas de tareas con texto "Completado: "/"Pendiente: " para lector de pantalla, `rel` de enlaces, la reducción de `h1`-`h6` a `h2`-`h4` y el contenedor `overflow-x-auto` de tablas (test existente).
- `form-field.tsx`: etiqueta y textos de ayuda/error con tokens; API (`name`, `label`, `hint`, `error`, render prop) y `aria-describedby`/`role="alert"` **intactos**.
- `tag-picker.tsx`: chips del diseño (seleccionado `bg-primary text-primary-foreground`, no seleccionado `bg-card border-border`, 32 px de alto, foco visible) con la misma semántica (casillas/`fieldset`, límite, `hint`); API y test intactos.

### Perfil público (T1)

`DeveloperProfileView` conserva `Props` (`profile`, `isOwner`, `viewerRole`, `rating`, `reviewsSlot`). Dos columnas en `lg` (aside `320px` + contenido):

- Aside: tarjeta `surface` centrada con `DeveloperAvatar size="xl"`, h1 con el nombre, línea "{titular} · {ubicación}" (solo las partes que existan), valoración (estrellas + promedio en 18/700 + "(N valoraciones)", o el texto actual si no hay), pastilla de disponibilidad (`AVAILABILITY_LABELS`), y "Editar mi perfil" (botón primario, solo dueño). Sin pastilla de "proyectos contratados".
- Tarjeta "Contacto": estados actuales de `ContactSection` (correo visible / "Visible cuando contrates a …" / restringido / oculto) con los **mismos textos**; sin "Invitar a un proyecto", zona horaria ni idiomas.
- Tarjeta "Enlaces": filas de 44 px con icono por tipo (GitHub y LinkedIn con los SVG del diseño; Portafolio/Otro con un icono de `lucide-react`, ya instalado), etiqueta del tipo (`LINK_TYPE_LABELS`) y el host/URL actual como texto secundario; mismos `href`, `rel` y `target` que hoy.
- Contenido: tarjeta "Sobre mí" (Markdown seguro, textos vacíos actuales) y tarjeta "Valoraciones" (`id="valoraciones"` se conserva) con el aviso "Solo clientes con un proyecto contratado pueden valorar." (regla de 020), el promedio grande (40-56/800, color primario) con estrellas y "promedio de N" (`RatingStars`), y la lista (`RatingList`: avatar de iniciales del nombre abreviado, nombre, "N de 5", fecha absoluta actual y comentario). Sin barras de distribución, sin "Proyecto: …" por reseña y sin "Ver las N valoraciones" (la lista ya muestra todas).
- Sin el enlace "Volver a las propuestas del proyecto" (el perfil se abre en pestaña nueva y no hay contexto de origen).
- `developers/[id]/page.tsx`: contenedor `max-w-page`; `generateMetadata`, carga y 404 intactos.

### Mi cuenta (T1)

`DeveloperProfileForm` conserva `Props` (`profile`, `initials`, `ratingSlot`), la validación, los textos de error, el contador, "Descartar cambios" y "Guardar perfil" (con su estado "Guardando..."), el anunciador y `aria-busy`. Cambios de UI:

- `account/page.tsx`: `max-w-page`; cabecera h1 "Mi cuenta" + subtítulo "Así te ven los clientes cuando revisan tus propuestas." + enlace "Ver perfil público" (texto actual) con icono de ojo; a continuación dos columnas en `lg`: `AccountSectionNav` (izquierda, `220px`) y el formulario + `PayoutsLinkCard` (derecha).
- `AccountSectionNav` (nuevo, `profile/components`): `<nav aria-label="Secciones de la cuenta">` en tarjeta con 3 enlaces de 44 px y icono: "Perfil" (ancla al inicio del formulario), "Valoraciones" (ancla a la tarjeta de valoración del formulario) y "Cobros de prueba" (`/dashboard/payouts`). Sin "Acceso y seguridad" (no existe esa pantalla). Los `id` de ancla los definen el formulario y la página, ambos en T1.
- Formulario: cada sección es una tarjeta `surface` con título 18/600 (como el artboard): "Foto de perfil" (avatar de 96 px y el texto actual; **sin** botones "Subir foto"/"Usar la foto por defecto"), "Información básica" (rejilla `auto-fit minmax(240px,1fr)`; el nombre sigue siendo de solo lectura), "Biografía" (textarea monoespaciada Geist Mono con el contador actual), "Enlaces", "Contacto" (correo + visibilidad como radios de 44 px; sin zona horaria ni idiomas) y "Tu valoración" (`ratingSlot`); barra de acciones alineada a la derecha.
- `PayoutsLinkCard`: tarjeta `surface` con el texto y el enlace actuales.
- `RatingSummary` (T1): promedio 40/800 en color primario, estrellas, "de 5 · N valoraciones" y el enlace "Ver valoraciones recibidas" actuales.

### Detalle de proyecto y propuesta (T2)

`PublicProjectDetail` conserva `Props` (`project`, `viewer`).

- Enlace "← Volver a proyectos" (texto actual); fila de píldoras con categoría y "Publicado" (todos los proyectos públicos están publicados) y fecha absoluta actual; h1 de 32-36 px/800.
- Dos columnas en `lg` (contenido + aside de 320 px). Descripción: tarjeta `surface` con cabecera `surface-subtle` ("Descripción" y la etiqueta "Markdown" en Geist Mono) y cuerpo con `MarkdownContent` y relleno 24/32 px (estilo README de T0). Etiquetas de tecnología (`--chip`).
- Aside "Detalles": `dl` con Presupuesto (18/600), Plazo y Categoría, y las tecnologías. **Sin** "Cliente" ni "N propuestas recibidas" (no están en `PublicProject`). Debajo, `ProposalCta` con sus ramas actuales: visitante (nota + "Iniciar sesión" con `redirect_url` + "Crear cuenta"), sesión sin fila, cliente (propio: "Editar proyecto" y "Mis proyectos"; ajeno: nota) y **developer**: ya no incrusta el formulario en el aside, sino un enlace primario "Ir a la propuesta" (`#propuesta`).
- `DeveloperProposalSection` (id `propuesta`) se renderiza en la **columna principal**, bajo la descripción y solo si el visor es developer (decisión tomada en `PublicProjectDetail`), con tarjeta `surface` "Enviar una propuesta" / "Tu propuesta" y los mismos estados (formulario, `OwnProposalCard`, aviso de cobros no configurados con enlace a `/dashboard/payouts`, error de carga). Lógica de datos y textos intactos.
- `ProposalForm` (crear/editar): campos y etiquetas actuales ("Precio (USD)", "Plazo (semanas)", "Descripción de tu propuesta"), `budgetHint`, validación, `aria-*`, "Enviar propuesta"/"Guardar cambios", "Cancelar" (edición) y anuncios; precio y plazo en rejilla de 2 columnas dentro de la tarjeta "Tu oferta", controles de 44 px. **Sin** sección "Adjuntos", sin zona de arrastre, sin lista de archivos y sin textos sobre archivos o revisión (decisión 2).
- `OwnProposalCard`: tarjeta `surface` con las mismas acciones (editar, retirar con `ConfirmDialog`) y textos.
- `projects/[id]/page.tsx`: `max-w-page`; metadata, 404 y `resolvePublicViewer` intactos.

### Editor de proyecto y valoración (T3)

- `ProjectForm`: una tarjeta `surface` con **todos** los campos actuales (título, categoría, descripción, presupuesto mínimo/máximo, plazo, tecnologías) en la misma tarjeta, rejillas de 2 columnas para presupuesto y plazo; modos y bloqueos de campos (borrador, publicado, solo lectura), botones ("Cancelar"/"Volver a mis proyectos", "Guardar borrador", "Guardar cambios", "Publicar" con sus estados "Guardando...") y mensajes **sin cambios**. En `lg`, aside con `MarkdownHelpCard`.
- `MarkdownEditor`: contenedor con borde `input`, cabecera `surface-subtle` con las pestañas "Escribir"/"Vista previa" (`aria-pressed` actuales) y la barra de formato (`role="toolbar"`, `aria-label` de cada botón y atajos intactos, botones de 40-44 px), textarea en Geist Mono 14/1,7 con el contador actual y vista previa con `MarkdownContent`.
- `MarkdownHelpCard` (nuevo, `projects/components`): `aside` con `aria-labelledby`, "Guía rápida de Markdown" (`dl` de sintaxis -> efecto: `## Título`, `**texto**`, `*texto*`, `- item`, `- [ ] tarea`, `[texto](url)`, `` `código` ``, `> nota`, tabla) y la nota "No se pueden subir archivos ni imágenes aquí. El HTML se ignora por seguridad." (se **omite** la frase "Si necesitas compartir documentos, pídelos en las propuestas": sugiere adjuntos y la decisión 2 los descarta). Contenido estático.
- `projects/new/page.tsx` y `projects/[id]/edit/page.tsx`: `max-w-page`, h1 y subtítulo de estado ("Editar proyecto" / "Borrador · los cambios se ven en el catálogo al publicar." según el estado real; textos de página existentes que informen del estado se conservan); lógica de carga y guardas intactas.
- `RateDeveloperForm`: tarjeta `surface` de 720 px con avatar de iniciales (`InitialsAvatar lg`), "Proyecto contratado · {título}", h1 "¿Cómo fue trabajar con {desarrollador}?", estrellas de 52 px (`aria-pressed`/etiquetas actuales, foco visible), texto "{n} de 5 · {palabra}" con `aria-live`, comentario con contador, bloque "Antes de enviar" (`surface-subtle`) y botones actuales; modos crear, editar (ventana de 14 días) y solo lectura intactos; `rate/page.tsx` no cambia salvo el contenedor si lo exige el diseño.

## Conflictos entre el diseño y la funcionalidad existente

| # | Diseño | Existente | Decisión |
|---|---|---|---|
| 1 | Perfil: "Invitar a un proyecto" | No existe la función | Se omite |
| 2 | Perfil: pastilla "8 proyectos contratados" | Dato no disponible en `PublicDeveloperProfile` | Se omite; sin cifras inventadas |
| 3 | Perfil/Cuenta: zona horaria, idiomas, "responde en menos de 24 h" | No hay campos ni columnas (019) | Se omiten |
| 4 | Perfil/Cuenta: tecnologías del desarrollador | No existen en el perfil | Se omiten |
| 5 | Valoraciones: barras de distribución por estrellas, "Proyecto: …" por reseña, "hace 2 semanas", "Ver las 12 valoraciones" | Solo promedio, cantidad y reseñas (sin proyecto); fecha absoluta; la lista ya muestra todas | Promedio + estrellas + conteo + lista actual; fecha absoluta; sin barras ni enlace |
| 6 | Perfil: enlace "Volver a las propuestas del proyecto" | Perfil con `target="_blank"` desde propuestas/pago | Se omite |
| 7 | Cuenta: "Subir foto" / "Usar la foto por defecto", nombre visible editable, "Acceso y seguridad" | 019: solo iniciales, nombre de solo lectura (viene de Clerk/Neon), sin pantalla de seguridad | Se conserva el texto "La subida de fotos llegará más adelante."; nombre de solo lectura; sin sección de seguridad |
| 8 | Detalle: "Cliente: Vet Andina" y "4 propuestas recibidas" | `PublicProject` es una lista blanca (006): no expone cliente ni conteos | Se omiten |
| 9 | Propuesta: página aparte "Enviar propuesta" con "Volver al proyecto" | Formulario incrustado en el detalle (`#propuesta`) | Se conserva incrustado (sin ruta nueva, YAGNI), ahora en la columna principal y a ancho completo; ver P1 |
| 10 | Propuesta: sección "Adjuntos" y nota "Solo el cliente… podrá descargar los adjuntos"; detalle: "Puedes adjuntar tu cotización…" | Sin adjuntos (021 descartada); esos textos no existen en el código | No se implementan (decisión 2) |
| 11 | Editor: solo título y descripción | `ProjectForm` tiene además categoría, presupuestos, plazo y tecnologías (con bloqueos por estado) | Todos los campos se conservan en la tarjeta |
| 12 | Editor: nota "…pídelos en las propuestas" | Sin adjuntos | Se omite esa frase |
| 13 | Fuentes Bricolage Grotesque, Instrument Sans y JetBrains Mono | Decisión 3 | Plus Jakarta Sans; mono = Geist Mono |
| 14 | "Publicado hace 3 días" | Fecha absoluta | Se conserva la absoluta |
| 15 | Header distinto en cada artboard | Header único (022a) | Ver 022a |
| 16 | Valoración: textos "Antes de enviar", "Más tarde", "Publicar valoración" | Idénticos | Sin conflicto |

## Reutilizar

| Existente | Uso |
|---|---|
| `profile/components/{developer-profile-view,developer-profile-form,developer-avatar,payouts-link-card}.tsx`, `profile/types/developer-profile.types.ts` (`AVAILABILITY_LABELS`, `LINK_TYPE_LABELS`, `PROFILE_LIMITS`) | Se restilizan; tipos sin cambios |
| `ratings/components/{rating-list,rating-summary,rating-stars,rate-developer-form}.tsx`, `rating.types.ts` | Se restilizan; APIs sin cambios |
| `projects/components/{public-project-detail,proposal-cta,project-form,markdown-editor}.tsx` | Se restilizan; `ProposalCta` cambia solo la rama `developer` (enlace al ancla) |
| `proposals/components/{developer-proposal-section,proposal-form,own-proposal-card,withdraw-proposal-button}.tsx` | `DeveloperProposalSection` cambia de lugar de render (decisión en el detalle); el resto, solo estilo |
| `src/components/shared/{markdown-content,form-field,tag-picker,empty-state,confirm-dialog}.tsx` | `markdown-content`, `form-field` y `tag-picker` se restilizan (T0); `confirm-dialog`/`empty-state` sin cambios |
| `src/components/shared/initials-avatar.tsx`, `src/lib/initials.ts`, tokens, `surface`, `max-w-page`, controles `ui/**`, tamaño `touch` (022a) | Estilo |
| `lucide-react` (ya instalado) | Iconos de enlaces y de navegación; sin dependencias nuevas |
| Artboard `ProjectEditor.dc.html` (guía rápida) | Contenido de `MarkdownHelpCard` |
| shadcn (`npx shadcn@latest search @shadcn`): `card`, `avatar`, `accordion`, `breadcrumb`, `tabs` existen | No se añade ninguno aquí (YAGNI: `surface` e `InitialsAvatar` cubren la necesidad) |

No existen `AccountSectionNav` ni `MarkdownHelpCard` (Glob/Grep en `src/**`): se crean.

## Archivos

| Archivo | N/M | Tarea |
|---|---|---|
| `src/components/shared/markdown-content.tsx`, `form-field.tsx`, `tag-picker.tsx` | M | T0 |
| `src/modules/profile/components/developer-profile-view.tsx`, `developer-profile-form.tsx`, `developer-avatar.tsx`, `payouts-link-card.tsx` | M | T1 |
| `src/modules/profile/components/account-section-nav.tsx` | N | T1 |
| `src/modules/ratings/components/rating-list.tsx`, `rating-summary.tsx`, `rating-stars.tsx` | M | T1 |
| `src/app/developers/[id]/page.tsx`, `src/app/dashboard/account/page.tsx` | M | T1 |
| `src/modules/projects/components/public-project-detail.tsx`, `proposal-cta.tsx` | M | T2 |
| `src/modules/proposals/components/developer-proposal-section.tsx`, `proposal-form.tsx`, `own-proposal-card.tsx` | M | T2 |
| `src/app/projects/[id]/page.tsx` | M | T2 |
| `src/modules/projects/components/project-form.tsx`, `markdown-editor.tsx` | M | T3 |
| `src/modules/projects/components/markdown-help-card.tsx` | N | T3 |
| `src/modules/ratings/components/rate-developer-form.tsx` | M | T3 |
| `src/app/projects/new/page.tsx`, `src/app/projects/[id]/edit/page.tsx`, `src/app/projects/[id]/rate/page.tsx` | M | T3 |
| `docs/MANUAL-TESTS.md` | M | T4 |

Sin cambios: servicios, acciones, `*.schema.ts`, `*.types.ts`, `proposal-form` validaciones, `confirm-dialog.tsx`, `live-announcer.tsx`, `select-proposal-button.tsx`, `package.json`, `drizzle/**`, `layout.tsx`, `globals.css`, `src/components/ui/**`.

## Criterios de aceptación

- AC1: Perfil público: aside (avatar `xl`, nombre en h1, titular y ubicación, valoración, disponibilidad, "Editar mi perfil" solo para el dueño), Contacto con **los mismos textos de privacidad** (correo visible solo si el servidor lo entrega; "Visible cuando contrates a …"/oculto/restringido), Enlaces con icono por tipo y mismos `href`/`rel`/`target`, Sobre mí (Markdown; textos vacíos actuales) y Valoraciones con `id="valoraciones"`; sin elementos sin datos (Invitar, proyectos contratados, zona horaria, idiomas, tecnologías, distribución, "Ver las N").
- AC2: Valoraciones del perfil: promedio con estrellas y conteo (o "Aún sin valoraciones"), lista con avatar de iniciales, nombre abreviado, "N de 5", fecha absoluta y comentario; el aviso "Solo clientes con un proyecto contratado pueden valorar." aparece.
- AC3: Mi cuenta: cabecera, navegación lateral con "Perfil", "Valoraciones" y "Cobros de prueba" (las dos primeras llevan a su sección, la tercera a `/dashboard/payouts`), tarjetas por sección; **todo el comportamiento del formulario se conserva** (validación por campo, contador de biografía, añadir y quitar enlaces con el límite actual, visibilidad del correo, "Descartar cambios", "Guardar perfil" con "Guardando...", mensajes de éxito/error y anuncio); sin botones de subida de foto ni sección de seguridad.
- AC4: Detalle de proyecto: píldoras de categoría y "Publicado" + fecha, h1, tarjeta de descripción con cabecera "Descripción · Markdown" y estilo README, aside "Detalles" con presupuesto, plazo, categoría y tecnologías; sin cliente ni conteo de propuestas; `ProposalCta` conserva todas las ramas y textos (visitante, sin rol, cliente propio/ajeno, developer) y para developer muestra "Ir a la propuesta".
- AC5: Propuesta: para un developer, la sección `#propuesta` aparece en la columna principal (a ancho completo) con los mismos estados (formulario, "Tu propuesta" con editar/retirar y `ConfirmDialog`, aviso de cobros no configurados, error de carga); el enlace de 022b `/projects/<id>#propuesta` lleva a ella; para visitante, cliente y sin rol la sección **no** se renderiza.
- AC6: `ProposalForm` conserva campos, etiquetas, `budgetHint`, validación, errores por campo, "Enviar propuesta"/"Guardar cambios"/"Cancelar" y anuncios; **no existe** nada de adjuntos: `grep -ri "adjunt\|attachment" src` sigue sin resultados de interfaz (solo el test no relacionado actual), `grep -ri "archivo" src/modules/proposals` no encuentra textos de archivos o revisión de archivos, y el detalle no contiene "Puedes adjuntar tu cotización" (la nota de `MarkdownHelpCard` "No se pueden subir archivos ni imágenes aquí" es la única mención permitida, y está en el editor).
- AC7: Editor de proyecto: tarjeta con todos los campos y sus bloqueos por estado, editor Markdown con pestañas "Escribir"/"Vista previa", barra de formato con `role="toolbar"` y `aria-label`s actuales, contador, guía rápida de Markdown con la nota sin la frase de documentos; botones y mensajes iguales; los tests existentes de `markdown-editor` pasan sin cambios.
- AC8: Valoración: tarjeta con avatar, "Proyecto contratado · {título}", h1 "¿Cómo fue trabajar con {nombre}?", estrellas operables con teclado (`aria-pressed`), texto `aria-live`, comentario con contador, "Antes de enviar" y botones; los modos crear/editar/solo lectura y los límites (600 caracteres, 14 días) se comportan como antes.
- AC9: `MarkdownContent` conserva saneado, listas de tareas accesibles, tablas con `overflow-x-auto` y `rel` de enlaces, y gana el estilo README (h2/h3 con línea inferior, citas, código en Geist Mono); `FormField` y `TagPicker` conservan su API y comportamiento (sus tests pasan sin cambios).
- AC10: Accesibilidad: un `<h1>` por página; `aria-labelledby` de secciones; etiquetas asociadas a controles; foco visible (`ring-ring/40`); objetivos >= 44 px en controles interactivos (estrellas 52 px); contraste >= 4,5:1; el color nunca es el único indicador (campo inválido con texto de error `role="alert"`).
- AC11: No hay JetBrains Mono, Bricolage Grotesque ni Instrument Sans (ni referencias a `fonts.googleapis.com`) en el código; los bloques de código usan `font-mono` (Geist Mono).
- AC12: A 390 px no hay scroll horizontal de página en ninguna de las 6 pantallas (tablas Markdown y código desplazan dentro de su contenedor); a 1440 px la composición coincide con los artboards (con las salvedades de la tabla de conflictos).
- AC13: Los archivos tocados usan tokens y no introducen hex nuevos con token equivalente; no se añaden dependencias; `package.json` sin cambios.
- AC14: `npm run lint`, `npm run test` y `npm run build` pasan; **ningún test existente se modifica**; `npm run test:coverage` no cae por debajo de los umbrales; cero cambios en servicios, acciones, schemas, permisos y `drizzle/**`.

## Tests requeridos

Vitest, junto al archivo (SETUP §3: solo donde hay lógica). Esta fase **no introduce lógica nueva** (vistas presentacionales; la decisión de render de `DeveloperProposalSection` ya la toma `ProposalCta`/`PublicViewer`), por lo que no exige tests nuevos.

- Los tests existentes deben seguir pasando **sin modificarse**: `markdown-content.test.tsx`, `markdown-editor.test.tsx`, `tag-picker.test.tsx`, `confirm-dialog.test.tsx`, `withdraw-proposal-button.test.tsx`, `select-proposal-button.test.tsx`, `avatar-initials.test.ts`, y los de servicios de perfil, valoraciones y propuestas.
- Si el developer detecta una rama nueva de render con lógica (por ejemplo, decidir `Ir a la propuesta` solo para developer), puede añadir un test RTL de `proposal-cta.test.tsx` con la tabla visitante / sin rol / cliente propio / cliente ajeno / developer (no obligatorio; propuesto por riesgo de regresión en la rama que cambia).
- El reviewer corre `grep` de adjuntos, de fuentes y de hex nuevos, y lint/test/build.

## Tareas

Máximo 5. Durante el bloque paralelo (T1, T2 y T3) nadie corre `npm install` ni `npm run build`; el reviewer corre lint, test y build al final.

### T0 — Componentes compartidos de formulario y Markdown (serial, primero)

- Archivos: `src/components/shared/markdown-content.tsx`, `src/components/shared/form-field.tsx`, `src/components/shared/tag-picker.tsx`
- Depende de: 022a `done`
- Paralelizable: no
- Cubre: AC9, AC11 (parte), AC13 (parte)

### T1 — Perfil público y Mi cuenta

- Archivos: `src/modules/profile/components/developer-profile-view.tsx`, `developer-profile-form.tsx`, `developer-avatar.tsx`, `payouts-link-card.tsx`, `account-section-nav.tsx`, `src/modules/ratings/components/rating-list.tsx`, `rating-summary.tsx`, `rating-stars.tsx`, `src/app/developers/[id]/page.tsx`, `src/app/dashboard/account/page.tsx`
- Depende de: T0
- Paralelizable: sí (con T2 y T3)
- Cubre: AC1, AC2, AC3, AC10, AC12, AC13

### T2 — Detalle de proyecto y formulario de propuesta (sin adjuntos)

- Archivos: `src/modules/projects/components/public-project-detail.tsx`, `proposal-cta.tsx`, `src/modules/proposals/components/developer-proposal-section.tsx`, `proposal-form.tsx`, `own-proposal-card.tsx`, `src/app/projects/[id]/page.tsx`
- Depende de: T0
- Paralelizable: sí (con T1 y T3)
- Cubre: AC4, AC5, AC6, AC10, AC12, AC13

### T3 — Editor de proyecto y valoración

- Archivos: `src/modules/projects/components/project-form.tsx`, `markdown-editor.tsx`, `markdown-help-card.tsx`, `src/modules/ratings/components/rate-developer-form.tsx`, `src/app/projects/new/page.tsx`, `src/app/projects/[id]/edit/page.tsx`, `src/app/projects/[id]/rate/page.tsx`
- Depende de: T0
- Paralelizable: sí (con T1 y T2)
- Cubre: AC7, AC8, AC10, AC12, AC13

### T4 — Documentación y lista manual

- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: T1, T2, T3
- Paralelizable: no
- Cubre: AC12, AC14 (verificación manual)
- Detalle: sección nueva "8p. Spec 022d — Perfiles, proyecto y formularios" (texto abajo) antes de la 9, tras las secciones de 022a-022c si existen; actualizar `**Cubre:**`. Solo se añade o reemplaza lo indicado: el árbol tiene cambios sin commitear en `MANUAL-TESTS.md`.

### Lista manual (texto para `docs/MANUAL-TESTS.md`, "8p. Spec 022d")

Compara con los artboards de `docs/assets/1-perfiles-y-proyectos/` a **1440 px** y **390 px**. Cuentas: Cliente C, Desarrollador A (con perfil completo y valoraciones) y B (sin perfil), y un visitante.

- [ ] (a) **Perfil público:** `/developers/<id>` muestra avatar de iniciales, nombre, titular · ubicación, valoración (o "Aún sin valoraciones"), disponibilidad, Contacto, Enlaces con icono, Sobre mí (Markdown) y Valoraciones; no aparecen "Invitar a un proyecto", "proyectos contratados", zona horaria ni idiomas. Un desarrollador sin perfil muestra "Este desarrollador aún no completó su perfil".
- [ ] (b) **Privacidad del correo:** con visibilidad "Solo clientes que me contrataron", un cliente sin contrato ve "Visible cuando contrates…", uno con propuesta aceptada ve el correo, un visitante no lo ve (comportamiento de 019 sin cambios); "Nadie" lo oculta.
- [ ] (c) **Valoraciones:** el promedio, el conteo y la lista coinciden con los datos; el enlace "Ver valoraciones recibidas" de "Mi cuenta" lleva a `#valoraciones`.
- [ ] (d) **Mi cuenta:** navegación "Perfil / Valoraciones / Cobros de prueba" funciona (anclas y `/dashboard/payouts`); editar titular, ubicación, disponibilidad, biografía (contador), enlaces (añadir, quitar, URL inválida con error), contacto y guardar muestra el mensaje de éxito y se refleja en el perfil público; "Descartar cambios" restablece; no hay botones de subir foto.
- [ ] (e) **Detalle de proyecto:** descripción con estilo README (títulos con línea, listas de tareas, cita, tabla con scroll horizontal, código en monoespaciada), aside con presupuesto, plazo, categoría y tecnologías; no hay "Cliente" ni conteo de propuestas ni texto de adjuntos.
- [ ] (f) **Propuesta:** como Desarrollador A (cobros activos) la sección "Enviar una propuesta" aparece bajo la descripción a ancho completo y "Ir a la propuesta" del aside salta a ella; enviar con datos inválidos muestra errores por campo; enviar bien muestra "Tu propuesta" con editar y retirar (diálogo de confirmación, foco inicial en "Cancelar"); sin cobros activos aparece el aviso con enlace a `/dashboard/payouts`; como visitante, Cliente o sin rol no aparece el formulario. No hay sección "Adjuntos".
- [ ] (g) **Editor de proyecto:** `/projects/new` y `/projects/<id>/edit` muestran tarjeta con todos los campos (en un publicado: categoría, presupuesto y plazo bloqueados), editor con "Escribir/Vista previa" y barra de formato, guía rápida lateral sin mención de documentos en propuestas; guardar borrador, guardar cambios y publicar funcionan igual; teclado: la barra de formato es alcanzable y los botones tienen nombre.
- [ ] (h) **Valoración:** `/projects/<id>/rate` de un proyecto contratado: elegir estrellas con ratón y con teclado, texto "N de 5 · palabra", comentario con contador (máx. 600), "Antes de enviar", "Publicar valoración"; editar dentro de 14 días; tras enviar se ve en el perfil del desarrollador.
- [ ] (i) **Tipografía:** todo en Plus Jakarta Sans; el código y los editores usan monoespaciada (Geist Mono); no se pide ninguna fuente externa.
- [ ] (j) **Responsive:** a 390 px sin scroll horizontal en las 6 pantallas; columnas apiladas; el aside de "Mi cuenta" y la guía rápida quedan arriba/abajo sin cortar texto.
- [ ] (k) **Teclado y foco:** Tab recorre cada pantalla con foco visible y orden lógico; controles >= 44 px; mensajes de error con `role="alert"`; lector de pantalla anuncia estrellas, pestañas del editor y diálogos.

## Preguntas abiertas

- P1. Propuesta (conflicto 9): ¿mantener el formulario incrustado, ahora en la columna principal (recomendado, sin ruta nueva), o crear una página dedicada `/projects/[id]/propose` como el artboard? La página dedicada añade una ruta, su `loading/error` y redirecciones (más código, mismo comportamiento).
- P2. El perfil y "Mi cuenta" omiten campos del diseño que no existen (zona horaria, idiomas, tecnologías, proyectos contratados, invitar). Recomendación: **omitir**; añadirlos requiere spec de datos (019 `done`) con migración.
- P3. Valoraciones sin distribución por estrellas ni proyecto por reseña (conflicto 5). Recomendación: omitir; si se quieren, spec de ratings (servicio + tipo).
- P4. `ProposalCta` pasa de incrustar el formulario en el aside a un enlace "Ir a la propuesta" y se mueve la sección a la columna principal. Es un cambio de composición (no de lógica) de la spec 007/006 `done`. Recomendación: aceptar.
- P5. Detalle sin "Cliente" ni conteo de propuestas (conflicto 8): mostrarlos exigiría ampliar la lista blanca de 006 y revisar la privacidad. Recomendación: omitir.
- P6. Regla de textos "el diseño manda en títulos y subtítulos; lo existente manda en acciones, estados y mensajes" (común a 022a-022d). Aquí casi todo coincide; los casos de diferencia se resolvieron a favor de lo existente. Recomendación: confirmar.
- P7. Tamaño `xl` de `DeveloperAvatar` (128 px): extensión aditiva del componente de `profile`. Recomendación: aceptar.
- P8. Las specs `done` 005, 006, 007, 018, 019 y 020 no se editan; esta spec es la traza del cambio visual. Recomendación: no tocarlas.
- P9. `RatingStars` (T1) lo consume 022c (`DeveloperRatingCard`) con su API actual. Si 022c se implementa antes, no hay conflicto; si se implementan a la vez, el aspecto de las estrellas puede variar entre fases. Recomendación: implementar T1 de esta fase antes o junto a T2 de 022c.

## Próximas fases

- Ninguna dentro del rediseño (022a-022d completan el alcance aprobado).
- Opcional: campos de perfil extra (zona horaria, idiomas, tecnologías), invitaciones a proyectos, distribución de valoraciones, cliente y conteos en el detalle, subida de foto (specs de dominio propias).

# Descripción de proyecto en Markdown (estilo README)

Estado: done

Spec 018 de 4 nuevas (018 Markdown, 019 perfil de desarrollador, 020 valoraciones, 021 adjuntos de propuestas). Los ids 012-017 están reservados en `docs/SDD-PLAN.md`. Esta spec es independiente de las otras tres. Referencia visual y de textos: diseño `ProjectEditor.dc.html` (editor con pestañas "Escribir" / "Vista previa", guía rápida) y `ProjectDetail.dc.html` (descripción renderizada estilo README), ambos en el lienzo "Nexora — perfiles, Markdown y adjuntos".

## Objetivo

Que la descripción de un proyecto se escriba en Markdown (GFM) y se muestre estilo README de GitHub: en el detalle público `/projects/[id]` y en el editor privado (pestaña "Vista previa"). Sin subir archivos ni imágenes en la descripción y sin HTML crudo (se escapa o ignora y nunca se ejecuta). El campo `projects.description` existente se reutiliza sin migración de datos.

Arquitectura que aplica (solo lo necesario): `system-design.md §3` (propiedad de datos: la descripción sigue en Neon, sin Storage) y `§6` (permisos: no cambian; el render no concede acceso a nada). Base: spec 005 (campo `description`, límites 30-5000) y spec 006 (detalle y catálogo públicos).

## Alcance

- Incluye:
  - Componente compartido `MarkdownContent` que renderiza Markdown GFM de forma segura (sin HTML crudo, sin imágenes, enlaces filtrados).
  - Editor `MarkdownEditor` con pestañas Escribir / Vista previa, barra de formato, contador y guía rápida, integrado en `project-form.tsx` en lugar del `Textarea` actual.
  - Render en el detalle público del proyecto (`public-project-detail.tsx`).
  - Resumen del catálogo y `meta description` en texto plano (Markdown eliminado), nunca Markdown crudo.
  - Utilidades puras en `src/lib`: política de URL, Markdown a texto plano y helpers de formato para la barra.
  - Una dependencia nueva: `react-markdown` y `remark-gfm` (T0).
- No incluye:
  - Subida de archivos o imágenes, imágenes remotas, adjuntos (spec 021 los resuelve en propuestas, no aquí).
  - HTML crudo (`rehype-raw`), plugins de resaltado de sintaxis, matemáticas, diagramas, notas al pie, emojis `:code:`, menciones.
  - Markdown en descripciones de propuestas, perfiles u otros campos (la spec 019 decide los suyos).
  - Migración de datos, cambios de esquema, cambios en `projectInputSchema` (límites 30-5000 intactos), cambio de búsqueda del catálogo.
  - Vista del cliente de detalle con propuestas (spec 012): cuando exista, importará `MarkdownContent`.
  - Edición en vivo con previsualización lado a lado, editor WYSIWYG, guardado automático.

## Reutilizar

Verificado con Glob/Grep/ls en el repo.

- Campo y validación: `src/modules/projects/schema/projects.table.ts` (`description: text NOT NULL`, línea 32) y `src/modules/projects/schemas/project.schema.ts` (`description` 30-5000 con `trim`, `LIMITS`/`L.description`). Sin cambios.
- `src/modules/projects/components/project-form.tsx` (líneas ~164-185): `FormField` + `Textarea` con `name="description"`, `defaultValue={values.description}`, `readOnly={fullyReadOnly}`, `aria-invalid`/`aria-describedby`. Se sustituye el `Textarea` por `MarkdownEditor` conservando `name`, `values`, `readOnly` y la repoblación tras error.
- `src/components/shared/form-field.tsx` (render prop con `id`, `describedBy`, `invalid`), `src/components/ui/textarea.tsx`, `button.tsx`, `badge.tsx`, `label.tsx`: ya existen. No se añade ningún componente shadcn. Búsqueda de pestañas: Tabs de shadcn no está instalado; se evalúa con `npx shadcn@latest search @shadcn -q tabs` (el developer decide en T3, ver pregunta P5). Por defecto: dos `<button aria-pressed>` como en el diseño, sin Tabs.
- `src/modules/projects/components/public-project-detail.tsx` (líneas ~69-76: `<p className="whitespace-pre-line ...">{project.description}</p>`): se reemplaza por `<MarkdownContent>`.
- `src/modules/projects/services/public-catalog.service.ts`: `summarySql = left(description, 240)` y tipos `PublicProjectSummary`/`PublicProject` (`public-project.types.ts`). Se cambia para entregar texto plano.
- `src/app/projects/[id]/page.tsx` (`generateMetadata`, colapsa espacios de `project.description`): se usa la utilidad de texto plano.
- `src/modules/projects/components/public-project-card.tsx` consume el resumen; no se toca (recibirá texto plano del servicio).
- `src/lib/utils.ts` (`cn`), `src/components/shared/empty-state.tsx`: sin cambios.
- Librerías: `node_modules` no contiene `react-markdown`, `remark-*`, `rehype-*` ni `@tailwindcss/typography` (verificado con `ls node_modules`; solo existen `@tailwindcss/node|oxide|postcss`). Hay que instalar. No existe `dompurify`/`sanitize-html` y no se necesitan (ver Seguridad).
- Tests: Vitest + RTL + jest-dom + user-event ya instalados; patrón de test de componente en `src/components/shared/tag-picker.test.tsx` y `site-nav.test.tsx`.
- Next 16.3.8 / React 19.2.8: `MarkdownContent` no usa APIs de Next; sin `"use client"`, funciona como Server Component (detalle público, sin JS extra) y dentro del cliente (vista previa). No hay API de Next que consultar para esta spec.

## Decisiones (con recomendación por defecto; confirmar en "Preguntas abiertas")

- Librería: `react-markdown` + `remark-gfm`, sin `rehype-raw`. Las versiones exactas y la compatibilidad con React 19, ESM y Vitest/jsdom están **a verificar** al instalar (esperado `react-markdown` ^10 y `remark-gfm` ^4). Si Vitest necesita `server.deps.inline` para los paquetes ESM, se ajusta en T0 (`vitest.config.*` es de T0).
- Estilos: clases Tailwind propias mediante el prop `components` de react-markdown, usando los tokens y hex ya presentes en el diseño (`#E3E8E3`, `#F0F2EC`, `#535E56`, `#183D30`, `#202522`). Sin `@tailwindcss/typography` (dependencia extra; su tema no coincide con el diseño; `globals.css` queda intacto y se evitan conflictos con las specs paralelas).
- Imágenes: no se renderizan nunca. `![alt](url)` se muestra como el texto `alt` (sin carga de red; evita rastreo por URL remota y contenido no moderado, coherente con "sin imágenes").
- Enlaces: solo `http:`, `https:`, `mailto:`; cualquier otro esquema (`javascript:`, `data:`, `vbscript:`, `file:`, `tel:`) y las URL relativas o `#ancla` se muestran como texto sin enlace. Los enlaces externos llevan `target="_blank"` y `rel="noopener noreferrer nofollow ugc"`.
- Límite de longitud: sin cambios, 5000 caracteres (el diseño muestra "486 / 5000"). El contador se calcula en cliente sobre el texto del textarea.
- Saltos de línea: comportamiento GFM de README (una nueva línea simple se une en el mismo párrafo; línea en blanco = párrafo; dos espacios = `<br>`). No se añade `remark-breaks`. Consecuencia: descripciones antiguas en texto plano con saltos simples se verán unidas (ver P6).
- Encabezados: `#` se renderiza como `h2` y los niveles se desplazan (el `h1` de la página es el título del proyecto): `#`,`##` -> `h2`; `###` -> `h3`; `####+` -> `h4`.
- Dónde se renderiza: detalle público (`published`) y vista previa del editor privado. Catálogo/tarjetas: solo texto plano truncado a 240 caracteres. Detalle privado del cliente con propuestas: spec 012.

## Contratos

`src/lib/markdown.ts` (puro, sin dependencias de React):

```ts
const ALLOWED_LINK_PROTOCOLS: readonly ["http:", "https:", "mailto:"];
/** Devuelve la URL normalizada si el esquema está permitido, o null. Rechaza relativas, #anclas, javascript:/data: (con mayúsculas, espacios y caracteres de control). */
function sanitizeUrl(url: string | undefined): string | null;
/** Markdown a texto plano de una línea: quita encabezados, énfasis, código, enlaces (deja el texto), imágenes (deja el alt), listas, tablas, citas y HTML; colapsa espacios. */
function markdownToPlainText(markdown: string): string;
/** markdownToPlainText + truncado con "…" sin cortar a mitad de palabra cuando es posible. */
function summarizeMarkdown(markdown: string, maxLength: number): string;
```

`src/lib/markdown-format.ts` (puro; lo usa la barra del editor):

```ts
type MarkdownFormat = "heading" | "bold" | "italic" | "list" | "task-list" | "link" | "code" | "table";
type TextEdit = { value: string; selectionStart: number; selectionEnd: number };
function applyMarkdownFormat(format: MarkdownFormat, value: string, selectionStart: number, selectionEnd: number): TextEdit;
```

`src/components/shared/markdown-content.tsx`:

```tsx
export function MarkdownContent(props: { source: string; className?: string }): JSX.Element
```

Usa `ReactMarkdown` con `remarkPlugins={[remarkGfm]}`, sin `rehypePlugins`, `urlTransform` basado en `sanitizeUrl` (devolviendo `""` si es `null`), `components` para `h1-h4`, `p`, `a`, `ul`, `ol`, `li`, `input` (casilla de tarea: caja visual, `disabled`, con texto oculto "Completado:"/"Pendiente:" para lectores de pantalla como en el diseño), `blockquote`, `table` (envuelta en `overflow-x-auto`), `th`, `td`, `code`, `pre`, `hr`, `img` (devuelve solo el texto `alt`) y `strong`/`em` por defecto. `source` vacío no renderiza nada. Contenedor con `min-w-0 break-words`.

`src/modules/projects/components/markdown-editor.tsx` (`"use client"`):

```tsx
export function MarkdownEditor(props: {
  id: string;
  name: string;
  defaultValue: string;
  maxLength: number;
  minLength?: number;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
}): JSX.Element
```

- Estado interno `value` y `tab: "write" | "preview"`. El `<textarea name=...>` permanece montado siempre (oculto con `hidden` en la pestaña Vista previa) para que `FormData` envíe siempre el valor y no se pierda al cambiar de pestaña.
- Pestañas Escribir / Vista previa como botones con `aria-pressed` (textos del diseño); la barra de formato (Título, Negrita, Cursiva, Lista, Lista de tareas, Enlace, Código, Tabla) solo en "Escribir" y deshabilitada con `readOnly`; cada botón con `aria-label` (textos del diseño).
- Pie: contador `N / {maxLength} caracteres` (`aria-live="polite"` no; solo texto estático actualizado, sin anunciar cada tecla).
- Pista junto a la etiqueta: "Markdown · sin archivos ni imágenes". Guía rápida de Markdown y nota "No se pueden subir archivos ni imágenes aquí. El HTML se ignora por seguridad. Si necesitas compartir documentos, pídelos en las propuestas." (texto del diseño) como un `<aside>` o `<details>` en el formulario; no cambia datos.
- Vista previa: `<MarkdownContent source={value}/>`; con valor vacío muestra "Nada que previsualizar".

Server: ninguna action, servicio, esquema ni tipo nuevo ni modificado. `projectInputSchema.description` y `parseProjectForm` siguen devolviendo `description` como cadena recortada.

Servicio público: `PublicProjectSummary.summary` pasa a ser texto plano (el tipo no cambia). `PublicProject.description` sigue siendo el Markdown completo (el cliente/servidor lo renderiza con `MarkdownContent`).

## Seguridad

- Sin HTML crudo: no se usa `rehype-raw`, `dangerouslySetInnerHTML`, `skipHtml` queda en su valor por defecto. react-markdown (sin `rehype-raw`) no convierte HTML en nodos del DOM; el comportamiento exacto (escapado como texto u omitido) se **verifica** en el test (a verificar) y la spec acepta ambos siempre que no exista ningún elemento HTML creado a partir de la entrada.
- Sin sanitizador adicional: el árbol se construye con React (texto escapado por React). Se añade defensa explícita sobre URL y elementos peligrosos: `urlTransform` + `components.a`/`img`.
- Esquemas de enlace: allowlist `http`, `https`, `mailto`. `javascript:`, `data:`, `vbscript:`, mayúsculas/espacios/caracteres de control insertados en el esquema (`jav&#x09;ascript:`, `JaVaScRiPt:`, `\u0000`) se rechazan. Se normaliza con `new URL()` y se compara `protocol`.
- Enlaces externos: `rel="noopener noreferrer nofollow ugc"` (evita `window.opener`, reduce spam SEO por contenido de usuarios) y `target="_blank"`.
- Imágenes remotas bloqueadas: sin peticiones a dominios de terceros al ver un proyecto (privacidad de los visitantes, sin píxeles de rastreo, sin contenido no moderado).
- Autolinks GFM (`https://...` y `www.`): pasan por la misma allowlist.
- Autorización: no cambia. El detalle sigue sirviendo solo proyectos `published` (spec 006); la vista previa solo renderiza lo que el usuario escribe en su navegador.
- Límite de entrada: 5000 caracteres validados en servidor (spec 005); el render no se ejecuta sobre entradas mayores. Parseo de 5000 caracteres es acotado (sin riesgo de ReDoS: no se usan regex propias sobre Markdown salvo `markdownToPlainText`, que debe usar patrones lineales y se prueba con una entrada patológica de 5000 caracteres).
- Plain text de resumen: se aplica `escape` natural de React al mostrarlo; no se re-interpreta como HTML.
- Confianza en datos existentes: filas antiguas con texto o `<script>` literal ya guardadas se muestran inertes bajo las mismas reglas (sin migración).

## Archivos

Nuevos: `src/lib/markdown.ts`, `src/lib/markdown.test.ts`, `src/lib/markdown-format.ts`, `src/lib/markdown-format.test.ts`, `src/components/shared/markdown-content.tsx`, `src/components/shared/markdown-content.test.tsx`, `src/modules/projects/components/markdown-editor.tsx`, `src/modules/projects/components/markdown-editor.test.tsx`.

Modificados: `package.json` y `package-lock.json` (T0; y config de Vitest solo si hace falta), `src/modules/projects/components/project-form.tsx`, `src/modules/projects/components/public-project-detail.tsx`, `src/modules/projects/services/public-catalog.service.ts` (+ su `.test.ts`), `src/app/projects/[id]/page.tsx`.

No se tocan: `globals.css`, `layout.tsx`, `src/components/ui/**`, esquema/migraciones, `docs/architecture/**`, archivos de las specs 019-021.

## Criterios de aceptación

- AC1: `MarkdownContent` renderiza encabezados, párrafos, negrita, cursiva, listas ordenadas y no ordenadas, listas de tareas, citas, tablas GFM, código en línea, bloques de código, `hr` y enlaces. `#` y `##` salen como `h2`; ninguna descripción genera un `h1`.
- AC2: HTML crudo no crea elementos: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<iframe src="...">`, `<div onclick="...">` y `<style>` no producen ninguna etiqueta `script`, `img`, `iframe`, `style` ni atributos `on*` en el DOM; el texto del HTML aparece escapado o se omite (comportamiento fijado en el test).
- AC3: `[x](javascript:alert(1))`, `[x](JaVaScRiPt:alert(1))`, `[x](data:text/html;base64,...)`, `[x](vbscript:...)`, `[x](file:///...)`, `[x](/ruta)` y `[x](#a)` se muestran como texto sin `<a>` (sin atributo `href` peligroso); `[x](https://a.com)`, `[x](http://a.com)` y `[x](mailto:a@b.co)` generan `<a href>` con `rel` que contiene `noopener`, `noreferrer`, `nofollow` y `ugc` y `target="_blank"` (para `mailto:` el `rel` se aplica igual; `target` solo en http/https).
- AC4: `![alt](https://x.com/p.png)` y `![](data:...)` no generan `<img>` ni peticiones; se muestra el texto `alt` (vacío si no hay). Autolinks `https://...` pasan por la allowlist.
- AC5: Las casillas de tarea (`- [x]`, `- [ ]`) se muestran deshabilitadas, sin ser interactivas, con texto accesible "Completado"/"Pendiente"; los cambios no modifican el valor.
- AC6: Las tablas se envuelven en un contenedor con scroll horizontal y no desbordan el contenedor en pantallas pequeñas.
- AC7: `sanitizeUrl` devuelve la URL para `http:`, `https:` y `mailto:` y `null` para cualquier otro esquema, relativas, anclas, vacío/`undefined`, mayúsculas/espacios/caracteres de control intercalados en `javascript:`.
- AC8: `markdownToPlainText`/`summarizeMarkdown` quitan encabezados, énfasis, código, enlaces (conservan el texto), imágenes (conservan el alt), listas, tablas, citas y HTML; el resultado no contiene `#`, `**`, `|---|`, `[...](...)` ni etiquetas; colapsa espacios; trunca a `maxLength` con `…` y nunca excede `maxLength`. Termina en tiempo acotado con una entrada patológica de 5000 caracteres.
- AC9: `applyMarkdownFormat` aplica los 8 formatos: con selección envuelve (`**texto**`, `*texto*`, `` `texto` ``, `[texto](https://)`) y sin selección inserta marcador/plantilla con el cursor bien posicionado; los formatos de línea (`## `, `- `, `- [ ] `) se anteponen a la línea; `table` inserta una plantilla GFM de 2 columnas. Devuelve siempre `selectionStart <= selectionEnd` dentro de `value.length`.
- AC10: `MarkdownEditor` alterna Escribir / Vista previa con `aria-pressed` correcto; el valor escrito se conserva al cambiar de pestaña y sigue en el `FormData` del formulario (textarea siempre montado, `name="description"`); en Vista previa muestra el contenido renderizado con `MarkdownContent` (incluye AC2/AC3: el HTML escrito no se ejecuta en la vista previa); el contador muestra `N / maxLength`; con `readOnly` el textarea es de solo lectura y los botones de la barra están deshabilitados.
- AC11: `project-form.tsx` usa `MarkdownEditor` para `description`; mantiene `name="description"`, repoblación tras error de validación, `aria-invalid`/`aria-describedby`, `readOnly` en estados no editables y `minLength`/`maxLength` 30/5000. El envío sigue pasando por `parseProjectForm` sin cambios de contrato.
- AC12: El detalle público (`public-project-detail.tsx`) muestra la descripción con `MarkdownContent` bajo el encabezado "Descripción", con una cabecera tipo README (etiqueta "Markdown") según el diseño; no usa `whitespace-pre-line` ni `dangerouslySetInnerHTML`.
- AC13: El resumen del catálogo (`summary`) y la `description` de `generateMetadata` son texto plano de longitud acotada (240 en resumen; el `DESCRIPTION_LENGTH` existente en metadata); nunca contienen sintaxis Markdown ni HTML. Un proyecto con descripción `## Hola **mundo**` produce `Hola mundo`.
- AC14: No se subió ni se aceptó archivo alguno en la descripción: el formulario sigue siendo `FormData` de solo texto y la interfaz no ofrece botón de imagen/adjunto en la barra ni en la guía.
- AC15: No hay cambios de esquema, migración ni cambios en `projectInputSchema`; las filas existentes (texto plano) se muestran sin error.
- AC16: `npm run lint`, `npm run test` y `npm run build` pasan; `package.json` solo añade `react-markdown` y `remark-gfm`; ningún test usa red.

## Tests requeridos

Vitest, junto al archivo; entorno `jsdom` para componentes, `// @vitest-environment node` en tests puros de `src/lib` si no necesitan DOM.

- `src/lib/markdown.test.ts` (AC7, AC8): `sanitizeUrl` (permitidos, `javascript:` con mayúsculas/espacios/tab/`\u0000`/entidades, `data:`, `vbscript:`, `file:`, `tel:`, relativas, `//evil.com`, `#a`, vacío, `undefined`); `markdownToPlainText`/`summarizeMarkdown` (cada sintaxis, HTML con `<script>`, truncado, `maxLength` pequeño, entrada patológica de 5000 caracteres con límite de tiempo razonable, cadena vacía).
- `src/lib/markdown-format.test.ts` (AC9): cada formato con y sin selección, selección al inicio/fin/multilínea, texto vacío, posición del cursor.
- `src/components/shared/markdown-content.test.tsx` (AC1-AC6), casos de seguridad obligatorios:
  - XSS: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<svg onload=...>`, `<iframe>`, `<a href="javascript:..." onclick=...>` en HTML crudo, y HTML crudo dentro de listas, citas, tablas y bloques de código (en bloque de código se muestra literal). Aserciones: `container.querySelector("script, img, iframe, style, svg, [onerror], [onclick], [onload]")` es `null`; el texto literal aparece o no según el comportamiento fijado.
  - Enlaces: `javascript:`, variantes de mayúsculas/espacios/entidades, `data:`, `vbscript:`, relativas, anclas -> sin `<a>`; `http`, `https`, `mailto` -> `<a>` con `rel` y `target` esperados; referencia de enlace `[x][1]` con `[1]: javascript:...`.
  - Imágenes: Markdown de imagen remota, de data-URI y `<img>` HTML -> sin `<img>`.
  - Funcionales: encabezados desplazados (`#`->`h2`), tablas con scroll, casillas deshabilitadas con texto accesible, bloque de código, `source` vacío.
  - Prueba de regresión del fijado de comportamiento: `** negrita **` sin cerrar, Markdown mal formado y 5000 caracteres no lanzan excepción.
- `src/modules/projects/components/markdown-editor.test.tsx` (AC10, AC14): cambio de pestaña con `user-event`, conservación del valor, valor presente en `FormData` del `<form>` (también estando en Vista previa), contador, barra aplica formato al seleccionar texto, `readOnly`, vista previa con `<script>` escrito no crea elemento, ausencia de botón de imagen/adjunto.
- `src/modules/projects/services/public-catalog.service.test.ts` (ampliación; AC13): con PGlite/`createTestDb`, un proyecto `published` con descripción en Markdown devuelve `summary` en texto plano de a lo sumo 240 caracteres; el detalle devuelve el Markdown íntegro; `draft` sigue sin aparecer (regresión). Se mantienen los tests existentes.
- No requieren test unitario (SETUP.md §3): `project-form.tsx` y `public-project-detail.tsx` (composición; solo se comprueba que compilan y con la verificación manual), `src/app/projects/[id]/page.tsx`.
- Verificación manual (humano, tras T4): crear un proyecto con un README completo (el ejemplo del diseño), ver la vista previa y el detalle público y comprobar que coinciden; pegar `<script>`/`onerror`/`javascript:` y confirmar que no se ejecuta; confirmar que el catálogo muestra el resumen sin símbolos; editar un proyecto `published` (la descripción sigue editable) y un borrador antiguo en texto plano.

## Tareas

Máximo 5. Archivos disjuntos. `package.json`, lockfile y config de Vitest van solo en T0; nadie más corre `npm install`.

### T0 — Dependencias (serial, primero)

- Archivos: `package.json`, `package-lock.json` (`npm install react-markdown remark-gfm`), `vitest.config.*` solo si Vitest necesita configuración para los paquetes ESM (a verificar).
- Depende de: —
- Paralelizable: no
- Cubre: parte de AC16 (verifica `ls node_modules/react-markdown`, versión y compatibilidad con React 19; importar ambos en un test de humo de `src/components/shared` lo hace T1).

### T1 — Utilidades y renderizador compartido

- Archivos: `src/lib/markdown.ts`, `src/lib/markdown.test.ts`, `src/lib/markdown-format.ts`, `src/lib/markdown-format.test.ts`, `src/components/shared/markdown-content.tsx`, `src/components/shared/markdown-content.test.tsx`.
- Depende de: T0
- Paralelizable: no (contrato base de T2-T4)
- Cubre: AC1-AC9

### T2 — Texto plano en catálogo y metadatos

- Archivos: `src/modules/projects/services/public-catalog.service.ts`, `src/modules/projects/services/public-catalog.service.test.ts`, `src/app/projects/[id]/page.tsx`.
- Depende de: T1 (`summarizeMarkdown`)
- Paralelizable: sí (con T3 y T4)
- Cubre: AC13, AC15

### T3 — Editor con pestañas y formulario

- Archivos: `src/modules/projects/components/markdown-editor.tsx`, `src/modules/projects/components/markdown-editor.test.tsx`, `src/modules/projects/components/project-form.tsx`.
- Depende de: T1 (`MarkdownContent`, `applyMarkdownFormat`)
- Paralelizable: sí (con T2 y T4)
- Cubre: AC10, AC11, AC14

### T4 — Render en detalle público

- Archivos: `src/modules/projects/components/public-project-detail.tsx`.
- Depende de: T1 (`MarkdownContent`)
- Paralelizable: sí (con T2 y T3)
- Cubre: AC12, parte de AC16 (cierra con la verificación manual y `npm run build` del reviewer)

## Preguntas abiertas (recomendación por defecto)

- P1. Librería Markdown. Recomendado: `react-markdown` + `remark-gfm`, sin `rehype-raw`. Alternativa: `marked` + sanitizador (`isomorphic-dompurify`/`sanitize-html`), más superficie XSS y dependencias. Versiones y compatibilidad con React 19/Vitest a verificar en T0.
- P2. Estilos. Recomendado: clases Tailwind propias vía `components` (sin `globals.css` ni dependencias). Alternativa: `@tailwindcss/typography` (más rápido, tema distinto del diseño, modifica `globals.css` y añade dependencia).
- P3. Imágenes. Recomendado: nunca se renderizan (se muestra el `alt`). Alternativa: permitir solo `https` remotas con `loading="lazy"` y `referrerPolicy="no-referrer"`; contradice el "sin imágenes" del diseño y añade rastreo/moderación.
- P4. Enlaces. Recomendado: allowlist `http`/`https`/`mailto`, `rel="noopener noreferrer nofollow ugc"`, `target="_blank"`. Alternativa: sin `mailto` (menos superficie de spam) o sin `target="_blank"`.
- P5. Pestañas y barra de formato. Recomendado: botones con `aria-pressed` como en el diseño y barra de 8 botones con `applyMarkdownFormat` (pura y probada). Alternativa: shadcn Tabs (si existe en el registro y no añade paquetes) y/o prescindir de la barra (YAGNI, el diseño la muestra; menos código y menos tests).
- P6. Saltos de línea. Recomendado: semántica GFM de README, sin `remark-breaks`; descripciones antiguas en texto plano con saltos simples se verán unidas hasta que el cliente las edite. Alternativa: `remark-breaks` (una dependencia más) para conservar el aspecto previo.
- P7. Límite de longitud. Recomendado: mantener 30-5000 (spec 005, diseño). Alternativa: subir a 10 000 si los clientes necesitan briefs largos (cambia `projectInputSchema` y su test, fuera de esta spec).
- P8. Encabezados. Recomendado: `#` y `##` como `h2`, el resto desplazados. Alternativa: respetar niveles tal cual (puede producir `h1` duplicado, problema de accesibilidad).
- P9. Búsqueda del catálogo (`ilike` sobre la descripción) sigue coincidiendo con símbolos de Markdown (p. ej. buscar `**`). Recomendado: aceptarlo (impacto bajo). Alternativa: columna `description_plain` generada (migración, fuera de alcance).
- P10. Detalle privado del cliente para ver su propio borrador: hoy es la página de edición. Recomendado: la vista previa del editor basta. Alternativa: página de solo lectura (cabe en spec 012).

## Próximas fases

- Spec 012: panel del cliente con detalle y propuestas; importará `MarkdownContent`.
- Spec 019 y 021 podrán reutilizar `MarkdownContent`/`MarkdownEditor` si deciden Markdown en otros campos (en 021 los adjuntos son de propuestas y no de la descripción del proyecto).
- Spec 014: pulido de accesibilidad del editor (atajos de teclado, anuncios).
- Opcional: resaltado de sintaxis, columna de texto plano para búsqueda (P9).

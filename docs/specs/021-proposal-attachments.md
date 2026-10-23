# Adjuntos en propuestas (Excel, Word, PDF y otros)

Estado: descartada

> **Descartada (2026-10-22, decidida por el humano).** Fuera del MVP: la propuesta se queda con su descripción en Markdown (hasta 5000 caracteres). No se almacenan archivos, así que no hay storage, antivirus ni subida. Este documento queda solo como referencia si se retoma (opciones evaluadas: Vercel Blob subiendo desde el servidor con tope de ~4 MB, o `bytea` en la BD).

Spec 021. Independiente de 018 (Markdown), 019 (perfil) y 020 (valoraciones): solo depende del módulo de propuestas (007, 008; ambas `done`). Los ids 012-017 están reservados en `docs/SDD-PLAN.md`. Formato y patrones: specs 007, 008 y 011a. Referencia visual (no es contrato): `ProposalForm.dc.html` del diseño ("Adjuntos (opcional) · Hasta 5 archivos · 10 MB cada uno", zona de arrastre, filas con tipo, tamaño, progreso y error "Tipo de archivo no permitido") y `ProjectDetail.dc.html` (nota "Puedes adjuntar tu cotización o plan de trabajo en PDF, Word o Excel").

## Objetivo

Que el desarrollador autor adjunte archivos (cotización, plan de trabajo, desglose de costos) a su propuesta `pending`, y que el cliente dueño del proyecto (y solo él, además del autor) los descargue de forma segura. La descripción del proyecto (018) sigue sin subir archivos; solo las propuestas los aceptan.

Documentos de arquitectura que aplican (leer solo estas secciones):

- `system-design.md §3` (propiedad de datos): la fila "Archivos privados" pasa de "MVP sin archivos; reservado" a activa. Neon guarda solo metadatos y la clave del objeto; el binario vive en el storage privado. `BRIEF §9` ya fija **Supabase Storage** para archivos privados.
- `system-design.md §4` (módulos): el módulo `proposals` escribe `proposal_attachments`. `§6` (permisos): sin acciones nuevas en la matriz (ver Seguridad).
- `state-machines.md §2` (propuesta): adjuntar/quitar solo en `pending`, igual que editar (007 RF3).
- `system-design.md §8` (decisiones): se registran D1 a D8 de esta spec (T4).

## Decisiones (con recomendación; "a verificar" = no comprobable desde el repo)

- **D1. Proveedor de almacenamiento: Supabase Storage, bucket privado.** Recomendado porque ya es el stack aprobado (`BRIEF §9`, `system-design §3`; spec 001 pregunta 5 lo dejó como "confirmar antes de que una spec dependa de subir archivos": esta spec lo necesita, ver P1). Alternativas: Vercel Blob (más simple, pero el store público/privado y las URLs firmadas de corta vida dependen del plan; a verificar), S3/R2 con URLs prefirmadas (más control, más configuración: IAM, CORS, SDK `@aws-sdk/*` pesado), UploadThing (SaaS de terceros extra, sin ventaja aquí). Nueva dependencia: `@supabase/supabase-js` (solo servidor). No se instala hasta aprobar esta spec (SDD-PLAN regla 8).
- **D2. Subida directa del navegador al storage con URL firmada de subida, no a través de una server action.** Verificado en `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` línea 83 y `.../serverActions.md` (`bodySizeLimit`): las actions tienen tope de 1 MB por defecto. Subir 10 MB por action obligaría a subir `bodySizeLimit` para **todas** las actions (más superficie de abuso) y toparía con el límite de payload de las funciones del hosting (a verificar según el despliegue, spec 017). Flujo en tres pasos: (1) action "solicitar subida" valida metadatos y reserva fila; (2) el navegador sube el binario al storage con la URL firmada; (3) action "confirmar" verifica en servidor tamaño y bytes reales. Sin confirmación el archivo no es descargable.
- **D3. Tipos permitidos** (extensión **y** MIME declarado **y** firma de bytes): `pdf`, `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `csv`, `txt`, `png`, `jpg`/`jpeg`, `zip` (todos los de la lista del diseño). Bloqueados siempre: ejecutables y scripts (`exe`, `dll`, `bat`, `cmd`, `com`, `msi`, `scr`, `ps1`, `sh`, `js`, `jar`, `apk`, `app`), documentos con macros (`docm`, `xlsm`, `pptm`), `html`/`htm`/`svg` (XSS) y cualquier extensión fuera de la lista (lista blanca; la lista negra solo cubre extensiones intermedias, ver RF1). `zip` es el tipo de mayor riesgo; se mantiene por el diseño, sin descompresión en servidor (P3).
- **D4. Límites: 10 MB por archivo, 5 archivos por propuesta, 25 MB en total por propuesta.** Las constantes viven en un solo lugar (`ATTACHMENT_LIMITS`). El tope de 25 MB es propuesta de esta spec (el diseño solo da 10 MB y 5 archivos; sin tope total serían 50 MB).
- **D5. Antivirus: ninguno en la fase 1**, con mitigaciones por diseño: bucket privado, descarga forzada (`Content-Disposition: attachment`), tipos en lista blanca con firma verificada, sin render ni previsualización en la app, MIME canónico, URL de descarga de 60 s solo para autor y cliente dueño, y aviso en la UI. Alternativas: ClamAV propio (requiere un servicio aparte, no cabe en un hosting serverless), servicio de terceros (VirusTotal/Cloudmersive/Supabase+edge function; coste, privacidad de los archivos y latencia). **Consecuencia de texto:** el diseño dice "Se revisan antes de guardarse"; sin antivirus eso sería falso. La UI debe decir "Verificamos el tipo y el tamaño de cada archivo" (P2). La interfaz de storage y el estado de la fila dejan espacio para añadir un estado `scanning` después sin rediseñar.
- **D6. Descarga:** una ruta `GET` autenticada resuelve la autorización en servidor y responde `302` a una URL firmada de **60 segundos** con descarga forzada y nombre saneado. Nunca URLs públicas ni URLs guardadas en BD.
- **D7. Estados en los que se adjunta/quita:** solo propuesta `pending` (y por invariante 007 R7, proyecto `published`). `accepted`, `rejected` y `withdrawn` son de solo lectura. Cada cambio de adjuntos **actualiza `proposals.updated_at`**: la selección (008) exige que el cliente haya visto la última versión (`PROPOSAL_CHANGED`), y un archivo nuevo o quitado es un cambio de la oferta.
- **D8. Borrado y huérfanos:** al retirar la propuesta se borran objetos y filas (mejor esfuerzo, ver RF4); al quitar un archivo, también. En `rejected`/`accepted` se conservan. Por construcción no hay objetos sin fila (la fila se crea antes de emitir la URL; se borra el objeto antes que la fila). Las filas `pending_upload` abandonadas se limpian de forma oportunista al solicitar otra subida en la misma propuesta (> 15 min). Un barrido global programado queda para una fase posterior (P6).
- **D9. Creación de propuesta con archivos:** la propuesta debe existir para tener `proposal_id`. En el formulario de creación, al enviar: primero se crea la propuesta (action existente, ahora devuelve su id) y luego se suben los archivos seleccionados uno a uno. Si alguno falla, la propuesta **ya existe** y el formulario pasa a modo edición mostrando qué archivos faltan para reintentar. Se descartó una tabla de subidas "sueltas" sin propuesta (más estados, más huérfanos; YAGNI).

## Alcance

- Incluye:
  - Dependencia y variables de entorno (T0), tabla `proposal_attachments` y migración generada con drizzle-kit (T0).
  - Cliente Supabase servidor y adaptador de storage detrás de una interfaz mockeable.
  - Validación de nombre, extensión, MIME, tamaño, cantidad y firma de bytes; saneamiento de nombres.
  - Servicio: solicitar subida, confirmar, quitar, listar, autorizar descarga, purgar por retirada.
  - Server actions y ruta de descarga.
  - UI: campo de adjuntos en el formulario de propuesta (crear/editar), lista en la tarjeta propia y en el detalle del cliente.
  - Documentación de arquitectura y pasos manuales (creación del bucket).
- No incluye:
  - Adjuntos en proyectos o en la descripción Markdown (018), en mensajes, perfiles (019) o valoraciones (020).
  - Antivirus, previsualización en línea, miniaturas, descompresión, OCR, versionado de archivos.
  - Barrido global programado de huérfanos y cron (P6), rate limiting (015), cuotas por usuario.
  - Acceso de admin a la descarga (P5).
  - Notificaciones al cliente por nuevos adjuntos.
  - Cambios en `project.service.ts`, `proposal-selection.service.ts`, detalle público de 006 (el catálogo público nunca expone adjuntos).

## Reutilizar

Inventario verificado con Glob, Grep y Read.

| Existente | Uso |
|---|---|
| `src/modules/proposals/**`: `proposal.service.ts` (patrón `assertCan`, proyecciones por columna, `FOR SHARE`/`UPDATE ... WHERE status`), `proposal-errors.ts` (patrón de errores con mapa código -> HTTP/mensaje), `proposal.types.ts` (`ProposalFormState`, `ProposalActionResult`), `proposal.actions.ts` (patrón re-auth -> UUID -> servicio -> `revalidatePath`) | Patrón y punto de extensión. `proposal.service.ts` y `proposal-selection.service.ts` **no se modifican** |
| `src/modules/proposals/schema/proposals.table.ts` | Solo FK. Sin cambios |
| `src/modules/proposals/components/`: `proposal-form.tsx`, `own-proposal-card.tsx`, `developer-proposal-section.tsx`, `client-proposal-detail.tsx`, `withdraw-proposal-button.tsx`, `proposal-status-badge.tsx` | Se extienden (T4). Patrón visual y de errores `aria-live` |
| `src/modules/auth/**`: `requireRole`, `requireOwnership`, `getCurrentUser`, `can` (`proposal.create`, `proposal.read`, `proposal.withdraw`), `AuthError`, `handleAuthErrorForPage` | Guards. Sin acciones nuevas en la matriz |
| `src/modules/payments/schema/connected-accounts.table.ts` y `src/lib/db/connected-accounts-constraints.test.ts` | Patrón de tabla con enum, CHECKs e índices y de su prueba de restricciones con PGlite |
| `src/lib/db/client.ts`, `src/lib/db/test-db.ts` (`createTestDb`), patrón de mock `Proxy` + `holder` de `proposal.service.test.ts` | Pruebas con PGlite y migraciones reales |
| `src/lib/stripe.ts` (singleton `server-only`, `StripeConfigError`) | Patrón del cliente `src/lib/supabase.ts` (falla con error claro si faltan variables, sin mostrar valores) |
| `src/lib/utils.ts`, `src/components/ui`: `button`, `badge`, `label`; `src/components/shared/empty-state.tsx` | UI. `ls src/components/ui` = `alert-dialog, badge, button, input, label, native-select, textarea`: no hay componente de subida ni barra de progreso en shadcn; `npx shadcn@latest search @shadcn -q progress` se ejecuta en T4: si existe `progress` y se aprueba, se añade en T0; si no, barra con `<progress>` nativo (P8). Dropzone: se construye en `modules/proposals/components` (específico, sin lógica compartida) |
| `src/proxy.ts` (corre para `/(api|trpc)(.*)`, solo expone la sesión de Clerk) | La ruta de descarga recibe sesión; la autorización vive en el handler |
| `src/app/api/webhooks/stripe/route.ts` | Precedente de route handler delgado |
| `.env.example` | Se añaden nombres (T0) |

No existe código de storage ni dependencia de Supabase: se crea. No existen `src/hooks` ni stores; no se necesitan.

## Archivos

| Archivo | N/M | Tarea |
|---|---|---|
| `package.json`, `package-lock.json` (`@supabase/supabase-js`) | M | T0 |
| `.env.example` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | M | T0 |
| `src/lib/supabase.ts` (cliente servidor singleton) + `src/lib/supabase.test.ts` | N | T0 |
| `src/modules/proposals/schema/proposal-attachments.table.ts` | N | T0 |
| `drizzle/00NN_proposal_attachments.sql`, `drizzle/meta/00NN_snapshot.json`, `drizzle/meta/_journal.json` (generados; `NN` lo asigna drizzle-kit) | N/N/M | T0 |
| `src/lib/db/proposal-attachments-constraints.test.ts` | N | T0 |
| `src/modules/proposals/types/proposal-attachment.types.ts` | N | T1 |
| `src/modules/proposals/schemas/proposal-attachment.schema.ts` + `.test.ts` (límites, lista blanca, validación de metadatos) | N | T1 |
| `src/modules/proposals/services/attachment-file-rules.ts` + `.test.ts` (saneamiento de nombre, firma de bytes) | N | T1 |
| `src/modules/proposals/services/attachment-errors.ts` | N | T1 |
| `src/modules/proposals/services/attachment-storage.ts` (interfaz y fábrica) | N | T1 |
| `src/modules/proposals/services/supabase-attachment-storage.ts` + `.test.ts` | N | T1 |
| `src/modules/proposals/services/proposal-attachment.service.ts` + `.test.ts` | N | T2 |
| `src/modules/proposals/actions/proposal-attachment.actions.ts` + `.test.ts` | N | T3 |
| `src/modules/proposals/actions/proposal.actions.ts` + `proposal.actions.test.ts` (`createProposalAction` devuelve `proposalId`; `withdrawProposalAction` purga adjuntos) | M | T3 |
| `src/modules/proposals/types/proposal.types.ts` (`ProposalFormState` success con `proposalId?`) | M | T3 |
| `src/app/api/proposals/[proposalId]/attachments/[attachmentId]/route.ts` + `route.test.ts` | N | T3 |
| `src/modules/proposals/components/attachments-field.tsx`, `attachment-list.tsx` | N | T4 |
| `src/modules/proposals/components/proposal-form.tsx`, `own-proposal-card.tsx`, `developer-proposal-section.tsx`, `client-proposal-detail.tsx` | M | T4 |
| `docs/architecture/system-design.md` (§3, §4, §8), `docs/MANUAL-TESTS.md`, `docs/SETUP.md` (nota en §4) | M | T4 |

Cada archivo pertenece a una sola tarea. Los archivos con cambios sin commitear de otras specs (`.env.example`, `docs/*`, `drizzle/meta/_journal.json`) **solo reciben adiciones**.

## Contratos

### 1. Tabla `proposal_attachments` (T0)

Patrón de `connected-accounts.table.ts`. Un archivo adjunto pertenece a una propuesta; el autor y el proyecto se derivan de la propuesta (sin columnas redundantes).

```ts
export const proposalAttachmentStatusEnum = pgEnum("proposal_attachment_status", ["pending_upload", "ready"]);

export const proposalAttachments = pgTable("proposal_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull().references(() => proposals.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull().unique(),     // server-generated; never derived from the user file name
  fileName: text("file_name").notNull(),                   // sanitized display name
  contentType: text("content_type").notNull(),             // canonical MIME from the allow-list, not the client's
  sizeBytes: integer("size_bytes").notNull(),
  status: proposalAttachmentStatusEnum("status").notNull().default("pending_upload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (t) => [
  check("proposal_attachments_size_valid", sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
  check("proposal_attachments_name_length", sql`char_length(${t.fileName}) BETWEEN 1 AND 255`),
  check("proposal_attachments_key_format", sql`${t.storageKey} LIKE 'proposals/%'`),
  check("proposal_attachments_ready_has_confirmed_at", sql`(${t.status} = 'ready') = (${t.confirmedAt} IS NOT NULL)`),
  index("proposal_attachments_proposal_idx").on(t.proposalId),
]);
```

- La clave de objeto es `proposals/<proposalId>/<attachmentId>.<ext>` (extensión de la lista blanca; el nombre original solo se guarda como texto).
- El límite de cantidad y de tamaño total no es un CHECK entre filas: lo aplica el servicio bajo bloqueo (RF2).
- Sin `uploadedBy`: siempre es el autor de la propuesta. Sin URL ni token guardados.
- **Migración:** la genera drizzle-kit (`npm run db:generate -- --name proposal_attachments`); no se escribe SQL a mano; no hace falta `DATABASE_URL`. El número lo asigna drizzle-kit al momento de generar: si 019/020 generan migraciones, se aprueban y se corren en orden para no chocar en el journal. **Prohibido `npm run db:migrate`**: lo corre el humano. `src/lib/db/migrations.test.ts` no cambia.

### 2. Variables de entorno y cliente (T0)

`.env.example` (solo nombres):

```
# Supabase Storage (private files; server-side only, never NEXT_PUBLIC_)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

El nombre del bucket es una constante (`"proposal-attachments"`), no variable (YAGNI). `src/lib/supabase.ts`: `import "server-only"`, `getSupabaseAdmin()` singleton con `createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })`; faltan variables -> error de configuración sin mostrar valores (patrón `StripeConfigError`). La service role key **nunca** sale del servidor ni va en `NEXT_PUBLIC_`. El bucket lo crea el humano como **privado** (pasos en MANUAL-TESTS, T4), con `file_size_limit = 10485760` y `allowed_mime_types` de D3 como defensa en profundidad.

### 3. Reglas de archivo y schema (T1)

`proposal-attachment.schema.ts`:

```ts
export const ATTACHMENT_LIMITS = { maxFileBytes: 10 * 1024 * 1024, maxFiles: 5, maxTotalBytes: 25 * 1024 * 1024, maxNameLength: 255 } as const;
export const ALLOWED_ATTACHMENT_TYPES: Record<Ext, { mimes: readonly string[]; signature: "pdf" | "zip" | "ole" | "png" | "jpeg" | "text" }>;
export const attachmentUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(ATTACHMENT_LIMITS.maxFileBytes),
  contentType: z.string().trim().max(127),
});   // ext + MIME consistency is a refine; errors map to INVALID_FILE_TYPE / FILE_TOO_LARGE
```

`attachment-file-rules.ts` (puro, sin I/O):

```ts
sanitizeFileName(name: string): string      // basename only (strips path separators, "..", control chars, bidi/RTL overrides U+202A-202E/2066-2069, NUL); collapses spaces; keeps a safe extension; truncates to 255 total; never empty (falls back to "adjunto.<ext>")
getExtension(name: string): string | null   // lowercase, last segment
hasBlockedInnerExtension(name: string): boolean   // "informe.pdf.exe", "x.exe.pdf" -> true (any segment in the block list of D3)
matchesSignature(ext: Ext, head: Uint8Array): boolean
// pdf "%PDF-"; docx/xlsx/pptx/zip "PK\x03\x04"; doc/xls/ppt OLE "D0 CF 11 E0 A1 B1 1A E1"; png "89 50 4E 47 0D 0A 1A 0A"; jpg "FF D8 FF";
// csv/txt: no NUL bytes and valid UTF-8 in the first 8 KB. Any head beginning "MZ", "\x7FELF" or "#!" is rejected for every type.
```

Errores (`attachment-errors.ts`, estilo `proposal-errors.ts`; fallas de autorización siguen siendo `AuthError`):

| Código | HTTP | Mensaje (es) | Cuándo |
|---|---|---|---|
| `INVALID_FILE_TYPE` | 422 | "Tipo de archivo no permitido." | Extensión fuera de la lista, extensión intermedia bloqueada, MIME incoherente |
| `FILE_TOO_LARGE` | 422 | "El archivo supera los 10 MB." | Tamaño declarado o real > límite |
| `TOO_MANY_FILES` | 409 | "Una propuesta admite hasta 5 archivos." | Cantidad (incluye `pending_upload` vigentes) |
| `TOTAL_SIZE_EXCEEDED` | 409 | "Los adjuntos de una propuesta no pueden superar 25 MB en total." | Suma |
| `PROPOSAL_NOT_EDITABLE` | 409 | "La propuesta ya no está pendiente y sus archivos no se pueden modificar." | Estado distinto de `pending` |
| `UPLOAD_NOT_FOUND` | 409 | "No encontramos el archivo subido. Inténtalo de nuevo." | Confirmar sin objeto en storage |
| `CONTENT_MISMATCH` | 422 | "El contenido del archivo no coincide con su tipo." | Firma inválida o tamaño real distinto del declarado; se borra objeto y fila |
| `STORAGE_UNAVAILABLE` | 502 | "No pudimos acceder al almacenamiento. Inténtalo de nuevo en unos minutos." | Error del proveedor o variables ausentes |

### 4. Storage detrás de una interfaz (T1)

```ts
// attachment-storage.ts
export interface AttachmentStorage {
  /** Presigned single-use upload target for exactly this key. */
  createUploadTarget(key: string): Promise<{ uploadUrl: string; token: string; expiresAt: Date }>;
  /** null when the object does not exist. Size comes from the provider, not from the client. */
  getObjectInfo(key: string): Promise<{ sizeBytes: number } | null>;
  /** First `length` bytes (for signature checks); null when missing. */
  readHead(key: string, length: number): Promise<Uint8Array | null>;
  /** Short-lived URL that forces download with the given (already sanitized) file name. */
  createDownloadUrl(key: string, opts: { fileName: string; expiresInSeconds: number }): Promise<string>;
  remove(keys: readonly string[]): Promise<void>;     // idempotent: missing keys are not an error
}
export function getAttachmentStorage(): AttachmentStorage;   // Supabase adapter; tests inject a fake
```

`supabase-attachment-storage.ts` implementa la interfaz con `storage.from(BUCKET).createSignedUploadUrl`, `.list`/`.info`, `.createSignedUrl(key, ttl, { download: fileName })` y `.remove`. **A verificar** (no comprobable sin instalar el paquete; el developer lo confirma contra los `.d.ts` instalados y lo anota): firmas exactas de esos métodos; vigencia de la URL de subida (la documentación pública indica ~2 h); que el protocolo de subida firmada admita `PUT` desde el navegador (si requiere el cliente JS, el navegador usará `createClient(url, anonKey).storage.uploadToSignedUrl` solo para esto y se añade `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ver P7); cómo leer solo los primeros bytes (rango HTTP sobre una URL firmada de lectura de 30 s); que `download` fuerza `Content-Disposition: attachment`; límite global de tamaño de objeto del plan contratado; que el `Content-Type` de la subida no pueda servirse como `text/html` con descarga forzada.

### 5. Servicio (T2, `import "server-only"`)

Todas las funciones reciben `actor: AuthUser` y repiten la autorización; el almacenamiento se inyecta como último parámetro opcional `deps: { storage?: AttachmentStorage } = {}` (por defecto `getAttachmentStorage()`), para mockearlo.

```ts
requestAttachmentUpload(actor, proposalId, input: { fileName; sizeBytes; contentType }, deps?): Promise<{ attachmentId: string; upload: { url: string; token: string } }>
confirmAttachmentUpload(actor, attachmentId, deps?): Promise<AttachmentSummary>
removeAttachment(actor, attachmentId, deps?): Promise<void>
listProposalAttachments(actor, proposalId): Promise<AttachmentSummary[]>          // only status 'ready'
getAttachmentDownloadUrl(actor, proposalId, attachmentId, deps?): Promise<string>
purgeProposalAttachments(proposalId, deps?): Promise<void>                        // internal, called after a withdrawal
type AttachmentSummary = { id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: Date };   // never storageKey, status or proposalId
```

Reglas:

- **`requestAttachmentUpload`** (autor developer, `can("proposal.create")`): en una transacción, `SELECT ... FROM proposals WHERE id = ? FOR UPDATE` (serializa las subidas de la misma propuesta y choca con el `UPDATE` de retirar/seleccionar). Inexistente o `developerId !== actor.id` -> `AuthError NOT_FOUND`; `status !== 'pending'` -> `PROPOSAL_NOT_EDITABLE`. Valida con el schema y las reglas puras (nombre saneado, extensión, MIME, bloqueos). Limpia las filas `pending_upload` de esa propuesta con más de 15 min (objeto primero, fila después). Cuenta filas vigentes (`ready` + `pending_upload`) y suma tamaños: `TOO_MANY_FILES` / `TOTAL_SIZE_EXCEEDED`. Inserta la fila (`pending_upload`) con la clave generada, y **después** pide `createUploadTarget` (fuera de la transacción; si falla, se borra la fila y `STORAGE_UNAVAILABLE`).
- **`confirmAttachmentUpload`** (autor): carga la fila + propuesta del actor (ajena o inexistente -> `NOT_FOUND`); idempotente si ya está `ready`. Re-verifica `status = 'pending'` de la propuesta. `getObjectInfo` (null -> `UPLOAD_NOT_FOUND`), compara tamaño real con el declarado y con el límite, `readHead` y `matchesSignature`. Si falla: borra objeto y fila y lanza `FILE_TOO_LARGE`/`CONTENT_MISMATCH`. Si pasa: transacción que revalida estado `pending` de la propuesta (bloqueo `FOR UPDATE`), marca `ready` con `confirmedAt` y hace `UPDATE proposals SET updated_at = now()` (D7).
- **`removeAttachment`** (autor): solo con propuesta `pending` (`PROPOSAL_NOT_EDITABLE`); borra el objeto y luego la fila; si el borrado del objeto falla, la fila se conserva y se lanza `STORAGE_UNAVAILABLE` (no hay objetos sin fila). Actualiza `proposals.updated_at` si la fila estaba `ready`.
- **`listProposalAttachments`**: autor developer, o cliente dueño del proyecto (propuesta no `withdrawn`, mismo criterio que `getProjectProposal` de 007). Cualquier otro caso: `NOT_FOUND` (o `FORBIDDEN` por rol, como 007). Solo filas `ready`.
- **`getAttachmentDownloadUrl`**: mismas reglas de lectura; la fila debe pertenecer a `proposalId` y estar `ready`; si no, `NOT_FOUND` (indistinguible). Devuelve `createDownloadUrl(key, { fileName, expiresInSeconds: 60 })`. Una fila `ready` cuyo objeto falta: `NOT_FOUND`.
- **`purgeProposalAttachments`**: borra objetos y luego filas de la propuesta; los errores de storage se registran sin datos sensibles y no relanzan (la retirada ya se confirmó).
- Autorización de lectura: no se añade acción a `permissions.ts`. Se usan `can("proposal.create")` (escritura, solo developer), `can("proposal.read")` + comprobación de rol y propiedad exactamente como `proposal.service.ts` de 007. El admin queda excluido de la descarga (P5).
- Logs: solo `proposalId`/`attachmentId` y códigos de error. Nunca claves de objeto, URLs firmadas, nombres de archivo ni tokens.

### 6. Server actions y ruta de descarga (T3)

`proposal-attachment.actions.ts` (`"use server"`; todas: `requireRole("developer")` -> UUID válido (si no, `NOT_FOUND` sin tocar BD) -> servicio -> `revalidatePath("/projects/<projectId>")`, `/dashboard/proposals` y `/projects/<projectId>/proposals`; `AuthError` distinto de `NOT_FOUND` -> `handleAuthErrorForPage`; `AttachmentError` -> mensaje en español sin lanzar; otro error -> mensaje genérico):

```ts
requestAttachmentUploadAction(proposalId: string, input: { fileName: string; sizeBytes: number; contentType: string }): Promise<{ ok: true; attachmentId: string; upload: { url: string; token: string } } | AttachmentActionFailure>
confirmAttachmentUploadAction(attachmentId: string): Promise<{ ok: true; attachment: AttachmentSummary } | AttachmentActionFailure>
removeAttachmentAction(attachmentId: string): Promise<{ ok: true } | AttachmentActionFailure>
```

Cambios en acciones existentes: `createProposalAction` devuelve `{ status: "success", proposalId }` (D9); `withdrawProposalAction` llama a `purgeProposalAttachments` después del éxito del servicio, dentro de su propio `try` que no altera el resultado.

Ruta `GET /api/proposals/[proposalId]/attachments/[attachmentId]/route.ts` (delgada; `params` es `Promise` en Next 16, se hace `await`): `getCurrentUser()` (sin sesión o sin onboarding -> 404, no revela existencia) -> ids UUID válidos (si no, 404) -> `getAttachmentDownloadUrl` -> `302` a la URL firmada con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. `AuthError`/falta de archivo -> 404 genérico; error de storage -> 502. Verificar la firma de `route.ts` y `NextResponse.redirect` contra `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (el developer lo confirma; 011a usó la misma guía).

### 7. UI (T4)

- `attachments-field.tsx` (`"use client"`): dropzone accesible (`<input type="file" multiple accept=...>` visible por teclado + arrastrar y soltar), lista con nombre, tipo, tamaño, estado (en cola, subiendo con progreso `<progress>` o barra, listo, error por archivo) y "Quitar". Valida localmente tipo/tamaño/cantidad como ayuda (la validación real es del servidor). Sube con `XMLHttpRequest` (progreso) a la URL firmada, y luego llama a `confirmAttachmentUploadAction`. Subidas en serie. Texto: "Hasta 5 archivos · 10 MB cada uno · 25 MB en total" y "PDF, Word, Excel, PowerPoint, CSV, TXT, PNG, JPG o ZIP"; nota "Verificamos el tipo y el tamaño de cada archivo. Solo el cliente de este proyecto podrá descargarlos." (sin "se revisan"; D5). Error de ejemplo del diseño: "Tipo de archivo no permitido. No se subió.". Región `aria-live="polite"`; objetivos táctiles >= 40 px; sin desbordamiento horizontal a 390 px.
- `proposal-form.tsx`: incluye `AttachmentsField` (crear: archivos en cola que se suben tras crear la propuesta, D9; editar: lista actual + subir/quitar al instante). Al terminar la creación con fallos parciales, pasa a modo edición.
- `own-proposal-card.tsx` / `developer-proposal-section.tsx`: la sección (servidor) carga `listProposalAttachments` y la tarjeta muestra la lista con enlaces de descarga; en `withdrawn`/`accepted`/`rejected` es solo lectura.
- `attachment-list.tsx`: lista presentacional (nombre como texto de React, tipo, tamaño formateado, enlace `<a href="/api/proposals/.../attachments/...">` sin `target=_blank` ni URL de storage). `client-proposal-detail.tsx` la muestra al cliente dueño con el aviso "Descarga solo archivos de desarrolladores en los que confíes."; es el único archivo de 008 que se toca (junto con las props necesarias); `getProjectProposal` y sus tipos no cambian.
- Estados: sin adjuntos no se muestra la sección al cliente; con error de storage al listar, la sección degrada a una nota sin romper la página.

## Seguridad

- **Autorización siempre en servidor**, en cuatro capas: guard de action/ruta, `can` + rol + propiedad dentro del servicio, filtro SQL por propuesta del autor o proyecto del cliente, y URL firmada de 60 s. Ningún id de usuario ni clave de objeto llega desde el cliente; el `storageKey` nunca sale del servidor.
- Recurso ajeno, inexistente, retirado o no confirmado -> 404 indistinguible. Rol incorrecto en escritura -> 403 vía `handleAuthErrorForPage`.
- Privacidad: bucket privado, sin políticas públicas, sin URLs permanentes ni guardadas; el catálogo público (006) y las listas no exponen adjuntos. La service role key solo en servidor.
- Validación en profundidad: extensión + MIME declarado + firma de bytes leída del objeto real + tamaño real del proveedor (el declarado por el cliente no es de fiar). Nombre original saneado y usado solo como etiqueta y nombre de descarga; la clave de objeto es generada por el servidor (sin path traversal). MIME almacenado canónico, no el del cliente.
- Descarga forzada (`attachment`), sin renderizar archivos en el origen de la app, sin `html`/`svg`.
- Abuso: tope por propuesta (5 archivos, 25 MB), solo `pending`, solo developer autenticado; limpieza oportunista de reservas abandonadas. Rate limiting y auditoría: spec 015.
- Los nombres de archivo y los mensajes de error no se registran en logs. Sin PII hacia el proveedor más allá del contenido que el desarrollador sube voluntariamente (aviso en UI).
- Riesgo aceptado: sin antivirus (D5, P2) un archivo malicioso permitido por tipo puede llegar al cliente; se mitiga con las medidas anteriores y el aviso. `zip` es el vector más probable (P3).

## Criterios de aceptación

Base (T0)

- AC1. La dependencia `@supabase/supabase-js` está en `package.json`; `.env.example` lista `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` sin valores y sin prefijo `NEXT_PUBLIC_`; `getSupabaseAdmin()` falla con error claro, sin mostrar valores, si falta alguna.
- AC2. La migración la generó drizzle-kit y crea el enum `proposal_attachment_status` y la tabla `proposal_attachments` con FK a `proposals` (`restrict`), `storage_key` UNIQUE y los CHECK de tamaño, nombre, clave y coherencia `ready`/`confirmed_at`; el journal tiene una entrada más; no se ejecutó `db:migrate`; `migrations.test.ts` pasa sin cambios.
- AC3. En PGlite: tamaño 0 o > 10 MiB falla; nombre vacío o > 255 falla; clave sin prefijo `proposals/` falla; clave duplicada falla; `ready` sin `confirmed_at` (y viceversa) falla; borrar una propuesta con adjuntos falla (`restrict`).

Validación (T1)

- AC4. `attachmentUploadRequestSchema` y las reglas aceptan los bordes (1 byte y 10 MiB exactos) y rechazan 0, 10 MiB + 1 byte, nombre vacío o > 255, extensión fuera de la lista (`exe`, `html`, `svg`, `docm`), MIME incoherente con la extensión y extensión intermedia bloqueada (`informe.pdf.exe`).
- AC5. `sanitizeFileName` elimina rutas (`..\..\a.pdf`, `/etc/passwd`), caracteres de control, NUL y overrides bidi; nunca devuelve vacío; conserva extensión segura y respeta 255.
- AC6. `matchesSignature` acepta un archivo real mínimo de cada tipo y rechaza un `.pdf` con bytes de `MZ`, un `.png` que es texto, un `.txt` con NUL y cualquier tipo que empiece por `MZ`, `\x7FELF` o `#!`.
- AC7. El adaptador Supabase traduce errores del cliente a `STORAGE_UNAVAILABLE`, nunca registra claves, URLs ni tokens, y `remove` de claves inexistentes no falla (cliente Supabase simulado).

Servicio (T2)

- AC8. `requestAttachmentUpload` por el autor en propuesta `pending` inserta una fila `pending_upload` con clave `proposals/<proposalId>/<id>.<ext>`, nombre saneado y MIME canónico, y devuelve la URL de subida; `client`, `admin` y un developer que no es el autor reciben `FORBIDDEN`/`NOT_FOUND` sin escribir ni llamar a storage.
- AC9. En propuesta `accepted`, `rejected` o `withdrawn`, solicitar, confirmar y quitar lanzan `PROPOSAL_NOT_EDITABLE` sin escribir.
- AC10. Un sexto archivo da `TOO_MANY_FILES`; superar 25 MB acumulados da `TOTAL_SIZE_EXCEEDED`; dos solicitudes simultáneas sobre la misma propuesta con 4 archivos existentes dejan exactamente 5 filas (una falla). Las reservas `pending_upload` de más de 15 min no cuentan y se limpian.
- AC11. `confirmAttachmentUpload` con objeto ausente da `UPLOAD_NOT_FOUND`; con tamaño real distinto del declarado o firma inválida da `FILE_TOO_LARGE`/`CONTENT_MISMATCH` y borra objeto y fila; con éxito marca `ready`, fija `confirmedAt` y actualiza `proposals.updated_at`; es idempotente.
- AC12. Quitar un archivo (`ready` o `pending_upload`) borra primero el objeto y luego la fila; si el borrado del objeto falla, la fila se conserva y se lanza `STORAGE_UNAVAILABLE`; actualiza `proposals.updated_at`.
- AC13. Authz de descarga: `getAttachmentDownloadUrl` entrega URL solo al desarrollador autor y al cliente dueño del proyecto (propuesta no `withdrawn` para el cliente); un cliente ajeno, otro desarrollador, el admin (P5), un visitante, una fila `pending_upload`, un `attachmentId` de otra propuesta y una propuesta retirada (para el cliente) reciben `NOT_FOUND`/`FORBIDDEN` y storage no recibe llamadas. La URL pedida usa TTL 60 s y el nombre saneado.
- AC14. `listProposalAttachments` devuelve solo filas `ready`, con exactamente las claves de `AttachmentSummary` (comparación de `Object.keys`; sin `storageKey`, `status` ni `proposalId`).
- AC15. `purgeProposalAttachments` borra objetos y filas de la propuesta y no lanza si storage falla.

Actions y ruta (T3)

- AC16. Cada action autentica con `requireRole("developer")` antes de validar; un id que no es UUID no llega a BD; `AttachmentError` se traduce a mensaje en español sin lanzar; con éxito llama a `revalidatePath`. `createProposalAction` devuelve `proposalId` al crear; `withdrawProposalAction` purga adjuntos y un fallo de la purga no cambia su resultado.
- AC17. La ruta de descarga responde 302 con `Location` igual a la URL del servicio, `Cache-Control: no-store`; 404 sin sesión, con ids mal formados, ante `AuthError` y ante archivo inexistente; 502 ante `STORAGE_UNAVAILABLE`; nunca incluye `storageKey` ni token en cuerpo o cabeceras de error.

UI (T4, verificación manual)

- AC18. El desarrollador ve el campo de adjuntos con los límites y la nota de D5 (sin "se revisan"); un `.exe` se rechaza con "Tipo de archivo no permitido. No se subió."; los demás muestran progreso y quedan "Listo"; al crear la propuesta con archivos, se suben tras el alta; un fallo parcial deja la propuesta creada en modo edición con el archivo pendiente.
- AC19. En edición se pueden añadir y quitar archivos mientras la propuesta es `pending`; tras retirar, la propuesta no permite cambios y los archivos desaparecen.
- AC20. El cliente dueño ve y descarga los adjuntos de cada propuesta; el navegador descarga (no abre) el archivo; un cliente ajeno que pega la URL de la ruta ve 404; el HTML del detalle no contiene claves de storage ni URLs firmadas; el detalle público de 006 no cambia.
- AC21. Tras añadir un adjunto a una propuesta `pending` que el cliente ya estaba viendo, seleccionarla falla con `PROPOSAL_CHANGED` (008) hasta que el cliente la reabre.
- AC22. `docs/architecture/system-design.md §3` describe la fila "Archivos privados" como activa (metadatos en Neon, binario en Supabase Storage privado) y registra D1-D8; `docs/MANUAL-TESTS.md` incluye la creación del bucket privado, las variables y la verificación de los puntos "a verificar".

## Tests requeridos

Vitest, junto al archivo. Storage siempre simulado (nunca red ni cuenta real).

- `src/lib/supabase.test.ts`: falta de variables, sin filtrar valores.
- `src/lib/db/proposal-attachments-constraints.test.ts` (PGlite, patrón de `connected-accounts-constraints.test.ts`): AC3.
- `proposal-attachment.schema.test.ts` y `attachment-file-rules.test.ts` (puros): validación de tipo y tamaño en los bordes, extensión intermedia bloqueada, firma de bytes por tipo, saneamiento de nombre (AC4-AC6).
- `supabase-attachment-storage.test.ts`: cliente Supabase falso; traducción de errores, TTL y `download` pasados, `remove` idempotente (AC7).
- `proposal-attachment.service.test.ts` (PGlite + `AttachmentStorage` falso en memoria que registra llamadas; mock `Proxy` del `db` como `proposal.service.test.ts`): AC8-AC15, incluidos autorización de descarga por rol/propiedad/estado, concurrencia sobre el tope de 5, confirmación con tamaño y firma incorrectos, no hay objetos sin fila y `updated_at` actualizado.
- `proposal-attachment.actions.test.ts` y `proposal.actions.test.ts` (servicio mockeado): AC16.
- `route.test.ts` de la descarga (servicio mockeado): AC17.
- No requieren test unitario: componentes presentacionales de T4 (`attachment-list.tsx`) y las páginas; `attachments-field.tsx` tiene lógica de cola/progreso: se prueba con RTL la validación local y el orden crear -> subir -> confirmar con las actions simuladas.

## Tareas

### T0 — Base: dependencia, entorno, cliente y migración (serial)
- Archivos: `package.json`, `package-lock.json`, `.env.example`, `src/lib/supabase.ts`, `src/lib/supabase.test.ts`, `src/modules/proposals/schema/proposal-attachments.table.ts`, `drizzle/*` (generados), `src/lib/db/proposal-attachments-constraints.test.ts`
- Depende de: —
- Paralelizable: no (instala dependencia, toca `package.json` y genera la migración; nadie ejecuta `npm install` ni `npm run build` en paralelo; no ejecuta `db:migrate`)
- Cubre: AC1, AC2, AC3

### T1 — Reglas de archivo, schema, errores y adaptador de storage
- Archivos: `proposal-attachment.types.ts`, `proposal-attachment.schema.ts` (+test), `attachment-file-rules.ts` (+test), `attachment-errors.ts`, `attachment-storage.ts`, `supabase-attachment-storage.ts` (+test)
- Depende de: T0
- Paralelizable: no con T2/T3 hasta cerrar la interfaz (T2 y T3 importan sus contratos); sí es la única tarea de su nivel
- Cubre: AC4, AC5, AC6, AC7

### T2 — Servicio de adjuntos
- Archivos: `proposal-attachment.service.ts` (+test)
- Depende de: T0, T1
- Paralelizable: no (T3 depende de su contrato)
- Cubre: AC8 a AC15

### T3 — Actions, cambios en acciones de propuesta y ruta de descarga
- Archivos: `proposal-attachment.actions.ts` (+test), `proposal.actions.ts` (+test), `proposal.types.ts`, `src/app/api/proposals/[proposalId]/attachments/[attachmentId]/route.ts` (+test)
- Depende de: T2
- Paralelizable: no con T4 respecto a los contratos de las actions (T4 las consume); T4 puede arrancar contra los contratos de esta spec solo si se acuerda
- Cubre: AC16, AC17

### T4 — UI y documentación
- Archivos: `attachments-field.tsx`, `attachment-list.tsx`, `proposal-form.tsx`, `own-proposal-card.tsx`, `developer-proposal-section.tsx`, `client-proposal-detail.tsx`, `docs/architecture/system-design.md`, `docs/MANUAL-TESTS.md`, `docs/SETUP.md`
- Depende de: T3
- Paralelizable: no (los componentes consumen los contratos de T3; la parte de docs podría ir en paralelo con T3, pero comparte tarea)
- Cubre: AC18 a AC22

Resumen: 5 tareas, secuenciales por dependencia de contratos (T0 -> T1 -> T2 -> T3 -> T4). Sin paralelismo real salvo tests de T1 contra la documentación; la documentación de T4 podría separarse de la UI si se quiere paralelizar.

## Preguntas abiertas (con recomendación por defecto)

- P1. ¿Se confirma Supabase Storage (D1) y se crea un proyecto/bucket privado `proposal-attachments`? Recomendación: sí, es el stack aprobado en `BRIEF §9`. Si se prefiere Vercel Blob o R2, cambia T0 y el adaptador de T1; la interfaz y el resto no.
- P2. Sin antivirus en la fase 1 (D5): ¿se acepta, y se cambia el texto del diseño "Se revisan antes de guardarse" por "Verificamos el tipo y el tamaño"? Recomendación: sí a ambos; revisar ClamAV/servicio de terceros en una fase posterior.
- P3. ¿Se mantiene `zip` en la lista (diseño) o se retira por riesgo? Recomendación: mantenerlo, sin descompresión y con el aviso; si hay duda, retirarlo (un cambio de una línea en `ALLOWED_ATTACHMENT_TYPES`).
- P4. Límites: 10 MB por archivo, 5 archivos, **25 MB en total** (el total es propuesta mía). ¿Se aprueba? Recomendación: sí; el plan gratuito de Supabase tiene un tope global por objeto (a verificar).
- P5. ¿Puede el admin descargar adjuntos? El requerimiento dice "solo el autor y el cliente dueño". Recomendación: no en esta fase (el admin lee propuestas en 007 pero no hay pantalla de admin; añadirlo después es trivial).
- P6. Limpieza global de huérfanos: se limpia de forma oportunista por propuesta; ¿se quiere un barrido programado (cron con secreto)? Recomendación: fase posterior; no hay objetos sin fila por construcción.
- P7. Protocolo de subida desde el navegador: si el `PUT` crudo a la URL firmada no es soportado, ¿se acepta exponer `NEXT_PUBLIC_SUPABASE_URL` y la anon key (solo para `uploadToSignedUrl`, sin políticas públicas)? Recomendación: sí, solo si la verificación de T1 lo exige.
- P8. Barra de progreso: `<progress>` nativo o añadir `@shadcn/progress`? Recomendación: nativo (sin tocar `src/components/ui`).
- P9. Retención: `accepted` y `rejected` conservan archivos indefinidamente. ¿Hay política de retención o derecho de borrado? Recomendación: dejarlo para 015/017.
- P10. Migraciones concurrentes: 019 y 020 también pueden generar migraciones. Recomendación: generar y aprobar en orden de implementación para no chocar en el journal.

## Próximas fases

- Antivirus/escaneo y estado `scanning`.
- Barrido global programado de reservas abandonadas y política de retención.
- Rate limiting y auditoría de subidas/descargas (015).
- Descarga para admin, adjuntos en otros recursos y previsualización segura.
- Notificación al cliente de nuevos adjuntos.
- Configuración de storage por entorno (017).

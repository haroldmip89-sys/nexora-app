# Valoraciones del desarrollador por el cliente

Estado: done

Tercera de 4 specs nuevas (ids 018 a 021; 012 a 017 siguen reservados en `docs/SDD-PLAN.md`). Orden: 018 Markdown -> 019 perfil de desarrollador (**done**) -> **020 valoraciones (esta)** -> 021 adjuntos. Sigue el formato y los patrones de `docs/specs/008-proposal-selection.md`, `010-payment-state-and-webhooks.md` y `011a-developer-connected-accounts.md` (actions, permisos, tabla con CHECK, test de constraints). Es un MVP basado en un diseño: prioriza simplicidad (YAGNI).

## Objetivo

Que el **cliente propietario** de un proyecto contratado valore al desarrollador contratado: 1 a 5 estrellas y un comentario opcional de hasta 600 caracteres. Hay **una sola valoración por proyecto contratado**, se publica con el nombre del cliente abreviado (p. ej. "Maria G.") y el cliente puede editarla durante **14 días desde su creación**. Cada desarrollador muestra en su perfil público el **promedio** (1 decimal) y el **conteo** de lo que valoraron sus clientes, y la lista de valoraciones; en "Mi cuenta" ve su resumen.

Referencia visual y de textos (leída y contrastada con el diseño): `RateDeveloper.dc.html` (formulario: leyenda "Valoración general", 5 botones de estrella de 52 px con `aria-pressed`, textos "Muy malo / Malo / Correcto / Bueno / Excelente", textarea con contador "0 / 600", caja "Antes de enviar" con "Una valoración por proyecto contratado", "Se publica en el perfil de <dev> con tu nombre abreviado (Valeria A.)" y "Puedes editarla durante 14 días", botones "Más tarde" y "Publicar valoración") y `Account.dc.html` (sección "Tu valoración": "La calculan las respuestas de tus clientes. No se puede editar.", promedio "4,6" con coma, "de 5 · 12 valoraciones", enlace "Ver valoraciones recibidas").

Secciones de arquitectura que aplican (leer solo estas): `system-design.md §2` (entidad nueva `developerRating`), `§3` (propiedad de datos: Neon), `§4` (módulo nuevo `ratings`; lectura de `projects`/`proposals`/`users`; **dependencia de solo tipo `ratings -> profile`**), `§6` (acción `rating.create`), `§8` (decisiones D-A a D-K de esta spec). `state-machines.md §1` (proyecto: `contracted` solo se alcanza con pago `completed_test`, §3) fundamenta la regla de elegibilidad. Ninguna máquina de estados cambia.

## Dependencias entre specs

- **Depende de 019 (ya `done`, verificada contra el código real).** Contrato real, sin cambios en 019:
  - `src/modules/profile/types/developer-profile.types.ts` exporta `DeveloperRatingSummary = { average: number | null; count: number }`. **020 NO lo redeclara: lo importa** de `@/modules/profile/types/developer-profile.types` (dependencia de **solo tipo** `ratings -> profile`; `profile` no importa `ratings`, sin ciclo). Se registra en `system-design.md §4` como tarea de documentación (T4).
  - `DeveloperProfileView` (`src/modules/profile/components/developer-profile-view.tsx`) ya recibe `rating?: DeveloperRatingSummary` (pinta el resumen compacto como texto "4,6 · N valoraciones", o "Aún sin valoraciones" con `count 0`) y `reviewsSlot?: ReactNode` (se renderiza dentro de una sección "Valoraciones" con `id="valoraciones"`, `aria-labelledby="developer-reviews"`; la sección solo existe si se pasa el slot).
  - `DeveloperProfileForm` (`developer-profile-form.tsx`) ya recibe `ratingSlot?: ReactNode` (sección "Tu valoración", solo si se pasa).
  - Hoy ambas páginas pasan `rating={undefined}`, `reviewsSlot={undefined}` y `ratingSlot={undefined}`.
  - El perfil público es **visible para visitantes anónimos** (019 D11); el servicio de lectura de 020 no depende de sesión.
- **020 NO toca `developer-profile-view.tsx` ni `developer-profile-form.tsx`.** Su única edición sobre archivos de 019 es en **dos páginas** (única edición permitida, de composición): `src/app/developers/[id]/page.tsx` y `src/app/dashboard/account/page.tsx`.
- **Depende de 018** solo en sentido negativo: el comentario es **texto plano** y **no** usa el renderizador de Markdown de 018.
- **Orden de migraciones: 019 (0005, ya generada) -> 020 -> 021.** 021 espera a que 020 haya generado la suya.

## Alcance

- Incluye:
  - Módulo nuevo `src/modules/ratings`: tabla `developer_ratings` (una fila por proyecto) y migración generada por drizzle-kit (**sin** `db:migrate`; la corre el humano).
  - Acción de permisos `rating.create` (solo `client`) en la matriz de `auth`.
  - Schema zod de entrada, errores de dominio, funciones puras (abreviatura del nombre, ventana de 14 días) y servicio: crear, editar (ambos devuelven el `developerId`), leer el estado de la valoración de un proyecto, resumen por desarrollador (promedio a 1 decimal y conteo) y lista pública de valoraciones recibidas.
  - Server actions `createDeveloperRatingAction` y `updateDeveloperRatingAction`.
  - Página del cliente `/projects/[id]/rate` (formulario de estrellas y comentario, estado "ya valoraste / editable N días / ventana cerrada") y enlace "Valorar al desarrollador" en la lista de proyectos del cliente para proyectos `contracted`.
  - Componentes presentacionales `RatingStars`, `RatingSummary` (solo en "Mi cuenta") y `RatingList` (en el perfil público) e integración por composición en las dos páginas de 019.
  - Pruebas automáticas y pasos manuales; documentación de arquitectura (solo adiciones).
- No incluye:
  - **Borrado, moderación y reportes**: fuera. Un caso grave se corrige con SQL manual del administrador. Se tratan en una spec posterior (015 o nueva).
  - **Respuesta del desarrollador** y **notificaciones** (email o in-app): fuera.
  - Valorar al cliente, valoraciones por criterios, útil/no útil, imágenes o adjuntos (021), ordenar o filtrar la lista, paginación de la lista (primeras 20), Markdown en el comentario.
  - Valorar desde un estado distinto de proyecto contratado (D-A).
  - Rate limiting (015) y cualquier cambio en pagos, propuestas o `proxy.ts`.
  - Cambios en `developer-profile-view.tsx`, `developer-profile-form.tsx`, `package.json`, `.env.example`, `src/app/layout.tsx`, `globals.css`, `src/components/ui/**`, `docs/SETUP.md` (no se añade shadcn: se reutilizan `button`, `textarea`, `badge`, `label`, `form-field`).

## Reutilizar

Inventario verificado con Glob, Grep y Read en `src/modules/*`, `src/components`, `src/lib`.

| Existente | Uso |
|---|---|
| `src/modules/profile/types/developer-profile.types.ts` (`DeveloperRatingSummary`) | **Se importa** (solo tipo) en servicio y `RatingSummary`; no se redeclara |
| `profile/components/developer-profile-view.tsx` (props `rating`, `reviewsSlot`; sección `id="valoraciones"`) y `developer-profile-form.tsx` (prop `ratingSlot`) | **No se modifican**; solo reciben props desde las páginas |
| `src/app/developers/[id]/page.tsx` (`loadProfile` con `cache`, `profile.userId`) y `src/app/dashboard/account/page.tsx` (`actorId`) | Únicas ediciones de archivos de 019 (composición) |
| `src/modules/projects/schema/projects.table.ts`: `clientId`, `status`, `contractedAt` (único escritor: `markProjectContracted` en `project-transitions.ts:32`; no se borra al cerrar) | Elegibilidad: `contracted_at IS NOT NULL` (D-A). Propiedad: `projects.clientId` |
| `src/modules/proposals/schema/proposals.table.ts`: `developerId`, `status`, `unique(id, project_id)`, índice `proposals_developer_created_idx` | FK compuesta `(proposal_id, project_id)` de la valoración; desarrollador por join |
| `proposal-selections.table.ts` y `payment-overview.service.ts` | Patrón de FK compuesta y de consulta ganador (proyecto -> selección -> propuesta -> usuario) |
| `src/modules/users/schema/users.table.ts`: `displayName` (anonimizado como `"Deleted user"`) | Origen del nombre abreviado (D-H) |
| `payments/schema/connected-accounts.table.ts` y `src/lib/db/connected-accounts-constraints.test.ts` | Patrón de tabla con `check` y `unique`, y de test de constraints con PGlite (`createTestDb`) |
| `auth`: `requireRole`, `requireOwnership` (ajeno = `AuthError("NOT_FOUND")`), `can`, `AuthError`, `handleAuthErrorForPage`, `getCurrentUser` | Guards. Matriz `permissions.ts` (`Record<Action, …>` exhaustiva) |
| `proposals/actions/proposal-selection.actions.ts` y `payments/actions/*.actions.ts` | Patrón de action: `requireRole` antes de todo, `safeParse`, `revalidatePath` |
| `proposals/components/proposal-form.tsx` (`useActionState`, `FormField`, `Textarea`, `Button`) y `proposals/types/proposal.types.ts` (`ProposalFormState`) | Patrón del formulario de valoración |
| `proposals/services/proposal-errors.ts` | Patrón de errores de dominio |
| `payments/components/payments-loading.tsx`, `payments-error.tsx` (aceptan `label`/`title`) | `loading.tsx` y `error.tsx` de la ruta nueva **sin componentes nuevos** |
| `src/app/projects/[id]/payment/page.tsx` | Patrón de página fina |
| `src/components/shared/empty-state.tsx`, `form-field.tsx`, `ui/badge`, `ui/button`, `ui/textarea`, `ui/label` | UI. `lucide-react` instalado con `Star`. `npx shadcn@latest search @shadcn -q rating` no devuelve ningún componente de valoración: se construye uno propio |
| `src/lib/db/test-db.ts` (`createTestDb`, PGlite con migraciones reales) | Pruebas de servicio |

No existe nada de valoraciones ni de abreviatura de nombres: se crean. No hay `src/hooks` ni stores y no se necesitan. Zod 4 (`^4.6.5`); drizzle-orm `^0.45.4`; vitest `^5.0.3`.

## Decisiones (todas resueltas)

- **D-A. Cuándo se puede valorar: proyecto contratado** (`contracted_at IS NOT NULL`, es decir, estado `contracted`, o `closed` después de haber estado `contracted`). Según `state-machines.md §1` y `§3`, `contracted` solo se alcanza con pago `completed_test` verificado, así que ya implica "pago confirmado"; `contracted_at` sobrevive al cierre y distingue ese caso del cierre forzado desde `proposal_selected` (no valorable). Descartadas: join directo con `payment_attempts` (mismo resultado, más acoplamiento) y "proyecto completado" (no existe ese estado ni seguimiento de entrega). Consecuencia aceptada: se puede valorar apenas se confirma el pago; la ventana de 14 días lo mitiga (R1).
- **D-B. Unicidad y desarrollador.** `unique(project_id)` y FK compuesta `(proposal_id, project_id) -> proposals(id, project_id)`. La fila guarda `proposal_id` (la propuesta `accepted`, leída en servidor) y **no** guarda `developer_id` ni `client_id`: se derivan por join.
- **D-C. Borrado, moderación, reportes**: fuera. `users` y `projects` usan `onDelete: restrict`. **D-D. Respuesta del desarrollador** y **D-E. Notificaciones**: fuera.
- **D-F. Promedio.** Consulta agregada en cada lectura (sin columna desnormalizada). **El servicio de 020 devuelve `average` redondeado a 1 decimal** (`round(avg(rating)::numeric, 1)` en SQL, convertido con `Number(...)`), `null` si `count = 0`, cumpliendo el contrato de 019. La presentación formatea con coma ("4,6") con `Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })`.
- **D-G. Ventana de edición de 14 días**, solo en servidor con reloj inyectable. `editableUntil = createdAt + 336 h` (duración absoluta). Editable mientras `now < editableUntil` (estricto). Editar **no** extiende la ventana. El UPDATE lleva la condición en SQL (`created_at > :cutoff`) para ser atómico. Crear no tiene límite de tiempo. El navegador solo recibe `canEdit` y `daysLeft` ya calculados.
- **D-H. Privacidad del nombre.** Se deriva en servidor al leer (no se guarda) con `abbreviateClientName(displayName)`: primer token + espacio + inicial en mayúscula del último token + punto ("Maria Gomez" -> "Maria G."); un solo token alfabético -> ese token; vacío, `"Deleted user"` o cualquier token con caracteres que no sean letras, marcas, apóstrofo o guion (username o parte local de email) -> `"Cliente"`. Nunca se expone el apellido completo, el email, el `id` del cliente ni el `displayName` crudo.
- **D-I. Zona horaria.** Columnas `timestamptz`. La UI de la ventana muestra "Te quedan N días para editarla" (N = `ceil((editableUntil - now) / 24 h)`, calculado en servidor) o "Ya no puedes editarla". La fecha de cada valoración en la lista: `Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" })`.
- **D-J. Cliente borrado o anonimizado**: la valoración se conserva y cuenta; el nombre se muestra "Cliente".
- **D-K. Estados y textos no definidos por el diseño: se aceptan las recomendaciones por defecto de esta spec y quedan decididos** (el diseño `RateDeveloper.dc.html` solo define el formulario de creación y `Account.dc.html` el resumen; se contrastó):
  - Edición: "Te quedan {N} días para editarla." (singular "1 día"), botón "Guardar cambios" y aviso de éxito "Valoración publicada.".
  - Ventana cerrada: solo lectura con "Ya no puedes editarla.".
  - Sin valoraciones: "Aún sin valoraciones" (coincide con el texto ya usado por 019) y `EmptyState` en la lista.
  - "Enviando": "Publicando..." / "Guardando...".
  - Enlace "Valorar al desarrollador" solo en proyectos `contracted` de la lista del cliente; `closed` tras contratación solo por URL directa.
  - La lista del perfil muestra las primeras 20, sin paginación.
  - Un solo token alfabético se muestra tal cual ("Maria").
  - Sin borrado, moderación, reportes, respuesta ni notificaciones.
  - Comentario como texto plano (sin Markdown de 018).
  - Perfil visible a anónimos (de 019 D11).
  - Enlace "Ver valoraciones recibidas" (diseño de "Mi cuenta") apunta a `/developers/{developerId}#valoraciones`.

## Archivos

Nuevos (N) y modificados (M). Cada archivo pertenece a una sola tarea. Nombres en inglés (`SETUP §1`).

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/ratings/schema/developer-ratings.table.ts` | N | T0 |
| `drizzle/<NNNN>_developer_ratings.sql`, `drizzle/meta/<NNNN>_snapshot.json`, `drizzle/meta/_journal.json` (generados; `<NNNN>` = siguiente número libre, hoy `0006`, porque `0005` es de 019) | N/N/M | T0 |
| `src/lib/db/developer-ratings-constraints.test.ts` | N | T0 |
| `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts` | M | T0 |
| `src/modules/ratings/types/rating.types.ts` | N | T1 |
| `src/modules/ratings/services/rating-errors.ts` | N | T1 |
| `src/modules/ratings/schemas/rating.schema.ts` + `.test.ts` | N | T1 |
| `src/modules/ratings/services/client-name.ts` + `.test.ts` | N | T1 |
| `src/modules/ratings/services/rating-window.ts` + `.test.ts` | N | T1 |
| `src/modules/ratings/services/rating.service.ts` + `.test.ts` | N | T2 |
| `src/modules/ratings/actions/rating.actions.ts` + `.test.ts` | N | T3 |
| `src/app/projects/[id]/rate/page.tsx`, `loading.tsx`, `error.tsx` | N | T3 |
| `src/modules/ratings/components/rate-developer-form.tsx` | N | T3 |
| `src/modules/projects/components/project-list.tsx` (solo añadir el enlace) | M | T3 |
| `src/modules/ratings/components/rating-stars.tsx`, `rating-summary.tsx`, `rating-list.tsx` | N | T4 |
| `src/app/developers/[id]/page.tsx` (solo pasar `rating` y `reviewsSlot`) | M | T4 |
| `src/app/dashboard/account/page.tsx` (solo pasar `ratingSlot`) | M | T4 |
| `docs/architecture/system-design.md`, `docs/MANUAL-TESTS.md` | M | T4 |

`project-list.tsx`, `docs/*` y las dos páginas de 019 pueden tener cambios sin commitear: **solo se añade**; no se reescribe ni reformatea nada. `docs/SETUP.md` no cambia.

## Contratos

### 1. Tabla (T0) — `src/modules/ratings/schema/developer-ratings.table.ts`

Estilo de `proposals.table.ts`, `proposal-selections.table.ts` y `connected-accounts.table.ts`:

```ts
export const developerRatings = pgTable("developer_ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().unique()
    .references(() => projects.id, { onDelete: "restrict" }),
  proposalId: uuid("proposal_id").notNull(),           // la propuesta accepted del proyecto
  rating: integer("rating").notNull(),
  comment: text("comment"),                              // NULL si no hay comentario
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  check("developer_ratings_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
  check("developer_ratings_comment_length",
    sql`${t.comment} IS NULL OR char_length(${t.comment}) BETWEEN 1 AND 600`),
  foreignKey({ name: "developer_ratings_proposal_project_fk",
    columns: [t.proposalId, t.projectId],
    foreignColumns: [proposals.id, proposals.projectId] }).onDelete("restrict"),
]);
```

- `unique(project_id)` garantiza "una por proyecto" (también ante dos envíos simultáneos). Zod valida en caracteres de JS (UTF-16), igual o más estricto que el CHECK (R3). Un comentario vacío no se guarda (`NULL`).
- Lo que un CHECK no puede expresar (propuesta `accepted`, proyecto contratado, actor cliente propietario) lo garantiza el servicio y sus pruebas.
- **Migración:** `npm run db:generate -- --name developer_ratings`; `drizzle.config.ts` ya recoge `./src/modules/*/schema/*.table.ts`. **Sin SQL escrito a mano.** Si un CHECK generado difiere, se ajusta el `sql` de la tabla y se regenera. **Número: el siguiente libre** (hoy `0006`; 019 ya usó `0005`); 020 migra **antes** que 021. **Prohibido `npm run db:migrate`** (lo corre el humano contra Neon). `migrations.test.ts` no cambia (a verificar que cuenta por entradas del journal).

### 2. Permiso (T0)

`auth.types.ts`: `Action` añade `"rating.create"`. `permissions.ts`: `"rating.create": ["client"]`. `permissions.test.ts`: fila `"rating.create": [true, false, false, false]` (a verificar el orden de la matriz actual, que ya incluye `profile.edit`). Cubre crear y editar. **Leer** valoraciones es público a nivel de servicio (sin `can`).

### 3. Tipos y errores (T1)

`src/modules/ratings/types/rating.types.ts`:

```ts
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types"; // type-only; NOT redeclared

export const RATING_COMMENT_MAX = 600;
export const RATING_EDIT_WINDOW_DAYS = 14;

export type RatingFormValues = { rating: string; comment: string };
export type RatingFieldErrors = Partial<Record<"rating" | "comment", string>>;
export type RatingFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message?: string; fieldErrors: RatingFieldErrors; values: RatingFormValues };

/** What the owning client sees for a project (never ids of developer/client, email, Stripe data). */
export type ProjectRatingView = {
  project: { id: string; title: string };
  developerName: string;
  previewName: string;                   // the client's own abbreviated name (server-computed), for "Antes de enviar"
  rating: null | {
    rating: number; comment: string | null;
    createdAt: Date; canEdit: boolean; daysLeft: number;   // daysLeft = 0 when !canEdit
  };
  canCreate: boolean;                    // contracted, not yet rated
};

/** Public DTO (profile list). No ids, no email, no full surname. */
export type PublicDeveloperRating = {
  rating: number; comment: string | null; clientName: string; createdAt: Date;
};
// DeveloperRatingSummary is consumed from profile (see import); the service returns it.
```

`rating-errors.ts` (estilo `proposal-errors.ts`; las fallas de autorización siguen siendo `AuthError`):

| Código | HTTP | Mensaje (es) | Cuándo |
|---|---|---|---|
| `NOT_CONTRACTED` | 409 | "Solo puedes valorar a un desarrollador cuando el proyecto ya fue contratado." | Proyecto sin `contracted_at` o sin propuesta aceptada |
| `ALREADY_RATED` | 409 | "Ya valoraste a este desarrollador en este proyecto. Puedes editar tu valoración." | `ON CONFLICT` sin fila |
| `EDIT_WINDOW_CLOSED` | 409 | "Ya pasaron los 14 días para editar esta valoración." | UPDATE sin fila por `created_at <= cutoff` |
| `RATING_NOT_FOUND` | 409 | "Aún no valoraste a este desarrollador." | Editar sin valoración previa |

Proyecto inexistente o ajeno: `AuthError("NOT_FOUND")`. Rol distinto de `client`: `AuthError("FORBIDDEN")`.

### 4. Schema zod (T1) — `rating.schema.ts`

```ts
export const ratingInputSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),          // llega como string de FormData (a verificar coerce en zod 4)
  comment: z.string().trim().max(RATING_COMMENT_MAX)
    .refine((v) => !v.includes("\u0000"))                  // Postgres rechaza NUL en text
    .optional().transform((v) => (v ? v : null)),          // vacío -> null
});
export type RatingInput = z.infer<typeof ratingInputSchema>;   // { rating: number; comment: string | null }
```

Mensajes en español por campo ("Elige entre 1 y 5 estrellas.", "El comentario no puede superar 600 caracteres."). `projectId` se valida aparte con `z.uuid()`. Ningún id de desarrollador, cliente o propuesta llega del cliente.

### 5. Funciones puras (T1)

- `client-name.ts`: `abbreviateClientName(displayName: string): string` (D-H).
- `rating-window.ts`: `RATING_EDIT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000`; `getEditableUntil(createdAt)`; `getEditWindow(createdAt, now): { canEdit; daysLeft }` (`daysLeft = ceil((editableUntil - now) / 24 h)` si `canEdit`, si no `0`); `getEditCutoff(now)` (`now - RATING_EDIT_WINDOW_MS`).

### 6. Servicio (T2) — `rating.service.ts` (`import "server-only"`)

Último parámetro opcional `deps: { now?: () => Date } = {}` (reloj inyectable). Todo es BD.

```ts
createDeveloperRating(actor: AuthUser, projectId: string, input: RatingInput, deps?): Promise<{ developerId: string }>
updateDeveloperRating(actor: AuthUser, projectId: string, input: RatingInput, deps?): Promise<{ developerId: string }>
getProjectRatingView(actor: AuthUser, projectId: string, deps?): Promise<ProjectRatingView>
getDeveloperRatingSummary(developerId: string): Promise<DeveloperRatingSummary>      // type from profile; average already rounded to 1 decimal
listDeveloperRatings(developerId: string, opts?: { limit?: number }): Promise<PublicDeveloperRating[]>   // limit por defecto y máximo 20
```

`developerId` es `users.id` del desarrollador (igual que el id de `/developers/[id]`), derivado de `proposals.developer_id` de la propuesta aceptada; nunca viene del cliente.

**Crear** (RF1):
1. `can(actor.role, "rating.create")` o `AuthError("FORBIDDEN")`, antes de tocar la BD.
2. Proyecto por `id`; sin fila -> `AuthError("NOT_FOUND")`; `requireOwnership(actor, project.clientId)` (**sin** `allowAdmin`).
3. Elegibilidad: `project.contractedAt` no nulo y existe la propuesta `accepted` del proyecto (join `proposal_selections` -> `proposals` como en `payment-overview.service.ts`); si no, `NOT_CONTRACTED`. El `proposal_id` y el `developerId` salen de esa consulta.
4. `INSERT … ON CONFLICT (project_id) DO NOTHING RETURNING id`; sin fila -> `ALREADY_RATED`. Sin transacción: la elegibilidad no puede revertirse y `UNIQUE` arbitra la carrera. Devuelve `{ developerId }`.

**Editar** (RF2): pasos 1 y 2 iguales. `UPDATE developer_ratings SET rating, comment WHERE project_id = :id AND created_at > :cutoff RETURNING proposal_id`; con `proposal_id` se obtiene `proposals.developer_id` y se devuelve `{ developerId }`. Sin fila en el UPDATE: se relee por `project_id`; si no existe -> `RATING_NOT_FOUND`, si existe -> `EDIT_WINDOW_CLOSED`. No cambia `created_at` ni `proposal_id`. Editar con los mismos valores es válido y no extiende la ventana.

**`getProjectRatingView`** (RF3): mismos guards. Solo lectura. `canCreate = contratado && sin valoración`; `rating = null` si no existe; `canEdit/daysLeft` por `getEditWindow`; `previewName = abbreviateClientName(actor.displayName)` (a verificar que `AuthUser` expone `displayName`; si no, se lee de `users` por `actor.id`). Sin `contracted_at`: `AuthError("NOT_FOUND")`.

**`getDeveloperRatingSummary`** (RF4): `SELECT count(*)::int, round(avg(rating)::numeric, 1)` sobre `developer_ratings` unido a `proposals` por `proposal_id` filtrando `proposals.developer_id = :id`. `average` a `number` (`Number(...)`), `null` si `count = 0`. Sin sesión ni permiso.

**`listDeveloperRatings`** (RF5): mismo join más `users` por `projects.client_id` para el nombre; orden `created_at DESC, id DESC`; proyección explícita `{ rating, comment, clientName: abbreviateClientName(displayName), createdAt }`. Sin ids, sin email.

Logs: ninguno con comentario, nombre ni email (solo códigos de error).

### 7. Server actions (T3) — `rating.actions.ts` (`"use server"`)

Firmas compatibles con `useActionState`:

```ts
createDeveloperRatingAction(projectId: string, _prev: RatingFormState, formData: FormData): Promise<RatingFormState>
updateDeveloperRatingAction(projectId: string, _prev: RatingFormState, formData: FormData): Promise<RatingFormState>
```

1. `requireRole("client")` en `try`; el `catch` llama a `handleAuthErrorForPage`.
2. `z.uuid()` sobre `projectId` (inválido -> `{ status: "error", message: "No encontramos el proyecto." }`) y `ratingInputSchema.safeParse`; si falla, `fieldErrors` + `values`.
3. Servicio en `try`: `RatingError` -> su mensaje; `AuthError("NOT_FOUND")` -> "No encontramos el proyecto."; otro `AuthError` -> `handleAuthErrorForPage`; el resto -> "No pudimos completar la acción. Inténtalo de nuevo.".
4. Éxito: el servicio devolvió `{ developerId }`; `revalidatePath` de `/projects/${projectId}/rate`, `/developers/${developerId}` y `/dashboard/account`. Devuelve `{ status: "success" }`.

### 8. UI (T3 y T4)

- `src/app/projects/[id]/rate/page.tsx` (fina): metadata "Valorar al desarrollador | Nexora"; `z.uuid()` -> `notFound()`; `requireRole("client")` + `getProjectRatingView` en `try`, `handleAuthErrorForPage` en el `catch`; compone `<RateDeveloperForm view={…} />`. `loading.tsx` con `PaymentsLoading` (label "Cargando valoración...") y `error.tsx` con `PaymentsError` (title "No pudimos cargar la valoración").
- `rate-developer-form.tsx` (`"use client"`), según la vista:
  - `canCreate`: título "¿Cómo fue trabajar con {developerName}?", leyenda "Valoración general", 5 botones de estrella `aria-pressed` con `aria-label` "1 estrella"/"N estrellas" y `<input type="hidden" name="rating">`, texto `aria-live` "{n} de 5 · {Muy malo|Malo|Correcto|Bueno|Excelente}" o "Elige una valoración", `Textarea` con `FormField` "Comentario (opcional)" y contador "{n} / 600", caja "Antes de enviar" con los tres puntos del diseño usando `view.previewName`, botón "Publicar valoración" y enlace "Más tarde" a `/dashboard/projects`.
  - `rating && canEdit`: mismo formulario precargado con "Te quedan {daysLeft} días para editarla." y botón "Guardar cambios".
  - `rating && !canEdit`: solo lectura con "Ya no puedes editarla." y estrellas/comentario publicados.
  - Estados: botón `disabled` y "Publicando..."/"Guardando..." en `pending`; errores de campo con `role="alert"` (lo da `FormField`); mensaje general `aria-live="polite"`; éxito -> `role="status"` "Valoración publicada." y `router.refresh()`. Objetivo táctil >= 44 px. El comentario se imprime como texto, nunca con `dangerouslySetInnerHTML`.
- `project-list.tsx` (T3, solo añadir): para `status === "contracted"`, enlace "Valorar al desarrollador" a `/projects/${id}/rate` junto al enlace existente.
- T4 (componentes, todos presentacionales y de servidor):
  - `rating-stars.tsx`: estrellas de solo lectura (`Star` de lucide, `role="img"` con `aria-label` "{n} de 5"); lo usan `RatingSummary` y `RatingList`.
  - `rating-summary.tsx`: props `{ summary: DeveloperRatingSummary; developerId: string }` (tipo importado de `profile`). **Se usa solo en `ratingSlot` de "Mi cuenta"** (el perfil público ya pinta el promedio con la prop `rating` de 019). Con valoraciones: estrellas, promedio grande con coma, "de 5 · {count} valoración(es)", texto "La calculan las respuestas de tus clientes. No se puede editar." y enlace "Ver valoraciones recibidas" a `/developers/${developerId}#valoraciones` (`min-h-11`, foco visible). Sin valoraciones: "Aún sin valoraciones".
  - `rating-list.tsx`: props `{ ratings: PublicDeveloperRating[] }`; cada ítem: estrellas, `clientName`, fecha (D-I) y comentario como texto plano con `whitespace-pre-line` y `break-words`. Vacío: `EmptyState`. Se pasa siempre como `reviewsSlot` (elemento truthy), de modo que la sección `id="valoraciones"` existe también sin valoraciones.
  - `src/app/developers/[id]/page.tsx` (M): tras `notFound()`, `Promise.all([getDeveloperRatingSummary(profile.userId), listDeveloperRatings(profile.userId)])` y pasa `rating={summary}` y `reviewsSlot={<RatingList ratings={ratings} />}`. No toca `loadProfile`, metadata ni el resto.
  - `src/app/dashboard/account/page.tsx` (M): `getDeveloperRatingSummary(actorId)` y pasa `ratingSlot={<RatingSummary summary={summary} developerId={actorId} />}`. No toca el resto.

## Seguridad

- **Autorización en servidor, en capas:** `requireRole("client")` en action y página, `can(…, "rating.create")` en el servicio antes de tocar la BD, y `requireOwnership` sin admin. Cliente ajeno: 404 indistinguible de inexistente. Admin y desarrollador: FORBIDDEN (un desarrollador no puede valorarse a sí mismo).
- **Nada de confianza en el cliente:** `projectId` con `z.uuid()`; `proposal_id`, desarrollador y cliente se resuelven en servidor; ventana, estado contratado y unicidad se deciden en servidor y BD.
- **Validación zod** de `rating` y `comment`, repetida como CHECK en BD.
- **Comentario como texto plano:** sin Markdown ni HTML (no usa el renderizador de 018); React lo escapa; sin `dangerouslySetInnerHTML`. No se envía por email ni a Stripe.
- **Privacidad:** DTOs públicos con proyección explícita; nombre abreviado derivado en servidor. Un test comprueba las claves exactas de `PublicDeveloperRating` y del resumen. Las lecturas públicas siguen siendo accesibles a anónimos porque el perfil lo es (019 D11).
- **Integridad:** `unique(project_id)`, FK compuesta, CHECK de rango y longitud, `restrict`.
- **Abuso:** sin rate limiting (015); mitigado por rol cliente, propiedad, una fila por proyecto y ventana acotada.
- **Pagos de prueba:** la valoración no cambia ningún dato ni texto de dinero.

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Proyecto no contratado (`published`, `proposal_selected`, `closed` sin `contracted_at`) | Servicio `NOT_CONTRACTED`; la página `/rate` responde 404 |
| Proyecto `closed` tras `contracted` | Se puede crear y editar según la ventana |
| Dos envíos simultáneos | Una fila (`UNIQUE` + `ON CONFLICT`); el segundo recibe `ALREADY_RATED` |
| Editar sin valoración previa | `RATING_NOT_FOUND` |
| Editar a las 336 h exactas o después | `EDIT_WINDOW_CLOSED`, sin cambios |
| Editar dentro de la ventana | Actualiza; no extiende la ventana |
| Cliente borrado/anonimizado | La valoración se conserva; nombre "Cliente" |
| `displayName` con formato de email o `username` | "Cliente" |
| Comentario vacío o solo espacios | Se guarda `NULL` |
| Comentario de 601 caracteres, con NUL, rating 0, 6 o 3,5 | Rechazado por zod por campo; la BD también lo impide |
| Desarrollador sin valoraciones | `{ average: null, count: 0 }`; perfil: "Aún sin valoraciones" y `EmptyState` en la sección "Valoraciones"; "Mi cuenta": "Aún sin valoraciones" |
| Cliente ajeno, admin, desarrollador, visitante en `/rate` | 404 / FORBIDDEN / `/sign-in` según `handleAuthErrorForPage` |

## Criterios de aceptación

Base (T0):

- AC1. La migración la generó drizzle-kit (sin SQL a mano), con el siguiente número libre (`0006` hoy, posterior a la `0005` de 019), y crea `developer_ratings` con `project_id` UNIQUE NOT NULL, `proposal_id` NOT NULL, `rating` NOT NULL, `comment` nullable, los CHECK `developer_ratings_rating_range` y `developer_ratings_comment_length` y la FK compuesta `(proposal_id, project_id)` a `proposals`. El journal tiene una entrada más. No se ejecutó `db:migrate`. `migrations.test.ts` pasa sin cambios.
- AC2. En PGlite: `rating` 0 y 6 fallan; 1 y 5 pasan; comentario de 600 pasa y de 601 falla; `''` falla y `NULL` pasa; una segunda valoración para el mismo `project_id` falla; un `proposal_id` de otro proyecto falla (FK compuesta); borrar un proyecto con valoración falla (`restrict`).
- AC3. `can(role, "rating.create")` es `true` solo para `client`; la matriz de `permissions.test.ts` incluye la fila y pasa.

Contratos y servicio (T1, T2):

- AC4. `ratingInputSchema`: acepta 1 a 5 (también string de `FormData`), rechaza 0, 6, 3,5 y no numéricos; `comment` acepta 600 y rechaza 601; recorta espacios; vacío y solo espacios dan `null`; rechaza NUL; ausente da `null`.
- AC5. `abbreviateClientName`: "Maria Gomez" -> "Maria G."; "Ana María Pérez" -> "Ana P."; "Maria" -> "Maria"; "  juan   perez  " -> "juan P."; "maria.gomez", "jperez1984", "", "Deleted user" -> "Cliente"; nunca más de una inicial del apellido ni caracteres de un email.
- AC6. `getEditWindow`: con `now = createdAt + 336 h - 1 ms` es editable y `daysLeft = 1`; con `createdAt + 336 h` no es editable y `daysLeft = 0`; recién creada `daysLeft = 14`; `getEditCutoff` coherente con `getEditableUntil`.
- AC7. Crear: un cliente propietario de un proyecto contratado crea la valoración; la fila lleva el `proposal_id` de la propuesta aceptada y **el servicio devuelve `{ developerId }` igual a `proposals.developer_id` de esa propuesta**. Proyecto `published`, `proposal_selected` o `closed` sin `contracted_at` da `NOT_CONTRACTED` sin escribir. `closed` con `contracted_at` sí permite crear. Una segunda creación da `ALREADY_RATED` y deja una sola fila; con `Promise.allSettled` simultáneo hay una fila.
- AC8. Permisos: `developer` y `admin` reciben `FORBIDDEN` en crear, editar y leer la vista **sin** tocar la BD; un cliente que no es el dueño recibe `NOT_FOUND` (igual que un proyecto inexistente) sin escribir; ninguna firma acepta `developerId`, `clientId` o `proposalId` externos.
- AC9. Editar: dentro de la ventana actualiza `rating` y `comment` sin cambiar `created_at` ni `proposal_id` y **devuelve `{ developerId }`**; con el reloj inyectado a `created_at + 336 h` da `EDIT_WINDOW_CLOSED` sin cambios; a `created_at + 336 h - 1 ms` aún edita; sin valoración previa da `RATING_NOT_FOUND`; editar no extiende la ventana. El test usa el reloj inyectado, no `Date` real.
- AC10. `getProjectRatingView`: `canCreate`, `rating`, `canEdit`, `daysLeft` correctos para (sin valoración), (reciente), (borde) y (vencida); `previewName` abreviado; sin `contracted_at` da `NOT_FOUND`; claves exactas del tipo.
- AC11. `getDeveloperRatingSummary`: sin valoraciones `{ average: null, count: 0 }`; con 1, 2 y 3 valoraciones calcula conteo y **promedio ya redondeado a 1 decimal** (5, 4, 4 -> 4,3; 5 y 4 -> 4,5; 1 y 2 -> 1,5); solo cuenta las del desarrollador pedido; incluye valoraciones de clientes anonimizados; el resultado es asignable a `DeveloperRatingSummary` de `profile` y `rating.types.ts` no lo declara.
- AC12. `listDeveloperRatings`: solo del desarrollador pedido, más reciente primero con desempate por `id`, máximo 20, nombre abreviado (incluido "Cliente" para anonimizados o con formato de email) y claves exactas `rating`, `comment`, `clientName`, `createdAt`.

Actions, UI e integración (T3, T4):

- AC13. Actions: `requireRole("client")` antes que el servicio y un `AuthError` no llama al servicio; entrada inválida devuelve `fieldErrors` y `values` sin llamar al servicio; cada `RatingError` da su mensaje; error desconocido da el genérico; el éxito llama a `revalidatePath` con **`/projects/${projectId}/rate`, `/developers/${developerId}` (el devuelto por el servicio) y `/dashboard/account`** y devuelve `{ status: "success" }`.
- AC14. Página del cliente (manual): `/projects/[id]/rate` muestra el formulario con 5 estrellas, contador "n / 600", nombre abreviado propio en "Antes de enviar" y los textos del diseño; tras publicar, modo editar con "Te quedan 14 días para editarla."; con la valoración vencida, solo lectura y "Ya no puedes editarla."; cliente ajeno, desarrollador o proyecto no contratado dan 404; el enlace "Valorar al desarrollador" aparece solo en proyectos `contracted` del cliente.
- AC15. Integración (manual): `/developers/[id]` muestra, con la prop `rating` de 019, "4,6 · N valoraciones" (o "Aún sin valoraciones"), y una sección "Valoraciones" con `id="valoraciones"` que contiene `RatingList` (nombres abreviados, fecha, comentarios como texto plano: `<script>` o `**negrita**` se ven literales; `EmptyState` si no hay); visible sin sesión. `/dashboard/account` muestra "Tu valoración" con `RatingSummary` (promedio con coma, "de 5 · N valoraciones", enlace "Ver valoraciones recibidas" que lleva a `/developers/{id}#valoraciones`). `RatingSummary` no aparece en el perfil público.
- AC16. Regresión y docs: `git diff` no muestra cambios en `developer-profile-view.tsx`, `developer-profile-form.tsx` ni `SETUP.md`; de los archivos de 019 solo cambian las dos páginas indicadas y solo en las props `rating`, `reviewsSlot`, `ratingSlot` y sus imports/consultas. `npm run lint`, `npm run test` y `npm run build` pasan; los tests de 004 a 019 pasan sin modificaciones (salvo la fila de `permissions.test.ts`); ningún test usa red, Clerk, Stripe ni Neon reales; `package.json` y `.env.example` no cambian; el build añade solo `/projects/[id]/rate`. Documentación (T4, solo adiciones): `system-design.md` §2 (entidad y diagrama), §3, §4 (módulo `ratings`, lee `projects`, `proposals`, `users`, y **dependencia de solo tipo `ratings -> profile`** con la aclaración de que `profile` no importa `ratings`), §6 y §8 (D-A a D-K); sección "Spec 020" en `MANUAL-TESTS.md` (incluido el paso humano `npm run db:migrate`).

## Tests requeridos

Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM; BD con PGlite y migraciones reales (`createTestDb`, patrón `Proxy` + `holder` y `vi.mock("server-only")` de los servicios existentes). Reloj inyectable vía `deps.now`; sin temporizadores falsos globales para la ventana.

- `src/lib/db/developer-ratings-constraints.test.ts` (T0): AC2.
- `src/modules/auth/services/permissions.test.ts` (T0): AC3.
- `src/modules/ratings/schemas/rating.schema.test.ts` (T1): AC4.
- `src/modules/ratings/services/client-name.test.ts` (T1): AC5, table-driven.
- `src/modules/ratings/services/rating-window.test.ts` (T1): AC6, bordes exactos.
- `src/modules/ratings/services/rating.service.test.ts` (T2): AC7 a AC12 (permisos, ventana con reloj inyectado, una por proyecto secuencial y concurrente, `developerId` devuelto, promedio y redondeo, claves exactas). Limitación documentada: PGlite serializa; la concurrencia demuestra coherencia (UNIQUE + `ON CONFLICT`), no bloqueos reales de Neon.
- `src/modules/ratings/actions/rating.actions.test.ts` (T3): AC13 (mocks de `requireRole`, del servicio y de `next/cache`; el mock del servicio devuelve `{ developerId }`).
- Sin test unitario obligatorio (`SETUP §3`): componentes presentacionales (`rating-stars`, `rating-summary`, `rating-list`), páginas de `src/app`. `rate-developer-form.tsx` admite un test RTL opcional.
- Regresión sin cambios: `migrations.test.ts`, `constraints.test.ts`, `developer-profiles-constraints.test.ts`, tests de `profile`, `proposal-selection.service.test.ts`, `payment-overview.service.test.ts`.

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Durante el bloque paralelo nadie ejecuta `npm install`, `npm run build`, `drizzle-kit` ni `db:migrate`; el reviewer corre lint, test y build al final.

### T0 — Base compartida: tabla, migración y permiso

- Archivos: `src/modules/ratings/schema/developer-ratings.table.ts`, `drizzle/<NNNN>_developer_ratings.sql`, `drizzle/meta/<NNNN>_snapshot.json`, `drizzle/meta/_journal.json` (generados con `npm run db:generate -- --name developer_ratings`; hoy `<NNNN>` = `0006`; **sin** `db:migrate`), `src/lib/db/developer-ratings-constraints.test.ts`, `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts`
- Depende de: — (019 ya migró; 021 espera a esta)
- Paralelizable: no
- Cubre: AC1, AC2, AC3

### T1 — Contratos y funciones puras

- Archivos: `src/modules/ratings/types/rating.types.ts`, `src/modules/ratings/services/rating-errors.ts`, `src/modules/ratings/schemas/rating.schema.ts`, `src/modules/ratings/schemas/rating.schema.test.ts`, `src/modules/ratings/services/client-name.ts`, `src/modules/ratings/services/client-name.test.ts`, `src/modules/ratings/services/rating-window.ts`, `src/modules/ratings/services/rating-window.test.ts`
- Depende de: T0
- Paralelizable: no
- Cubre: AC4, AC5, AC6

### T2 — Servicio de valoraciones

- Archivos: `src/modules/ratings/services/rating.service.ts`, `src/modules/ratings/services/rating.service.test.ts`
- Depende de: T1
- Paralelizable: no
- Cubre: AC7, AC8, AC9, AC10, AC11, AC12

### T3 — Actions, página del cliente y enlace

- Archivos: `src/modules/ratings/actions/rating.actions.ts`, `src/modules/ratings/actions/rating.actions.test.ts`, `src/app/projects/[id]/rate/page.tsx`, `src/app/projects/[id]/rate/loading.tsx`, `src/app/projects/[id]/rate/error.tsx`, `src/modules/ratings/components/rate-developer-form.tsx`, `src/modules/projects/components/project-list.tsx` (solo añadir el enlace)
- Depende de: T2
- Paralelizable: sí (con T4; archivos disjuntos)
- Cubre: AC13, AC14

### T4 — Visualización, composición en las páginas de 019 y documentación

- Archivos: `src/modules/ratings/components/rating-stars.tsx`, `src/modules/ratings/components/rating-summary.tsx`, `src/modules/ratings/components/rating-list.tsx`, `src/app/developers/[id]/page.tsx`, `src/app/dashboard/account/page.tsx`, `docs/architecture/system-design.md`, `docs/MANUAL-TESTS.md`
- Depende de: T2 (019 ya está implementada)
- Paralelizable: sí (con T3; archivos disjuntos)
- Cubre: AC15, AC16
- Docs (solo adiciones): `system-design.md` §2 fila `developerRating` ("valoración del cliente al desarrollador contratado; proyecto (único), propuesta aceptada, estrellas 1 a 5, comentario opcional <= 600, fechas"; 1:0..1 con proyecto) y relación en el diagrama; §3 "Valoraciones: Neon"; §4 módulo `ratings` y la dependencia de solo tipo `ratings -> profile` (sin ciclo); §6 fila "Valorar al desarrollador": solo cliente propietario de proyecto contratado; §8 decisiones D-A a D-K. `MANUAL-TESTS.md`: sección "Spec 020" con pasos: aplicar la migración en Neon (humano), valorar un proyecto contratado, intentar valorar uno no contratado y uno ajeno (404), segunda valoración (rechazada), editar dentro de la ventana, simular ventana vencida (`UPDATE developer_ratings SET created_at = now() - interval '15 days'`, solo pruebas), perfil público sin sesión con promedio y lista, enlace "Ver valoraciones recibidas" desde "Mi cuenta", comentario con HTML/Markdown literal, responsive a 390 px y teclado/foco en las estrellas.

## Riesgos

- R1. Se puede valorar apenas se confirma el pago de prueba, antes de recibir el trabajo (D-A). Mitigado por la edición de 14 días.
- R2. Sin moderación ni borrado, una valoración abusiva solo se corrige con SQL manual. Aceptado en el MVP.
- R3. Zod cuenta unidades UTF-16 y Postgres `char_length` puntos de código: zod es igual o más estricto.
- R4. `displayName` viene de Clerk: la heurística de D-H prioriza no filtrar datos (cae a "Cliente").
- R5. Agregado sin caché; aceptable en el MVP.
- R6. PGlite no demuestra concurrencia real; se valida por UNIQUE + `ON CONFLICT`.
- R7. `z.coerce.number()` y `.optional().transform` en zod 4 sobre `FormData` **a verificar** por el developer en `node_modules/zod` (el contrato de salida no cambia). También verificar que `AuthUser` expone `displayName` para `previewName`.
- R8. Las dos páginas de 019 se editan solo por composición; si 019 cambia sus props, esta spec vuelve a `borrador`.

## Preguntas abiertas

Ninguna. Antiguas P1 a P9 resueltas con la recomendación por defecto (y P6 por 019 D11): valorar con proyecto contratado (D-A); sin `developer_id`/`client_id` en la fila (D-B); comentario texto plano; sin enlace de valoración para `closed` (D-K); nombre de un token tal cual; perfil visible a anónimos; 20 valoraciones sin paginar; sin borrado, moderación, reportes, respuesta ni notificaciones; textos de estado decididos en D-K.

## Próximas fases

- Moderación y reportes (015 o spec nueva), borrado administrativo y respuesta del desarrollador.
- Paginación y orden de la lista; columna desnormalizada de promedio si el volumen lo exige.
- Estado "completado/entregado" del proyecto y valoración condicionada a él.
- Notificaciones al desarrollador.
- Enlace de valoración y estado en el dashboard del cliente (012); vista de valoraciones recibidas del desarrollador (013).
- Rate limiting de las actions (015).

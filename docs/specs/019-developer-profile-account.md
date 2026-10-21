# Perfil del desarrollador y panel "Mi cuenta"

Estado: done

Numeración: 019 (018 a 021 se eligieron porque 012 a 017 están reservadas en `docs/SDD-PLAN.md`). Orden del conjunto: 018 Markdown -> **019 perfil (esta)** -> 020 valoraciones (depende de 019) -> 021 adjuntos. Esta spec **no depende de 018** (la biografía es texto plano; ver D3) ni de 020 (solo deja el contrato de inyección; ver "Contrato para 020").

Referencia visual y de textos (leída): `Account.dc.html` (panel "Mi cuenta · gestión del perfil"), `Main.dc.html` (perfil público) y `canvas.json` del diseño. Los textos de esta spec salen de ahí y se ajustan donde se indica.

## Objetivo

Que un usuario con rol `developer`:

1. Edite su perfil en un panel privado (`/dashboard/account`, "Mi cuenta"): titular, ubicación, disponibilidad, biografía, hasta 5 enlaces y datos de contacto con control de privacidad.
2. Tenga un perfil público (`/developers/[id]`) que ven los clientes (y cualquier visitante, sin datos privados) con su avatar por defecto (iniciales), titular, biografía, enlaces y, cuando 020 lo inyecte, su valoración promedio y número de valoraciones.
3. Controle quién ve su correo de contacto, con una opción por defecto conservadora: solo un cliente con el que tiene una propuesta aceptada.
4. Acceda a "Cobros de prueba" (011a) desde "Mi cuenta", como en el diseño, en lugar de un enlace propio en el header (D15).

Referencias de arquitectura (solo estas secciones): `system-design.md §2` (entidad `developerProfile`, 1:1 con usuario `developer`), `§3` (propiedad de datos: nombre y email de acceso viven en Clerk/`users`; el perfil en Neon), `§4` y `D4` (módulos y dependencias permitidas; **esta spec las modifica, ver D14**), `§6` (permisos), y `004` RF7 (autorización siempre en servidor, recurso ajeno -> 404). Patrones de formato, permisos y dashboard: specs 004, 009b y 011a.

## Hallazgos del repositorio que condicionan la spec

- **La tabla `developer_profiles` ya existe** (`src/modules/users/schema/developer-profiles.table.ts`, migración `0000`): PK `user_id` (FK a `users`, `cascade`), `headline` NOT NULL, `bio` NOT NULL, `technologies text[]`, `external_url`, fechas. **Ningún código de la app la lee ni la escribe** (Grep: solo esquema, `constraints.test.ts` y `migrations.test.ts`). Ya cumple "tabla propia 1:1 con `users`": esta spec la **extiende** con una migración de `ALTER`, no crea otra tabla.
- **`system-design.md §4` (verificado) prohíbe lo que la primera versión de esta spec asumía.** La tabla de dependencias dice: `users` -> "sin dependencias de otros módulos; nunca importa `auth`", y `proposals`/`projects` dependen de `users` (un `users -> proposals/projects` crearía un ciclo; "sin ciclos"). Un servicio de perfil dentro de `users` necesitaba `can`/`AuthError`/`AuthUser` (de `auth`) y leer `proposals`/`projects` (regla `accepted_client`): ambas cosas incumplen §4. Resolución en D14: la lógica de perfil vive en un módulo nuevo `profile` que puede depender de `users`, `projects`, `proposals` y `auth` (como `payments`); la tabla se queda en `users/schema`.
- `users.display_name` y `users.email` los sincroniza Clerk (webhook `user.updated`, spec 004 RF3). Si el perfil permitiera editar el nombre, el siguiente webhook lo sobrescribiría. Por eso el nombre **no es editable aquí** (D5).
- `users.service.ts` (004) anonimiza cuentas con `email = <algo>@deleted.invalid` y `display_name = "Deleted user"` (constantes `DELETED_EMAIL_DOMAIN` y `DELETED_DISPLAY_NAME`, hoy **no exportadas**). Se necesitan para D16.
- `technologies` del perfil: la decisión D11 de 009c lo dejó fuera de alcance y usarlo obligaría a una dependencia con el catálogo de `projects`. No se incluye (D7).
- La migración `0004` (011a) está sin commitear. Esta spec genera la siguiente en orden. **020 y 021 también generarán migraciones**: las cuatro specs se implementan en serie en lo que a migraciones respecta (018 no tiene esquema; 019 -> 020 -> 021), y cada una corre `db:generate` sobre el estado real del repo en ese momento. 020 ya contempla "usar el siguiente número libre".
- `lib/db/constraints.test.ts` ya inserta en `developer_profiles` solo `user_id, headline, bio`: las columnas nuevas deben tener `DEFAULT` o ser nullable para que ese test siga pasando sin cambios.
- `getPayoutsLink` (011a) solo se usa en `site-header.tsx` y `dashboard-link.test.ts` (Grep). Las rutas `/dashboard/payouts`, `/dashboard/payouts/onboarding/return` y `/refresh` y sus redirects (`?onboarding=...`) no dependen del header.

## Alcance

- Incluye:
  - Migración generada por drizzle-kit que añade a `developer_profiles`: `location`, `availability` (enum), `links` (jsonb), `contact_email`, `contact_visibility` (enum) y CHECKs de longitud.
  - Permiso `profile.edit` (solo `developer`).
  - Módulo nuevo `src/modules/profile` (D14): schema zod de entrada, tipos, servicio de perfil (lectura propia, guardado propio, lectura pública), función pura de privacidad del correo y función pura de iniciales.
  - Server action `saveDeveloperProfileAction`.
  - Ruta privada `/dashboard/account` (editor) y ruta pública `/developers/[id]` (perfil), con `loading.tsx` y `error.tsx`.
  - Avatar por defecto (iniciales sobre fondo `#DCE6DE`) sin subida de archivos.
  - "Cobros de prueba" **dentro de "Mi cuenta"** (D15): tarjeta con enlace a `/dashboard/payouts`; el header del desarrollador sustituye "Cobros de prueba" por "Mi cuenta"; la página de cobros gana un enlace de vuelta a "Mi cuenta".
  - Contrato de inyección de valoración para 020 (props opcionales; sin implementarlo).
  - Pruebas automáticas y pasos manuales; actualización de docs de arquitectura (incluida la tabla de módulos de §4).
- No incluye:
  - Subida de foto (Vercel Blob/S3/Supabase Storage). El diseño muestra "Subir foto" y "Usar la foto por defecto": **no se renderizan** esos botones (D1). Candidata a fase posterior, junto a 021 (adjuntos).
  - Markdown en la biografía (018 aporta el renderizado; ver D3).
  - Valoraciones: cálculo, tabla, formulario y lista (020). 019 solo reserva el hueco.
  - Zona horaria, idiomas, "proyectos contratados" e "Invitar a un proyecto" del diseño (D17).
  - Tecnologías del perfil (D7) y la columna `external_url` (queda sin uso; ver D8).
  - Edición de nombre visible o del email de acceso (los gestiona Clerk), sección "Acceso y seguridad", sub-navegación lateral de "Mi cuenta" (D15, D17).
  - Mostrar el **estado** de la cuenta de cobros dentro de "Mi cuenta" (solo un enlace; evita `profile -> payments`). Mover o cambiar rutas, servicios, actions, schemas, redirects o tests de 011a en `payments` (D15).
  - Perfil de cliente o de admin; búsqueda o listado de desarrolladores; slug personalizado.
  - Cambios en `package.json`, `.env.example`, `src/app/layout.tsx`, `proxy.ts`, `globals.css`, `src/components/ui/**`, ni en servicios, rutas o tests de 004 a 011a, **salvo la lista cerrada de "Excepciones sobre archivos de 004 a 011a" en la sección Archivos**.
  - Rate limiting (015).

## Decisiones (todas resueltas; las del humano se marcan "Decidida")

- **D1. Foto de perfil. Decidida (humano).** Solo avatar por defecto con iniciales de `users.display_name` (sin subida, sin columna de foto, sin dependencias, sin riesgo de archivos). Alternativas para una fase posterior: Vercel Blob o S3 (dependencia, variables de entorno, validación de tipo y tamaño, moderación), o la foto de Clerk (`imageUrl`; acopla el perfil público a una URL de tercero).
- **D2. Privacidad del correo de contacto. Decidida.** Campo propio `contact_email` (opcional, distinto del email de acceso `users.email`, que **nunca** se expone). Enum `contact_visibility`:
  - `accepted_client` (**por defecto**): solo un `client` autenticado que tenga, como dueño de un proyecto, una propuesta `accepted` de este desarrollador. Coincide con la opción "recomendada" del diseño.
  - `any_client`: cualquier usuario autenticado con rol `client`.
  - `nobody`: nadie; solo lo ve el propio desarrollador.
  Visitantes anónimos, desarrolladores y admin **no** ven el correo en ninguna opción (admin: D8 de 004 limita su lectura a proyectos, propuestas y pagos). La decisión se toma **en el servidor**: el DTO público ya trae `contactEmail` resuelto o `null`.
- **D3. Biografía.** Texto plano, hasta 5000 caracteres, renderizado como texto (React escapa; `whitespace-pre-line`). Se **ajusta el texto de ayuda** del diseño ("Admite Markdown básico") a "Texto plano. Los saltos de línea se conservan.". Punto de integración para 018: el texto se renderiza solo dentro de `DeveloperBio` (componente dentro de `developer-profile-view.tsx`); esta spec no importa nada de 018.
- **D4. Relación con Clerk y con `users`.** Tabla propia 1:1 con `users` (la existente `developer_profiles`), sin duplicar email ni nombre; el nombre visible se lee de `users.display_name`. **Ajustada por D14**: la tabla sigue en `users/schema`, la lógica de perfil vive en el módulo `profile`.
- **D5. Nombre visible no editable en 019. Decidida.** Lo gestiona Clerk (nota "Se gestiona desde tu cuenta de acceso").
- **D6. URL pública.** `/developers/[id]` con `users.id` (UUID); sin slug (YAGNI) ni `clerk_user_id`. Un UUID que no sea de un usuario `developer` da 404.
- **D7. Tecnologías fuera de esta fase. Decidida.** Reutilizar el catálogo cerrado exigiría una dependencia hacia `projects`; fase posterior.
- **D8. Enlaces.** Columna `links jsonb` (array de `{ type, url }`), máximo 5, solo `https:`. `external_url` queda sin uso y se **conserva** (borrarla es una limpieza destructiva que nadie pide; decidida).
- **D9. Ruta del panel.** `/dashboard/account` (coherente con `/dashboard/projects|proposals|payouts`) y enlace "Mi cuenta" en el header del desarrollador.
- **D10. Perfil sin fila.** El desarrollador no tiene fila hasta el primer guardado (el editor muestra valores vacíos). El perfil público de un desarrollador sin fila **se muestra igual** con nombre, avatar y "Este desarrollador aún no completó su perfil" (los enlaces desde propuestas no dan 404).
- **D11. Perfil público abierto a visitantes anónimos. Decidida.** Solo contiene lo que el desarrollador decide publicar; el correo sigue D2.
- **D12. Permiso.** `profile.edit: ["developer"]` en la matriz (coherente con `payout.manage`). La lectura pública no necesita acción.
- **D13. Migración.** `npm run db:generate -- --name developer_profile_account`. No se escribe SQL a mano ni se aplica; el humano corre `npm run db:migrate`. 019 es la primera de las cuatro specs en migrar, así que toma el siguiente número libre (esperado `0005`).
- **D14. Módulo `profile` (resuelve la antigua P8). Decidida por verificación contra `system-design.md §4`.** Los servicios, la action, los schemas, los tipos y los componentes del perfil viven en `src/modules/profile` (singular, concepto único; SETUP §1.3). Dependencias permitidas: `users`, `projects`, `proposals`, `auth` (igual que `payments`); lectura de las tablas Drizzle de `proposals` y `projects`, sin importar sus servicios. **Excepción acotada:** `profile` escribe en `developer_profiles` (tabla de `users/schema`) únicamente con `INSERT ... ON CONFLICT (user_id) DO UPDATE` y el `user_id` sale siempre de la sesión. Nadie depende de `profile` salvo `src/app`. `users` no cambia de dependencias (sigue sin importar a nadie). Esta spec actualiza `§4` (bloque de módulos, tabla y regla) y reescribe la frase de D4 en `§8` (T4). Alternativas descartadas: permitir `users -> proposals/projects` y `users -> auth` (ciclo y contradice §4) o mover la regla `accepted_client` a una función expuesta por `proposals` (acopla `proposals` a la privacidad del perfil).
- **D15. "Cobros de prueba" dentro de "Mi cuenta". Decidida (humano); forma mínima elegida.**
  - El header del desarrollador muestra "Mis propuestas" y **"Mi cuenta"**; ya no "Cobros de prueba".
  - `/dashboard/account` incluye, bajo el formulario, una tarjeta "Cobros de prueba" (texto: "Configura tu cuenta de Stripe en modo de prueba para recibir transferencias de prueba. No es dinero real.") con un enlace "Ir a Cobros de prueba" a `/dashboard/payouts`.
  - Se **conserva** la ruta `/dashboard/payouts` y las rutas `onboarding/return|refresh` de 011a (no se toca Stripe ni los `return_url`/`refresh_url`, que ya están registrados en `connected-account.service.ts`).
  - `payouts-page-view.tsx` añade un enlace "Volver a Mi cuenta" (a `/dashboard/account`) sobre el `<h1>`, para no dejar al usuario sin navegación (ya no está en el header).
  - `getPayoutsLink` se **elimina** de `dashboard-link.ts` (código muerto: YAGNI) junto con su `describe` en `dashboard-link.test.ts`; se sustituye por `getAccountLink`.
  - No se muestra el estado de la cuenta de cobros en "Mi cuenta" (sería una dependencia `profile -> payments` y un aviso Stripe duplicado). Alternativa para una fase posterior: composición desde `src/app` con `getConnectedAccountOverview`.
  - Esto **reemplaza** lo decidido en 011a D-A/AC17 y el paso 11 de MANUAL-TESTS de 011a (el header). 011a queda `done` sin editarse: la sustitución queda registrada aquí y en `system-design.md §8` (T4). Al estar `/dashboard/payouts` fuera del header, `SiteNav` no resalta nada en esa ruta (aceptado).
- **D16. Cuentas anonimizadas. Decidida.** Si el usuario está anonimizado (`users.email` termina en `@deleted.invalid`), el correo de contacto se **oculta** (estado `none`) aunque exista en la fila. El servicio calcula un booleano en SQL (`users.email LIKE '%' || DELETED_EMAIL_DOMAIN`) sin devolver ni registrar el email; reutiliza las constantes de `users.service.ts`, que T0 exporta (cambio de una palabra, sin lógica).
- **D17. Fuera de fase. Decidida.** Zona horaria, idiomas, "proyectos contratados", "Invitar a un proyecto", sub-navegación lateral y "Acceso y seguridad" se difieren; "Valoraciones" lo añade 020.
- **D18. Orden de migraciones. Decidida.** 019 -> 020 -> 021.

## Reutilizar

Inventario verificado con Glob, Grep y Read:

| Existente | Uso |
|---|---|
| `users/schema/developer-profiles.table.ts` (PK `user_id`, `headline`, `bio`) | Se **extiende**; no se crea tabla |
| `users/schema/users.table.ts` (`displayName`, `role`) | Nombre visible del perfil y filtro de rol `developer`. **`email` nunca se devuelve**; solo se usa en un `LIKE` interno para D16 |
| `users/services/users.service.ts` (`DELETED_EMAIL_DOMAIN`, `DELETED_DISPLAY_NAME`) | Se **exportan** las constantes (T0) y `profile` las reutiliza (D16) |
| `payments/schema/connected-accounts.table.ts` y `drizzle/0004_connected_accounts.sql` | Patrón de tabla, `pgEnum`, `check(...)` con `sql`, `updatedAt.$onUpdate` |
| `lib/db/connected-accounts-constraints.test.ts`, `lib/db/test-db.ts` (`createTestDb`, PGlite con migraciones reales) | Patrón del test de constraints y de servicios |
| `lib/db/constraints.test.ts` (inserta `developer_profiles`) y `lib/db/migrations.test.ts` | Regresión: deben pasar sin cambios |
| `auth`: `requireRole`, `getCurrentUser` (con `cache`), `can`, `AuthError`, `AuthUser`, `handleAuthErrorForPage` | Guards del editor y del perfil público (viewer opcional) |
| `auth/services/permissions.ts` + `permissions.test.ts` (matriz exhaustiva) y `auth/types/auth.types.ts` | Se añade `profile.edit` |
| `auth/services/dashboard-link.ts` (`NavLinkItem`; `getPayoutsLink` de 011a que se sustituye), `auth/components/site-header.tsx`, `components/shared/site-nav.tsx`, `lib/is-active-path.ts` | Patrón del enlace de header; `SiteNav` **no cambia** |
| `projects/schemas/project.schema.ts` (`PROJECT_LIMITS`, errores por campo) y `projects/types/project.types.ts` | Patrón de límites constantes y de `FieldErrors` |
| `payments/actions/connected-account.actions.ts` y `payment.actions.ts` | Patrón de action: `requireRole` primero, `toResult`, `revalidatePath` |
| `payments/components/payouts-page-view.tsx`, `src/app/dashboard/payouts/**` (011a) | Se **conservan**; solo el enlace de vuelta (D15) |
| `projects/components/project-form.tsx`, `components/ui/{input,textarea,label,native-select,button,badge}.tsx` | UI del formulario; **sin `shadcn add`**. `npx shadcn@latest search @shadcn -q avatar` existe en el registro, pero no se añade: un círculo con iniciales no justifica un componente nuevo ni tocar `src/components/ui` (si el developer decide usarlo, escala y la spec vuelve a borrador) |
| `payments/components/payments-loading.tsx`, `payments-error.tsx` (aceptan `label` y `title`) | `loading.tsx` y `error.tsx` de las rutas nuevas sin componentes nuevos (los usó 011a desde otro módulo; mismo criterio) |
| `proposals/schema/proposals.table.ts` (`developerId`, `projectId`, `status = 'accepted'`) y `projects/schema/projects.table.ts` (`clientId`) | Consulta de "propuesta aceptada" para D2; lectura de tablas desde `profile`, permitida por D14. Se aísla en la función `hasAcceptedProposalWith` |
| `src/app/dashboard/proposals/page.tsx` | Patrón de página fina con `requireRole("developer")` |
| Tokens del repo `#183D30`, `#F5F6F2`, `#E3E8E3`, `#202522`, `#535E56`, `#DCE6DE`, `#B42318`; foco `ring-[#183D30]/40`; objetivos `min-h-11` | Estilos (idénticos al diseño) |

No existen `src/hooks`, stores, ni código de perfil: se crea. No se instalan dependencias (`zod` 4.6.5, `drizzle-orm` 0.45.4 y `drizzle-kit` 0.31.11 ya instalados).

## Contratos

### Datos (T0)

Cambios en `developer-profiles.table.ts` (solo adiciones; `headline`, `bio`, `technologies`, `external_url` no cambian):

```ts
export type ProfileLink = { type: "github" | "linkedin" | "portfolio" | "other"; url: string };  // única declaración

export const developerAvailabilityEnum = pgEnum("developer_availability", ["available", "partial", "unavailable"]);
export const contactVisibilityEnum = pgEnum("contact_visibility", ["accepted_client", "any_client", "nobody"]);

// columnas nuevas
location: text("location"),                                            // nullable
availability: developerAvailabilityEnum("availability").notNull().default("available"),
links: jsonb("links").$type<ProfileLink[]>().notNull().default(sql`'[]'::jsonb`),
contactEmail: text("contact_email"),                                   // nullable; NOT users.email
contactVisibility: contactVisibilityEnum("contact_visibility").notNull().default("accepted_client"),

// tercer argumento: (t) => [check(...)]
// developer_profiles_headline_length : char_length(headline) <= 80
// developer_profiles_bio_length      : char_length(bio) <= 5000
// developer_profiles_location_length : location IS NULL OR char_length(location) <= 80
// developer_profiles_contact_email_length : contact_email IS NULL OR char_length(contact_email) <= 254
// developer_profiles_links_shape     : jsonb_typeof(links) = 'array' AND jsonb_array_length(links) <= 5
```

- El CHECK de `headline` permite cadena vacía (la tabla ya es NOT NULL; la obligatoriedad de 1 a 80 la impone zod). Evita romper filas existentes.
- El esquema `https`-only de las URLs **no** se expresa en SQL (jsonb): lo garantiza zod en servidor y se prueba.
- Migración: `npm run db:generate -- --name developer_profile_account` produce `drizzle/0005_developer_profile_account.sql` (número **a confirmar** según el estado real de `drizzle/`), su snapshot y el journal. No hace falta `DATABASE_URL` para generar. Si drizzle-kit pregunta por renombres, no hay renombres: responder "crear". **Prohibido** `npm run db:migrate`. `migrations.test.ts` no cambia (usa `arrayContaining` y cuenta entradas del journal; **a verificar**).
- `users.service.ts`: solo se antepone `export` a `DELETED_EMAIL_DOMAIN` y `DELETED_DISPLAY_NAME`.

### Permiso (T0)

`auth.types.ts`: `Action` añade `"profile.edit"`. `permissions.ts`: `"profile.edit": ["developer"]`. `permissions.test.ts`: fila `"profile.edit": [false, false, true, false]`.

### Tipos y límites (T1) — `profile/types/developer-profile.types.ts`

```ts
export type { ProfileLink } from "@/modules/users/schema/developer-profiles.table";
export type ProfileLinkType = ProfileLink["type"];
export type DeveloperAvailability = "available" | "partial" | "unavailable";
export type ContactVisibility = "accepted_client" | "any_client" | "nobody";

export const PROFILE_LIMITS = {
  headline: { min: 1, max: 80 }, location: { max: 80 }, bio: { max: 5000 },
  links: { maxItems: 5, urlMax: 300 }, contactEmail: { max: 254 },
} as const;
export const AVAILABILITY_LABELS: Record<DeveloperAvailability, string> = {
  available: "Disponible", partial: "Disponible parcialmente", unavailable: "No disponible" };
export const LINK_TYPE_LABELS: Record<ProfileLinkType, string> = {
  github: "GitHub", linkedin: "LinkedIn", portfolio: "Portafolio", other: "Otro" };
export const CONTACT_VISIBILITY_LABELS: Record<ContactVisibility, string> = {
  accepted_client: "Solo clientes que me contrataron (recomendado)",
  any_client: "Cualquier cliente con sesión iniciada",
  nobody: "Nadie" };

/** Form/DB shape owned by the developer (editor). Never includes users.email. */
export type OwnDeveloperProfile = {
  displayName: string;            // read-only, from users
  headline: string; location: string; availability: DeveloperAvailability;
  bio: string; links: ProfileLink[];
  contactEmail: string; contactVisibility: ContactVisibility;
  hasProfile: boolean;            // false until first save (D10)
};

/** Public DTO. contactEmail is ALREADY resolved server-side (D2, D16): string only if the viewer may see it. */
export type PublicDeveloperProfile = {
  userId: string; displayName: string; initials: string;
  hasProfile: boolean;
  headline: string | null; location: string | null;
  availability: DeveloperAvailability | null;
  bio: string | null; links: ProfileLink[];
  contactEmail: string | null;
  contactState: "visible" | "hidden_by_owner" | "restricted" | "none";   // for UI copy; see RF4
};

export type DeveloperProfileFieldName = "headline" | "location" | "availability" | "bio" | "links" | "contactEmail" | "contactVisibility";
export type DeveloperProfileFieldErrors = Partial<Record<DeveloperProfileFieldName, string>>;
export type SaveDeveloperProfileResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION"; fieldErrors: DeveloperProfileFieldErrors }
  | { ok: false; code: "UNKNOWN"; message: string };

/** ---- Contract for spec 020 (declared here ONLY; 020 imports it, never redeclares it) ---- */
export type DeveloperRatingSummary = { average: number | null; count: number };   // average null iff count === 0; already rounded to 1 decimal by 020's service
```

`PublicDeveloperProfile` **no tiene** `email` ni `clerkUserId` (se verifica con `Object.keys` exactos).

### Schema zod (T1) — `profile/schemas/developer-profile.schema.ts`

`developerProfileInputSchema` (zod 4; mensajes en español; estilo de `project.schema.ts`):

- `headline`: `trim`, 1 a 80.
- `location`: `trim`, 0 a 80; cadena vacía -> se guarda `null`.
- `availability`: enum de los tres valores.
- `bio`: `trim` solo en los extremos, 0 a 5000 (caracteres, no bytes). Texto plano: sin transformación del contenido.
- `links`: array de `{ type, url }` con máximo 5. Cada `url`: `trim`, longitud 1 a 300, debe parsear con `new URL(...)`, `protocol === "https:"`, **sin credenciales** y host con al menos un punto. Mensaje: "Escribe la URL completa, empezando por https://". `javascript:`, `data:`, `http:`, `//host` y relativas se rechazan. La URL se guarda tal como la escribió el usuario (`trim`). Duplicados exactos: "Este enlace ya está en tu lista".
- `contactEmail`: `trim`; vacío -> `null`; si no, email válido (`z.email()` de zod 4; **a verificar**) de hasta 254.
- `contactVisibility`: enum de los tres valores.
- `.strict()`: se rechazan claves desconocidas (`userId`, `role`, `email`).
- `toDeveloperProfileFieldErrors(error)` aplana los issues en `DeveloperProfileFieldErrors` (primer mensaje por campo; errores de enlaces en `links`).

## Requisitos funcionales

### RF1. Lectura propia y guardado propio (`profile/services/developer-profile.service.ts`, T1, `server-only`)

```ts
getOwnProfile(actor: AuthUser): Promise<OwnDeveloperProfile>
saveOwnProfile(actor: AuthUser, input: DeveloperProfileInput): Promise<void>
```

- Ambos empiezan con `can(actor.role, "profile.edit")` o `AuthError("FORBIDDEN")`, antes de tocar la BD.
- La fila se identifica **solo** por `actor.id`. Ninguna firma recibe un id de usuario o de perfil.
- `getOwnProfile`: lee `developer_profiles` por `user_id` y `users.display_name`. Sin fila: valores vacíos (`headline ""`, `availability "available"`, `contactVisibility "accepted_client"`, `hasProfile false`). **No escribe**. Nunca selecciona `users.email`. Devuelve el correo de contacto guardado aunque la cuenta esté anonimizada (D16 aplica solo a la lectura pública).
- `saveOwnProfile`: `INSERT ... ON CONFLICT (user_id) DO UPDATE SET` solo `headline, location, availability, bio, links, contact_email, contact_visibility` (`updated_at` por `$onUpdate`). Idempotente ante doble envío o dos pestañas (último guardado gana, una sola fila). **No** toca `technologies` ni `external_url`.
- La validación zod ocurre en la action (RF3); el servicio recibe un tipo ya validado y vuelve a comprobar `can`.

### RF2. Perfil público (`getPublicDeveloperProfile`, T1, mismo servicio)

```ts
getPublicDeveloperProfile(developerId: string, viewer: { id: string; role: Role } | null): Promise<PublicDeveloperProfile | null>
```

- Valida `developerId` como UUID (si no, `null` sin consultar). Consulta `users` con `id = developerId AND role = 'developer'` y `LEFT JOIN developer_profiles`. Otro rol o inexistente -> `null` (404, sin revelar si el id existe con otro rol).
- Selecciona `users.id`, `users.display_name`, las columnas del perfil y el booleano `isAnonymized` (D16). **Nunca devuelve** `users.email` ni `clerk_user_id`.
- Calcula `initials` con `getInitials(displayName)` y `contactEmail` con `resolveContactEmail` (RF4); si `isAnonymized`, el `contactEmail` de entrada es `null` (estado `none`). El correo se **descarta** en el servicio si la regla no pasa (no se devuelve ni se registra).
- Sin fila de perfil: `hasProfile false`, resto `null`/`[]` (D10).
- `viewer` lo arma la página con `getCurrentUser()`; el servicio no importa Clerk.

### RF3. Server action (`profile/actions/developer-profile.actions.ts`, T2, `"use server"`)

`saveDeveloperProfileAction(input: unknown): Promise<SaveDeveloperProfileResult>`:

1. `requireRole("developer")` en `try`; `catch` -> `handleAuthErrorForPage`. **Antes** de parsear la entrada.
2. `developerProfileInputSchema.safeParse(input)`; si falla: `{ ok: false, code: "VALIDATION", fieldErrors }` sin tocar la BD.
3. `saveOwnProfile(actor, parsed.data)`; un error no esperado -> `{ ok: false, code: "UNKNOWN", message: "No pudimos guardar tu perfil. Inténtalo de nuevo." }` y `console.error` sin el contenido del perfil ni el correo.
4. Éxito: `revalidatePath("/dashboard/account")` y `revalidatePath("/developers/" + actor.id)`; `{ ok: true }`.

### RF4. Privacidad del correo (`profile/services/contact-visibility.ts`, T1, función pura sin `server-only`)

```ts
resolveContactEmail(args: {
  contactEmail: string | null; visibility: ContactVisibility;
  viewer: { id: string; role: Role } | null; ownerId: string;
  viewerHasAcceptedProposalWithOwner: boolean;
}): { email: string | null; state: "visible" | "hidden_by_owner" | "restricted" | "none" }
```

Tabla (en orden):

| Condición | `email` | `state` |
|---|---|---|
| `contactEmail` nulo o vacío | `null` | `none` |
| viewer es el propio dueño (`viewer.id === ownerId`) | correo | `visible` |
| `visibility = nobody` | `null` | `hidden_by_owner` |
| viewer nulo, o rol distinto de `client` (incluye `developer` y `admin`) | `null` | `restricted` |
| `visibility = any_client` y viewer `client` | correo | `visible` |
| `visibility = accepted_client` y `viewerHasAcceptedProposalWithOwner` | correo | `visible` |
| `visibility = accepted_client` sin propuesta aceptada | `null` | `restricted` |

`viewerHasAcceptedProposalWithOwner` lo calcula el servicio (`hasAcceptedProposalWith`, existencia): `proposals.status = 'accepted' AND proposals.developer_id = ownerId AND projects.client_id = viewer.id` (join `projects`). Solo se ejecuta cuando `visibility = accepted_client`, `contactEmail` existe, la cuenta no está anonimizada y el viewer es `client`. Copias de UI por `state`: `visible` muestra el correo (enlace `mailto:`); `hidden_by_owner` y `none`: no se muestra la fila de correo; `restricted`: el texto depende del rol del viewer, que la página pasa a la vista como `viewerRole` (`Role | null`): `null` -> "Inicia sesión como cliente para ver el correo"; `developer` o `admin` -> "Solo visible para clientes"; `client` -> "Visible cuando contrates a {nombre}" (texto del diseño; un cliente con `any_client` nunca llega a `restricted`).

### RF5. Iniciales (`profile/services/avatar-initials.ts`, T1, puro)

`getInitials(displayName: string): string`: hasta 2 letras mayúsculas de las dos primeras palabras (`"Lucía Ramos"` -> `"LR"`, `"madonna"` -> `"M"`), ignorando espacios múltiples y símbolos; nombre vacío o sin letras/dígitos -> `"?"`. Soporta Unicode (sin partir pares sustitutos). `"Deleted user"` produce `"DU"`, sin tratamiento especial.

### RF6. Editor privado `/dashboard/account` (T4)

- `src/app/dashboard/account/page.tsx`: metadata "Mi cuenta | Nexora". `requireRole("developer")` + `getOwnProfile` en `try`, `handleAuthErrorForPage` en `catch`; compone `<DeveloperProfileForm profile={...} ratingSlot={undefined} />`, un enlace "Ver perfil público" a `/developers/{actor.id}` y, bajo el formulario, `<PayoutsLinkCard />` (D15). `loading.tsx` y `error.tsx` con `PaymentsLoading`/`PaymentsError` (label "Cargando tu cuenta..." y título "No pudimos cargar tu cuenta").
- `developer-profile-form.tsx` (`"use client"`), secciones del diseño con estos ajustes:
  - **Foto de perfil**: `DeveloperAvatar` (96 px) con iniciales y el texto "Tu foto por defecto se genera con tus iniciales. La subida de fotos llegará más adelante." **Sin** botones "Subir foto" ni "Usar la foto por defecto".
  - **Información básica**: Nombre visible (solo lectura, `readOnly`/`aria-readonly`, nota "Se gestiona desde tu cuenta de acceso"), Titular, Ubicación, Disponibilidad (`native-select`).
  - **Biografía**: `textarea` con contador `n / 5000` (`aria-describedby`), ayuda "Texto plano. Los saltos de línea se conservan." (D3). `font-sans`.
  - **Enlaces**: "Hasta 5 · solo https://"; filas tipo + URL + quitar (aria-label "Quitar enlace N") y "Añadir enlace" (deshabilitado al llegar a 5). Error por fila con `role="alert"` y `aria-invalid` ("Escribe la URL completa, empezando por https://").
  - **Contacto**: "Correo de contacto" (aviso: "No es el correo de tu cuenta de acceso; tu correo de acceso nunca se muestra") y el grupo de radios "¿Quién ve tu correo?" con `CONTACT_VISIBILITY_LABELS`.
  - **Tu valoración**: renderiza `ratingSlot` (prop opcional de `DeveloperProfileForm`, que la página le pasa); sin `ratingSlot` **no se renderiza la sección**.
  - Botones "Descartar cambios" (restablece al valor guardado) y "Guardar perfil". Durante el envío: deshabilitado, "Guardando...". Éxito: aviso `role="status"` "Perfil guardado" y `router.refresh()`. Error de validación: mensajes por campo (`aria-invalid`, `aria-describedby`) y foco en el primer campo con error. Error `UNKNOWN`: `role="alert"`.
  - Objetivos táctiles de 44 px, foco visible, responsive (390 px sin desborde), `<label>` asociada a cada control.
- `payouts-link-card.tsx` (presentacional, servidor): `<section aria-labelledby>` con `<h2>` "Cobros de prueba", el texto de D15 y un `Link` "Ir a Cobros de prueba" a `/dashboard/payouts` (`min-h-11`, foco visible). Sin estado de cuenta, sin llamadas a `payments`.
- Sin sub-navegación lateral (D17).
- Header (D15): `dashboard-link.ts` **elimina** `getPayoutsLink` y añade `getAccountLink(viewer: NavViewer): NavLinkItem | null` -> `{ href: "/dashboard/account", label: "Mi cuenta" }` solo para `{ kind: "user", role: "developer" }`; `site-header.tsx` sustituye el bloque `getPayoutsLink` por `getAccountLink` (mismo lugar: tras los enlaces existentes, si no es `null`). Los demás enlaces y `getDashboardLink` no cambian. Resultado: el header del desarrollador es "Proyectos", "Mis propuestas", "Mi cuenta".
- `payouts-page-view.tsx` (011a): añade, antes del `<h1>`, un `Link` "Volver a Mi cuenta" a `/dashboard/account` (`min-h-11`, foco visible). No cambia nada más (textos, estados, botones).

### RF7. Perfil público `/developers/[id]` (T3)

- `src/app/developers/[id]/page.tsx` (Next 16: `params` es una `Promise`; **a verificar** en `node_modules/next/dist/docs/` antes de implementar): metadata "{displayName} | Nexora". Obtiene `viewer` con `getCurrentUser()` (puede ser `null`; **no** llama a `requireUser`), llama a `getPublicDeveloperProfile(id, viewer)`; `null` -> `notFound()`. Compone `<DeveloperProfileView profile={...} isOwner={...} viewerRole={viewer?.role ?? null} rating={undefined} reviewsSlot={undefined} />`. `loading.tsx` y `error.tsx` con los componentes compartidos existentes.
- `developer-profile-view.tsx` (servidor, presentacional), con el diseño de `Main.dc.html`:
  - Columna lateral: `DeveloperAvatar`, `<h1>` nombre, titular y ubicación, disponibilidad (`AVAILABILITY_LABELS`), bloque de valoración (solo si hay `rating`), botón "Editar mi perfil" (a `/dashboard/account`) **solo si `isOwner`**.
  - Sección "Contacto" según `contactState` (RF4). **Sin** "Invitar a un proyecto", zona horaria ni idiomas.
  - Sección "Enlaces": `target="_blank"`, `rel="noopener noreferrer nofollow"`, etiqueta del tipo y host visible. Si `new URL(url)` falla en render, se omite el enlace.
  - Sección "Sobre mí" (`DeveloperBio`, texto plano, `whitespace-pre-line`) o, si `!hasProfile`, "Este desarrollador aún no completó su perfil".
  - Sección "Valoraciones": **solo se renderiza si se pasa `reviewsSlot`**; contiene el slot.
  - **Sin** sección "Tecnologías" (D7) ni "N proyectos contratados".
- `developer-avatar.tsx`: círculo con iniciales (`aria-hidden` en las letras) y `role="img"` con `aria-label="Foto por defecto de {displayName}"`; tamaños `sm` (36 px), `md`, `lg` (96 px); fondo `#DCE6DE`, texto `#183D30`. Sin imágenes ni `next/image`.

## Contrato para 020 (valoración promedio y conteo)

019 **define** y **no implementa**:

1. Tipo `DeveloperRatingSummary = { average: number | null; count: number }` declarado **solo** en `profile/types/developer-profile.types.ts`. `average` es `null` si y solo si `count = 0`; **ya viene redondeado a 1 decimal** por el servicio de 020; la UI solo lo formatea con `Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 })` ("4,6").
2. `getDeveloperRatingSummary(developerId: string): Promise<DeveloperRatingSummary>` lo **implementa 020** (módulo `ratings`). `profile` **no importa** `ratings`. `developerId` es `users.id` del desarrollador (igual que el id de `/developers/[id]`).
3. Puntos de inyección **en 019**, cableados por composición desde `src/app` (SETUP §1.2):
   - `DeveloperProfileView` acepta `rating?: DeveloperRatingSummary` y `reviewsSlot?: ReactNode`. `rating` ausente: no pinta valoración; `{ average: null, count: 0 }`: "Aún sin valoraciones"; `count > 0`: un `<span role="img" aria-label="4,6 de 5 estrellas">` con texto "4,6 · N valoraciones" **sin iconos de estrella**. `reviewsSlot` se renderiza dentro de la sección "Valoraciones" (solo si se pasa).
   - `DeveloperProfileForm` acepta `ratingSlot?: ReactNode` ("Tu valoración").
   - 019 deja `rating`, `reviewsSlot` y `ratingSlot` sin pasar (`undefined`) en las dos páginas.
4. **Lo que debe ajustar 020 (desalineaciones detectadas al revisar `020-developer-ratings.md`):**
   - Importar `DeveloperRatingSummary` de `@/modules/profile/types/developer-profile.types` (dependencia de **tipo** `ratings -> profile`, sin ciclo) en lugar de **redeclararlo** en `rating.types.ts`; registrar esa dependencia en `system-design.md §4`.
   - `T4` de 020 no toca "el archivo de la vista de 019" ni `developer-profile-view.tsx`: **solo edita** `src/app/developers/[id]/page.tsx` y `src/app/dashboard/account/page.tsx` (única edición permitida de archivos de 019): llama a `getDeveloperRatingSummary` y pasa `rating={summary}` y `reviewsSlot={<RatingList ... />}` en el perfil público, y `ratingSlot={<RatingSummary ... />}` en la cuenta. La vista de 019 pinta el resumen compacto como texto; las estrellas (`RatingStars`) las usa 020 dentro de `RatingList` y `RatingSummary`.
   - Con las props `rating`/`reviewsSlot` de 019, `RatingSummary` de 020 solo se usa en "Mi cuenta" (`ratingSlot`); el perfil público no lo necesita (evita duplicar el promedio).
   - `revalidatePath` de 020 debe incluir `/developers/${developerId}` y `/dashboard/account`. Las actions solo reciben `projectId`: el servicio de crear/editar debe **devolver el `developerId`** (derivado de la propuesta aceptada) para revalidar.
   - Pregunta P6 de 020 queda respondida: el perfil es **visible para visitantes anónimos** (019 D11).
   - La migración de 020 toma el siguiente número libre después de la de 019 (no `0005` fijo).
   - La referencia de 020 a "SETUP.md solo si 019 lo requiere": 019 **no** modifica SETUP.md; 020 tampoco lo necesita.
   - "Enlace 'Valoraciones'" en el diseño ("Mi cuenta" con sub-navegación) queda para después; 020 usa `ratingSlot` y, si quiere, un enlace "Ver valoraciones recibidas" hacia `/developers/{id}#valoraciones` (la sección "Valoraciones" de 019 lleva `id="valoraciones"`).
   - Mientras estas correcciones no se apliquen, 020 sigue `Estado: borrador` y no se debe aprobar.

## Permisos y seguridad

- **Autorización en servidor (004 RF7).** La action y las páginas privadas empiezan con `requireRole("developer")`; cada servicio vuelve a comprobar `can(role, "profile.edit")`. El dueño sale siempre de `actor.id` (sesión): **ninguna** firma ni formulario acepta `userId`, `profileId` o `role`; el schema zod es `.strict()`. Cliente o admin: 404 en `/dashboard/account` (vía `handleAuthErrorForPage`). Sin sesión: `/sign-in`. Sin fila interna: `/onboarding`. La tarjeta de cobros es solo un enlace: `/dashboard/payouts` mantiene su propia autorización de 011a.
- **No filtrar el email.** `users.email` no se devuelve en ninguna consulta del perfil (solo participa en el `LIKE` de D16); `PublicDeveloperProfile` y `OwnDeveloperProfile` no tienen campo `email`; el correo de contacto se resuelve en el servidor (RF4) **antes** de construir el DTO (verificar el HTML en los pasos manuales). No se registra el correo, la biografía ni los enlaces en logs.
- **Validación servidor.** Todo input pasa por `developerProfileInputSchema` en la action. Enlaces: solo `https:`, sin credenciales, máximo 5 y 300 caracteres; render con `rel="noopener noreferrer nofollow"`.
- **XSS.** Bio, titular, ubicación y nombre se renderizan como texto de React; nunca `dangerouslySetInnerHTML`.
- **Datos públicos mínimos.** Solo lo publicado, el nombre visible y el `id`. Sin `clerk_user_id`, sin rol, sin fechas.
- **Cuenta anonimizada** (spec 004 RF8): el perfil público muestra "Deleted user" con iniciales "DU" y **sin correo de contacto** (D16).
- Sin rate limiting del guardado (015).

## Estados, errores y casos límite

| Caso | Resultado |
|---|---|
| Desarrollador sin fila abre el editor | Formulario vacío con defaults; no se crea fila hasta guardar |
| Doble clic en "Guardar" o dos pestañas | Una sola fila (PK `user_id`); gana el último guardado |
| Enlace `http://`, `javascript:`, sin esquema, con credenciales, más de 5 o duplicado | `VALIDATION` con el mensaje por fila; sin escribir |
| Bio de 1001 caracteres o titular vacío o de 81 | `VALIDATION`; sin escribir (y CHECK de BD como red de seguridad) |
| Correo vacío | Se guarda `null` (estado `none` en público) |
| Cliente sin propuesta aceptada abre un perfil `accepted_client` | `restricted`; el HTML no contiene el correo |
| Visitante anónimo abre el perfil | Ve el perfil sin correo; sin errores |
| `/developers/<uuid de un cliente>` o UUID inexistente o cadena no UUID | 404 |
| Desarrollador sin perfil guardado | Perfil público con nombre, avatar y "aún no completó su perfil" |
| Desarrollador anonimizado con `contact_email` guardado | Perfil público sin correo (`none`) |
| Cliente o admin intenta guardar el perfil (action invocada a mano) | `FORBIDDEN` -> 404; sin escribir |
| Entrada con `userId` o `email` extra | Rechazada por `.strict()` |
| Neon caído | `error.tsx`; el header sigue degradado (009b) |
| 020 aún no existe | Sin sección de valoraciones (props ausentes) |
| Stripe devuelve al usuario a `/dashboard/payouts/onboarding/return` | Sin cambios (redirige a `/dashboard/payouts?onboarding=...`); el enlace "Volver a Mi cuenta" da salida |

## Archivos

Nuevos (N) y modificados (M). Cada archivo pertenece a una sola tarea.

| Archivo | N/M | Tarea |
|---|---|---|
| `src/modules/users/schema/developer-profiles.table.ts` | M | T0 |
| `src/modules/users/services/users.service.ts` (solo `export` de `DELETED_EMAIL_DOMAIN` y `DELETED_DISPLAY_NAME`) | M | T0 |
| `drizzle/0005_developer_profile_account.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json` | N/N/M (generados) | T0 |
| `src/lib/db/developer-profiles-constraints.test.ts` | N | T0 |
| `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts` | M | T0 |
| `src/modules/profile/types/developer-profile.types.ts` | N | T1 |
| `src/modules/profile/schemas/developer-profile.schema.ts` + `.test.ts` | N | T1 |
| `src/modules/profile/services/developer-profile.service.ts` + `.test.ts` | N | T1 |
| `src/modules/profile/services/contact-visibility.ts` + `.test.ts` | N | T1 |
| `src/modules/profile/services/avatar-initials.ts` + `.test.ts` | N | T1 |
| `src/modules/profile/actions/developer-profile.actions.ts` + `.test.ts` | N | T2 |
| `src/app/developers/[id]/page.tsx`, `loading.tsx`, `error.tsx` | N | T3 |
| `src/modules/profile/components/developer-profile-view.tsx` | N | T3 |
| `src/modules/profile/components/developer-avatar.tsx` | N | T3 |
| `src/app/dashboard/account/page.tsx`, `loading.tsx`, `error.tsx` | N | T4 |
| `src/modules/profile/components/developer-profile-form.tsx` | N | T4 |
| `src/modules/profile/components/payouts-link-card.tsx` | N | T4 |
| `src/modules/auth/services/dashboard-link.ts`, `dashboard-link.test.ts`, `src/modules/auth/components/site-header.tsx` (011a: se sustituye `getPayoutsLink` por `getAccountLink`) | M | T4 |
| `src/modules/payments/components/payouts-page-view.tsx` (011a: solo el enlace "Volver a Mi cuenta") | M | T4 |
| `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md` | M | T4 |

**Excepciones sobre archivos de 004 a 011a (lista cerrada):** `permissions.ts`, `permissions.test.ts`, `auth.types.ts` (solo añadir la fila/acción); `users.service.ts` (solo `export`); `dashboard-link.ts`, `dashboard-link.test.ts`, `site-header.tsx` (solo lo relativo a `getPayoutsLink` -> `getAccountLink`; el resto no se reescribe, reordena ni reformatea); `payouts-page-view.tsx` (solo el enlace de vuelta); `MANUAL-TESTS.md` (sección nueva y el paso 11 de 011a, ver abajo) y `system-design.md`. Estos archivos tienen cambios de 011a sin commitear: **no se reescribe nada más**. `SETUP.md` **no** cambia (su §4 no lista módulos; sin filas nuevas).

Docs (T4):
- `system-design.md §2` (campos de `developerProfile`: titular, ubicación, disponibilidad, bio, enlaces, correo de contacto y su visibilidad), `§3` (nombre y email de acceso: Clerk/`users`; datos del perfil: Neon), `§4` (añadir `profile/` al bloque de módulos, la fila `profile` -> `users`, `projects`, `proposals`, `auth`, y la regla de D14 con su excepción de escritura), `§6` (fila "Editar perfil propio": solo desarrollador; "Ver perfil público": abierto, con regla de correo) y `§8` (decisiones D14, D15 y las de perfil: avatar por defecto, tabla propia extendida, correo `accepted_client` por defecto, bio texto plano; y una línea que indica que D15 reemplaza el enlace de header de 011a D-A). Solo adiciones, salvo la frase de D4 de `§8` que se ajusta a D14.
- `MANUAL-TESTS.md`: sección "Spec 019 — Perfil del desarrollador" (pasos abajo), cabecera "Cubre" actualizada y el **paso 11 de la sección 011a** reescrito: "el header del Desarrollador muestra 'Mis propuestas' y 'Mi cuenta' (ya no 'Cobros de prueba', ver 019 D15); los de Cliente, administrador y visitante no cambian". El paso 7 de 011a (el header no muestra "Cobros de prueba" a un cliente) sigue siendo válido.

## Criterios de aceptación

Base (T0):

- AC1. La migración la generó drizzle-kit (no se escribió a mano), añade a `developer_profiles` las columnas `location`, `availability`, `links`, `contact_email`, `contact_visibility`, los enums `developer_availability` y `contact_visibility` y los CHECKs de la sección Datos, **sin** `DROP`/`ALTER` de columnas existentes; el journal tiene una entrada más; no se ejecutó `db:migrate`. `migrations.test.ts` y `constraints.test.ts` pasan sin cambios. `users.service.ts` solo gana dos `export`.
- AC2. En PGlite: una fila mínima (`user_id, headline, bio`) sigue insertándose y toma `availability = 'available'`, `links = []`, `contact_visibility = 'accepted_client'`; falla `headline` de 81 caracteres, `bio` de 1001, `location` de 81, `contact_email` de 255, `links` que no sea array, `links` con 6 elementos, y valores de enum inválidos; un segundo perfil para el mismo `user_id` falla; borrar el usuario borra el perfil (`cascade`).
- AC3. `can(role, "profile.edit")` es `true` solo para `developer`; la matriz de `permissions.test.ts` incluye la fila y pasa.

Schemas y lógica (T1):

- AC4. `developerProfileInputSchema` acepta una entrada válida (con y sin ubicación, correo y enlaces) y rechaza: titular vacío o de más de 80; bio de más de 5000; más de 5 enlaces; URL `http:`, `javascript:`, `data:`, sin esquema, con credenciales, sin punto en el host, de más de 300 caracteres o duplicada; tipo de enlace desconocido; correo inválido o de más de 254; `availability` o `contactVisibility` desconocidos; claves extra (`userId`, `email`, `role`). Cadenas vacías de ubicación y correo se normalizan a `null`. `toDeveloperProfileFieldErrors` devuelve un mensaje por campo.
- AC5. `resolveContactEmail` cumple la tabla de RF4, con un caso por fila y por rol (visitante, `client`, `developer`, `admin`, dueño) y por valor de visibilidad.
- AC6. `getInitials` cumple RF5: `"Lucía Ramos"` -> `"LR"`, un solo nombre -> una letra, espacios múltiples, Unicode y vacío -> `"?"`.
- AC7. `getOwnProfile` y `saveOwnProfile`: `client` y `admin` reciben `FORBIDDEN` sin tocar la BD. Con dos desarrolladores, cada uno solo lee y escribe su fila. Guardar dos veces (secuencial y con `Promise.all`) deja una fila. `getOwnProfile` sin fila devuelve defaults con `hasProfile: false` y no inserta. `saveOwnProfile` no modifica `technologies` ni `external_url`.
- AC8. `getPublicDeveloperProfile`: `null` para UUID inválido, inexistente o de usuario `client`/`admin`; DTO con `Object.keys` exactos (sin `email`, `clerkUserId`, `role`); sin fila de perfil devuelve `hasProfile: false`; el correo solo aparece según RF4 con la consulta real (cliente dueño del proyecto con propuesta `accepted` de ese desarrollador -> visible; propuesta `pending`/`rejected`/`withdrawn`, o de otro cliente -> `restricted`); un desarrollador anonimizado (`email` `...@deleted.invalid`) con `contact_email` guardado devuelve `contactEmail: null` y `contactState: "none"` incluso para el dueño del proyecto con propuesta aceptada.
- AC9. `users.email` nunca aparece en los resultados de los servicios (test con un email distintivo en `users` y un `contact_email` distinto).

Action, rutas y UI (T2, T3, T4):

- AC10. Action: `requireRole("developer")` se ejecuta **antes** de validar; un `AuthError` no llama al servicio; entrada inválida devuelve `VALIDATION` con `fieldErrors` y no llama al servicio; éxito llama a `revalidatePath` para `/dashboard/account` y `/developers/<actor.id>` y devuelve `{ ok: true }`; un error desconocido devuelve `UNKNOWN` genérico sin imprimir el contenido del perfil. El id del actor define la fila.
- AC11. `/developers/[id]` (manual): visible sin sesión; muestra avatar con iniciales, nombre, titular, ubicación, disponibilidad, biografía como texto plano (un `<script>` en la bio se ve como texto), enlaces con `rel="noopener noreferrer nofollow"`; 404 para UUID de cliente o inexistente; "Editar mi perfil" solo al dueño; el HTML de un visitante **no contiene** el correo de contacto ni `users.email`.
- AC12. Privacidad de contacto (manual): con `accepted_client` solo el cliente con propuesta aceptada ve el correo; con `any_client` cualquier cliente con sesión; con `nobody` nadie salvo el dueño; visitante, otro desarrollador y admin no lo ven en ninguna opción.
- AC13. `/dashboard/account` (manual): solo `developer` (cliente/admin -> 404, sin sesión -> `/sign-in`); guarda cada sección; "Descartar cambios" restablece; errores por campo accesibles; límites visibles (`n / 5000`, "Hasta 5 · solo https://"); sin botones de subida de foto; nombre de solo lectura; muestra la tarjeta "Cobros de prueba" con el enlace "Ir a Cobros de prueba" que abre `/dashboard/payouts` (sin estado de cuenta ni llamadas a Stripe desde esta página).
- AC14. Contrato 020: `DeveloperProfileView` sin `rating` no renderiza valoración; con `{ average: null, count: 0 }` muestra "Aún sin valoraciones"; con `{ average: 4.6, count: 12 }` muestra "4,6" y "12 valoraciones" (test RTL opcional o manual con la prop forzada); la sección "Valoraciones" solo existe con `reviewsSlot`. `src/modules/users` y `src/modules/profile` no importan ningún módulo de valoraciones.
- AC15. Accesibilidad y responsive (manual): 390 px sin desbordes (incluido el header del desarrollador con tres enlaces); objetivos de 44 px; foco visible; `label` en cada control; errores con `role="alert"`; contraste de los tokens del repo.
- AC16. Navegación (011a sustituido): `getAccountLink` devuelve `{ href: "/dashboard/account", label: "Mi cuenta" }` solo para `developer` y `null` para client, admin, visitor, degraded y needs_onboarding; `getPayoutsLink` ya no existe y nada la importa; los tests de `getDashboardLink` no cambian. El header del desarrollador muestra "Proyectos", "Mis propuestas" y "Mi cuenta" (con `aria-current` en `/dashboard/account`) y **no** "Cobros de prueba"; los de cliente, admin y visitante no cambian. `/dashboard/payouts` (y `return`/`refresh`) funcionan como antes y la página muestra un enlace "Volver a Mi cuenta"; no se modificó ningún servicio, action, schema, ruta ni test de `payments`.
- AC17. Regresión: `package.json`, `.env.example`, `src/app/layout.tsx`, `proxy.ts`, `src/components/ui/**`, `site-nav.tsx` y los servicios, rutas y tests de 004 a 011a no cambian salvo la lista cerrada de excepciones; `npm run lint`, `npm run test` y `npm run build` pasan; ningún test usa red, Clerk, Stripe ni Neon reales; el build añade `/developers/[id]` y `/dashboard/account`. `system-design.md §4` documenta el módulo `profile` y sus dependencias (D14).

## Tests requeridos

Vitest, junto al archivo; `// @vitest-environment node` donde no haya DOM; PGlite con las migraciones reales (`createTestDb`, patrón `Proxy` + `holder` y `vi.mock("server-only")` de los servicios existentes). Ningún test contra Clerk ni red.

- `src/lib/db/developer-profiles-constraints.test.ts` (T0): AC2.
- `src/modules/auth/services/permissions.test.ts` (T0): fila nueva (AC3).
- `src/modules/profile/schemas/developer-profile.schema.test.ts` (T1): AC4, table-driven.
- `src/modules/profile/services/contact-visibility.test.ts` (T1): AC5, matriz completa.
- `src/modules/profile/services/avatar-initials.test.ts` (T1): AC6.
- `src/modules/profile/services/developer-profile.service.test.ts` (T1): AC7, AC8 (incluido el caso anonimizado), AC9 (PGlite; usuarios, proyectos y propuestas sembrados por SQL; permisos por rol; aislamiento entre dos desarrolladores). Limitación documentada: PGlite serializa y no prueba concurrencia real de Neon.
- `src/modules/profile/actions/developer-profile.actions.test.ts` (T2): AC10 (mocks de `requireRole`, del servicio y de `next/cache`).
- `src/modules/auth/services/dashboard-link.test.ts` (T4): se **elimina** el `describe("getPayoutsLink")` y se añade `describe("getAccountLink")` (AC16: solo `developer`; `null` para client, admin, visitor, degraded, needs_onboarding); los de `getDashboardLink` no cambian.
- Sin test unitario obligatorio (SETUP §3): páginas de `src/app`, `developer-profile-view.tsx`, `developer-avatar.tsx`, `developer-profile-form.tsx`, `payouts-link-card.tsx` y el enlace añadido a `payouts-page-view.tsx` (presentacionales o de composición). Un test RTL de `DeveloperProfileView` con `rating` es **opcional** (AC14); el formulario admite un test RTL opcional de contador y botón "Añadir enlace" deshabilitado en 5.
- Regresión sin cambios: `constraints.test.ts`, `migrations.test.ts`, `connected-accounts-constraints.test.ts`, `site-nav.test.tsx`, y los tests de `payments` (`connected-account.*`, `payouts/onboarding/*/route.test.ts`).

## Tareas

Máximo 5. Cada archivo pertenece a una sola tarea. Durante el bloque paralelo (T2 y T3) nadie corre `npm install`, `npm run build`, `drizzle-kit` ni `db:migrate`; el reviewer corre lint, test y build al final.

### T0 — Base compartida: esquema, migración y permiso (serial)

- Archivos: `src/modules/users/schema/developer-profiles.table.ts`, `src/modules/users/services/users.service.ts` (solo `export`), `drizzle/0005_developer_profile_account.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json` (generados con `npm run db:generate -- --name developer_profile_account`; **sin** `db:migrate`), `src/lib/db/developer-profiles-constraints.test.ts`, `src/modules/auth/types/auth.types.ts`, `src/modules/auth/services/permissions.ts`, `src/modules/auth/services/permissions.test.ts`
- Depende de: — (y de que 018 no haya dejado migraciones pendientes; 020 y 021 esperan a esta)
- Paralelizable: no (esquema, migración y contrato de `auth` compartidos)
- Cubre: AC1, AC2, AC3
- Nota: confirmar el número real de la migración siguiente y que `migrations.test.ts` sigue verde sin cambios; si hace falta modificarlo, escalar (la spec vuelve a borrador).

### T1 — Contratos, schema zod y servicios del perfil (módulo `profile`)

- Archivos: `src/modules/profile/types/developer-profile.types.ts`, `src/modules/profile/schemas/developer-profile.schema.ts` + `.test.ts`, `src/modules/profile/services/developer-profile.service.ts` + `.test.ts`, `src/modules/profile/services/contact-visibility.ts` + `.test.ts`, `src/modules/profile/services/avatar-initials.ts` + `.test.ts`
- Depende de: T0
- Paralelizable: no (contrato base de T2, T3 y T4)
- Cubre: AC4 a AC9

### T2 — Server action de guardado

- Archivos: `src/modules/profile/actions/developer-profile.actions.ts`, `src/modules/profile/actions/developer-profile.actions.test.ts`
- Depende de: T1
- Paralelizable: sí (con T3; archivos disjuntos)
- Cubre: AC10

### T3 — Perfil público y avatar

- Archivos: `src/app/developers/[id]/page.tsx`, `src/app/developers/[id]/loading.tsx`, `src/app/developers/[id]/error.tsx`, `src/modules/profile/components/developer-profile-view.tsx`, `src/modules/profile/components/developer-avatar.tsx`
- Depende de: T1
- Paralelizable: sí (con T2; archivos disjuntos)
- Cubre: AC11, AC12 (vista pública), AC14, AC15 (parte)

### T4 — Mi cuenta (editor y cobros), header, enlace de vuelta y documentación

- Archivos: `src/app/dashboard/account/page.tsx`, `loading.tsx`, `error.tsx`, `src/modules/profile/components/developer-profile-form.tsx`, `src/modules/profile/components/payouts-link-card.tsx`, `src/modules/auth/services/dashboard-link.ts`, `src/modules/auth/services/dashboard-link.test.ts`, `src/modules/auth/components/site-header.tsx`, `src/modules/payments/components/payouts-page-view.tsx`, `docs/MANUAL-TESTS.md`, `docs/architecture/system-design.md`
- Depende de: T1, T2 (firma de la action) y T3 (reutiliza `DeveloperAvatar`)
- Paralelizable: no (necesita T2 y T3 terminadas)
- Cubre: AC12, AC13, AC15, AC16, AC17

Pasos manuales que T4 documenta (casillas `- [ ]`):

1. Preparación: aplicar la migración en Neon con `npm run db:migrate` (lo hace el humano). Cuentas: Desarrollador A, Desarrollador B, Cliente C (con proyecto y propuesta aceptada de A), Cliente D (sin relación), Admin (opcional), visitante en incógnito.
2. Editor (A): `/dashboard/account` vacío; guardar titular, ubicación, disponibilidad, bio y 2 enlaces; recargar y comprobar persistencia; "Descartar cambios".
3. Validación: bio de 1001 caracteres, enlace `http://x.com`, `javascript:alert(1)`, 6 enlaces, correo inválido: mensajes por campo, nada se guarda.
4. Perfil público: `/developers/<id de A>` sin sesión muestra el perfil sin correo; escribir `<script>alert(1)</script>` en la bio y verla como texto; enlaces con `rel` correcto; el HTML (ver código fuente) no contiene el correo de contacto ni el de acceso.
5. Privacidad: probar `accepted_client`, `any_client` y `nobody` con C, D, B, Admin y visitante (tabla de AC12). Anonimizar a A en Neon de prueba (o usar una cuenta ya anonimizada) y comprobar que el correo no aparece.
6. Permisos: Cliente y Admin reciben 404 en `/dashboard/account`; sin sesión redirige a `/sign-in`; B no ve ni edita lo de A; `/developers/<uuid de cliente>` da 404.
7. Header: A ve "Proyectos", "Mis propuestas" y "Mi cuenta" (resaltado en la cuenta) y **no** "Cobros de prueba"; los demás no ven "Mi cuenta".
8. Cobros dentro de la cuenta: en `/dashboard/account` la tarjeta "Cobros de prueba" abre `/dashboard/payouts`; allí "Volver a Mi cuenta" regresa; el onboarding de Stripe de 011a (return/refresh) sigue llevando a `/dashboard/payouts`.
9. Sin perfil: `/developers/<id de B>` antes de guardar muestra "aún no completó su perfil".
10. Responsive y accesibilidad a 390 px: sin scroll horizontal (header con tres enlaces incluido), teclado, foco visible, objetivos de 44 px, errores anunciados.

## Decisiones del humano y preguntas abiertas

Ninguna pregunta abierta. Registro de las antiguas P1 a P10:

- P1 foto: solo avatar con iniciales, sin subida (D1; decisión del humano).
- P2 visibilidad del perfil público: abierto a anónimos (D11).
- P3 nombre visible: gestionado por Clerk, no editable (D5).
- P4 tecnologías: fuera de fase (D7).
- P5 campos del diseño (zona horaria, idiomas, proyectos contratados, invitar): diferidos (D17).
- P6 sub-navegación y "Cobros de prueba": sub-navegación diferida (D17); "Cobros de prueba" **se mueve dentro de "Mi cuenta"** (D15; decisión del humano).
- P7 cuentas anonimizadas: correo oculto (D16).
- P8 dependencia `users` -> `proposals`/`projects`: **verificada contra `system-design.md §4`: no permitida** (y `users` tampoco puede importar `auth`); resuelta con el módulo `profile` (D14).
- P9 orden de migraciones 019 -> 020 -> 021 (D18).
- P10 `external_url`: se conserva sin uso (D8).
- Privacidad del contacto `accepted_client` por defecto: aceptada (D2).

Punto a confirmar al aprobar (consecuencia de verificar P8, no una pregunta): D14 crea un módulo nuevo y modifica `system-design.md §4`/D4 (cambio de arquitectura que SETUP §4 exige aprobar con la spec).

## Próximas fases

- Subida de foto de perfil (almacenamiento, validación de tipo y tamaño, recorte), posiblemente junto a 021.
- Biografía con Markdown cuando 018 esté aprobada (cambio localizado en `DeveloperBio`).
- 020: valoraciones (`getDeveloperRatingSummary`, lista, formulario, `RatingStars`) conectadas por los puntos de inyección de este contrato.
- Tecnologías del perfil con el catálogo cerrado; zona horaria, idiomas y proyectos contratados.
- Sub-navegación de "Mi cuenta", estado de la cuenta de cobros dentro de "Mi cuenta" (composición desde `src/app`) y sección "Acceso y seguridad".
- Perfil público con slug, listado/búsqueda de desarrolladores y "Invitar a un proyecto".
- 015: rate limiting del guardado y revisión transversal de privacidad.

## Corrección posterior (2026-10-21, modo BUILD, decidida por el humano)

Tope de la biografía subido de 1000 a 5000 caracteres (`bio.max`, CHECK `developer_profiles_bio_length`, tests). Requiere migración 0007 (la corre el humano).

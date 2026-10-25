# Rediseño visual, fase C: paneles (cliente y desarrollador), página de pago y tabla de propuestas

Estado: done

Spec 022c. **Depende de 022a** (tokens, fuente, `surface`, `max-w-page`, variantes de `badge` y `button`, `InitialsAvatar`, header y footer globales): no se implementa hasta que 022a esté `done`. Es independiente de 022b y 022d (archivos disjuntos; solo comparten `docs/MANUAL-TESTS.md`, ver "Tareas").

Es una spec **solo de interfaz** sobre funcionalidad ya probada y `done`: paneles de 012 y 013, pago de 009/010/011, comparación de propuestas de 007/008, cancelación y anuncios de 012/014. **No cambia** servicios, schemas, permisos, acciones, consultas ni migraciones, ni edita esas specs. Arquitectura: `system-design.md §4` (el módulo `dashboard` sigue siendo de solo lectura; no se añaden imports nuevos entre módulos: `dashboard` -> `ratings` ya existe por `RatingSummary`) y `§6`/`§7` (los textos de dinero de prueba y la transferencia "nunca recibida" se conservan: I3, I5, BRIEF §7 reglas 14-15).

Diseños de referencia (HTML de /design: referencia visual y de contenido, no código final; ignorar `<x-dc>`/`<helmet>`): `docs/assets/3-paneles/Main.dc.html` (panel del cliente), `DeveloperDashboard.dc.html`, `Payment.dc.html` y `Proposals.dc.html`. (`Projects.dc.html` es de 022b.)

## Objetivo

1. Restilizar `/dashboard` para el **cliente** (`ClientDashboardView` y sus 3 secciones) y para el **desarrollador** (`DeveloperDashboardView` y sus 4 secciones) como los artboards: cabecera con saludo, tarjetas de conteo por estado, acciones pendientes con icono, tablas de pago/transferencia, panel lateral informativo.
2. Restilizar la página de pago `/projects/[id]/payment` (migas de pan, progreso, estado, desarrollador seleccionado y resumen con total de prueba).
3. Restilizar la comparación de propuestas `/projects/[id]/proposals` (tabla + detalle) con el aspecto de `Proposals.dc.html`, conservando orden, paginación, selección con confirmación y accesibilidad.
4. Conservar íntegramente textos de estados, avisos de modo de prueba, roles, `aria-*`, anunciador y `ConfirmDialog`/`AlertDialog` de 012 y 014, y los objetivos táctiles >= 44 px.

## Hechos verificados (código del repo, 2026-10-24)

| Hecho | Fuente |
|---|---|
| `/dashboard` es role-aware: `requireRole("client","developer")` y rinde `ClientDashboardView` o `DeveloperDashboardView(data, developerId)`; título `Mi panel \| Nexora`. `AuthUser.displayName` está disponible en la página | `src/app/dashboard/page.tsx`, `auth.types.ts` |
| El cliente ve hoy: h1 "Mi panel", "Pendiente de ti" (lista con un solo enlace de acción), "Tus proyectos por estado" (**5 estados + "Todos"**, con `aria-label` "{etiqueta}: {n} proyectos"), "Pagos y contratación" (tarjetas con aviso `role="note"` "Modo de prueba · No se mueve dinero real", `CancelPaymentButton` si el pago está `pending`, `TRANSFER_TEST_NOTICE`, "Ver todos") | `client-dashboard-view.tsx`, `dashboard-*.tsx` |
| Etiquetas reales de proyecto: Borrador, Publicado, "Con propuesta seleccionada · pendiente de pago", "En contratación" (= `contracted`), Cerrado. El diseño usa solo 4 tarjetas y llama "En contratación" a "Desarrollador elegido": **no coincide** con el modelo de 5 estados | `PROJECT_STATUS_LABELS` |
| `DashboardProjectPayment` ya incluye `developerId` y `developerName` (spec 019/commit "developer profile link"): el nombre puede enlazar al perfil con `DeveloperProfileLink` | `dashboard.types.ts`, `dashboard-contracting-list.tsx` |
| `DashboardAction` no trae importe ni nombre del desarrollador (solo `projectId`, `projectTitle`, `pendingProposals`) | `dashboard.types.ts` |
| `DeveloperDashboard` trae conteos de propuestas, `payouts` (`status`, `hasStripeAccount`, `statusSyncedAt`), `ratings` (promedio y cantidad), acciones pendientes y proyectos ganados con `clientName` abreviado; **no** trae valoraciones recientes (solo el resumen) | `developer-dashboard.types.ts` |
| `PaymentPageView` ya implementa aviso de modo de prueba, aviso de retorno de Stripe, `PaymentProgress`, resumen (proyecto, desarrollador con `DeveloperProfileLink`, importe, plazo), estado con `StartCheckoutButton`/`RefreshPaymentButton`/`CancelPaymentButton`; no hay migas de pan ni tarjeta de desarrollador con perfil ampliado | `payment-page-view.tsx` |
| `ProjectProposalsView` ya es maestro-detalle por URL: orden por enlaces (`recent`/`price_asc`/`timeline_asc`, `aria-current`), tabla con región desplazable `tabIndex=0`, `?proposal=` para el detalle, `SelectProposalButton` (diálogo, 014), `PaginationNav`. El detalle usa `MarkdownContent` y **no** trae valoración del desarrollador | `project-proposals-view.tsx`, `client-proposal-detail.tsx`, `proposal.types.ts` |
| `PaginationNav` (compartido) ya tiene "Anterior" a la izquierda, "Página X de Y" al centro y "Siguiente" a la derecha, como el diseño, pero con enlaces subrayados de texto | `pagination-nav.tsx` |
| Existen tests de los botones de acción (`cancel-payment-button`, `refresh-payment-button`, `retry-transfers-button`, `select-proposal-button`, `start-checkout-button`, …) basados en textos y roles: los textos no cambian | `*.test.tsx` |
| shadcn: `table` y `breadcrumb` existen en el registro (`npx shadcn@latest search @shadcn -q table`, `-q breadcrumb`) | CLI |
| `src/lib/` no tiene helper de nombre de pila | Glob/Grep |

## Alcance

- Incluye:
  - `/dashboard` cliente y desarrollador, `/projects/[id]/payment` y `/projects/[id]/proposals` restilizados; `PaginationNav` restilizado como botones del diseño.
  - Componente nuevo `PaymentStatusBadge`/`TransferStatusBadge` (tonos `success|warning|danger|neutral` de 022a) para el estado del pago y de la transferencia en tablas y en la página de pago.
  - Helper `getFirstName` para "Hola, {nombre}".
  - Tablas con shadcn `table` y migas de pan con shadcn `breadcrumb` (T0).
  - Pasos manuales en `docs/MANUAL-TESTS.md`.
- No incluye:
  - Cambios en servicios, acciones, schemas, consultas o permisos; nuevos datos (valoraciones recientes, valoración y titular del desarrollador en la comparación, proyectos contratados por desarrollador): ver Preguntas abiertas.
  - `/dashboard/projects`, `/dashboard/proposals`, `/dashboard/payouts` (sin artboard; heredan tokens, header y footer; el único cambio visible es `PaginationNav`).
  - Los botones y diálogos de acción (`cancel-payment-button`, `refresh-payment-button`, `start-checkout-button`, `select-proposal-button`, `retry-transfers-button`): conservan su lógica, `aria-live`, anuncios y textos; solo reciben las clases de tamaño del botón del diseño cuando haga falta (no en esta spec: ver P5).
  - Gráficos, notificaciones, tiempo real, modo oscuro.

## Contratos (solo props/UI; sin cambios de servicios, schemas ni permisos)

### Helpers y componentes compartidos

```ts
// src/lib/first-name.ts (puro)
export function getFirstName(displayName: string | null | undefined): string;
// "Harold Inga" -> "Harold"; "  Ana  María " -> "Ana"; "" | null | undefined -> ""
// Primera palabra con letras/números (Unicode); sin sufijos ni capitalización forzada.

// src/modules/payments/components/payment-status-badge.tsx
export function PaymentStatusBadge({ status }: { status: PaymentAttemptStatus }): JSX.Element;
export function TransferStatusBadge({ status }: { status: DeveloperTransferStatus }): JSX.Element;
// Texto = PAYMENT_ATTEMPT_STATUS_LABELS / DEVELOPER_TRANSFER_STATUS_LABELS (sin cambios).
// Tono (Record exhaustivo, el compilador exige cubrir cada estado):
//   pago:  pending -> warning, completed_test -> success, failed -> danger, canceled -> neutral
//   transferencia: pending -> warning, completed_test -> success, failed -> danger
// Ausencia de intento/transferencia ("No iniciado", "Sin transferencia todavía"): Badge neutral en la vista.
```

El color nunca es el único portador de significado: toda píldora lleva su texto y el aviso de prueba conserva sus palabras.

### `src/app/dashboard/page.tsx` (M, T1)

Calcula `firstName = getFirstName(user.displayName)` y lo pasa a ambas vistas (`firstName: string`). Lógica de roles, carga de datos y `handleAuthErrorForPage` no cambian. `loading.tsx`/`error.tsx` no cambian.

### Panel del cliente (T1)

`ClientDashboardView({ data, firstName })`, una columna principal + aside en `lg`:

- Cabecera: eyebrow "Panel del cliente"; `<h1>` "Hola, {firstName}" ("Hola" si vacío); subtítulo "Esto es lo que necesita tu atención hoy."; acciones: enlace outline "Ver todos mis proyectos" (`/dashboard/projects`) y botón primario "Nuevo proyecto" con icono "+" (`/projects/new`). Sin proyectos (`counts.total === 0`): se conserva el `EmptyState` actual ("Aún no tienes proyectos" + "Crear tu primer proyecto").
- "Tus proyectos por estado": rejilla `auto-fit minmax(200px,1fr)` con una **tarjeta-enlace por estado** (los 5 reales, `PROJECT_STATUS_LABELS`) con punto de color, conteo en 32/800 y frase de ayuda ("Sin publicar", "Recibiendo propuestas", "Desarrollador elegido, falta el pago", "Pago confirmado", "Finalizados"); enlace a `/dashboard/projects?status=<estado>`; `aria-label` "{etiqueta}: {n} proyectos" y estado atenuado con 0 se conservan; "Todos (N)" pasa a ser un enlace al lado del título de la sección ("{N} proyectos en total"), con `aria-label` "Todos: N proyectos".
- "Acciones pendientes" (título del diseño; antes "Pendiente de ti"), pastilla "{n} por hacer"/"1 por hacer" derivada de `actions.length`; cada fila: caja de icono por tipo (`choose_proposal`: lista; `start_payment`/`resume_payment`: tarjeta; `rate`: estrella), título por tipo ("Elige una propuesta", "Completa el pago de prueba", "Valora al desarrollador"), detalle = nombre del proyecto (+ " · N propuestas pendientes" en `choose_proposal`), y el **enlace de acción con la etiqueta existente** ("Elegir propuesta (N)", "Pagar (prueba)", "Continuar o cancelar el pago", "Valorar al desarrollador") a las mismas rutas que hoy. Sin acciones: "No tienes nada pendiente." (texto actual).
- "En contratación" (título del diseño; subtítulo "Pago y transferencia de prueba de cada proyecto con desarrollador elegido."): tabla `table` dentro de una región con scroll horizontal (`role="region"`, `tabIndex=0`, `aria-label`, patrón ya usado en propuestas) con columnas Proyecto (título + `ProjectStatusBadge`), Desarrollador (`InitialsAvatar` + `DeveloperProfileLink`), Importe (`formatUsd`, alineado a la derecha), Pago (`PaymentStatusBadge` o "No iniciado" neutro; nota "Esperando que el desarrollador configure sus cobros de prueba" cuando corresponda), Transferencia (`TransferStatusBadge` o "Sin transferencia todavía" + `TRANSFER_TEST_NOTICE`) y una columna de acciones con "Ver pago" y, si `payment.status === "pending"`, `CancelPaymentButton`. Se conserva el aviso `role="note"` "Modo de prueba · No se mueve dinero real" en el encabezado de la sección y el enlace "Ver todos" cuando `contractingTotal > contracting.length`.
- Aside: tarjeta verde oscuro "Cómo avanza un proyecto" (4 pasos del diseño: Publica, Compara, Elige y paga, Valora; `<ol>`) y tarjeta `role="note"` "Pagos en modo de prueba" ("Los cobros y transferencias usan Stripe Test Mode. Ningún importe representa dinero real."). Contenido estático, sin cifras.

### Panel del desarrollador (T2)

`DeveloperDashboardView({ data, developerId, firstName })`:

- Cabecera: eyebrow "Panel del desarrollador"; `<h1>` "Hola, {firstName}"; subtítulo "Tus propuestas, proyectos ganados y cobros de prueba en un solo lugar."; acciones: enlace outline "Ver mi perfil público" (`/developers/{developerId}`) y botón primario "Explorar proyectos" con icono de lupa (`/projects`). El enlace "Ver todas mis propuestas" (`/dashboard/proposals`) se mantiene junto al título de "Tus propuestas por estado". Sin propuestas (`proposals.total === 0`) se conserva el bloque "Aún no has enviado propuestas".
- Fila superior de dos tarjetas: **cobros de prueba** (`DeveloperPayoutStatus`: icono en tono según estado, `CONNECTED_ACCOUNT_STATUS_LABELS[status]` como título (texto existente), "Última consulta a Stripe: {fecha}" con `statusSyncedAt` cuando exista, enlace a `/dashboard/payouts` con las etiquetas actuales "Ver cobros"/"Continuar configuración"/"Configurar cobros de prueba", y el texto de bloqueo existente si no está activa) y **valoración media** (`DeveloperRatingCard`, nuevo: panel verde oscuro con promedio 40/800, "de 5 · N valoraciones", `RatingStars` en `--star-on-dark`, enlace "Ver valoraciones recibidas" a `/developers/{id}#valoraciones`; sin valoraciones: "Aún sin valoraciones"). `RatingSummary` (ratings) no se toca (lo usa "Mi cuenta", 022d).
- "Tus propuestas por estado": 4 tarjetas-enlace (Pendiente, Aceptada, Rechazada, Retirada; etiquetas de `PROPOSAL_STATUS_LABELS`) con punto de color y frase de ayuda ("Esperando decisión", "Proyectos ganados", "Otra propuesta elegida", "Retiradas por ti") a `/dashboard/proposals?status=<estado>`; conservan su `aria-label` actual.
- "Acciones pendientes": mismo patrón de filas con icono y tono (`retry_transfer` -> `danger`, `awaiting_payment` -> `warning`, `setup_payouts` -> `warning`), con las **etiquetas y textos existentes**; las informativas (`awaiting_payment`) muestran la píldora "Informativa" en vez de enlace, como el diseño.
- "Proyectos ganados": tabla (región con scroll) Proyecto, Cliente (nombre abreviado existente), Importe, "Pago del cliente" (`PaymentStatusBadge`), Transferencia (`TransferStatusBadge`; con su motivo y "Reintentar" si ya existen hoy); subtítulo/aviso "Transferencia de prueba, no es dinero real." (`role="note"` con "Modo de prueba · No se mueve dinero real" se conserva).
- Sin la columna lateral "Valoraciones recientes" del diseño (no hay datos; ver P2).

### Página de pago (T3)

`PaymentPageView` conserva `Props` (`overview`, `returnNotice`) y toda su lógica (`deriveProgress`, `attemptText`, `awaitingDeveloper`, `closedWithoutPayment`, `buttonLabel`, `RETURN_NOTICES`).

- Migas de pan (`<nav aria-label="Ruta">` con shadcn `breadcrumb`): "Mi panel" (`/dashboard`) / título del proyecto (`/projects/{id}`) / "Pago de prueba" (`aria-current="page"`). Sustituye al enlace "Volver a mis proyectos".
- Cabecera: h1 "Pago de prueba", título del proyecto y `ProjectStatusBadge`. Aviso de modo de prueba `role="note"` en tono `warning` (texto actual sin cambios) y aviso de retorno (`role="status"`).
- "Progreso" (`PaymentProgress` restilizado: 4 pasos en rejilla, el actual con borde verde y fondo `surface-soft`, los completados con círculo verde y marca, texto de estado en `success`/`warning`/muted).
- Dos columnas en `lg`: izquierda "Estado del pago" (`PaymentStatusBadge`, texto actual, botones existentes `StartCheckoutButton`/`RefreshPaymentButton`/`CancelPaymentButton`, frase "Volver desde Stripe no confirma el pago…" dentro de la tarjeta) y tarjeta "Desarrollador seleccionado" (`InitialsAvatar` + `DeveloperProfileLink` con "Ver perfil"; sin titular ni valoración, que no existen en `ProjectPaymentOverview`); derecha, `aside` "Resumen": proyecto, plazo, método "Stripe Checkout", y pie "Total de prueba" con `formatUsd(proposal.priceCents)` y "USD". Se conserva la lista "Importe"/"Desarrollador seleccionado"/"Plazo".
- Si el pago está `completed_test`: botón "Volver a mi panel" (`/dashboard`) y, solo si `project.status === "contracted"`, "Valorar al desarrollador" (`/projects/{id}/rate`, ruta ya existente); se conserva `TRANSFER_TEST_NOTICE`. Texto de ayuda de prueba: "Para probar usa la tarjeta 4242 4242 4242 4242 con cualquier fecha futura y CVC." en el resumen (es el comportamiento de Stripe Test Mode; ver P4).

### Comparación de propuestas (T3)

`ProjectProposalsView` y `ClientProposalDetail` conservan `Props`, URLs (`?sort=`, `?page=`, `?proposal=`) y lógica.

- Migas de pan (`breadcrumb`): "Mi panel" / título del proyecto / "Propuestas" (reemplazan "Volver a mis proyectos"). h1 "Propuestas recibidas", título del proyecto, `ProjectStatusBadge` y presupuesto/plazo **solo si ya están disponibles** en `project` (hoy solo `id`, `title`, `status`: se omiten, ver P3).
- Orden: los 3 enlaces actuales con aspecto de control segmentado (activo `bg-primary text-primary-foreground`, `min-h-10`/`h-11`, `aria-current="page"` se conserva; siguen siendo enlaces, no `aria-pressed`).
- Tabla en tarjeta `surface` con `table`: Desarrollador (`InitialsAvatar sm` + `DeveloperProfileLink` + badge de estado si no es `pending`), Precio (alineado a la derecha, 15/800), Plazo, Enviada y "Ver detalle" con el estilo outline; la fila seleccionada con `surface-soft` y borde izquierdo verde de 3 px, y el botón "Viendo" (`aria-current="true"`) como el diseño. Región desplazable con foco (`role="region"`, `tabIndex=0`) y `caption` se conservan.
- `ClientProposalDetail`: tarjeta con avatar grande, nombre (enlace a perfil), "Ver perfil y valoraciones" (`DeveloperProfileLink`, nueva pestaña como hoy), `dl` de Precio/Plazo/Enviada sobre `surface-subtle`, descripción Markdown actual y, al pie en `surface-subtle`, el botón existente de **selección con diálogo** + texto "Al seleccionarla, las demás propuestas se rechazan y podrás hacer el pago de prueba."; sin la tercera columna "Valoración" (no hay dato por propuesta).
- `PaginationNav` (T3): "Anterior" y "Siguiente" como botones outline (`h-11`, borde `input`, radio 10 px) y deshabilitados (no enlaces) cuando no aplican, "Página X de Y" al centro; misma API (`page`, `totalPages`, `buildHref`).

## Conflictos entre el diseño y la funcionalidad existente

| # | Diseño | Existente | Decisión |
|---|---|---|---|
| 1 | 4 tarjetas de estado (Borrador, Publicado, En contratación, Cerrado) | 5 estados; `proposal_selected` y `contracted` son distintos (pago pendiente vs. contratado) | **5 tarjetas** con las etiquetas reales; el diseño omite un estado |
| 2 | Tabla de contratación con una acción distinta por fila ("Valorar", "Ir al pago", "Pagar") | "Ver pago" fijo + `CancelPaymentButton` si `pending`; las acciones por tipo ya están en "Acciones pendientes" | Una acción "Ver pago" por fila + cancelar; sin duplicar acciones |
| 3 | Título "Acciones pendientes", "En contratación", saludo "Hola, Harold" en el h1 | "Pendiente de ti", "Pagos y contratación", h1 "Mi panel" | **El diseño manda en títulos, eyebrows y subtítulos de página/sección**; lo existente manda en etiquetas de acciones, estados, mensajes y avisos (regla común 022a-022d). El `<title>` de la pestaña sigue "Mi panel \| Nexora" |
| 4 | CTAs "Publicar proyecto", "Mis proyectos" | "Nuevo proyecto", "Ver todos mis proyectos", "Crear tu primer proyecto" | Se conservan las etiquetas existentes (los manuales 8g y los tests las citan) |
| 5 | Aside "Valoraciones recientes" con reseñas del cliente | Solo promedio y cantidad en el panel; las reseñas viven en el perfil público | No se renderiza (sin datos nuevos); ver P2 |
| 6 | Titular y valoración del desarrollador ("Full Stack .NET · React · ★ 4.6 (8 valoraciones)") en la página de pago y en la tabla y detalle de propuestas | `ProjectPaymentOverview` y `ClientProposalSummary` no los traen (y `payments`/`proposals` no pueden depender de `profile`/`ratings`) | Se omiten; la tarjeta muestra avatar + nombre + "Ver perfil" |
| 7 | Propuestas: resumen en párrafo + 3 viñetas | Descripción Markdown libre (`MarkdownContent`) | Se conserva el Markdown |
| 8 | Orden como botones `aria-pressed` y filtrado en cliente | Enlaces con `?sort=` (servidor, paginado) | Se conservan los enlaces con estilo de control segmentado |
| 9 | Presupuesto y plazo del proyecto en la cabecera de propuestas | `project` solo trae `id`, `title`, `status` | Se omiten sin tocar el servicio; ver P3 |
| 10 | Nombre del desarrollador como enlace de avatar sin nueva pestaña en el panel; con nueva pestaña en propuestas/pago | `DeveloperProfileLink` siempre abre en pestaña nueva | Se usa `DeveloperProfileLink` en todos |
| 11 | Pago completado: "Volver a mi panel" y "Valorar al desarrollador" | La página no los ofrece hoy | Se añaden como enlaces a rutas existentes (valorar solo si `contracted`); no cambian lógica; ver P4 |
| 12 | Avatar "HI" del header | `UserButton` | Ver 022a |

## Reutilizar

| Existente | Uso |
|---|---|
| `src/modules/dashboard/components/*.tsx` (9 vistas) y `types/*.ts`, `services/*` | Se restilizan; **tipos y servicios no cambian** |
| `payments/types/{payment,developer-transfer,connected-account}.types.ts` (etiquetas, `TRANSFER_TEST_NOTICE`, `CONNECTED_ACCOUNT_STATUS_LABELS`) | Textos y tonos |
| `payments/components/{cancel-payment-button,refresh-payment-button,start-checkout-button,retry-transfers-button}.tsx` y `payment-progress.tsx` | Los botones **no se tocan**; `payment-progress.tsx` se restiliza |
| `proposals/components/{select-proposal-button,proposal-status-badge}.tsx`, `src/components/shared/{developer-profile-link,empty-state,pagination-nav,markdown-content}.tsx` | Se reutilizan; `pagination-nav.tsx` se restiliza |
| `projects/components/project-status-badge.tsx`, `ratings/components/rating-stars.tsx` | Estados y estrellas (API sin cambios) |
| `ui/badge` (tonos de 022a), `ui/button` (tamaño `touch`), `InitialsAvatar`, `surface`, tokens (022a) | Estilo |
| shadcn `table` y `breadcrumb` (T0) | Tablas y migas; no existen en `src/components/ui` (Glob) |
| Patrón de región desplazable accesible de `project-proposals-view.tsx` | Tablas de los paneles |
| `src/lib/money.ts` (`formatUsd`), `Intl.DateTimeFormat("es", { dateStyle: "medium" })` | Importes y fechas |

No existe `getFirstName` ni badges de pago/transferencia compartidos (Grep): se crean.

## Archivos

| Archivo | N/M | Tarea |
|---|---|---|
| `src/components/ui/table.tsx`, `src/components/ui/breadcrumb.tsx` (`npx shadcn@latest add table breadcrumb`) | N | T0 |
| `src/modules/payments/components/payment-status-badge.tsx` | N | T0 |
| `src/lib/first-name.ts`, `src/lib/first-name.test.ts` | N | T1 |
| `src/app/dashboard/page.tsx` | M | T1 |
| `src/modules/dashboard/components/client-dashboard-view.tsx`, `dashboard-status-summary.tsx`, `dashboard-pending-actions.tsx`, `dashboard-contracting-list.tsx` | M | T1 |
| `src/modules/dashboard/components/developer-dashboard-view.tsx`, `developer-proposals-summary.tsx`, `developer-pending-actions.tsx`, `developer-won-projects.tsx`, `developer-payout-status.tsx` | M | T2 |
| `src/modules/dashboard/components/developer-rating-card.tsx` | N | T2 |
| `src/modules/payments/components/payment-page-view.tsx`, `payment-progress.tsx` | M | T3 |
| `src/modules/proposals/components/project-proposals-view.tsx`, `client-proposal-detail.tsx` | M | T3 |
| `src/components/shared/pagination-nav.tsx` | M | T3 |
| `docs/MANUAL-TESTS.md` | M | T4 |

Sin cambios: servicios, acciones, schemas, `dashboard.types.ts`, `developer-dashboard.types.ts`, `cancel-payment-button.tsx` y demás botones de acción, `select-proposal-button.tsx`, `rating-summary.tsx`, `rating-stars.tsx`, `package.json`, `drizzle/**`, `layout.tsx`, `globals.css`.

## Criterios de aceptación

- AC1: `getFirstName` devuelve la primera palabra del nombre ("Harold Inga" -> "Harold"), ignora espacios sobrantes, soporta acentos y devuelve `""` con vacío/`null`/`undefined`.
- AC2: `/dashboard` **cliente**: cabecera con eyebrow, h1 "Hola, {nombre}" y subtítulo; "Tus proyectos por estado" con 5 tarjetas-enlace a `?status=` (conteos correctos, atenuadas con 0, `aria-label` conservado) y enlace "Todos"; "Acciones pendientes" con icono, título por tipo y el enlace de acción con la etiqueta y ruta existentes; "En contratación" como tabla con las 6 columnas, avisos de modo de prueba, transferencia nunca "recibida" y "Ver todos" cuando hay más de 20; aside con los dos bloques estáticos.
- AC3: `/dashboard` **desarrollador**: cabecera, tarjeta de cobros (estado, "Última consulta a Stripe" con `statusSyncedAt`, enlace y texto de bloqueo existentes), tarjeta de valoración media con estrellas (o "Aún sin valoraciones"), 4 tarjetas de propuestas por estado a `?status=`, acciones con tonos y píldora "Informativa", tabla de proyectos ganados con badges de pago/transferencia y aviso "Transferencia de prueba, no es dinero real."; sin columna de valoraciones recientes.
- AC4: Estados vacíos intactos: cliente sin proyectos (`EmptyState` actual), desarrollador sin propuestas (bloque actual), "No tienes nada pendiente.", "Sin transferencia todavía".
- AC5: Datos y permisos intactos: ningún servicio, consulta, tipo de dashboard ni permiso cambia; `developer` y `admin` conservan su comportamiento en `/dashboard` (developer ve su panel, admin 404, visitante a `/sign-in`).
- AC6: `PaymentStatusBadge`/`TransferStatusBadge` muestran exactamente las etiquetas de `PAYMENT_ATTEMPT_STATUS_LABELS`/`DEVELOPER_TRANSFER_STATUS_LABELS` con el tono indicado; el compilador falla si se añade un estado sin tono.
- AC7: Página de pago: migas de pan con `aria-current="page"` en el último elemento; aviso de modo de prueba; progreso de 4 pasos con el estado correcto en cada caso (sin intento, `pending`, `completed_test` con y sin transferencia, `failed`, `canceled`); estado con los botones existentes y sus textos; tarjeta de desarrollador con enlace a perfil; resumen con total de prueba; "Volver a mi panel" y, si `contracted`, "Valorar al desarrollador"; `TRANSFER_TEST_NOTICE` visible; **ningún** texto afirma dinero real ni transferencia recibida.
- AC8: Comparación de propuestas: migas, orden por enlaces con `aria-current`, tabla con fila seleccionada y "Viendo", detalle con descripción Markdown y botón de selección con diálogo (foco inicial en "Cancelar", 014), mensaje de consecuencia, paginación; todos los parámetros de URL (`sort`, `page`, `proposal`) y los estados (vacío, "No hay propuestas en esta página", `proposal_selected` con "Continuar al pago de prueba") se comportan como antes.
- AC9: `PaginationNav` muestra botones del diseño, con "Anterior"/"Siguiente" deshabilitados (no enlaces, `aria-disabled`) cuando no aplican, y mantiene la API y el texto "Página X de Y"; las listas que lo usan (`/dashboard/projects`, `/dashboard/proposals`, propuestas) siguen paginando.
- AC10: Accesibilidad conservada: un `<h1>` por página; `aria-label`s de tarjetas, regiones desplazables con foco, `role="note"`, `aria-current`, anunciador/avisos visuales (014) y diálogos sin cambios; foco visible con `ring-ring/40`; objetivos táctiles >= 44 px (>= 40 px en botones de tabla ya existentes); contraste >= 4,5:1 en textos de badges y notas; el color nunca es el único indicador de estado.
- AC11: A 390 px no hay scroll horizontal de página (las tablas desplazan dentro de su región) y las tarjetas de estado y acciones se apilan sin cortar texto; a 1440 px la composición coincide con los artboards (con las salvedades de la tabla de conflictos).
- AC12: Los archivos tocados usan tokens (`bg-card`, `text-muted-foreground`, `border-border`, tonos de estado) y no introducen hex nuevos con token equivalente; no se añaden dependencias (`table` y `breadcrumb` son código local de shadcn).
- AC13: `npm run lint`, `npm run test` y `npm run build` pasan; **ningún test existente se modifica** (los textos de los botones y diálogos no cambian); `npm run test:coverage` no cae por debajo de los umbrales; cero cambios en `drizzle/**`, servicios, schemas y permisos.

## Tests requeridos

Vitest, junto al archivo (SETUP §3).

- `src/lib/first-name.test.ts` (AC1): nombre y apellido, un solo nombre, espacios múltiples y bordes, acentos (`"Óscar Peña"`), vacío, `null`, `undefined`, solo símbolos.
- Sin test unitario obligatorio (presentacionales): vistas de dashboard, `payment-page-view`, `payment-progress`, `project-proposals-view`, `client-proposal-detail`, `payment-status-badge` (el `Record` exhaustivo ya lo garantiza el compilador), `pagination-nav`, páginas de `src/app`.
- Los tests existentes de botones (`cancel-payment-button`, `refresh-payment-button`, `retry-transfers-button`, `select-proposal-button`, `start-checkout-button`, `withdraw-proposal-button`) y de `dashboard-link`/`site-nav` **pasan sin cambios** (verificación del reviewer).

## Tareas

Máximo 5. Durante el bloque paralelo (T1, T2 y T3) nadie corre `npm install` ni `npm run build`; el reviewer corre lint, test y build al final.

### T0 — Base: componentes shadcn y badges de pago/transferencia (serial, primero)

- Archivos: `src/components/ui/table.tsx`, `src/components/ui/breadcrumb.tsx` (`npx shadcn@latest add table breadcrumb`), `src/modules/payments/components/payment-status-badge.tsx`
- Depende de: 022a `done`
- Paralelizable: no
- Cubre: AC6, AC12 (parte)

### T1 — Panel del cliente

- Archivos: `src/lib/first-name.ts`, `src/lib/first-name.test.ts`, `src/app/dashboard/page.tsx`, `src/modules/dashboard/components/client-dashboard-view.tsx`, `dashboard-status-summary.tsx`, `dashboard-pending-actions.tsx`, `dashboard-contracting-list.tsx`
- Depende de: T0
- Paralelizable: sí (con T2 y T3)
- Cubre: AC1, AC2, AC4, AC5, AC10, AC11, AC12
- Nota: `page.tsx` es de esta tarea; pasa `firstName` a las dos vistas (contrato arriba). T2 consume ese prop.

### T2 — Panel del desarrollador

- Archivos: `src/modules/dashboard/components/developer-dashboard-view.tsx`, `developer-proposals-summary.tsx`, `developer-pending-actions.tsx`, `developer-won-projects.tsx`, `developer-payout-status.tsx`, `developer-rating-card.tsx`
- Depende de: T0 (y del contrato de `firstName` de T1)
- Paralelizable: sí (con T1 y T3)
- Cubre: AC3, AC4, AC5, AC10, AC11, AC12

### T3 — Página de pago, comparación de propuestas y paginación

- Archivos: `src/modules/payments/components/payment-page-view.tsx`, `payment-progress.tsx`, `src/modules/proposals/components/project-proposals-view.tsx`, `client-proposal-detail.tsx`, `src/components/shared/pagination-nav.tsx`
- Depende de: T0
- Paralelizable: sí (con T1 y T2)
- Cubre: AC7, AC8, AC9, AC10, AC11, AC12

### T4 — Documentación y lista manual

- Archivos: `docs/MANUAL-TESTS.md`
- Depende de: T1, T2, T3
- Paralelizable: no
- Cubre: AC11, AC13 (verificación manual)
- Detalle: sección nueva "8p. Spec 022c — Paneles, pago y propuestas" (texto abajo) antes de la 9, tras las secciones de 022a/022b si existen; actualizar `**Cubre:**`. Solo se añade o reemplaza lo indicado: el árbol tiene cambios sin commitear en `MANUAL-TESTS.md`.

### Lista manual (texto para `docs/MANUAL-TESTS.md`, "8p. Spec 022c")

Compara con `docs/assets/3-paneles/Main.dc.html`, `DeveloperDashboard.dc.html`, `Payment.dc.html` y `Proposals.dc.html` a **1440 px** y **390 px**. Todo es de prueba. Cuentas: Cliente C (con proyectos en todos los estados), Desarrollador A, Desarrollador B, Administrador.

- [ ] (a) **Panel del cliente:** "Hola, {tu nombre}"; 5 tarjetas por estado con conteos correctos y enlaces `?status=` que abren la lista filtrada; "Acciones pendientes" con "Elegir propuesta (N)", "Pagar (prueba)", "Continuar o cancelar el pago" y "Valorar al desarrollador" llevando a las mismas pantallas que antes.
- [ ] (b) **En contratación:** la tabla muestra desarrollador (enlace al perfil en pestaña nueva), importe, pago y transferencia; con pago `pending` aparece "Cancelar pago de prueba" y su diálogo (foco inicial en "Volver"); la transferencia dice "Transferencia de prueba, no es dinero real" y nunca "recibida"; con más de 20 aparece "Ver todos".
- [ ] (c) **Panel del desarrollador:** tarjeta de cobros (estado, "Última consulta a Stripe", enlace correcto), valoración media con estrellas (o "Aún sin valoraciones"), 4 propuestas por estado con enlace `?status=`, acciones (reintentar transferencia, esperando pago "Informativa", configurar cobros) y tabla de proyectos ganados; "Ver mi perfil público" abre `/developers/{tu id}`.
- [ ] (d) **Estados vacíos:** cliente sin proyectos ("Aún no tienes proyectos" + "Crear tu primer proyecto"), desarrollador sin propuestas ("Aún no has enviado propuestas"), "No tienes nada pendiente.".
- [ ] (e) **Roles:** un administrador recibe 404 en `/dashboard`; sin sesión redirige a `/sign-in`; el Desarrollador B no ve datos del A.
- [ ] (f) **Pago:** migas "Mi panel / proyecto / Pago de prueba"; con proyecto en `proposal_selected` sin intento, con intento `pending`, tras cancelar, `failed` y `completed_test` con transferencia `pending` y `completed_test`, el progreso, los badges y los botones coinciden con el estado; nunca aparece "recibido" ni "dinero real"; completado: "Volver a mi panel" y "Valorar al desarrollador" (solo `contracted`).
- [ ] (g) **Propuestas:** con 4 propuestas ordena por "Más recientes / Menor precio / Menor plazo" (un solo enlace marcado como actual), "Ver detalle" -> "Viendo" y el panel de detalle; "Seleccionar esta propuesta" abre el diálogo (foco en "Cancelar", Escape cierra y devuelve el foco), el mensaje de error de una propuesta modificada sigue visible ("Cerrar y recargar"); con más de 10 propuestas la paginación funciona.
- [ ] (h) **Paginación compartida:** en `/dashboard/projects` y `/dashboard/proposals` "Anterior"/"Siguiente" tienen aspecto de botón, se deshabilitan en los extremos y navegan bien.
- [ ] (i) **Avisos:** al cancelar un pago o retirar una propuesta aparece el aviso visual de 014 (unos 6 s) sobre el footer y el lector de pantalla lo anuncia una vez.
- [ ] (j) **Responsive:** a 390 px no hay scroll horizontal de página; las tablas desplazan dentro de su región (alcanzable con Tab, con foco visible); tarjetas y acciones se apilan.
- [ ] (k) **Teclado y lector:** todos los enlaces y botones se alcanzan con Tab con foco visible y objetivos >= 44 px; las tarjetas de estado se anuncian como "{estado}: {n} proyectos"; los badges se leen como texto.

## Preguntas abiertas

- P1. Estados del cliente (conflicto 1): ¿5 tarjetas con las etiquetas reales (recomendado) o fusionar a 4 como el diseño? Fusionar ocultaría la diferencia entre "pago pendiente" y "contratado" que 012 muestra a propósito.
- P2. "Valoraciones recientes" del panel del desarrollador necesita un dato nuevo (reseñas). `DeveloperDashboard` solo trae el resumen. Recomendación: **omitir** la columna y mantener la tarjeta de valoración media con enlace al perfil; si se quiere, es una spec de dashboard (servicio) o reutilizar `listPublicRatings` de 020 (excepción de dependencia).
- P3. Presupuesto y plazo en la cabecera de propuestas y titular/valoración del desarrollador en tabla, detalle y pago requieren datos nuevos en `payments`/`proposals`. Recomendación: **omitir**; si se quieren, spec de servicios.
- P4. Añadir "Volver a mi panel", "Valorar al desarrollador" (solo `contracted`) y la pista de tarjeta de prueba `4242…` en la página de pago son contenido del diseño sin equivalente existente. Recomendación: **sí** (enlaces a rutas existentes y texto verdadero de Stripe Test Mode); si prefieres cero contenido nuevo, se quitan de T3.
- P5. Los botones de acción (`cancel-payment-button`, `refresh-payment-button`, `start-checkout-button`) mantienen su estilo actual (`h-10`, tokens hex) porque tienen tests y no están en el alcance de diseño. Recomendación: **no tocarlos** en esta fase; si se quiere unificar tamaños de botón (48 px del diseño), una pasada posterior.
- P6. Regla de textos "el diseño manda en títulos; lo existente manda en acciones/estados/mensajes" (conflictos 3 y 4): ¿se confirma? Recomendación: sí; así las etiquetas citadas en manuales y tests no cambian.
- P7. `/dashboard/projects`, `/dashboard/proposals`, `/dashboard/payouts` y `/onboarding` no tienen artboard: heredan tokens, header y footer sin rediseño. Recomendación: aceptar; si se quieren, spec nueva.
- P8. `Hola, {nombre}` usa `displayName` de Clerk/Neon (la primera palabra). Si el nombre es vacío se muestra "Hola". Recomendación: aceptar.
- P9. Las specs `done` 012, 013, 007, 008, 009-011 y 014 no se editan; esta spec es la traza del cambio visual. Recomendación: no tocarlas.

## Próximas fases

- 022d `profiles-and-project-forms` (independiente de esta; también depende de 022a).
- Opcional: valoraciones recientes en el panel y datos del desarrollador en pago/propuestas (specs de servicios); diseño de las pantallas sin artboard.

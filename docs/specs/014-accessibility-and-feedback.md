# Accesibilidad y feedback: diálogo de confirmación reutilizable, anuncios persistentes y un solo `aria-current`

Estado: done

Spec 014 de `docs/SDD-PLAN.md §7` (Fase 4, "ui-accessibility-and-feedback"). Cierra los pendientes que las specs 005, 007, 008, 012 y 013 dejaron explícitamente para 014 (`docs/MANUAL-TESTS.md §10`). No toca lógica de negocio, servidor, base de datos ni migraciones (`drizzle/` no cambia). Arquitectura: no aplica ninguna sección de `system-design.md` (solo UI cliente y un componente compartido; `src/components/shared` y `src/lib` según `SETUP.md §1.6`). Esta spec no usa APIs nuevas de Next 16: solo `useRouter().refresh()` y `layout.tsx` ya existentes. Las APIs de Base UI se verificaron en `node_modules/@base-ui/react/dialog/popup/DialogPopup.d.ts` (`finalFocus`, `initialFocus`).

## Objetivo

1. Sustituir los tres `window.confirm` provisionales (despublicar, cerrar, retirar) por un diálogo de confirmación accesible y reutilizable (`ConfirmDialog`), con foco atrapado, Escape, retorno de foco, texto de confirmación y estado `pending`.
2. Que el mensaje de error de la selección de propuesta (008) no desaparezca al refrescar.
3. Que los resultados de acciones cuyo botón se desmonta tras `router.refresh()`/`revalidatePath` se anuncien igualmente a lectores de pantalla (región global persistente).
4. Un solo `aria-current="page"` en el header (cierra R4/P2 de 013).

## Pendientes confirmados en código (y descartados)

| # | Pendiente | Veredicto | Evidencia |
|---|---|---|---|
| 1 | `window.confirm` provisional | Confirmado, 2 archivos (los únicos en `src/`; `grep window.confirm` no encuentra otros) | `src/modules/proposals/components/withdraw-proposal-button.tsx:15`; `src/modules/projects/components/project-lifecycle-actions.tsx:37` (textos en `:66` despublicar y `:82` cerrar). Lo usan `own-proposal-card.tsx:60`, `my-proposals-list.tsx:157` y `src/app/projects/[id]/edit/page.tsx:40` |
| 2 | Selección 008: el diálogo se cierra al refrescar sin mensaje | Confirmado, causa identificada: con los códigos "stale" `select-proposal-button.tsx:66-70` hace `setError` + `router.refresh()`; al refrescar, la propuesta ya no está `pending`/el proyecto no está `published` y `client-proposal-detail.tsx:61` deja de renderizar el botón, que se desmonta con su diálogo y su `role="alert"` (`:103-109`) | `select-proposal-button.tsx:18-24, 66-70`; `client-proposal-detail.tsx:61-63` |
| 3 | Doble `aria-current` en `/dashboard/account` | Confirmado: `isActivePath` por prefijo marca "Mi panel" (`/dashboard`) y "Mi cuenta" (`/dashboard/account`) | `src/lib/is-active-path.ts:4`; `site-nav.tsx:72`; `dashboard-link.ts` (`roleLink` y `getAccountLink`); aceptado como R4/P2 en `013-developer-dashboard.md:299, 307` |
| 4 | `cancel-payment-button.tsx`: el anuncio puede perderse | Confirmado: `:51` `router.refresh()` (y la action ya hace `revalidatePath` en `payment-cancellation.actions.ts:55-57`); tras `canceled`/`completed` el botón deja de renderizarse (`dashboard-contracting-list.tsx:88` exige `payment?.status === "pending"`; `payment-page-view.tsx:217` exige `canResume`), por lo que su `aria-live` (`:102`) se desmonta con el texto recién insertado | `cancel-payment-button.tsx:44-51, 102-113` |
| 5a | `refresh-payment-button.tsx`: mismo patrón que 4 (`setFeedback` + `router.refresh()`, y la action hace `revalidatePath`; el botón vive bajo `canResume`) | Confirmado, bajo riesgo | `refresh-payment-button.tsx:27-33`; `payment-page-view.tsx:217-219`; `payment-reconciliation.actions.ts:50-51` |
| 5b | `retry-transfers-button.tsx`: en éxito solo `router.refresh()`, sin ningún mensaje (resultado visible solo por el refresco) | Confirmado, bajo riesgo | `retry-transfers-button.tsx:15-23` |
| 5c | `refresh-connected-account-button.tsx`: ídem 5b | Confirmado, bajo riesgo | `refresh-connected-account-button.tsx:15-23` |
| 5d | `withdraw-proposal-button.tsx` y `project-lifecycle-actions.tsx`: en éxito no hay mensaje y el botón cambia/desaparece por `revalidatePath` | Confirmado, bajo riesgo (se resuelve al migrarlos, con el anunciador) | `withdraw-proposal-button.tsx:19-22`; `project-lifecycle-actions.tsx:39-42`; `project.actions.ts:106,134-140,166-167`; `proposal.actions.ts:72-78` |
| — | `select-proposal-button` éxito (`setOpen(false)`, `:62-65`) | Descartado como defecto de feedback: el aviso del siguiente paso con "Continuar al pago de prueba" aparece en la página (008); solo se añade un anuncio equivalente (T2) |
| — | `start-checkout-button`, `start-payout-onboarding-button`, `proposal-form`, `project-form`, `rate-developer-form`, `developer-profile-form` | Descartados: o redirigen (`window.location`/`redirect`) o mantienen su región `aria-live`/`role="status"` montada tras el éxito (`developer-profile-form.tsx:446-457`, `rate-developer-form.tsx:84-95`). No se tocan |
| — | `layout.tsx` con `lang="en"` y metadata de `create-next-app` | Fuera de alcance (006b) |

## Alcance

- Incluye:
  - `ConfirmDialog` compartido sobre el `alert-dialog` existente y su uso en despublicar, cerrar y retirar (y como cuerpo común de la confirmación de selección solo si no cambia su diseño: ver D-C).
  - Región de anuncios global (`LiveAnnouncer` + store Zustand mínimo) montada en `layout.tsx`, usada por cancelar pago, actualizar pago, reintentar transferencia, actualizar cuenta de cobros, retirar propuesta, ciclo de vida del proyecto y selección.
  - Error persistente en el diálogo de selección (008): no se refresca solo; se ofrece "Cerrar y recargar".
  - `getActiveHref` (un único enlace activo en el header) con tests.
  - Notas en `MANUAL-TESTS.md` y una nota mínima en la spec 013.
- No incluye: landing y metadata global (006b); rate limiting (015); tests globales (016); despliegue (017); cambios de lógica de negocio, actions o servicios; toasts visuales; "saltar al contenido" (`<main id>`; queda para una spec de UI posterior, ver Próximas fases); cambios en `dashboard-link.ts`; componentes de `src/components/ui/**`.

## Reutilizar

| Qué | Dónde | Uso |
|---|---|---|
| `AlertDialog*` (Base UI, `base-nova`) | `src/components/ui/alert-dialog.tsx` — **versionado en git** (`git ls-files` lo lista; no es nuevo ni está sin commitear), completo: Root, Trigger, Portal, Overlay, Content (`initialFocus`/`finalFocus` pasan por `Popup.Props`), Header, Footer, Title, Description, Action, Cancel | Base de `ConfirmDialog`. **No hace falta `shadcn add` ni dependencias**. Base UI ya cubre foco atrapado, Escape, `role="alertdialog"`, no cierra por clic fuera y `aria-labelledby/describedby` |
| Patrón de diálogo con `pending`, foco inicial en el botón seguro y `handleOpenChange` que ignora el cierre mientras `pending` | `select-proposal-button.tsx:41-72, 84-125`, `cancel-payment-button.tsx:28-100` | Se extrae a `ConfirmDialog` (DRY). `cancel-payment-button` **no migra** a `ConfirmDialog` (YAGNI: ya funciona, solo cambia su feedback, T3) |
| `Button` | `src/components/ui/button.tsx` | Botones del diálogo |
| `FormField`, `role="alert"` + `aria-live` locales | `src/components/shared/form-field.tsx:39` y los botones de acción | Se conservan los mensajes de error locales; el anunciador solo se añade donde el nodo se desmonta |
| `zustand` (ya instalado) | `package.json` | Store del anunciador |
| `isActivePath` | `src/lib/is-active-path.ts` | `getActiveHref` lo reutiliza (no se cambia su firma) |
| Tests de `SiteNav` (`it.each` de `aria-current`, mock de `usePathname`) | `src/components/shared/site-nav.test.tsx` | Se añaden filas, no se reescribe |
| `ProjectActionResult` | `src/modules/projects/types/project.types.ts` | Tipo de `run()` en lifecycle |

## Decisiones (con recomendación por defecto)

- **D-A. Diálogo controlado, sin trigger interno.** `ConfirmDialog` recibe `open`/`onOpenChange`; el botón que lo abre lo renderiza el consumidor (como ya hacen 008 y 012). Evita exponer `AlertDialogTrigger` y deja al consumidor decidir el texto del botón (`pending`). Retorno de foco: Base UI restaura el foco al elemento activo previo al abrir; para no depender de ello (el diálogo es controlado, sin `Trigger`), `ConfirmDialog` acepta `finalFocus` (ref al botón que abre) y lo pasa al `Content`. Si el botón se desmonta tras el éxito (retirar, cerrar), el foco no puede volver; el resultado se anuncia (D-B).
- **D-B. Anunciador global en vez de elevar estado.** El defecto de #4 y #5 es que el mensaje vive en el componente que el refresco desmonta. Solución: `LiveAnnouncer` (siempre montado en `layout.tsx`) con dos regiones persistentes (`role="status"`/`aria-live="polite"` y `role="alert"`) alimentadas por un store (`announce(text, kind)`). Es solo para lector de pantalla (`sr-only`): el cambio visible ya lo da la página refrescada (fila "Cancelado", badge "Retirada", etc.). Para no duplicar anuncios, en los botones migrados el texto visible local pierde `role`/`aria-live` cuando ya se anuncia globalmente; los errores que **no** desmontan el botón (`setError`) mantienen su `role="alert"` local y **no** se anuncian por el store. Alternativa descartada: toasts visuales (librería nueva, fuera de alcance).
  - Re-anuncio del mismo texto: el store guarda un `id` incremental y el componente re-renderiza el nodo con `key={id}` para que un mismo mensaje repetido se vuelva a leer.
- **D-C. Selección (008): sin refresco automático ante errores "stale".** Causa raíz: el refresco desmonta el diálogo. Cambio mínimo: en `STALE_CODES` ya no se llama `router.refresh()`; se mantiene `setError` + `setStale(true)`, el diálogo permanece abierto con el mensaje (`role="alert"` en el diálogo, que ya existe) y el botón de cancelar pasa a "Cerrar y recargar", que cierra y ejecuta `router.refresh()`. El mensaje persiste y es anunciado mientras el diálogo siga abierto. La confirmación de selección **no migra** a `ConfirmDialog` (tiene cuatro consecuencias estructuradas y lógica `stale`; se evita ampliar la API del diálogo, YAGNI). En éxito, `announce("Propuesta seleccionada. Continúa con el pago de prueba.")`.
- **D-D. Un solo `aria-current`: enlace activo = el de coincidencia más específica.** `getActiveHref(pathname, hrefs)` devuelve, entre los `href` que cumplen `isActivePath`, el más largo (o `null`). `SiteNav` marca solo ese. En `/dashboard/account` queda activo solo "Mi cuenta"; en `/dashboard/proposals` queda activo "Mi panel" (único que coincide). El logo (`/`) y "Registrarse" siguen usando `isActivePath` directo (no comparten lista). No cambia `dashboard-link.ts` ni los tests de 009b que ya existen (siguen pasando: `/projects/abc` -> "Proyectos", `/dashboard/projects` -> "Mis proyectos"). Alternativa descartada: opción `exact` en `isActivePath` (rompe "Mi panel" resaltado en subrutas).
- **D-E. Textos de confirmación (español, sin cambios de significado):**
  - Retirar: título "¿Retirar esta propuesta?", descripción "No podrás enviar otra a este proyecto.", confirmar "Retirar propuesta" (`pendingLabel` "Retirando...").
  - Despublicar: "¿Despublicar este proyecto?", "Volverá a ser un borrador y dejará de ser visible.", "Despublicar" ("Despublicando...").
  - Cerrar: "¿Cerrar este proyecto?", "Esta acción no se puede deshacer.", "Cerrar proyecto" ("Cerrando..."), `destructive`.
  - Foco inicial en "Cancelar" (acción segura) en los tres.
- **D-F. Mensaje de éxito anunciado** (cadenas fijas, sin lógica de negocio): "Propuesta retirada.", "Proyecto publicado.", "Proyecto despublicado.", "Proyecto cerrado.", "Propuesta seleccionada. Continúa con el pago de prueba.", resultados `OUTCOME_TEXT` ya existentes para cancelar/actualizar pago, "Transferencias reintentadas. Revisa el estado actualizado." (reintentar), "Estado de la cuenta de cobros actualizado." (actualizar cuenta). Los errores de red (`catch`) de cancelar pago ya existen y se anuncian como `alert`.

## Archivos

Nuevos:
- `src/lib/announcer.store.ts` y `src/lib/announcer.store.test.ts`
- `src/components/shared/live-announcer.tsx` y `src/components/shared/live-announcer.test.tsx`
- `src/components/shared/confirm-dialog.tsx` y `src/components/shared/confirm-dialog.test.tsx`
- Tests nuevos de consumidores: `src/modules/proposals/components/select-proposal-button.test.tsx`, `src/modules/proposals/components/withdraw-proposal-button.test.tsx`, `src/modules/projects/components/project-lifecycle-actions.test.tsx`, `src/modules/payments/components/cancel-payment-button.test.tsx`

Modificados:
- `src/app/layout.tsx` (montar `<LiveAnnouncer />`; no tocar `lang`/metadata)
- `src/modules/proposals/components/select-proposal-button.tsx`, `withdraw-proposal-button.tsx`
- `src/modules/projects/components/project-lifecycle-actions.tsx`
- `src/modules/payments/components/cancel-payment-button.tsx`, `refresh-payment-button.tsx`, `retry-transfers-button.tsx`, `refresh-connected-account-button.tsx`
- `src/lib/is-active-path.ts`, `src/lib/is-active-path.test.ts`, `src/components/shared/site-nav.tsx`, `src/components/shared/site-nav.test.tsx`
- `docs/MANUAL-TESTS.md` (sección nueva "8i. Spec 014" y §10: quitar los dos pendientes resueltos), `docs/specs/013-developer-dashboard.md` (spec `done`: solo una nota en R4, ver Preguntas abiertas)

No hay instalaciones, ni `shadcn add`, ni cambios en `src/components/ui/**`, ni migraciones.

## Contratos

### `src/lib/announcer.store.ts`

```ts
export type AnnouncementKind = "status" | "alert";
export type AnnouncerState = {
  message: string;
  kind: AnnouncementKind;
  id: number; // incrementa en cada announce
  announce: (message: string, kind?: AnnouncementKind) => void; // kind por defecto "status"
  clear: () => void;
};
export const useAnnouncerStore: UseBoundStore<StoreApi<AnnouncerState>>;
/** Atajo para código fuera de render y handlers. */
export function announce(message: string, kind?: AnnouncementKind): void;
```

### `src/components/shared/live-announcer.tsx`

`export function LiveAnnouncer()`: client component sin props. Renderiza siempre dos contenedores `sr-only`: `<div role="status" aria-live="polite" aria-atomic="true">` y `<div role="alert" aria-atomic="true">`; el texto actual se pinta solo en el que corresponde a `kind` con `key={id}`.

### `src/components/shared/confirm-dialog.tsx`

```ts
type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;   // no se invoca para cerrar mientras pending
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;                   // texto del botón confirmar durante pending (def.: confirmLabel)
  cancelLabel?: string;                    // def. "Cancelar"
  onConfirm: () => void;                   // el consumidor cierra el diálogo
  pending?: boolean;                       // def. false; deshabilita ambos botones, bloquea Escape/cierre
  error?: string | null;                   // se muestra en role="alert" dentro del diálogo; persiste hasta que cambie
  destructive?: boolean;                   // botón confirmar variant="destructive"
  finalFocus?: React.RefObject<HTMLElement | null>;
};
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;
```

Comportamiento: `initialFocus` en el botón cancelar; `max-h` con scroll interno y ancho como en `select-proposal-button` (390 px sin desborde); el contenedor del error es `<div aria-live="polite">` siempre montado con el `<p role="alert">` dentro (patrón existente); el botón confirmar es `type="button"`, no envía formularios.

### `getActiveHref` (`src/lib/is-active-path.ts`)

```ts
/** Entre `hrefs`, el activo de coincidencia más larga según isActivePath; null si ninguno. */
export function getActiveHref(pathname: string, hrefs: string[]): string | null;
```

## Criterios de aceptación

- AC1: `ConfirmDialog` abre con `role="alertdialog"` etiquetado por el título y descrito por la descripción; el foco inicial está en "Cancelar".
- AC2: Con el diálogo abierto, Tab y Shift+Tab no sacan el foco del diálogo; `Escape` lo cierra (`onOpenChange(false)`) y el foco vuelve al botón que lo abrió (`finalFocus`).
- AC3: Con `pending=true`, ambos botones están deshabilitados, el de confirmar muestra `pendingLabel`, y Escape no cierra el diálogo.
- AC4: "Confirmar" llama a `onConfirm` exactamente una vez por clic; "Cancelar" cierra sin llamar a `onConfirm`. Un `error` se renderiza con `role="alert"` y permanece visible mientras el diálogo siga abierto.
- AC5: `window.confirm` ya no se usa en `src/` (`grep` sin resultados fuera de tests). Despublicar, cerrar y retirar abren `ConfirmDialog` con los textos de D-E; no ejecutan la acción hasta confirmar; cancelar no la ejecuta; durante la ejecución el diálogo muestra `pending` y se cierra al terminar.
- AC6: Si la action de despublicar, cerrar o retirar devuelve error, el diálogo permanece abierto mostrando el mensaje en `role="alert"` (prop `error`) con "Cancelar" disponible; el botón no se desmonta porque en error no hay `revalidatePath`.
- AC7: Selección (008): ante un código de `STALE_CODES` el diálogo no se cierra ni se refresca solo; muestra el mensaje en `role="alert"`, "Confirmar selección" queda deshabilitado y el botón dice "Cerrar y recargar"; al pulsarlo se cierra y se llama a `router.refresh()` una vez. Un error no-stale muestra el mensaje y no refresca. En éxito se cierra y se anuncia "Propuesta seleccionada. Continúa con el pago de prueba.".
- AC8: `announce(m, kind)` hace que `LiveAnnouncer` muestre `m` en la región `role="status"` (kind `status`) o `role="alert"` (kind `alert`); la región está montada antes de anunciar (existe en el DOM inicial) y un mismo texto repetido vuelve a renderizarse (cambia el `key`).
- AC9: `cancel-payment-button`: tras `canceled`/`completed`/`none` o error, el texto del resultado se anuncia vía `announce` (`status`, o `alert` en error) y sigue en el DOM aunque el botón se desmonte; el botón ya no duplica el anuncio con su propio `aria-live`. `refresh-payment-button` anuncia igual su resultado.
- AC10: `retry-transfers-button` y `refresh-connected-account-button` anuncian el éxito (D-F); sus errores siguen en su `role="alert"` local.
- AC11: `withdraw-proposal-button` y `project-lifecycle-actions` anuncian el éxito (D-F); publicar (sin confirmación) también.
- AC12: `getActiveHref("/dashboard/account", ["/projects","/dashboard","/dashboard/account"])` devuelve `"/dashboard/account"`; `("/dashboard/proposals", [...])` devuelve `"/dashboard"`; `("/projects/abc", ...)` devuelve `"/projects"`; `("/somewhere-else", ...)` devuelve `null`; `("/", ["/projects"])` devuelve `null`.
- AC13: `SiteNav` con links `Proyectos`, `Mi panel` (`/dashboard`), `Mi cuenta` (`/dashboard/account`) tiene exactamente un enlace con `aria-current="page"` en `/dashboard/account` ("Mi cuenta") y los tests existentes de `aria-current` siguen pasando sin modificarse.
- AC14: `npm run lint`, `npm run test` y `npm run build` pasan; no hay cambios en `drizzle/`, `src/components/ui/**` ni actions/servicios.

## Tests requeridos

(Vitest + RTL junto al archivo. `userEvent` para teclado.)

- `announcer.store.test.ts`: `announce` actualiza `message`/`kind` e incrementa `id`; `kind` por defecto `status`; `clear`.
- `live-announcer.test.tsx`: las dos regiones existen antes de anunciar (AC8); `status` y `alert` aterrizan en la región correcta; repetir el mismo texto cambia el nodo; sigue en el DOM tras desmontar un componente que lo emitió (render de un hijo que llama `announce` y se desmonta).
- `confirm-dialog.test.tsx` (AC1-AC4): rol y nombre accesible, foco inicial en Cancelar, foco atrapado (Tab cíclico), Escape cierra, foco de retorno con `finalFocus`, confirmar llama una vez, `pending` (labels, deshabilitado, Escape ignorado), `error` con `role="alert"`.
- `is-active-path.test.ts`: filas de AC12 además de las existentes (no se borran).
- `site-nav.test.tsx`: caso de AC13 con tres enlaces; una sola coincidencia.
- `select-proposal-button.test.tsx` (AC7): mock de `selectProposalAction` y `next/navigation`; stale -> permanece abierto, `role="alert"`, sin `refresh` hasta "Cerrar y recargar"; no-stale -> sin refresh; éxito -> cierra y anuncia.
- `withdraw-proposal-button.test.tsx`, `project-lifecycle-actions.test.tsx` (AC5, AC6, AC11): abre el diálogo, no llama a la acción hasta confirmar, cancelar no la llama, éxito anuncia, error se ve en el diálogo.
- `cancel-payment-button.test.tsx` (AC9): resultado `canceled`/`completed`/`none` y error llaman a `announce` con el tipo correcto (mock del store o lectura de `useAnnouncerStore`).
- Los botones de refrescar pago, reintentar y actualizar cuenta (AC10) no requieren test propio (presentacionales con una llamada a `announce`); se cubren en revisión manual. El reviewer verifica con `grep` que `window.confirm` no queda.

## Tareas

### T0 — Anunciador global (serial, primero; incluye el único cambio de `layout.tsx`)
- Archivos: `src/lib/announcer.store.ts`, `src/lib/announcer.store.test.ts`, `src/components/shared/live-announcer.tsx`, `src/components/shared/live-announcer.test.tsx`, `src/app/layout.tsx`
- Depende de: —
- Paralelizable: no (serial al inicio; es la base de T2 y T3). No hay instalaciones ni `src/components/ui/**` que añadir (`alert-dialog` ya existe y está versionado).
- Cubre: AC8, (parte de AC14)

### T1 — `ConfirmDialog` compartido
- Archivos: `src/components/shared/confirm-dialog.tsx`, `src/components/shared/confirm-dialog.test.tsx`
- Depende de: — (usa `src/components/ui/alert-dialog.tsx` tal cual)
- Paralelizable: sí (con T0, T3 y T4; disjunto)
- Cubre: AC1, AC2, AC3, AC4

### T2 — Consumidores de proyectos y propuestas
- Archivos: `src/modules/proposals/components/select-proposal-button.tsx`, `src/modules/proposals/components/select-proposal-button.test.tsx`, `src/modules/proposals/components/withdraw-proposal-button.tsx`, `src/modules/proposals/components/withdraw-proposal-button.test.tsx`, `src/modules/projects/components/project-lifecycle-actions.tsx`, `src/modules/projects/components/project-lifecycle-actions.test.tsx`
- Depende de: T0, T1
- Paralelizable: sí (con T3 y T4, una vez cerradas T0 y T1)
- Cubre: AC5, AC6, AC7, AC11

### T3 — Anuncios persistentes en pagos
- Archivos: `src/modules/payments/components/cancel-payment-button.tsx`, `src/modules/payments/components/cancel-payment-button.test.tsx`, `src/modules/payments/components/refresh-payment-button.tsx`, `src/modules/payments/components/retry-transfers-button.tsx`, `src/modules/payments/components/refresh-connected-account-button.tsx`
- Depende de: T0
- Paralelizable: sí (con T1, T2 y T4)
- Cubre: AC9, AC10

### T4 — Un solo `aria-current` y documentación
- Archivos: `src/lib/is-active-path.ts`, `src/lib/is-active-path.test.ts`, `src/components/shared/site-nav.tsx`, `src/components/shared/site-nav.test.tsx`, `docs/MANUAL-TESTS.md`, `docs/specs/013-developer-dashboard.md` (solo una nota en R4)
- Depende de: —
- Paralelizable: sí (disjunto de T1-T3; no depende de T0)
- Cubre: AC12, AC13, AC14 (documentación)
- Texto manual a añadir a `MANUAL-TESTS.md` ("8i. Spec 014"): (a) despublicar, cerrar y retirar abren un diálogo (no `confirm` del navegador), foco inicial en "Cancelar", Tab no sale, Escape cierra y el foco vuelve al botón; (b) selección con propuesta modificada (008 "Versión vista"): el diálogo se queda abierto con el mensaje y "Cerrar y recargar"; (c) con lector de pantalla, cancelar pago, actualizar pago, retirar y cerrar anuncian el resultado aunque el botón desaparezca; (d) en `/dashboard/account` (desarrollador) solo "Mi cuenta" está marcado como página actual; (e) a 390 px los diálogos no se desbordan. Quitar de §10 los dos pendientes resueltos (selección y `window.confirm`).

## Preguntas abiertas

- P1. Spec 013 está `done`: ¿aceptas una nota mínima en su R4 ("resuelto en 014") sin devolverla a borrador? Recomendación: sí, es solo texto; el cambio de código vive en `site-nav.tsx`/`is-active-path.ts` (no toca los archivos de 013). Si prefieres no tocarla, se omite esa edición de T4. 005, 007, 008 y 012 mencionan `window.confirm` o "014 lo sustituirá" y **no** se editan.
- P2. Anunciador global solo para lector de pantalla (sin toast visual). Recomendación: sí; la UI refrescada ya muestra el cambio. Un toast visual sería otra spec (librería, diseño).
- P3. En D-C, ¿"Cerrar y recargar" manual o refresco automático al cerrar el diálogo? Recomendación: manual (el usuario lee el mensaje antes de que cambie la pantalla); el cierre con Escape también recarga si `stale` (el developer debe tratar `onOpenChange(false)` con `stale` igual que el botón).
- P4. Errores de despublicar/cerrar/retirar (AC6): ¿mostrarlos dentro del diálogo (recomendado, mismo patrón que 008) o cerrarlo y mostrarlos bajo el botón como hoy? Recomendación: dentro del diálogo, que permanece abierto con "Cancelar" para salir; el `role="alert"` local actual bajo el botón se elimina para no duplicar.
- P5. `cancel-payment-button` conserva su `AlertDialog` propio (no migra a `ConfirmDialog`). Recomendación: mantenerlo (YAGNI, ya cumple con foco y `pending`); migrarlo solo si aparece un tercer consumidor con el mismo patrón.
- P6. `getActiveHref` marca solo el enlace más específico; "Mi panel" deja de resaltarse en `/dashboard/account`. Recomendación: aceptar (es el comportamiento esperado de navegación: un único "página actual").
- P7. `lang="en"` y la metadata de `layout.tsx` siguen sin corregir (es un defecto de accesibilidad real: lectores de pantalla pronunciarán en inglés). Recomendación: cubrirlo en 006b, que ya lo tiene como pendiente; no mezclar con 014 aunque T0 toque `layout.tsx` para montar el anunciador.

## Próximas fases

- "Saltar al contenido" (`<main id>` y enlace en `SiteNav`, pendiente de 009b) y revisión de contraste: spec de UI posterior, o 006b con el layout.
- Estados de carga, error y vacío del resto de pantallas y errores de red/servicios externos con reintento: ya existen `*-loading.tsx`/`*-error.tsx` por módulo; una revisión sistemática queda para 016/017.
- Toasts visuales de éxito si el producto lo pide.

## Corrección posterior (2026-10-24, modo BUILD, decidida por el humano)

P2 ajustada: el anunciador global ahora también muestra una copia **visual** del mensaje durante 6 s (`aria-hidden`, sin duplicar el anuncio a lectores de pantalla). Motivo: tras cancelar un pago el botón y su mensaje se desmontan con el `router.refresh()`, y una persona que ve la pantalla no veía el resultado ("El pago se completó antes de poder cancelarlo"). Afecta a todos los usuarios del anunciador.

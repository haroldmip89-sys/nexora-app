# Nexora — Pruebas manuales pendientes

**Estado:** vivo (se actualiza al cerrar cada spec)
**Cubre:** specs 003 a 011a, 011c, 012, 013, 017, 018, 019, 022a, 022b, 022c, 022d, 022e y 023 (las specs 001 y 002 son documentales)

Estas pruebas no se pueden automatizar con Vitest: dependen de un navegador, de Clerk, de una base de datos Neon real o de la revisión visual. Los reviewers las dejaron marcadas como "pendiente de verificación manual".

Marca cada casilla al terminarla y anota en la columna de notas cualquier defecto con la ruta y el paso exacto.

## 0. Preparación (una sola vez)

- [ ] `.env.local` tiene `DATABASE_URL` (cadena pooled de Neon), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY`. Las demás variables ya vienen rellenadas.
- [ ] Aplica las migraciones sobre tu Neon: `npm run db:migrate`.
- [ ] Arranca la aplicación: `npm run dev` y abre `http://localhost:3000`.
- [ ] Prepara **tres cuentas** con correos distintos (con Gmail sirve el truco `tucorreo+cliente@gmail.com`, `tucorreo+dev@gmail.com`):
  - Cuenta **Cliente**: elige el rol `client` en `/onboarding`.
  - Cuenta **Desarrollador A**: elige el rol `developer`.
  - Cuenta **Desarrollador B**: elige el rol `developer` (hace falta para comparar y seleccionar entre dos propuestas).
- [ ] Opcional, para probar el rol administrador: regístrate con una cuarta cuenta y promuévela en Neon con `UPDATE users SET role = 'admin' WHERE email = '<correo>';`.
- [ ] Usa una ventana de incógnito por cuenta, o cierra sesión entre pruebas, para no mezclar sesiones.

## 1. Spec 003 — Base de datos

- [ ] `npm run db:migrate` termina sin error contra la cadena **pooled** de Neon. Esto no se pudo comprobar en la auditoría (queda también para la spec 017).
- [ ] En la consola de Neon aparecen las 7 tablas: `users`, `developer_profiles`, `projects`, `proposals`, `proposal_selections`, `payment_attempts`, `processed_payment_events`.
- [ ] Ejecutar `npm run db:migrate` por segunda vez no falla ni duplica nada.

## 2. Spec 004 — Autenticación y autorización

- [ ] `/sign-up` muestra el formulario de Clerk. Tras registrarte, Clerk te lleva a `/onboarding`.
- [ ] `/onboarding` ofrece solo dos roles (`client` y `developer`). No existe la opción `admin`.
- [ ] Al elegir un rol se crea tu fila en la tabla `users` de Neon, con ese rol y tu correo.
- [ ] Si vuelves a abrir `/onboarding` con la sesión ya iniciada y con fila, te redirige a `/` y no te deja cambiar el rol.
- [ ] Sin sesión, `/onboarding` te redirige a `/sign-in`.
- [ ] `/sign-in` permite entrar con una cuenta existente y te devuelve a `/`.
- [ ] Rutas privadas sin sesión (`/dashboard/projects`, `/dashboard/proposals`, `/projects/new`) te redirigen a `/sign-in`.
- [ ] **Webhook de Clerk** (opcional en local, necesario en despliegue): crea un endpoint en el panel de Clerk apuntando a `https://<tu-túnel>/api/webhooks/clerk`, suscrito solo a `user.updated` y `user.deleted`, y copia el signing secret a `CLERK_WEBHOOK_SIGNING_SECRET`.
  - [ ] Cambiar tu nombre en Clerk actualiza `display_name` en Neon.
  - [ ] Eliminar un usuario en Clerk anonimiza su fila (`display_name = 'Deleted user'`, correo `<id>@deleted.invalid`) y conserva el rol.
  - [ ] Un `POST` a `/api/webhooks/clerk` sin firma válida responde 400.

## 3. Spec 005 — Gestión de proyectos (cuenta Cliente)

- [ ] `/projects/new` muestra el formulario con 7 campos: título, categoría, descripción, presupuesto mínimo, presupuesto máximo, plazo y tecnologías (esta última como mosaicos de la lista cerrada, ver Spec 009c).
- [ ] Enviar el formulario vacío muestra un error por campo, en español, y no pierde lo escrito.
- [ ] Un presupuesto con más de dos decimales (`10.999`) o con coma (`1,5`) se rechaza con mensaje de campo.
- [ ] Presupuesto máximo menor que el mínimo se rechaza.
- [ ] "Guardar borrador" crea el proyecto y te lleva a `/dashboard/projects`, donde aparece con estado "Borrador".
- [ ] "Publicar" desde el formulario crea el proyecto directamente como "Publicado".
- [ ] En `/dashboard/projects` los filtros por estado, el orden y la paginación (más de 10 proyectos) funcionan, y el estado vacío ("Aún no tienes proyectos") aparece con una cuenta nueva.
- [ ] Editar un **borrador** permite cambiar todos los campos.
- [ ] Editar un proyecto **publicado** deja bloqueados categoría, presupuesto y plazo, y solo permite cambiar título, descripción y tecnologías. Guardar funciona.
- [ ] Despublicar un proyecto sin propuestas pide confirmación y lo devuelve a "Borrador".
- [ ] Despublicar un proyecto que ya tiene propuestas está bloqueado (el botón no aparece o muestra error).
- [ ] Cerrar un proyecto pide confirmación y lo deja en "Cerrado" sin acciones.
- [ ] Un proyecto cerrado ya no se puede editar (formulario de solo lectura).
- [ ] Cuenta **Desarrollador**: `/projects/new` y `/dashboard/projects` responden 404.
- [ ] Un cliente que abre `/projects/<id>/edit` de un proyecto ajeno recibe 404.
- [ ] Teclado: se puede completar y enviar el formulario solo con Tab y Enter, y el foco es visible.
- [ ] A 390 px de ancho no hay scroll horizontal en el formulario ni en la lista.

## 4. Spec 006 — Catálogo público y detalle (sin sesión y con sesión)

Necesitas al menos 13 proyectos publicados para ver la paginación (12 por página). Si no, comprueba el resto.

- [ ] `/projects` carga sin iniciar sesión y muestra solo proyectos **publicados**.
- [ ] Un borrador, un proyecto cerrado y uno con propuesta seleccionada **no** aparecen en el catálogo.
- [ ] Búsqueda por texto: encuentra por título, descripción y nombre de una tecnología (tag) del proyecto. Buscar `%` o `_` no devuelve todo el catálogo.
- [ ] Filtros de categoría, presupuesto máximo y plazo funcionan solos y combinados. "Limpiar" restablece todo.
- [ ] Los tres órdenes (recientes, presupuesto ascendente y descendente) cambian la lista.
- [ ] Paginación "Anterior / Siguiente / Página X de Y" funciona y conserva los filtros.
- [ ] Una página fuera de rango (`/projects?page=999`) muestra el mensaje y el enlace a la primera página.
- [ ] `/projects/<id>` de un proyecto publicado muestra el detalle, sin ningún dato del cliente (ni correo ni nombre).
- [ ] Un id inexistente, uno que no sea UUID, el de un borrador y el de un proyecto cerrado responden **404**. Verifica con `curl -I http://localhost:3000/projects/00000000-0000-0000-0000-000000000000`.
- [ ] `/projects/new` sigue abriendo el formulario (no lo captura `/projects/[id]`).
- [ ] Panel lateral del detalle según quién mira:
  - [ ] Visitante: enlaces para iniciar sesión (con regreso al proyecto) y crear cuenta.
  - [ ] Cuenta sin onboarding: enlace a `/onboarding`.
  - [ ] Cliente dueño: aviso "Este es tu proyecto" con enlaces.
  - [ ] Cliente no dueño: aviso de que los clientes no envían propuestas.
  - [ ] Desarrollador: ver sección 5.
- [ ] Header: a 390 px de ancho los elementos no se desbordan ni se rompen en dos líneas feas (el reviewer lo estimó justo).
- [ ] Revisión visual a 390, 768 y 1280 px frente a los artboards del diseño (https://claude.ai/artifact/VmUpQeQu1q9LscALC9g5Wm). Es una referencia, no un contrato.
- [ ] Los enlaces de acción de los estados vacíos ("Reintentar", "Limpiar filtros") se pueden pulsar con comodidad en móvil.

## 5. Spec 007 — Propuestas (cuenta Desarrollador A y Cliente)

Prepara un proyecto publicado con la cuenta Cliente.

**Como Desarrollador A en `/projects/<id>`:**

- [ ] Aparece el formulario "Enviar propuesta" (precio, plazo, descripción) con el presupuesto del cliente como ayuda.
- [ ] Enviar vacío o con valores fuera de rango muestra errores por campo en español.
- [ ] Enviar una propuesta válida la muestra como "Pendiente" con precio, plazo, fecha y descripción.
- [ ] "Editar" permite cambiar la propuesta mientras sigue pendiente.
- [ ] "Retirar" pide confirmación y la deja en "Retirada" (solo lectura).
- [ ] Después de retirar, **no** se puede enviar otra propuesta a ese proyecto (aparece la nota explicativa).
- [ ] Enviar una segunda propuesta al mismo proyecto sin retirar la primera no es posible.
- [ ] **Cobros requeridos (011b, mejora):** un desarrollador sin cuenta de cobros `active` ve, en el detalle de un proyecto publicado, "Para enviar propuestas debes configurar tus cobros de prueba." con el enlace a `/dashboard/payouts` en lugar del formulario. Tras activar la cuenta ("Actualizar estado"), el formulario aparece.
- [ ] `/dashboard/proposals` lista tus propuestas, las pestañas por estado filtran, y "Editar" lleva al formulario del detalle.
- [ ] En `/dashboard/proposals` el título del proyecto es un enlace solo si el proyecto sigue publicado.

**Como Cliente:**

- [ ] En `/dashboard/projects` aparece el enlace "Ver propuestas" solo en proyectos que tienen propuestas.
- [ ] `/projects/<id>/proposals` muestra la tabla comparativa (desarrollador, precio, plazo, fecha) y el orden por recientes, menor precio y menor plazo funciona.
- [ ] "Ver detalle" abre el panel con descripción completa. Si el desarrollador la editó, aparece "Editada".
- [ ] **Privacidad:** en toda la vista del cliente solo aparece el nombre del desarrollador. En ninguna parte aparece su correo.
- [ ] Una propuesta **retirada** no aparece en la vista del cliente.
- [ ] A 390 px la tabla hace scroll horizontal **dentro** de su caja, no de la página.
- [ ] Un cliente ajeno que abre `/projects/<id>/proposals` recibe 404. Un desarrollador también.
- [ ] Cerrar un proyecto publicado con propuestas pendientes las deja en "Rechazada".
- [ ] Carrera: con la cuenta Cliente intenta despublicar mientras el desarrollador envía una propuesta. El resultado debe ser coherente (o hay propuesta y no se despublica, o se despublica y la propuesta se rechaza).

## 6. Spec 008 — Selección de la propuesta ganadora

Prepara un proyecto publicado con propuestas de los Desarrolladores A y B.

- [ ] En el detalle de una propuesta pendiente aparece "Seleccionar esta propuesta". En propuestas que no están pendientes no aparece.
- [ ] El diálogo muestra "¿Seleccionar la propuesta de <nombre>?" con las cuatro consecuencias y la nota de Test Mode. El foco inicial está en "Cancelar".
- [ ] "Cancelar" cierra el diálogo y no cambia nada.
- [ ] "Confirmar selección":
  - [ ] El proyecto pasa a "Con propuesta seleccionada" en `/dashboard/projects`.
  - [ ] La propuesta ganadora queda "Aceptada" y la del otro desarrollador "Rechazada".
  - [ ] Una propuesta que estaba retirada sigue "Retirada".
  - [ ] Aparece el aviso del siguiente paso con el enlace "Continuar al pago de prueba", que lleva a `/projects/<id>/payment` (se prueba en la sección 7, Spec 009).
  - [ ] El botón "Seleccionar" desaparece.
  - [ ] `/projects/<id>` ahora responde 404 (el proyecto salió del catálogo).
- [ ] Como Desarrollador A y B, `/dashboard/proposals` muestra Aceptada / Rechazada según corresponda.
- [ ] **Versión vista:** con el diálogo ya abierto en la cuenta Cliente, edita la propuesta desde la cuenta Desarrollador y luego pulsa "Confirmar selección". Debe rechazarlo pidiendo recargar y no seleccionar.
- [ ] **Retirada simultánea:** con el diálogo abierto, retira la propuesta desde la cuenta Desarrollador y confirma. Debe mostrar error y no seleccionar.
- [ ] **Doble clic:** pulsar "Confirmar selección" dos veces rápido no muestra un error falso ni selecciona dos veces.
- [ ] **Dos pestañas:** abre la misma vista del cliente en dos pestañas, selecciona una propuesta en la primera y otra distinta en la segunda. La segunda debe fallar y la ganadora debe seguir siendo la primera.
- [ ] Escape y clic fuera no cierran el diálogo mientras se procesa la selección.
- [ ] Cerrar el proyecto desde "Mis proyectos" tras la selección funciona mientras no se haya iniciado ningún pago (con un pago de prueba pendiente queda bloqueado: ver sección 7).
- [ ] Un desarrollador o administrador que intente seleccionar recibe error de permisos o 404.
- [ ] Revisión visual del diálogo a 390 px: no se desborda y tiene scroll interno si hace falta.

## 7. Spec 009 — Pago de prueba con Stripe Checkout (Test Mode)

Esta spec solo **crea** el pago de prueba. La confirmación (`completed_test`) y el paso a "En contratación" llegan con la spec 010 (sección 8). Las casillas de esta sección valen **sin** `stripe listen` activo: sin listener ni reconciliación un pago hecho en Stripe no se refleja como completado.

### Preparación con Stripe (una sola vez)

- [ ] Crea una cuenta de Stripe y quédate en **modo de prueba** (sandbox / Test Mode). No actives la cuenta para cobros reales.
- [ ] En el panel de Stripe (modo prueba, Developers -> API keys) copia la **clave secreta de prueba** (`sk_test_...`, nunca una `sk_live_`) y pégala en `.env.local` como `STRIPE_SECRET_KEY`.
- [ ] En `.env.local` añade `APP_URL=http://localhost:3000` (o el puerto que uses). Ninguna de las dos variables lleva prefijo `NEXT_PUBLIC_`.
- [ ] Reinicia `npm run dev` para que lea las variables.
- [ ] Para pagar en la página de Stripe usa la tarjeta `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y cualquier código postal.
- La CLI de Stripe (`stripe login`, `stripe listen`) y `STRIPE_WEBHOOK_SECRET` **no** hacen falta para esta sección; son para la spec 010 (sección 8). Si los tienes activos, el pago de prueba se confirma y las casillas "sigue `pending`" no aplican: usa la sección 8.

Prepara con la cuenta Cliente un proyecto en "Con propuesta seleccionada" (sección 6).

### Acceso y página de pago

- [ ] En `/dashboard/projects` el enlace "Continuar al pago de prueba" aparece solo en proyectos "Con propuesta seleccionada" y lleva a `/projects/<id>/payment`.
- [ ] En `/projects/<id>/proposals` el aviso del siguiente paso trae el mismo enlace y lleva a la misma página.
- [ ] La página muestra el banner permanente de Modo de prueba, el resumen (título, nombre del desarrollador, importe en USD y plazo en semanas), el progreso de 4 pasos y la leyenda "Volver desde Stripe no confirma el pago".
- [ ] El importe mostrado es el de la propuesta ganadora, no el de otra propuesta del mismo proyecto.
- [ ] El paso 4 dice "Pendiente de implementación" y nunca aparece como completo ni como dinero recibido.
- [ ] Sin intento previo aparece "Aún no iniciaste el pago de prueba." y el botón "Pagar con Stripe (prueba)".

### Crear el pago y volver desde Stripe

- [ ] Pulsar "Pagar con Stripe (prueba)" muestra "Redirigiendo a Stripe..." y te lleva a `checkout.stripe.com` con el importe de la propuesta ganadora y en USD.
- [ ] En Stripe Dashboard (modo prueba) la sesión aparece marcada como **Test**, y su `metadata` y `client_reference_id` contienen solo ids internos (`payment_attempt_id`, `project_id`, `proposal_id`, `client_id`), sin correo, nombre, título ni descripción.
- [ ] En Neon hay **una** fila en `payment_attempts` con `status = 'pending'`, `livemode = false`, `stripe_checkout_session_id` relleno y `stripe_payment_intent_id` nulo. El proyecto sigue en `proposal_selected`.
- [ ] **Cancelar:** pulsar el enlace de volver/cancelar de Stripe regresa a `/projects/<id>/payment?checkout=cancel`, muestra el aviso "Volviste desde Stripe sin completar el pago desde esta pantalla" y no cambia el estado (sigue "Pendiente").
- [ ] **Reintentar dentro de 10 minutos:** pulsar "Continuar en Stripe" reutiliza la misma sesión (misma URL de Stripe, sin segunda sesión en el panel ni segunda fila en `payment_attempts`).
- [ ] **Doble clic:** pulsar el botón dos veces rápido no crea dos intentos ni dos sesiones.
- [ ] **Dos pestañas:** abre la página en dos pestañas y pulsa el botón en ambas. Termina con un solo intento activo y una sola sesión.
- [ ] **Pago de prueba:** pagar con `4242 4242 4242 4242` vuelve a `/projects/<id>/payment?checkout=success`, con el aviso "Volviste desde Stripe. Esto no confirma el pago: esperamos la verificación del servidor.".
  - [ ] Sin `stripe listen` activo: el panel dice "Pendiente de confirmación del servidor". **Nunca** aparece "completado" ni "pagado" solo por volver del navegador (la confirmación llega por webhook o por "Actualizar estado", sección 8).
  - [ ] Sin `stripe listen` activo: la fila sigue `pending` y el proyecto sigue en `proposal_selected`.
  - [ ] Pulsar "Continuar en Stripe" no crea otro pago: responde "Ya hay un pago de prueba en curso, pendiente de confirmación del servidor.".
- [ ] **Parámetro manipulado:** escribir `?checkout=success` a mano en la URL de un proyecto sin pago iniciado no cambia ningún estado y el panel sigue mostrando el estado real ("Aún no iniciaste el pago de prueba."). Probar también `?checkout=cualquiercosa`: no muestra aviso.
- [ ] **Cierre bloqueado:** con un intento `pending`, "Cerrar proyecto" en `/dashboard/projects` falla con `PAYMENT_IN_PROGRESS` ("No puedes cerrar el proyecto mientras haya un pago en curso."). Con `stripe listen` activo, el evento `expired` (sección 8, paso 5) también desbloquea el cierre.
- [ ] **Sesión vencida (opcional, tarda 60 minutos):** pasado ese tiempo sin pagar, pulsar el botón cancela el intento viejo (`canceled`) y crea uno nuevo con otra sesión; solo hay uno activo. Con `stripe listen` activo el intento ya habrá pasado a `canceled` por el evento `checkout.session.expired`.

### Configuración y errores

- [ ] **Clave live (solo local, con clave falsa):** pon en `STRIPE_SECRET_KEY` un valor falso que empiece por `sk_live_` (por ejemplo `sk_live_falsa`; **nunca una clave live real**), reinicia y pulsa el botón. Muestra "El pago de prueba no está disponible en este entorno." y no se crea ninguna fila en `payment_attempts`. Restaura la clave `sk_test_` y reinicia.
- [ ] **Sin `STRIPE_SECRET_KEY`:** quítala (o déjala vacía), reinicia y abre la página. La página carga sin romperse y, al pulsar el botón, muestra el mismo mensaje claro sin crear intento. Restáurala y reinicia.
- [ ] **Sin `APP_URL`:** el botón muestra el mismo mensaje y no crea intento. Restáurala y reinicia.
- [ ] Un error al conectar con Stripe muestra "No pudimos conectar con Stripe. Inténtalo de nuevo en unos minutos." en una región de alerta y la página sigue usable.

### Permisos y privacidad

- [ ] Cuenta **Desarrollador** y cuenta **Administrador**: `/projects/<id>/payment` responde 404.
- [ ] **Cliente ajeno** (otro cliente con el id de un proyecto que no es suyo): `/projects/<id>/payment` responde 404.
- [ ] Un id que no es UUID, o el de un proyecto sin propuesta seleccionada (borrador, publicado), responde 404.
- [ ] Sin sesión, `/projects/<id>/payment` redirige a `/sign-in`.
- [ ] El HTML de la página (ver código fuente) no contiene correos, ids de Stripe (`cs_test_...`, `pi_...`) ni la URL de Checkout.

### Responsive y accesibilidad

- [ ] A 390 px de ancho la página no tiene scroll horizontal y el progreso de 4 pasos es legible.
- [ ] A 768 y 1280 px la página se ve ordenada y sin desbordes.
- [ ] El botón y los enlaces se alcanzan con teclado (Tab), tienen foco visible y un objetivo táctil de al menos 40 px.
- [ ] El mensaje de error del botón se anuncia en una región `aria-live`.

## 7b. Spec 009b — Navegación global (todas las cuentas)

Usa las cuentas de la sección 0 (Cliente, Desarrollador A) y, si la preparaste, la de administrador. Una ventana de incógnito sin sesión para el visitante.

### Visitante (sin sesión)

- [ ] En `/`, `/projects`, `/projects/<id>` de un proyecto publicado, `/sign-in` y `/sign-up` aparece la cabecera con "Nexora", "Proyectos", "Iniciar sesión" y "Registrarse"; no aparece ningún enlace de dashboard ni el avatar.
- [ ] En una URL inexistente (por ejemplo `/no-existe`) la página 404 también muestra la cabecera.
- [ ] "Nexora" lleva a `/`; "Proyectos" a `/projects`; "Iniciar sesión" a `/sign-in`; "Registrarse" a `/sign-up`.
- [ ] En cada página, el enlace de la sección actual aparece resaltado (subrayado y verde) y en las herramientas de desarrollo tiene `aria-current="page"` (por ejemplo "Proyectos" en `/projects` y en el detalle).

### Cuenta Cliente

- [ ] El avatar de Clerk aparece a la derecha y desaparecen "Iniciar sesión" y "Registrarse".
- [ ] Aparece "Mi panel" y lleva a `/dashboard`; queda resaltado en `/dashboard` y también en `/dashboard/projects`.
- [ ] No aparece "Mis propuestas".
- [ ] La cabecera se ve igual en `/dashboard/projects`, `/projects/new`, `/projects/<id>/edit` y `/projects/<id>/payment` (con un proyecto en `proposal_selected`), sin duplicarse.
- [ ] Desde `/projects/new` se puede volver a "Proyectos" y a "Nexora" sin escribir la URL.

### Cuenta Desarrollador

- [ ] Aparece "Mi panel" y lleva a `/dashboard`; queda resaltado en `/dashboard` y también en `/dashboard/proposals`. No aparece "Mis proyectos" ni "Mis propuestas" (spec 013).
- [ ] Desde el detalle de un proyecto publicado se llega a "Mi panel" con un clic.

### Cuenta recién registrada, sin rol

- [ ] Tras registrarte y antes de elegir rol, la cabecera muestra el avatar y el enlace "Completar registro" hacia `/onboarding`.
- [ ] Al elegir un rol y volver a `/`, "Completar registro" es sustituido por "Mi panel" (-> `/dashboard`) según el rol.

### Cuenta administrador (opcional)

- [ ] La cabecera muestra "Nexora", "Proyectos" y el avatar, sin enlace de dashboard (decisión D-C: no hay panel de admin).

### Cerrar sesión

- [ ] Desde el menú del avatar, "Cerrar sesión" devuelve a un estado de visitante: reaparecen "Iniciar sesión" y "Registrarse" y desaparece el enlace de dashboard.

### Responsive y accesibilidad

- [ ] A 390 px la cabecera no tiene scroll horizontal: se ven "Nexora", el avatar o "Registrarse" y el botón "Menú".
- [ ] El botón "Menú" despliega todos los enlaces apilados; se cierra al elegir un enlace, al pulsar `Escape` y al pulsarlo de nuevo. Un lector de pantalla anuncia "expandido/contraído".
- [ ] A 768 px y 1280 px los enlaces van en línea y no aparece el botón "Menú".
- [ ] Con teclado (Tab y Shift+Tab) se recorren logo, enlaces, avatar y botón "Menú" con foco visible, y el orden es lógico.
- [ ] Logo, enlaces, "Registrarse", botón "Menú" y avatar tienen un objetivo táctil de al menos 44 px (inspección o modo táctil).
- [ ] `/sign-in`, `/sign-up` y `/onboarding` se ven centrados y no generan scroll vertical extra por la cabecera.
- [ ] Con la base de datos inaccesible (cadena `DATABASE_URL` inválida temporalmente) y sesión iniciada, las páginas públicas siguen abriendo y la cabecera muestra el avatar sin enlace de dashboard.
- [ ] `npm run build` muestra `/`, `/sign-in`, `/sign-up` y `_not-found` como dinámicas (`ƒ`), y no hay errores.

## 7c. Spec 009c — Catálogo de tecnologías (tags)

**Antes de probar:** ejecuta `npm run db:migrate` (crea `technologies` y `project_technologies`, siembra el catálogo, convierte las tecnologías existentes y elimina `projects.technologies`). Sin ese paso, `/projects`, `/projects/new` y la edición fallan o muestran el catálogo vacío.

### Selector en el formulario (cuenta Cliente)

- [ ] `/projects/new` muestra "Tecnologías" como mosaicos (unos 50, con "Otros" al final) en lugar de un campo de texto.
- [ ] Se pueden marcar varios mosaicos; el marcado se ve con fondo verde `#183D30` y texto blanco, y el no marcado con fondo blanco y borde gris.
- [ ] Enviar sin ninguna tecnología muestra el error "Indica al menos una tecnología".
- [ ] Marcar 11 tecnologías y guardar muestra error (máximo 10); con 10 se guarda.
- [ ] Ante cualquier error de validación, los mosaicos elegidos siguen marcados y lo escrito en los demás campos no se pierde.
- [ ] «Otros» se puede elegir como un tag más y no pide ningún texto.
- [ ] Guardar crea el proyecto con esas tecnologías; al abrir `/projects/<id>/edit` aparecen marcadas.
- [ ] Editar un proyecto **publicado** permite cambiar los tags (junto con título y descripción); en un proyecto cerrado el selector está deshabilitado.
- [ ] Los proyectos que existían antes de la migración conservan sus tecnologías; las que no estaban en el catálogo aparecen como «Otros».

### Filtro en `/projects` (sin sesión)

- [ ] "Tecnologías" aparece plegado cuando no hay tags elegidos; al abrirlo muestra los mosaicos con el mismo estilo que los botones de `/dashboard/projects`.
- [ ] Elegir un tag y pulsar "Aplicar" deja `?tech=<slug>` en la URL, muestra solo proyectos publicados con ese tag, y el bloque llega abierto con el contador (por ejemplo "Tecnologías (1)") y el mosaico marcado.
- [ ] Elegir dos tags devuelve solo los proyectos que tienen **ambos**.
- [ ] El filtro se combina con búsqueda, categoría, presupuesto, plazo, orden y paginación.
- [ ] Un `?tech=` con un slug inexistente (por ejemplo `?tech=cobol`) muestra el estado vacío sin error.
- [ ] Con tags activos y sin resultados, el estado vacío ofrece "Limpiar filtros".
- [ ] "Limpiar" quita también los tags elegidos.
- [ ] Con JavaScript desactivado el filtro funciona igual.
- [ ] Las tarjetas y el detalle público muestran los nombres de los tags del proyecto.

### Responsive y accesibilidad

- [ ] A 390 px no hay scroll horizontal en el formulario ni en el filtro; los mosaicos saltan de línea.
- [ ] Con teclado (Tab para moverse, Espacio para marcar, Enter para enviar) se pueden elegir tags y enviar el formulario y el filtro; el foco es visible en cada mosaico.
- [ ] Un lector de pantalla anuncia cada mosaico como casilla con su nombre y estado (marcada o no), y el grupo con su leyenda "Tecnologías".

## 8. Spec 010 — Estado del pago y webhooks de Stripe (Test Mode)

### Preparación con la CLI de Stripe (una sola vez)

- [ ] Instala la CLI de Stripe y ejecuta `stripe login` (modo de prueba).
- [ ] Ejecuta `stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:3000/api/webhooks/stripe` y deja la terminal abierta.
- [ ] Copia el `whsec_...` que imprime a `STRIPE_WEBHOOK_SECRET` en `.env.local` (la variable ya figura en `.env.example`; sin prefijo `NEXT_PUBLIC_`) y **reinicia `npm run dev`**.
- [ ] Prepara con la cuenta Cliente un proyecto en "Con propuesta seleccionada" (sección 6). Tarjetas: `4242 4242 4242 4242` (éxito) y `4000 0000 0000 0002` (rechazo), cualquier fecha futura, CVC y código postal.

### Pasos

1. [ ] **Pago correcto:** paga con `4242 4242 4242 4242` desde la página de pago.
   - [ ] En la terminal de `stripe listen` aparece `checkout.session.completed` con 200.
   - [ ] En Neon: el intento queda `completed_test` con `stripe_payment_intent_id` y `completed_at`; el proyecto `contracted` con `contracted_at`; hay una fila `applied` en `processed_payment_events`.
   - [ ] En la UI: "En contratación" en "Mis proyectos" (con el enlace "Ver pago de prueba"), panel "Completado en Test Mode · confirmado por el servidor", paso 3 completo, paso 4 "Pendiente de implementación" y ningún texto de dinero recibido.
2. [ ] **Idempotencia:** reenvía el mismo evento con `stripe events resend <evt_id>` (**a verificar** que llegue al listener local; si no, repite la petición firmada guardada con `--print-json` dentro de 5 minutos con `curl`). Respuesta 200, sin cambios y sin segunda fila en `processed_payment_events`.
3. [ ] **Evento ajeno (sintético):** `stripe trigger checkout.session.completed` genera una sesión sin intento: respuesta 200, el log del servidor dice `attempt_not_found`, se crea una fila `ignored` con `payment_attempt_id` NULL y nada más cambia.
4. [ ] **Rechazo de tarjeta (P1):** paga con `4000 0000 0000 0002`. Stripe muestra el rechazo en su página y el intento sigue `pending`: un rechazo de tarjeta **no produce "Fallido"** (`failed` solo llega con el fallo definitivo de un método asíncrono). Paga después con `4242` en la misma sesión: se completa como en el paso 1.
5. [ ] **Expiración:** con un intento `pending`, expira la sesión con `stripe checkout sessions expire <cs_test_...>`. Llega `checkout.session.expired`, el intento pasa a `canceled`, el proyecto sigue `proposal_selected`, "Cerrar proyecto" ya no responde `PAYMENT_IN_PROGRESS` y se puede reintentar el pago.
6. [ ] **Firma alterada:** `curl -i -X POST http://localhost:3000/api/webhooks/stripe -H "Stripe-Signature: t=1,v1=firma_falsa" -d '{}'` responde 400; sin la cabecera también 400; no aparece ninguna fila nueva en `processed_payment_events`.
7. [ ] **Sin `stripe listen` (reconciliación):** detén el listener, paga con `4242` y vuelve a la página: el intento sigue "Pendiente". Pulsa "Actualizar estado": pasa a completado y el proyecto a "En contratación". Con la sesión aún abierta (sin pagar), "Actualizar estado" muestra "Stripe todavía no confirma el pago.".
8. [ ] **Retorno del navegador:** volver con `?checkout=success` antes de que llegue el evento sigue mostrando "pendiente"; escribir `?checkout=success` a mano en otro proyecto no cambia nada.
9. [ ] **Secreto ausente:** quita `STRIPE_WEBHOOK_SECRET`, reinicia y envía un evento: 500 y ningún cambio. Restaura y reinicia.
10. [ ] **Privacidad y logs:** el log del servidor no contiene cuerpos de evento, correos ni secretos; el HTML de la página no contiene ids de Stripe.
11. [ ] **Método asíncrono (opcional, solo si la cuenta de prueba tiene uno habilitado):** `completed` con `unpaid` no completa el pago; el evento asíncrono posterior sí.
12. [ ] **Responsive y accesibilidad** del botón "Actualizar estado" a 390 px: operable con teclado, foco visible y resultado anunciado en una región `aria-live`.

## 8b. Spec 011a — Cuentas conectadas (Stripe Connect, modo de prueba)

Cubre solo la cuenta conectada del desarrollador y su onboarding. No hay transferencias ni movimiento de dinero (eso llega con 011b). Todo el flujo es de prueba y la página lo indica con "Cobros de prueba · no es dinero real".

### Preparación (una sola vez)

- [ ] **Precondición:** en el Dashboard de Stripe, **en modo de prueba**, activa Connect (Settings > Connect; completa el perfil de plataforma si lo pide) y anota el país de tu cuenta de plataforma. **A verificar:** que ese país admite una plataforma con cuentas conectadas `US`. Sin Connect activo, "Configurar cobros de prueba" mostrará "Los cobros de prueba no están disponibles en este entorno.".
- [ ] No hay variables nuevas: valen `STRIPE_SECRET_KEY` (`sk_test_...`) y `APP_URL`.
- [ ] Aplica la migración `0004_connected_accounts` en Neon con `npm run db:migrate` (lo haces tú; los agentes no la ejecutan).
- [ ] **Spec 011c (Accounts v2):** la opción de compatibilidad con Accounts v1 del Dashboard **ya no es necesaria**; no hace falta activarla.
- [ ] **Precondición SQL (011c):** antes de probar, `SELECT user_id, stripe_account_id FROM connected_accounts WHERE stripe_account_id IS NOT NULL;` debe devolver **0 filas** (solo puede existir la fila con `stripe_account_id` nulo). Si devuelve alguna, resetea en modo de prueba con `DELETE FROM connected_accounts WHERE user_id = '<id>';`.

### A verificar de 011c (no comprobables sin red; ciérralos tú)

- [ ] (a) `POST /v2/core/accounts` con `dashboard: 'express'`, `fees_collector: 'application'`, `losses_collector: 'application'` y solo `stripe_transfers` se acepta para `identity.country` US en modo de prueba. Si Stripe exige otro valor: `fees_collector: 'application_express'`.
- [ ] (b) Grafía de `identity.country` (`us` o `US`) y de `defaults.currency` (`usd`); se asume minúscula. Se ajusta con el `message` de Stripe visible en el log.
- [ ] (c) Sin `include` la respuesta omite `configuration.recipient` y `requirements`; con `include: ['configuration.recipient', 'requirements']` los devuelve.
- [ ] (d) Un Account Link v2 `account_onboarding` sin `configurations` abre el onboarding de la configuración `recipient` y la URL es `https://*.stripe.com`.
- [ ] (e) Tras completar el onboarding con datos de prueba (`000000`, SSN `000-00-0000`, routing `110000000`, cuenta `000123456789`), `stripe_transfers.status` pasa a `active`.
- [ ] (f) Antes de completar el onboarding, `requirements.entries` trae entradas con `awaiting_action_from: 'user'` (base de `not_started`); tras enviar los datos desaparecen mientras Stripe verifica (`pending`).
- [x] (g) Un id de cuenta v2 (`acct_...`) acepta `stripe.transfers.create({ destination })` v1 (lo consume 011b) y la API v1 `accounts.retrieve` ya no es necesaria. **Verificado 2026-10-21:** `transfers.create` v1 hacia cuenta v2 `recipient` devolvió `tr_...` y `destination_payment`; basta con `destination`.
- [ ] (h) Código y tipo de error de `v2.core.accounts.retrieve` / `accountLinks.create` con una cuenta inexistente o de otra plataforma. Esperado: 404 como `StripeInvalidRequestError` (p. ej. `account_not_found`) y mensaje `ACCOUNT_UNAVAILABLE`.
- [ ] (i) Ventana real de la clave de idempotencia de `v2.core.accounts.create` (se asume al menos 24 h).
- [ ] (j) `account.closed === true` es una señal fiable de cuenta cerrada.
- [ ] (k) El Account Link v2 admite `return_url` y la sesión de Clerk (cookie `SameSite=Lax`) llega tras volver desde `connect.stripe.com`.

### Pasos

1. [ ] **Onboarding completo:** con la cuenta Desarrollador A, ve a "Cobros de prueba", pulsa "Configurar cobros de prueba", completa el formulario de Stripe con datos de prueba (teléfono de prueba, código `000000`, SSN `000-00-0000`, dirección `address_full_match`, routing `110000000`, cuenta `000123456789`; **a verificar** según el formulario vigente) y vuelve. La página muestra "Lista para recibir transferencias de prueba" y el aviso "Volviste desde Stripe...". En Neon hay una sola fila con `acct_...` y `status = 'active'`. En el Dashboard (Connect > Accounts) aparece una sola cuenta.
   - [ ] **Revisado en 011c (Accounts v2):** la cuenta se crea con configuración `recipient` y solo `stripe_balance.stripe_transfers`. Con los datos de prueba indicados, `stripe_transfers.status` debe pasar a `active` (a verificar (a), (b), (e)); antes de terminar, la etiqueta es "Sin configurar" o "En revisión" según (f).
   - [ ] **Log con el `message` de Stripe (011c):** provoca un 400 temporal (p. ej. cambia `CONNECTED_ACCOUNT_COUNTRY` a un país inválido en local, borra la fila con `stripe_account_id` nulo si hace falta y pulsa "Configurar"). El log del servidor muestra `type`, `code`, `statusCode`, `requestId` y el `message` de Stripe saneado (máx. 300 caracteres), sin `acct_...`, `sk_...`, correos ni URLs (aparecen como `[redacted]`). Restaura la constante después.
2. [ ] **Idempotencia:** antes de completar el onboarding, pulsa "Configurar" dos veces o en dos pestañas: queda una sola fila y una sola cuenta en Stripe. **A verificar:** la ventana real de la clave de idempotencia de `accounts.create` (se asume al menos 24 h, igual que en 009).
3. [ ] **Abandono y continuación:** sal del onboarding a mitad. La página muestra "Sin configurar" con "Continuar configuración en Stripe", que reanuda la misma cuenta.
4. [ ] **Enlace caducado:** reabre una URL de onboarding ya usada. Stripe redirige a `/dashboard/payouts/onboarding/refresh` y se abre un enlace nuevo. **A verificar:** que la sesión de Clerk llega a las URLs de return y refresh tras la redirección desde `connect.stripe.com` (cookie `SameSite=Lax`) y que la URL del enlace es `https://*.stripe.com`.
5. [ ] **En revisión y requiere acción:** con los datos de prueba que fuerzan verificación pendiente o fallida (**a verificar** en la documentación de pruebas de Connect), comprueba "En revisión por Stripe" o "Requiere acción" y que "Completar datos en Stripe" abre el onboarding.
6. [ ] **Actualizar estado:** cambia algo en el Dashboard (p. ej. rechaza la cuenta de prueba) y pulsa "Actualizar estado": la etiqueta cambia.
7. [ ] **Permisos:** con la cuenta Cliente, `/dashboard/payouts`, `/dashboard/payouts/onboarding/return` y `/dashboard/payouts/onboarding/refresh` dan 404 y el header no muestra "Cobros de prueba". Sin sesión, redirigen a `/sign-in`. El Desarrollador B no ve la cuenta de A.
8. [ ] **Configuración:** con `STRIPE_SECRET_KEY` live (`sk_live_...` ficticia) o sin ella, "Configurar" muestra "Los cobros de prueba no están disponibles en este entorno." y no escribe en Neon. Restaura la clave después.
9. [ ] **Cuenta inexistente:** borra la cuenta de prueba en el Dashboard y pulsa "Actualizar estado": aparece "No encontramos tu cuenta de cobros de prueba en Stripe. Contacta con el administrador.". **A verificar:** el código y tipo de error de Stripe en este caso (esperado `StripeInvalidRequestError` o `StripePermissionError` con `code` `account_invalid` o `resource_missing`). Reseteo manual (solo modo de prueba): `DELETE FROM connected_accounts WHERE user_id = '<id>';`.
10. [ ] **Privacidad y logs:** el log del servidor y el HTML de la página no contienen `acct_...`, URLs de onboarding, correos ni claves.
11. [ ] **Navegación:** el header del Desarrollador muestra "Mi panel" (-> `/dashboard`) y "Mi cuenta" (ya no "Cobros de prueba", ver 019 D15); los de Cliente, administrador y visitante no cambian.
12. [ ] **Responsive y accesibilidad** a 390 px: botones operables con teclado, foco visible, mensajes en `aria-live` y aviso "no es dinero real" visible.

## 8c. Spec 018 — Descripción de proyecto en Markdown

No requiere variables nuevas ni migración. Las filas antiguas en texto plano siguen funcionando.

1. [ ] **README completo:** con la cuenta Cliente, crea un proyecto con un README completo (títulos, negrita, cursiva, listas, lista de tareas, cita, tabla, código en línea y bloque de código, enlace). La pestaña "Vista previa" y el detalle público `/projects/[id]` (tras publicar) se ven iguales.
2. [ ] **Encabezados:** `#` y `##` salen como títulos de sección; la página no tiene un segundo título principal.
3. [ ] **Seguridad:** pega `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>` y `[x](javascript:alert(1))`. No se ejecuta nada, no aparece ninguna imagen y el enlace `javascript:` se muestra como texto sin enlace.
4. [ ] **Imágenes y enlaces:** `![logo](https://ejemplo.com/a.png)` muestra solo el texto "logo", sin petición de red (pestaña Network). Los enlaces `https://` abren en pestaña nueva con `rel` que incluye `noopener noreferrer nofollow ugc`.
5. [ ] **Catálogo:** `/projects` muestra el resumen sin símbolos (`##`, `**`, `|---|`) y el título de la pestaña/`meta description` del detalle es texto plano.
6. [ ] **Edición:** edita un proyecto `published` (la descripción sigue editable) y un borrador antiguo en texto plano; los saltos de línea simples de textos antiguos se ven unidos (comportamiento README esperado).
7. [ ] **Tablas y móvil:** a 390 px una tabla ancha hace scroll horizontal dentro de su contenedor, sin desbordar la página.
8. [ ] **Accesibilidad:** las casillas de tarea no son interactivas y el lector de pantalla anuncia "Completado"/"Pendiente"; el editor y la cabecera "Markdown" son operables con teclado.
9. [ ] **Propuestas en Markdown (mejora de 007/018):** como desarrollador, el formulario de propuesta usa el mismo editor que la descripción del proyecto (barra, pestañas Escribir/Vista previa, contador hasta 5000). Tras enviar, `Tu propuesta` y el detalle del cliente (`/projects/<id>/proposals`) muestran títulos, negritas, listas y enlaces con estilo; el HTML crudo, las imágenes y los enlaces `javascript:` no se renderizan.

## 8d. Spec 019 — Perfil del desarrollador y "Mi cuenta"

1. [ ] **Preparación:** el humano aplica la migración en Neon con `npm run db:migrate`. Cuentas: Desarrollador A, Desarrollador B, Cliente C (con un proyecto y una propuesta aceptada de A), Cliente D (sin relación), Admin (opcional) y un visitante en ventana de incógnito.
2. [ ] **Editor (A):** `/dashboard/account` aparece vacío. Guarda titular, ubicación, disponibilidad, biografía y 2 enlaces; recarga y comprueba que persisten. Cambia un campo y pulsa "Descartar cambios": vuelve al valor guardado.
3. [ ] **Validación:** prueba una biografía de 1001 caracteres, un enlace `http://x.com`, `javascript:alert(1)`, 6 enlaces y un correo inválido. Cada error sale junto a su campo, el foco va al primero y nada se guarda.
4. [ ] **Perfil público:** `/developers/<id de A>` sin sesión muestra el perfil sin correo. Escribe `<script>alert(1)</script>` en la biografía y comprueba que se ve como texto. Los enlaces llevan `rel="noopener noreferrer nofollow"`. El código fuente de la página no contiene el correo de contacto ni el de acceso.
5. [ ] **Privacidad del correo:** prueba `accepted_client`, `any_client` y `nobody` con C, D, B, Admin y el visitante. Con `accepted_client` solo C lo ve; con `any_client`, cualquier cliente con sesión; con `nobody`, nadie salvo A. Visitante, otro desarrollador y Admin no lo ven en ninguna opción. Anonimiza a A en Neon de prueba (o usa una cuenta ya anonimizada) y comprueba que el correo no aparece.
6. [ ] **Permisos:** Cliente y Admin reciben 404 en `/dashboard/account`; sin sesión redirige a `/sign-in`; B no ve ni edita lo de A; `/developers/<uuid de un cliente>` da 404.
7. [ ] **Header:** A ve "Proyectos", "Mi panel" (-> `/dashboard`) y "Mi cuenta" (resaltado en la cuenta) y no "Cobros de prueba". Los demás roles no ven "Mi cuenta".
8. [ ] **Cobros dentro de la cuenta:** la tarjeta "Cobros de prueba" abre `/dashboard/payouts`; allí "Volver a Mi cuenta" regresa. El onboarding de Stripe (return y refresh) sigue llevando a `/dashboard/payouts`.
9. [ ] **Sin perfil:** `/developers/<id de B>` antes de guardar muestra "Este desarrollador aún no completó su perfil".
10. [ ] **Responsive y accesibilidad** a 390 px: sin scroll horizontal (header con tres enlaces incluido), todo operable con teclado, foco visible, objetivos de 44 px y errores anunciados. No hay botones de subir foto.

## 8e. Spec 020 — Valoraciones del desarrollador

1. [ ] **Preparación:** el humano aplica la migración en Neon con `npm run db:migrate`. Cuentas: Cliente C (con un proyecto `contracted` y propuesta aceptada de Desarrollador A), Cliente D (sin relación), Desarrollador A, un proyecto no contratado de C y un visitante en ventana de incógnito.
2. [ ] **Valorar:** C abre `/projects/<id>/rate` desde "Valorar al desarrollador" (solo visible en proyectos `contracted`). Elige estrellas, escribe un comentario y comprueba el contador "n / 600" y su nombre abreviado en "Antes de enviar". Publica y aparece "Valoración publicada." con "Te quedan 14 días para editarla.".
3. [ ] **Casos rechazados:** `/projects/<id>/rate` de un proyecto no contratado da 404; con D (cliente ajeno) y con A (desarrollador) también 404. Una segunda valoración del mismo proyecto no crea otra fila.
4. [ ] **Editar:** dentro de la ventana, cambia estrellas y comentario y pulsa "Guardar cambios"; los datos se actualizan y los días restantes no aumentan.
5. [ ] **Ventana vencida (solo pruebas):** ejecuta `UPDATE developer_ratings SET created_at = now() - interval '15 days'` sobre esa fila. La página queda en solo lectura con "Ya no puedes editarla.".
6. [ ] **Perfil público sin sesión:** `/developers/<id de A>` muestra "4,6 · N valoraciones" (o "Aún sin valoraciones") y la sección "Valoraciones" con nombres abreviados, fecha y comentarios; sin valoraciones se ve el estado vacío.
7. [ ] **Mi cuenta:** A abre `/dashboard/account` y ve "Tu valoración" con el promedio con coma y "de 5 · N valoraciones". "Ver valoraciones recibidas" lleva a `/developers/<id de A>#valoraciones`. El resumen no aparece en el perfil público.
8. [ ] **Texto plano:** un comentario con `<script>alert(1)</script>` o `**negrita**` se ve literal, con saltos de línea respetados y textos largos sin desbordar.
9. [ ] **Responsive y accesibilidad** a 390 px: sin scroll horizontal en el formulario, la lista ni el resumen; las estrellas se operan con teclado, con foco visible, y el valor se anuncia (`aria-label`), no solo por color.

## 8f. Spec 011b — Transferencias de prueba al desarrollador (Stripe Connect, Test Mode)

Todo es de prueba: ninguna transferencia mueve dinero real y la UI lo indica con "Transferencia de prueba, no es dinero real". Cuentas: Cliente C (proyecto con propuesta aceptada de Desarrollador A), Desarrollador A, Desarrollador B y Cliente D.

### Preparación

- [ ] **Precondición:** el humano aplica la migración `0008_developer_transfers` en Neon con `npm run db:migrate` (los agentes no la ejecutan). No hay variables de entorno nuevas.
- [ ] Para la prueba de saldo (si hace falta): paga con la tarjeta `4000 0000 0000 0077` para que la plataforma tenga saldo de prueba disponible.

### A verificar (no comprobables sin red; ciérralos tú)

- [x] (a) `transfers.create` con `source_transaction` (cargo del PaymentIntent) y `destination` = cuenta v2 se acepta. La prueba verificada en 8b (g) fue sin `source_transaction`. **Verificado 2026-10-21** (proyecto SportSpace, 3.000 USD).
- [x] (b) Con `source_transaction` la transferencia no falla por saldo insuficiente aunque el cargo aún no esté disponible. **Verificado 2026-10-21** (el pago recién hecho se transfirió sin error de saldo).
- [ ] (c) La transferencia hereda el `transfer_group` del PaymentIntent (`group_pi_...`) y Stripe la acepta sin enviarlo explícitamente.
- [ ] (d) Repetir `transfers.create` con la misma clave devuelve el mismo `tr_...`; tras un rechazo 4xx la misma clave repite el error (base de la generación en la clave).
- [ ] (e) Ventana real de la clave de idempotencia de `transfers.create` (se asume al menos 24 h).
- [ ] (f) Latencia del webhook con la transferencia en línea (tres llamadas a Stripe): `stripe listen` no muestra timeouts ni reintentos del evento.
- [ ] (g) El Dashboard de Stripe muestra la transferencia con su `destination_payment` en la cuenta del desarrollador.

### Pasos

1. [ ] **Camino feliz:** con A en cuenta `active`, C paga con `4242 4242 4242 4242`. En la página de pago de C el paso 4 pasa a "Completado" con "Transferencia de prueba completada" y la etiqueta "Transferencia de prueba, no es dinero real". En `/dashboard/payouts` de A aparece la transferencia con el importe, el estado "Completada en Test Mode" y la etiqueta de prueba. En Neon: una fila con `status = 'completed_test'`, `stripe_transfer_id` `tr_...` y `completed_at`.
2. [ ] **Desarrollador sin cobros activos (propuestas ya enviadas antes de la mejora):** con A sin onboarding completo y una propuesta aceptada, C abre la página de pago: no hay botón de pago y dice "El desarrollador aún no configuró sus cobros de prueba. Podrás pagar cuando lo haga." A completa el onboarding ("Actualizar estado" con la cuenta `active`) y C recarga: ya aparece "Pagar con Stripe (prueba)". (Si la cuenta pasa a no activa después del pago, la transferencia queda "Pendiente" y se envía sola al reactivarse.)
3. [ ] **Reintento manual:** con una fila `pending` (p. ej. desconecta la red o quita temporalmente `STRIPE_SECRET_KEY` solo durante el pago), restaura y pulsa "Reintentar transferencia" en `/dashboard/payouts`: el botón muestra "Reintentando...", el resultado se anuncia y la fila pasa a "Completada en Test Mode". El botón no aparece si todas están completadas.
4. [ ] **`failed`:** provoca un rechazo definitivo (p. ej. borra la cuenta de A en el Dashboard y recréala con otro `acct_`, o fuerza un destino inválido en una copia local). La fila queda "Fallida" con el motivo amigable; "Reintentar transferencia" sube `retry_generation` (la clave pasa a `nexora:transfer:<id>:1`) y vuelve a llamar. El cliente ve "Transferencia de prueba fallida; el desarrollador puede reintentarla" y no tiene botón de reintento.
5. [ ] **Idempotencia:** envía dos veces el mismo evento con `stripe events resend <evt_...>` y pulsa "Reintentar transferencia" varias veces seguidas (o en dos pestañas): queda una sola fila y una sola transferencia en el Dashboard; el evento repetido entra como `duplicate`.
6. [ ] **Permisos:** Cliente y Admin reciben 404 en `/dashboard/payouts` (y no hay botón de reintento); sin sesión redirige a `/sign-in`. B no ve ni reintenta las transferencias de A. D no ve el estado de la transferencia de C (404 en su página de pago).
7. [ ] **Pago sin transferencia aún:** antes de pagar, el paso 4 es "Pendiente"; la sección "Transferencias de prueba" de A, sin filas, muestra "Aún no tienes transferencias de prueba.".
8. [ ] **Privacidad y logs:** el HTML de la página de pago y de `/dashboard/payouts` no contiene `acct_...`, `tr_...`, `pi_...` ni URLs de Stripe; el log del servidor solo trae `transferId`, `status`, `reason` y los campos saneados de `stripeErrorLogFields` (nunca `acct_`, `tr_`, importes, correos ni el objeto de Stripe). La fila guarda códigos propios en `last_error_code`, no el mensaje de Stripe.
9. [ ] **Responsive y accesibilidad** a 390 px: sin scroll horizontal, "Reintentar transferencia" operable con teclado, foco visible, objetivo táctil de 44 px, resultado anunciado en una región `aria-live` y el estado no depende solo del color.

- [ ] **Perfil del desarrollador visible para el cliente (mejora de 007/009/012/013):** como cliente, el nombre del desarrollador es un enlace (se abre en pestaña nueva) a `/developers/<id>` en: la tabla y el detalle de `/projects/<id>/proposals` (antes de elegir), `/projects/<id>/payment` y las filas "En contratación" de `/dashboard` (durante el proyecto). El perfil muestra bio en Markdown, titular, enlaces y valoraciones, sin correo salvo que el desarrollador lo haya hecho visible para clientes aceptados. El HTML de esas páginas contiene el id del desarrollador solo dentro de ese enlace.

## 8g. Spec 012 — Dashboard del cliente y cancelación de pago

Todo es de prueba: el bloque de pagos lleva "Modo de prueba · No se mueve dinero real". Cuentas: Cliente C (proyecto en `proposal_selected` con Desarrollador A), Desarrollador, Administrador y otro Cliente D. Para (b) hace falta **no** tener `stripe listen` activo.

- [ ] (a) **Cancelar sesión abierta:** con `proposal_selected`, inicia el pago y vuelve a `/dashboard` sin pagar; la fila muestra "Pendiente" y "Continuar o cancelar el pago". Cancela: queda "Cancelado", en Stripe la sesión aparece `expired`, y "Cerrar proyecto" ya no devuelve `PAYMENT_IN_PROGRESS`; también se puede reintentar el pago (intento nuevo).
- [ ] (b) **Carrera, pago ya completado:** paga en Stripe con `4242…` **sin** `stripe listen` (el intento sigue `pending` en Neon) y pulsa "Cancelar pago de prueba" en el panel: debe responder "El pago se completó antes de poder cancelarlo", el pago pasa a "Completado en Test Mode" y el proyecto a "En contratación"; nunca queda "Cancelado" sobre un pago pagado.
- [ ] (c) **Sesión ya expirada:** expira la sesión con `stripe checkout sessions expire <cs_test_...>` y cancela desde la app sin esperar al webhook: queda "Cancelado" (el `expire` de la app falla; la relectura la ve `expired`).
- [ ] (d) **Verificar el supuesto de Stripe:** con la sesión abierta en otra pestaña, cancela desde la app y confirma en la pestaña de Stripe que ya no se puede pagar.
- [ ] (e) **Doble clic o dos pestañas:** una cancelación efectiva, la otra informa que no hay pago pendiente.
- [ ] (f) **Cuentas:** developer ve su panel (013); admin recibe 404 en `/dashboard`; sin sesión redirige a `/sign-in`; otro cliente no ve ni cancela pagos ajenos.
- [ ] (g) **Header del cliente:** "Mi panel" lleva a `/dashboard` y queda resaltado también en `/dashboard/projects`.
- [ ] (h) **Transferencia:** con un proyecto contratado y transferencia `Pendiente`/`Completada en Test Mode`, el panel muestra el estado con "Transferencia de prueba, no es dinero real" y nunca "recibida".
- [ ] (i) **Responsive y accesibilidad:** a 390 px sin scroll horizontal; teclado y foco visible (el diálogo abre con foco en "Volver"); lector de pantalla anuncia el resultado en el botón de cancelar y el diálogo.

## 8h. Spec 013 — Dashboard del desarrollador

Todo es de prueba: el bloque de proyectos ganados lleva "Modo de prueba · No se mueve dinero real". Cuentas: Desarrollador A y B, Cliente, Administrador.

- [ ] (a) Desarrollador A sin cuenta de cobros: `/dashboard` muestra "Configurar cobros de prueba" y el enlace lleva a `/dashboard/payouts`; tras activar la cuenta y pulsar "Actualizar estado", el panel muestra "Lista para recibir transferencias de prueba" y desaparece la acción.
- [ ] (b) Con propuestas en los cuatro estados, los conteos coinciden con `/dashboard/proposals` y cada enlace `?status=` abre la lista filtrada.
- [ ] (c) Propuesta aceptada con el cliente sin pagar: aparece en "Proyectos ganados" con "Pago de prueba del cliente: No iniciado" y la acción informativa "Esperando el pago de prueba del cliente".
- [ ] (d) Pago completado con transferencia `pending`/`failed`: el panel muestra el estado con "Transferencia de prueba, no es dinero real" y la acción "Reintentar" enlaza a `/dashboard/payouts`, donde "Reintentar transferencia" funciona; completada: "Completada en Test Mode", nunca "recibida".
- [ ] (e) Valoraciones: sin ninguna, "Aún sin valoraciones"; tras valorar el cliente, promedio y cantidad coinciden con "Mi cuenta" y el enlace lleva al perfil público.
- [ ] (f) Cuentas: cliente ve su panel de 012 sin cambios; admin recibe 404 en `/dashboard`; el Desarrollador B no ve nada del A.
- [ ] (g) Header del desarrollador: "Mi panel" -> `/dashboard`, "Proyectos" y "Mi cuenta"; resaltado en `/dashboard/*` (en `/dashboard/account` solo "Mi cuenta", spec 014).
- [ ] (h) Sin red de Stripe: con la clave de Stripe inválida o ausente el panel carga igual (solo BD).
- [ ] (i) Responsive a 390 px (header de tres enlaces), teclado/foco y lector de pantalla.

## 8i. Spec 014 — Accesibilidad y feedback

- [ ] (a) Despublicar, cerrar y retirar abren un diálogo propio (no el `confirm` del navegador): foco inicial en "Cancelar", Tab y Shift+Tab no salen del diálogo, Escape lo cierra y el foco vuelve al botón que lo abrió.
- [ ] (b) Selección con propuesta modificada (008, "Versión vista"): el diálogo se queda abierto con el mensaje y el botón "Cerrar y recargar"; al pulsarlo se cierra y la página se recarga.
- [ ] (c) Con lector de pantalla, cancelar pago, actualizar pago, retirar y cerrar anuncian el resultado aunque el botón desaparezca.
- [ ] (d) En `/dashboard/account` (desarrollador) solo "Mi cuenta" está marcado como página actual (en `/dashboard` y `/dashboard/proposals`, "Mi panel").
- [ ] (e) A 390 px los diálogos no se desbordan.

- [ ] **Aviso visual (corrección posterior):** tras cancelar un pago, retirar una propuesta, actualizar el estado, reintentar una transferencia, etc., aparece un aviso breve abajo en pantalla (unos 6 s) con el resultado, aunque el botón haya desaparecido. Con lector de pantalla se anuncia una sola vez (el aviso visual está oculto para él).

## 8j. Spec 015 — Seguridad (rate limiting y CSP)

### Preparación

- [ ] (a) Aplica la migración antes de probar el limitador: `npm run db:migrate` (migración `drizzle/0009_dazzling_captain_america.sql`, tabla `rate_limit_hits`). Solo lo corre el humano.

### Rate limiting

- [ ] (b) Con una cuenta Cliente, supera el límite de una acción, por ejemplo "Actualizar estado" del pago (20 en 5 min): al pasarlo aparece el mensaje en español "Hiciste demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo." sin códigos internos.
- [ ] (c) Pasada la ventana (5 min), la acción vuelve a funcionar.
- [ ] (d) Otra cuenta no queda bloqueada por el límite de la primera.
- [ ] (e) El log del servidor solo muestra la política bloqueada (`[rate-limit] blocked`), sin id de usuario, correo ni IP.

### CSP en modo Report-Only (AC8)

- [ ] (f) Inicio de sesión, registro y onboarding funcionan igual que antes.
- [ ] (g) `/projects/<id>/payment` carga, la redirección a Stripe Checkout funciona y la vuelta a la app también.
- [ ] (h) El onboarding de cobros (Stripe Connect) funciona y vuelve a la app.
- [ ] (i) En la consola del navegador no hay violaciones de CSP sin explicar; las que aparezcan se resuelven en `directives` o se anotan aquí.
- [ ] (j) En Network, las respuestas de páginas traen `Content-Security-Policy-Report-Only` (no `Content-Security-Policy`) y las cabeceras `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` y `Strict-Transport-Security`; no hay `x-powered-by`.
- [ ] (k) `/api/webhooks/*` responde igual que antes (el webhook de Stripe con `stripe listen` sigue en 200; sin firma, 400).
- [ ] (l) Pasar la CSP a enforce lo decide un humano en la spec 017, tras esta lista.

## 8k. Spec 016 — Testing transversal

- [ ] (a) `npm run verify` (lint, tests y build) termina en verde.
- [ ] (b) `npm run test:coverage` termina en verde y respeta los umbrales (sentencias 73, ramas 59, funciones 62, líneas 73).
- [ ] (c) Bucle AC2: `src/app/api/webhooks/stripe/route.test.ts` y `route.flow.test.ts` pasan 50 veces seguidas cada uno, por ejemplo `for i in $(seq 50); do npx vitest run <archivo> || break; done`, sin ningún fallo (usan `tamperSignature`).
- [ ] (d) Nota: `coverage/` no está en `globalIgnores` de `eslint.config.mjs`; si `npm run lint` se ejecuta con una carpeta `coverage/` generada y reporta ruido, bórrala o añade la carpeta a los ignores (el archivo no lo toca esta tarea).
- [ ] (e) Los bloqueos reales de Postgres y la concurrencia entre conexiones siguen verificándose a mano (8f y 8g); ver sección 10.

## 8l. Spec 017 — Despliegue y smoke test en producción

Guía de referencia: `docs/DEPLOYMENT.md` ([1. Entornos y plataforma](DEPLOYMENT.md#1-entornos-y-plataforma), [2. Variables de entorno](DEPLOYMENT.md#2-variables-de-entorno), [3. Base de datos (Neon) y migraciones](DEPLOYMENT.md#3-base-de-datos-neon-y-migraciones), [4. Clerk](DEPLOYMENT.md#4-clerk), [5. Stripe (Test Mode)](DEPLOYMENT.md#5-stripe-test-mode), [6. Seguridad previa al lanzamiento](DEPLOYMENT.md#6-seguridad-previa-al-lanzamiento), [7. Observabilidad y recuperación](DEPLOYMENT.md#7-observabilidad-y-recuperación), [8. Rollback](DEPLOYMENT.md#8-rollback), [9. Acciones del humano](DEPLOYMENT.md#9-acciones-del-humano)).

La demo corre en `https://<proyecto>.vercel.app` con Clerk en modo Development y Stripe en Test Mode. En producción `stripe listen` no es necesario: el webhook lo entrega Stripe al endpoint desplegado `https://<dominio>/api/webhooks/stripe`. No pegues secretos ni URLs reales en este documento; usa solo marcadores `<...>`.

### Preparación

- [ ] (a) Completa antes las "Acciones del humano" ([9](DEPLOYMENT.md#9-acciones-del-humano)): variables de entorno ([2](DEPLOYMENT.md#2-variables-de-entorno)), migraciones en Neon ([3](DEPLOYMENT.md#3-base-de-datos-neon-y-migraciones)), Clerk ([4](DEPLOYMENT.md#4-clerk)) y endpoint de webhook en Stripe Test Mode ([5](DEPLOYMENT.md#5-stripe-test-mode)).

### Flujo completo en producción

- [ ] (b) Regístrate con dos cuentas nuevas en `https://<dominio>` y elige rol: una Cliente y una Desarrollador.
- [ ] (c) Con la cuenta Cliente, publica un proyecto.
- [ ] (d) Con la cuenta Desarrollador, envía una propuesta al proyecto.
- [ ] (e) Con la cuenta Cliente, selecciona la propuesta ganadora.
- [ ] (f) Paga en `/projects/<id>/payment` con la tarjeta de prueba `4242 4242 4242 4242` (fecha futura y CVC cualquiera) y vuelve a la app.
- [ ] (g) Webhook recibido: en Dashboard de Stripe (Test Mode) > Developers > Webhooks, el evento `checkout.session.completed` figura con `200`, y en `processed_payment_events` existe la fila con estado `applied`.
- [ ] (h) La transferencia de prueba al desarrollador queda en `completed_test`.
- [ ] (i) La cuenta de cobros v2 del desarrollador (Stripe Connect) aparece `active`.

### Seguridad y rollback

- [ ] (j) Las cabeceras de seguridad coinciden con 8j (j): `Content-Security-Policy-Report-Only` (salvo que un humano haya pasado a enforce), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, `Strict-Transport-Security`, y no hay `x-powered-by`.
- [ ] (k) Un `POST` sin firma a `https://<dominio>/api/webhooks/stripe` (por ejemplo `curl -i -X POST https://<dominio>/api/webhooks/stripe -d '{}'`) responde 400.
- [ ] (l) Plan de rollback ([8. Rollback](DEPLOYMENT.md#8-rollback)) revisado: se puede volver al despliegue anterior en Vercel, pero las migraciones de Drizzle solo van hacia delante. Advertencia: volver el código atrás no revierte la base de datos; antes de migrar, confirma que el código anterior tolera el esquema nuevo (o ten un respaldo/rama de Neon, ver [7](DEPLOYMENT.md#7-observabilidad-y-recuperación)).

## 8m. Spec 022a — Tema, header y footer globales

Compara cada punto con `docs/assets/3-paneles/Main.dc.html` (header) a **1440 px** y a **390 px** (modo dispositivo de DevTools). Cuentas: visitante (incógnito), Cliente y Desarrollador A.

- [ ] (a) **Fuente:** en `/`, `/projects`, `/dashboard`, `/sign-in` y un 404 el texto se ve en Plus Jakarta Sans (DevTools -> Rendered Fonts); en la pestaña Network no hay peticiones a `fonts.googleapis.com`.
- [ ] (b) **Idioma y título:** `document.documentElement.lang` es `es`; el título de la pestaña en `/` es el de Nexora (no "Create Next App"); las demás páginas conservan su título.
- [ ] (c) **Favicon:** la pestaña muestra el símbolo verde/negro de Nexora (recarga forzada, Ctrl+F5); no aparece el icono de Next.
- [ ] (d) **Header (1440 px):** fondo blanco, símbolo + "nexora", chip "Modo de prueba" siempre visible, y para Cliente "Mi panel · Proyectos", para Desarrollador "Mi panel · Proyectos · Mi cuenta", para visitante "Proyectos · Iniciar sesión" + "Registrarse"; la página actual aparece con píldora verde suave y solo una.
- [ ] (e) **Header (390 px):** sin scroll horizontal; se ven símbolo, "nexora", chip, avatar (o "Registrarse") y botón de menú; el menú despliega todos los enlaces, se cierra con un enlace, con `Escape` y con un segundo clic; Escape devuelve el foco al botón.
- [ ] (f) **Teclado y foco:** Tab recorre logo, enlaces, avatar y botón de menú con anillo de foco visible y orden lógico; ningún control mide menos de 44 px (inspección).
- [ ] (g) **Clerk:** el menú del avatar abre y "Cerrar sesión" funciona; no hay errores de hidratación en consola al cargar con sesión iniciada ni al recargar.
- [ ] (h) **Footer:** aparece en todas las páginas (incluida `/sign-in` y el 404) pegado al final cuando el contenido es corto; muestra marca, frase, "Proyectos", "© año Nexora. Proyecto de demostración." y "Pagos procesados por Stripe en modo de prueba."; se ve bien a 390 px; el enlace "Proyectos" tiene foco visible.
- [ ] (i) **Sin regresiones funcionales:** los avisos de `LiveAnnouncer` (014) siguen apareciendo encima del footer; ningún dashboard, formulario ni diálogo pierde función (solo cambian color y tipografía hasta las fases B-D).
- [ ] (j) **Consola:** sin violaciones nuevas de CSP (Report-Only) ni advertencias de `next/image`.

## 8n. Spec 022b — Landing y listado de proyectos

Compara con `docs/assets/2-landing/Main.dc.html` y `docs/assets/3-paneles/Projects.dc.html` a **1440 px** y **390 px**. Cuentas: visitante (incógnito), Cliente, Desarrollador A, y (opcional) Administrador. Prepara al menos 8 proyectos publicados con tecnologías distintas y uno en borrador.

- [ ] (a) **Landing visitante:** `/` muestra hero, proyectos publicados, cómo funciona, por qué Nexora, para desarrolladores, preguntas, llamada final y footer; un solo `h1`; las 3 fotos cubren de fondo toda la sección hero (casi transparentes bajo el texto, más visibles hacia la derecha), cambian cada 3 s, se pausa con el cursor, el foco y el botón "Pausar carrusel", y queda fijo con "reducir movimiento" activo (corrección posterior a 022b: sustituyó a la vista previa "Ejemplo ilustrativo").
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

## 8o. Spec 022e — Login y registro a pantalla dividida

Cuentas: visitante (incógnito) y una cuenta de prueba de Clerk (Test Mode). Probar a **1440 px** y **390 px** (modo dispositivo de DevTools).

- [ ] (a) **1440 px, `/sign-in` y `/sign-up`:** dos mitades iguales; izquierda, carrusel; derecha, formulario de Clerk fundido con el panel (sin tarjeta con sombra), botón primario verde `#183D30`, tipografía Plus Jakarta Sans, esquinas de 10 px; header y footer visibles, con el chip "Modo de prueba".
- [ ] (b) **Carrusel:** cada 3 s la imagen se desliza hacia la izquierda; las tres imágenes rotan en bucle sin parpadeo ni retroceso al dar la vuelta.
- [ ] (c) **Pausa:** el ratón sobre el carrusel lo detiene y al salir se reanuda; "Pausar carrusel" lo detiene y el botón pasa a "Reproducir carrusel"; el botón se alcanza con Tab, se activa con Enter/Espacio, mide >= 44 px y muestra foco.
- [ ] (d) **Reduced-motion:** activar "Reducir movimiento" en el SO (o Rendering -> Emulate `prefers-reduced-motion: reduce` en DevTools) y recargar: imagen estática, sin avance, sin botón de pausa.
- [ ] (e) **Teclado y foco:** Tab recorre header, campos, botón primario y enlace "Sign up"/"Sign in" del pie de Clerk con foco visible y orden lógico; cada control mide >= 44 px; el foco nunca queda atrapado en el carrusel.
- [ ] (f) **390 px:** el carrusel no se ve; el formulario ocupa todo el ancho útil; sin scroll horizontal (también a 320 px); Network no descarga `/auth/*` ni `/_next/image` de `login-*`.
- [ ] (g) **Flujo real login:** desde el landing/Proyectos, "Iniciar sesión" -> `/sign-in?redirect_url=...` -> iniciar sesión con la cuenta de prueba vuelve a la página de origen; sin sesión previa, redirige según las variables de entorno (comportamiento igual que antes de 022e).
- [ ] (h) **Flujo real registro:** crear una cuenta de prueba en `/sign-up` -> llega a `/onboarding` (elegir rol) y de ahí al panel, sin errores.
- [ ] (i) **Consola y red:** sin violaciones nuevas de CSP (Report-Only), sin advertencias de `next/image` ni errores de hidratación; las imágenes vienen del propio origen.
- [ ] (j) **Límites conocidos:** el formulario de Clerk está en inglés (decisión documentada, P3) y puede mostrar "Secured by Clerk"/"Development mode" según la instancia.

- [ ] **Header y footer en el acceso (corrección posterior):** en `/sign-in` y `/sign-up` el header solo tiene el logo y el chip "Modo de prueba" (sin enlaces, "Registrarse" ni menú) y no hay footer; en el resto de páginas el header y el footer son los normales.

## 8p. Spec 022c — Paneles, pago y propuestas

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

## 8q. Spec 022d — Perfiles, proyecto y formularios

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

## 8r. Spec 023 — Foto de perfil de Google

Requiere una cuenta de **Google real** con foto (AC12), una cuenta correo/contraseña sin foto, una cuenta Cliente y una ventana de incógnito.

- [ ] (a) **Previo:** el humano corrió `npm run db:migrate` (columna `users.image_url`) antes de probar.
- [ ] (b) **Con foto de Google:** tras registrarse como Desarrollador con la cuenta de Google, `users.image_url` no es `NULL` (si lo es, revisar si la URL real de Clerk trae query string: la validación la rechaza, 023 D5). `/developers/<id>` y "Mi cuenta" muestran la foto.
- [ ] (c) **Sin foto:** con la cuenta correo/contraseña (sin foto) se ven las iniciales en el perfil, "Mi cuenta", propuestas, pago y "En contratación".
- [ ] (d) **Visitante:** en una ventana de incógnito, `/developers/<id>` muestra la foto sin sesión, también si el desarrollador aún no completó su perfil.
- [ ] (e) **Layout:** a 1440 px y a 390 px los avatares tienen el mismo tamaño que antes y no hay saltos de layout al cargar la foto.
- [ ] (f) **Imagen rota:** con la imagen bloqueada (DevTools: bloquear `/_next/image`) o rota se ven las iniciales.
- [ ] (g) **Cambios en Clerk:** cambiar o quitar la foto en Clerk se refleja al abrir "Mi cuenta" y, con el webhook desplegado, al llegar `user.updated`; en local sin webhook, solo al abrir "Mi cuenta".
- [ ] (h) **Cliente:** una cuenta Cliente no guarda ni muestra foto (`image_url` queda `NULL`) y las valoraciones del perfil siguen con iniciales.
- [ ] (i) **Consola:** no hay avisos de CSP por `img.clerk.com` (la CSP sigue en Report-Only).
- [ ] (j) **Dónde se ve:** la foto del desarrollador aparece en la fila y el detalle de propuestas, la tarjeta "Desarrollador seleccionado" de la página de pago, la tabla "En contratación" del panel del cliente y la cabecera del formulario de valoración.

## 9. Revisión visual transversal

- [ ] Todas las pantallas nuevas respetan la paleta (verde bosque `#183D30`, off-white `#F5F6F2`, verde suave `#DCE6DE`) y se ven coherentes con los artboards.
- [ ] Todos los controles son alcanzables y operables con teclado, con foco visible.
- [ ] Ningún texto queda en inglés en la interfaz.

## 10. Pendientes que no son pruebas, sino decisiones o mejoras ya detectadas

Estas notas no bloquean, pero conviene tenerlas a la vista:

- La spec 010 refleja el pago por webhook verificado o por "Actualizar estado"; sin `stripe listen` (o un endpoint de webhook en despliegue, spec 017, ver 8l) un pago hecho en Stripe solo se confirma pulsando ese botón. 009 y 010 no deben llegar a usuarios finales por separado.
- Un intento de pago abandonado se cancela con el evento `checkout.session.expired` o con "Actualizar estado"; si el webhook falta y el cliente no vuelve, queda `pending` y bloquea el cierre (`PAYMENT_IN_PROGRESS`) hasta cancelarlo. La cancelación explícita ya existe (spec 012): el cliente pulsa "Cancelar pago de prueba" en `/dashboard` o en la página de pago del proyecto, confirma el diálogo y, cuando Stripe confirma la sesión como `expired`, el intento queda `canceled` y puede reintentar el pago o cerrar el proyecto (sección 8g).
- Rate limiting de las acciones sensibles (incluido el refresco de pago y de cuenta de cobros): resuelto en la spec 015 (límite por usuario en Neon; pruebas en la sección 8j).
- Webhook de Stripe (spec 015, D3): no se limita por IP; tiene un tope de 1 MiB del cuerpo (responde `413`) y la firma sigue siendo la única autenticación. Un techo por IP, si hiciera falta, se resolvería con Upstash en la spec 017.
- Spec 011a: el webhook `account.updated` (Connect) queda diferido; sin él, un cambio hecho por Stripe tras volver del onboarding solo se ve con "Actualizar estado" o al volver a pasar por el retorno.
- El header global ya existe (spec 009b, sección 7b). La metadata global, el `lang` y el favicon quedaron resueltos en la spec 022a (sección 8m); landing resuelto en 022b.
- La paginación del catálogo solo tiene "Anterior / Siguiente", sin números de página.
- Un proyecto publicado con una categoría que ya no esté en la lista no podría editar su título. Es hipotético hasta que cambie la lista de categorías.
- `npm audit` (spec 016, T0): las vulnerabilidades de producción críticas quedaron corregidas. `npm audit` pasó de 17 (1 crítica, 11 altas, 5 moderadas) a 15 (0 críticas, 10 altas, 5 moderadas); con `--omit=dev` pasó de 10 (incluía `next` crítica) a 9 y `next` ya no aparece. `next` subió de 16.3.8 a 16.4.2 (corrige RCE del optimizador de imágenes SVG, RCE de `use cache` y DoS de Server Actions), `eslint-config-next` a 16.4.2 y `vite` de 8.3.2 a 8.3.5 (sin avisos). Nunca se usa `npm audit fix --force`. Quedan registradas sin aplicar porque npm solo propone majors o downgrades (`shadcn@1.0.0`, `drizzle-kit@0.18.1`, `eslint-config-next@14.2.35`):
  - CLI `shadcn` y su cadena (`@shadcn/registry`, `ts-morph`, `@ts-morph/common`, `braces`, `micromatch`, `fast-glob`, `@modelcontextprotocol/sdk`, `ip-address`): en runtime solo se importa `shadcn/tailwind.css` (CSS de build).
  - `drizzle-kit`, `esbuild` y `@esbuild-kit/*`: herramientas de desarrollo.
  - `eslint-config-next` y `@next/eslint-plugin-next`: herramientas de desarrollo.

  Ninguna llega al bundle ni al servidor. Revisar cuando salgan versiones corregidas.
- Bloqueos reales de Postgres/Neon (`FOR UPDATE`, `FOR SHARE`, upsert `ON CONFLICT` del rate limit) y concurrencia entre conexiones: **no están cubiertos por la suite** (PGlite tiene una sola conexión). Se probaron a mano en 8f y 8g, y no hay suite contra Neon (decisión Q2 de la spec 016). Los tests de PGlite solo demuestran la coherencia del resultado.
- Cobertura (spec 016): global medida con `npm run test:coverage` en sentencias 75.90, ramas 61.76, funciones 64.02 y líneas 75.14; umbrales en 73/59/62/73.

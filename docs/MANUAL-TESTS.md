# Nexora — Pruebas manuales pendientes

**Estado:** vivo (se actualiza al cerrar cada spec)
**Cubre:** specs 003 a 009b (las specs 001 y 002 son documentales)

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

Esta spec solo **crea** el pago de prueba. La confirmación (`completed_test`) y el paso a "Contratado" llegan con la spec 010: en esta fase un pago hecho en Stripe nunca se refleja como completado.

### Preparación con Stripe (una sola vez)

- [ ] Crea una cuenta de Stripe y quédate en **modo de prueba** (sandbox / Test Mode). No actives la cuenta para cobros reales.
- [ ] En el panel de Stripe (modo prueba, Developers -> API keys) copia la **clave secreta de prueba** (`sk_test_...`, nunca una `sk_live_`) y pégala en `.env.local` como `STRIPE_SECRET_KEY`.
- [ ] En `.env.local` añade `APP_URL=http://localhost:3000` (o el puerto que uses). Ninguna de las dos variables lleva prefijo `NEXT_PUBLIC_`.
- [ ] Reinicia `npm run dev` para que lea las variables.
- [ ] Para pagar en la página de Stripe usa la tarjeta `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y cualquier código postal.
- La CLI de Stripe (`stripe login`, `stripe listen`) y `STRIPE_WEBHOOK_SECRET` **no** hacen falta aquí: son solo para la spec 010.

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
  - [ ] El panel dice "Pendiente de confirmación del servidor". **Nunca** aparece "completado" ni "pagado" (eso llega con la spec 010).
  - [ ] La fila sigue `pending` y el proyecto sigue en `proposal_selected`.
  - [ ] Pulsar "Continuar en Stripe" no crea otro pago: responde "Ya hay un pago de prueba en curso, pendiente de confirmación del servidor.".
- [ ] **Parámetro manipulado:** escribir `?checkout=success` a mano en la URL de un proyecto sin pago iniciado no cambia ningún estado y el panel sigue mostrando el estado real ("Aún no iniciaste el pago de prueba."). Probar también `?checkout=cualquiercosa`: no muestra aviso.
- [ ] **Cierre bloqueado:** con un intento `pending`, "Cerrar proyecto" en `/dashboard/projects` falla con `PAYMENT_IN_PROGRESS` ("No puedes cerrar el proyecto mientras haya un pago en curso.").
- [ ] **Sesión vencida (opcional, tarda 60 minutos):** pasado ese tiempo sin pagar, pulsar el botón cancela el intento viejo (`canceled`) y crea uno nuevo con otra sesión; solo hay uno activo.

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
- [ ] Aparece "Mis proyectos" y lleva a `/dashboard/projects`; en esa página queda resaltado.
- [ ] No aparece "Mis propuestas".
- [ ] La cabecera se ve igual en `/dashboard/projects`, `/projects/new`, `/projects/<id>/edit` y `/projects/<id>/payment` (con un proyecto en `proposal_selected`), sin duplicarse.
- [ ] Desde `/projects/new` se puede volver a "Proyectos" y a "Nexora" sin escribir la URL.

### Cuenta Desarrollador

- [ ] Aparece "Mis propuestas" y lleva a `/dashboard/proposals`; en esa página queda resaltado. No aparece "Mis proyectos".
- [ ] Desde el detalle de un proyecto publicado se llega a "Mis propuestas" con un clic.

### Cuenta recién registrada, sin rol

- [ ] Tras registrarte y antes de elegir rol, la cabecera muestra el avatar y el enlace "Completar registro" hacia `/onboarding`.
- [ ] Al elegir un rol y volver a `/`, "Completar registro" es sustituido por "Mis proyectos" o "Mis propuestas" según el rol.

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

## 8. Revisión visual transversal

- [ ] Todas las pantallas nuevas respetan la paleta (verde bosque `#183D30`, off-white `#F5F6F2`, verde suave `#DCE6DE`) y se ven coherentes con los artboards.
- [ ] Todos los controles son alcanzables y operables con teclado, con foco visible.
- [ ] Ningún texto queda en inglés en la interfaz.

## 9. Pendientes que no son pruebas, sino decisiones o mejoras ya detectadas

Estas notas no bloquean, pero conviene tenerlas a la vista:

- Sin la spec 010 un pago hecho en Stripe no se refleja como completado; 009 y 010 no deben llegar a usuarios finales por separado.
- Hasta la spec 010 (o la cancelación explícita de la 012), un intento de pago abandonado queda `pending` y bloquea el cierre del proyecto (`PAYMENT_IN_PROGRESS`); la sesión vence a los 60 minutos y solo se reconcilia al pulsar el botón de pago.
- El header global ya existe (spec 009b, sección 7b). El landing de `/` y la metadata global (título, `lang`, 404 con marca) siguen pendientes; la spec 006 los recomendó en una spec propia (`006b-landing-and-site-header`).
- La paginación del catálogo solo tiene "Anterior / Siguiente", sin números de página.
- En la spec 008, con algunos errores raros de selección el diálogo puede cerrarse al refrescar sin mostrar el mensaje. Se pulirá en la spec 014.
- `window.confirm` se usa de forma provisional al despublicar, cerrar y retirar. La spec 014 lo sustituirá por un diálogo accesible.
- Un proyecto publicado con una categoría que ya no esté en la lista no podría editar su título. Es hipotético hasta que cambie la lista de categorías.
- `npm audit` reporta vulnerabilidades en el árbol de dependencias. Pendiente de revisar antes del despliegue.
- Los tests no demuestran los bloqueos reales de Postgres (`FOR UPDATE`, `FOR SHARE`) porque PGlite tiene una sola conexión. Se validaron leyendo el SQL. La spec 016 debería cubrirlos contra una rama real de Neon.

# Máquinas de estado

Define las 4 máquinas de estado de Nexora: proyecto, propuesta, intento de pago y transferencia. Los identificadores de estado son canónicos (inglés, snake_case) y la columna "Etiqueta" es el texto de UI aprobado. Origen normativo: `docs/specs/002-product-domain-and-architecture.md` (RF4 y sección 9). `system-design.md §5` solo resume y enlaza este documento.

Reglas transversales:

- Ninguna transición a `completed_test` (pago) ni a `contracted` (proyecto) la dispara la página de retorno del navegador ni una acción del cliente. Ambas dependen de un webhook de Stripe verificado en servidor (firma válida).
- Todo estado de pago es de Test Mode (`livemode=false`) y nunca se presenta como dinero real.
- Las transiciones entre módulos se hacen mediante funciones de transición expuestas por el módulo dueño, nunca por SQL directo desde otro módulo.

---

## 1. Proyecto (`project.status`)

| Id | Etiqueta |
|---|---|
| `draft` | Borrador |
| `published` | Publicado |
| `proposal_selected` | Con propuesta seleccionada · pendiente de pago |
| `contracted` | En contratación |
| `closed` | Cerrado |

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> published: cliente propietario
    published --> draft: cliente propietario (sin propuestas)
    published --> proposal_selected: sistema (transaccion de seleccion)
    proposal_selected --> contracted: sistema (webhook verificado, pago completed_test)
    published --> closed: cliente propietario o admin
    proposal_selected --> closed: cliente propietario o admin
    contracted --> closed: cliente propietario o admin
    closed --> [*]
```

| Transición | Quién la dispara | Condición |
|---|---|---|
| `draft -> published` | Cliente propietario | Datos del proyecto válidos (spec 005) |
| `published -> draft` | Cliente propietario | Solo si no tiene propuestas (D3) |
| `published -> proposal_selected` | Sistema, dentro de la transacción de selección iniciada por el cliente propietario | El proyecto sigue en `published`; la propuesta seleccionada está en `pending` |
| `proposal_selected -> contracted` | Sistema, tras procesar un webhook verificado que deja el pago en `completed_test` | Intento de pago asociado a la propuesta ganadora. Nunca por el navegador ni por acción del cliente |
| `published -> closed` | Cliente propietario (o administrador) | Cierre manual; las propuestas `pending` pasan a `rejected` |
| `proposal_selected -> closed` | Cliente propietario (o administrador) | Cancelación antes de pagar; solo mientras no exista pago `completed_test`. Con un intento `pending`, se cancela o se espera su resolución (D2; detalle en specs 010/012) |
| `contracted -> closed` | Cliente propietario (o administrador) | Cierre manual tras la contratación |

Estado terminal: `closed`.

Notas:

- `draft` no pasa a `closed` en el MVP: un borrador se edita o se descarta (el borrado queda para la spec 005).
- Solo `published` admite nuevas propuestas.
- No se reabre la selección (`proposal_selected -> published`) en el MVP (D2).

---

## 2. Propuesta (`proposal.status`)

| Id | Etiqueta |
|---|---|
| `pending` | Pendiente |
| `accepted` | Aceptada |
| `rejected` | Rechazada |
| `withdrawn` | Retirada |

```mermaid
stateDiagram-v2
    [*] --> pending: desarrollador autor (proyecto published)
    pending --> accepted: sistema (transaccion de seleccion)
    pending --> rejected: sistema (seleccion de otra o cierre sin ganador)
    pending --> withdrawn: desarrollador autor
    accepted --> [*]
    rejected --> [*]
    withdrawn --> [*]
```

| Transición | Quién la dispara | Condición |
|---|---|---|
| (creación) -> `pending` | Desarrollador autor | Proyecto en `published`; usuario con rol `developer`; no es el propietario del proyecto; máximo una propuesta por desarrollador por proyecto (D5) |
| `pending -> accepted` | Sistema, dentro de la transacción de selección (acción del cliente propietario) | Exactamente una por proyecto |
| `pending -> rejected` | Sistema, en la misma transacción de selección para las demás; o al cerrarse el proyecto sin ganador | Proyecto cerrado o con otra propuesta seleccionada |
| `pending -> withdrawn` | Desarrollador autor | Solo mientras el proyecto está `published` |

Estados terminales: `accepted`, `rejected`, `withdrawn`. Una propuesta `accepted` no se retira en el MVP.

---

## 3. Intento de pago (`paymentAttempt.status`)

La ausencia de intento equivale a "No iniciado" (no es un estado almacenado).

| Id | Etiqueta |
|---|---|
| `pending` | Pendiente |
| `completed_test` | Completado en Test Mode |
| `failed` | Fallido |
| `canceled` | Cancelado |

```mermaid
stateDiagram-v2
    [*] --> pending: servidor (cliente propietario inicia pago)
    pending --> completed_test: webhook verificado (exito)
    pending --> failed: webhook verificado (fallo)
    pending --> canceled: webhook verificado (sesion expirada) o cancelacion del servidor
    completed_test --> [*]
    failed --> [*]
    canceled --> [*]
```

| Transición | Quién la dispara | Condición |
|---|---|---|
| (creación) -> `pending` | Servidor, al pedir el cliente propietario iniciar el pago | Proyecto en `proposal_selected`; no existe otro intento `pending`/`completed_test` para el proyecto. Importe y moneda salen de la propuesta ganadora guardada en servidor |
| `pending -> completed_test` | Webhook de Stripe verificado (firma válida) | Evento de éxito. La página de retorno nunca dispara esta transición |
| `pending -> failed` | Webhook de Stripe verificado | Evento de fallo de pago |
| `pending -> canceled` | Webhook de Stripe verificado (sesión expirada) o cancelación explícita del servidor al abandonar la sesión | La redirección de cancelación del navegador solo informa; no cambia el estado por sí sola |

Estados terminales: `completed_test`, `failed`, `canceled`.

Reglas:

- Un reintento crea un intento nuevo.
- Un evento tardío o repetido nunca revierte `completed_test` ni reabre un estado terminal.
- La spec 010 detalla el mapeo exacto de eventos de Stripe.

---

## 4. Transferencia al desarrollador (`transferStatus`)

La transferencia es independiente del pago: son estados y entidades distintos. Que el pago esté en `completed_test` no implica que el desarrollador haya recibido nada.

| Id | Etiqueta | Cuándo |
|---|---|---|
| `not_applicable` | No aplicable | Derivado: no existe pago `completed_test` para el proyecto. No se almacena |
| `pending_implementation` | Pendiente de implementación | Derivado en el MVP inicial: existe pago `completed_test` y Stripe Connect aún no está implementado |
| `simulated` | Simulada | Solo si la spec 011 incorpora Connect en test mode o simulación almacenada |

```mermaid
stateDiagram-v2
    [*] --> not_applicable
    not_applicable --> pending_implementation: derivada (pago pasa a completed_test)
    pending_implementation --> simulated: sistema (spec 011)
    simulated --> [*]
```

| Transición | Quién la dispara | Condición |
|---|---|---|
| `not_applicable -> pending_implementation` | Derivada automáticamente al pasar el pago a `completed_test` | Sin acción de usuario |
| `pending_implementation -> simulated` | Sistema (spec 011, última fase) | Pago `completed_test`; flujo de test aprobado |

Reglas:

- Hasta la spec 011 no existe la tabla `simulatedTransfer`; el estado se deriva del pago (D6).
- `pending_implementation` y `simulated` nunca se muestran como dinero recibido por el desarrollador.
- `simulated` es el estado final de esta máquina en el alcance actual.

---

## 5. Casos límite

- Dos selecciones simultáneas del mismo proyecto: solo una gana; la otra recibe error de conflicto (máximo una selección por proyecto).
- Retirada de propuesta concurrente con la selección de esa propuesta: gana la que se confirma primero; la otra falla sin dejar estado inconsistente.
- Webhook repetido: no cambia el estado (idempotencia por `processedPaymentEvent`).
- Webhook fuera de orden (por ejemplo `canceled` o `failed` tras `completed_test`): se ignora la regresión.
- Pago `failed` o `canceled`: el proyecto permanece en `proposal_selected` y puede crearse un nuevo intento.
- Retorno del navegador a la URL de éxito antes del webhook: la UI muestra "verificando"; no se afirma pago completado.
- Cliente intenta cerrar un proyecto con pago `pending`: comportamiento a definir en las specs 010/012 (D2).
- Usuario sin fila interna aunque exista en Clerk (primer ingreso, sincronización pendiente): spec 004.

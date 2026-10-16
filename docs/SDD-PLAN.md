# Nexora — Software Design Document Plan

**Estado:** Borrador para revisión  
**Versión:** 0.2  
**Documento relacionado:** `docs/BRIEF.md`

## 1. Propósito

Definir el proceso de especificación y desarrollo de Nexora mediante documentos pequeños, verificables y ordenados por dependencias.

El objetivo es convertir el brief de producto en especificaciones técnicas y funcionales que puedan implementarse y probarse de forma incremental.

Este documento organiza el trabajo futuro. No autoriza por sí mismo la implementación de código ni la instalación de dependencias.

## 2. Reglas de trabajo

1. Revisar el template existente antes de proponer cambios.
2. Identificar las convenciones actuales de carpetas, componentes, validación, pruebas y configuración.
3. Reutilizar las capacidades existentes cuando sean compatibles con los requisitos.
4. Mantener las especificaciones dentro de `docs/specs/`, siguiendo la convención de numeración del repositorio.
5. Cada especificación debe incluir objetivo, alcance, dependencias, reglas de negocio, cambios de datos, criterios de aceptación y pruebas.
6. Una especificación debe ser aprobada por una persona antes de iniciar su implementación.
7. No implementar funcionalidades que no estén incluidas en una especificación aprobada.
8. No instalar paquetes hasta que una especificación aprobada justifique su necesidad.
9. Separar decisiones confirmadas, supuestos y cuestiones pendientes.
10. No considerar una operación de Stripe completada únicamente porque el usuario regresa a una página de éxito.
11. No registrar ni mostrar pagos de prueba como dinero real.
12. No avanzar a transferencias reales sin una especificación adicional y una revisión del modelo de Stripe Connect.

## 3. Fase 0 — Auditoría del repositorio

**Documento sugerido:** `docs/specs/001-repository-audit.md`

### Objetivo

Determinar cómo debe integrarse Nexora en el template existente sin duplicar herramientas o convenciones.

### Revisar

- Estructura de Next.js y App Router.
- Versiones y configuración de TypeScript.
- Convenciones de módulos y componentes.
- Sistema de estilos y componentes de interfaz.
- Configuración de formularios y validación.
- Acceso a PostgreSQL y configuración del ORM.
- Integración existente con Clerk, si la hubiera.
- Pruebas, linting y convenciones de calidad.
- Agentes, reglas y flujo de aprobación de especificaciones.
- Gestión de variables de entorno y secretos.

### Entregables

- Inventario de capacidades existentes.
- Diferencias entre el template y las necesidades de Nexora.
- Decisiones técnicas que requieren aprobación.
- Lista de dependencias faltantes, sin instalarlas.

### Criterio de aceptación

No se proponen modificaciones ni instalaciones sin haber identificado primero qué capacidades ya existen.

## 4. Fase 1 — Fundamentos del producto y arquitectura

### Spec 002: `product-domain-and-architecture.md`

Definir las entidades principales y sus relaciones:

- Usuario y rol.
- Perfil del desarrollador.
- Proyecto.
- Propuesta.
- Selección de propuesta.
- Intento de pago.
- Evento de pago procesado.
- Registro de transferencia simulada, si resulta necesario.

Determinar qué datos pertenecen a Nexora y cuáles proceden de Clerk o Stripe.

### Spec 003: `database-schema.md`

Definir el esquema PostgreSQL y las migraciones con Drizzle ORM.

Debe incluir:

- Identificadores y relaciones.
- Campos obligatorios y opcionales.
- Restricciones de integridad.
- Índices para las consultas principales.
- Campos de fecha y auditoría mínima.
- Restricciones que impidan más de una propuesta ganadora por proyecto.
- Unicidad de identificadores externos de Stripe cuando corresponda.
- Estrategia de evolución de esquemas.

### Spec 004: `authentication-and-authorization.md`

Definir:

- Registro e inicio de sesión con Clerk.
- Vinculación de la identidad autenticada con los datos internos.
- Roles y permisos.
- Protección de rutas y operaciones del servidor.
- Reglas para impedir que un usuario actúe sobre proyectos ajenos.
- Tratamiento de cuentas desactivadas y datos de sesión.

**Criterio de aceptación de la fase:** el dominio, los datos y los permisos están definidos antes de implementar funcionalidades de negocio.

## 5. Fase 2 — Proyectos y propuestas

### Spec 005: `project-management.md`

Definir la creación, edición, publicación, consulta y cierre de proyectos.

Incluir:

- Campos y validaciones.
- Estados del proyecto.
- Reglas de propiedad.
- Visibilidad pública.
- Paginación, filtros y ordenamiento.
- Tratamiento de proyectos sin propuestas.

### Spec 006: `public-project-catalog.md`

Definir el catálogo público y el detalle del proyecto.

Incluir:

- Información visible para visitantes.
- Campos privados que nunca deben exponerse.
- Filtros y paginación.
- Estados que permiten mostrar el proyecto como oportunidad.
- Experiencia para usuarios no autenticados.

### Spec 007: `proposal-management.md`

Definir el envío y la administración de propuestas.

Incluir:

- Precio y moneda acordada.
- Plazo estimado.
- Descripción de la solución.
- Validación del presupuesto y el plazo.
- Estados y transiciones.
- Reglas de edición o retirada.
- Restricciones de acceso.

### Spec 008: `proposal-selection.md`

Definir la selección de un único proveedor.

Incluir:

- Autorización del cliente propietario.
- Condiciones para seleccionar una propuesta.
- Transacción atómica para aceptar una sola propuesta.
- Cierre de nuevas propuestas.
- Rechazo de las propuestas restantes.
- Comportamiento ante solicitudes simultáneas.
- Estado del proyecto mientras espera el pago.

**Criterio de aceptación de la fase:** el marketplace permite publicar proyectos, presentar propuestas y elegir un único ganador sin inconsistencias.

## 6. Fase 3 — Stripe Test Mode

### Spec 009: `stripe-checkout-test-mode.md`

Definir el flujo de pago de prueba después de la aceptación.

Incluir:

- Configuración segura de Stripe en modo de prueba.
- Variables de entorno para claves y secretos.
- Creación de Checkout Sessions en el servidor.
- Asociación del pago con el cliente, proyecto y propuesta ganadora.
- Importe y moneda derivados de datos validados del servidor.
- Prevención de pagos duplicados.
- Redirecciones de éxito y cancelación.
- Verificación del estado mediante webhooks.
- Persistencia de identificadores externos y estados.
- Manejo de errores y reintentos.
- Separación de datos de prueba y producción.

### Spec 010: `payment-state-and-webhooks.md`

Definir el modelo de estados y el procesamiento de eventos.

Incluir:

- Verificación de la firma del webhook.
- Registro de identificadores de eventos.
- Idempotencia en el procesamiento.
- Manejo de eventos repetidos o recibidos fuera de orden.
- Reconciliación entre la base de datos y Stripe.
- Actualización segura del estado del proyecto.
- Tratamiento de pagos fallidos y sesiones expiradas.
- Registro de errores sin exponer secretos.

La página de retorno del navegador solo informará al usuario; no será la fuente de verdad del pago.

### Spec 011: `developer-payment-routing-test-model.md`

Definir cómo se representará el destino del pago en el modelo de datos y en la experiencia del usuario.

El modelo previsto es el pago directo al desarrollador seleccionado. Sin embargo, el Checkout estándar no demuestra por sí solo que los fondos se hayan enviado directamente al desarrollador.

Esta especificación deberá decidir si:

- Se simula únicamente la confirmación del pago de prueba y se registra que la transferencia está fuera del MVP; o
- Se incorpora un flujo de Stripe Connect en modo de prueba para demostrar también el enrutamiento entre cuentas conectadas.

La segunda alternativa aumenta el alcance y deberá aprobarse expresamente antes de implementarse.

En ambos casos:

- No habrá cobros ni transferencias reales.
- La interfaz no mostrará una transferencia como completada si solo existe un pago confirmado.
- No se afirmará que Nexora ofrece custodia o garantía de fondos.
- El modelo deberá permitir diferenciar el pago del cliente de la liquidación al desarrollador.

**Criterio de aceptación de la fase:** el flujo de prueba es verificable, idempotente y coherente; las operaciones simuladas se distinguen de las reales.

## 7. Fase 4 — Experiencia de usuario

### Spec 012: `client-dashboard.md`

Definir la vista del cliente:

- Proyectos propios.
- Estado de publicación.
- Propuestas recibidas.
- Propuesta seleccionada.
- Estado del pago de prueba.
- Acciones disponibles según el estado.

### Spec 013: `developer-dashboard.md`

Definir la vista del desarrollador:

- Proyectos disponibles.
- Propuestas enviadas.
- Estados y resultados.
- Propuesta ganadora.
- Estado del pago asociado.
- Datos permitidos para continuar la comunicación externa.

### Spec 014: `ui-accessibility-and-feedback.md`

Definir:

- Estados de carga, error y vacío.
- Validación de formularios.
- Confirmaciones antes de acciones importantes.
- Mensajes de éxito y error.
- Diseño adaptable y accesibilidad.
- Manejo de errores de red y de servicios externos.

## 8. Fase 5 — Seguridad, pruebas y despliegue

### Spec 015: `security-and-privacy.md`

Definir controles para:

- Autorización en el servidor.
- Validación de entradas.
- Protección de variables secretas.
- Verificación de webhooks.
- Acceso a archivos privados.
- Exposición mínima de datos personales.
- Limitación de operaciones sensibles.
- Registro de errores y eventos relevantes.

### Spec 016: `testing-strategy.md`

Definir pruebas para:

- Validaciones de proyectos y propuestas.
- Permisos por rol.
- Selección concurrente de propuestas.
- Restricciones de integridad de la base de datos.
- Creación y cancelación de Checkout Sessions.
- Webhooks inválidos y repetidos.
- Pagos fallidos y completados en Test Mode.
- Coherencia entre pago confirmado y transferencia simulada.
- Flujos principales de cliente y desarrollador.

### Spec 017: `deployment-and-environments.md`

Definir:

- Entornos local, pruebas y producción.
- Configuración de Neon y Clerk.
- Configuración de Supabase Storage.
- Variables de entorno por entorno.
- Webhooks de Stripe en modo de prueba.
- Migraciones de base de datos.
- Registros, observabilidad y procedimientos de recuperación.

La configuración de producción podrá prepararse para el futuro, pero no habilitará cobros reales en este alcance.

## 9. Orden de dependencias

1. Auditoría del repositorio.
2. Dominio y arquitectura.
3. Esquema de base de datos.
4. Autenticación y autorización.
5. Gestión y catálogo de proyectos.
6. Gestión de propuestas.
7. Selección de propuesta.
8. Checkout de prueba.
9. Estados y webhooks.
10. Modelo de pago directo o transferencia simulada.
11. Paneles de cliente y desarrollador.
12. Seguridad, pruebas y despliegue.

Las especificaciones de interfaz podrán desarrollarse en paralelo cuando sus contratos de datos y reglas de negocio estén definidos.

## 10. Plantilla mínima de cada especificación

Cada archivo en `docs/specs/` debe incluir:

1. Objetivo.
2. Contexto y alcance.
3. Requisitos funcionales.
4. Requisitos no funcionales.
5. Reglas de negocio.
6. Modelo de datos y migraciones.
7. Contratos de servidor o API, cuando correspondan.
8. Permisos y seguridad.
9. Estados, errores y casos límite.
10. Criterios de aceptación verificables.
11. Pruebas requeridas.
12. Dependencias y riesgos.
13. Decisiones pendientes.
14. Estado de aprobación.

## 11. Criterios de finalización del proyecto

Nexora se considerará funcional para el MVP cuando:

- Los visitantes puedan explorar proyectos públicos.
- Los clientes puedan publicar proyectos y recibir propuestas.
- Los desarrolladores autenticados puedan presentar ofertas.
- Cada proyecto admita como máximo una propuesta ganadora.
- El proceso de aceptación sea consistente ante solicitudes simultáneas.
- El pago de prueba pueda completarse y verificarse de extremo a extremo.
- Los webhooks se validen y procesen de forma idempotente.
- El estado del pago sea independiente del estado de la transferencia.
- Los permisos y la privacidad se hayan probado.
- La aplicación esté desplegada con configuración de prueba segura.
- La documentación y los criterios de aceptación estén actualizados.

## 12. Pendientes de aprobación

Antes de iniciar la implementación, confirmar:

- [ ] Auditoría del template completada.
- [ ] Modelo de roles y perfiles aprobado.
- [ ] Esquema de datos aprobado.
- [ ] Reglas de publicación y selección aprobadas.
- [ ] Alcance de Stripe Test Mode aprobado.
- [ ] Decisión sobre Stripe Connect en modo de prueba.
- [ ] Estados de pago y transferencia aprobados.
- [ ] Criterios de seguridad y pruebas aprobados.

**Regla de aprobación:** ninguna especificación pasa a implementación sin revisión y aprobación explícitas.

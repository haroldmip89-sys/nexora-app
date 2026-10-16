# Nexora — Product Brief

**Estado:** Borrador para revisión  
**Versión:** 0.2  
**Nombre del producto:** Nexora  
**Tipo de producto:** Marketplace web de servicios de desarrollo de software

## 1. Visión del producto

Nexora es una plataforma que conecta a clientes que necesitan desarrollar productos digitales con desarrolladores que pueden ofrecer sus servicios mediante propuestas personalizadas.

Los clientes pueden publicar proyectos, recibir propuestas, comparar las condiciones ofrecidas y seleccionar a un único desarrollador para cada proyecto. Los desarrolladores pueden explorar proyectos públicos y presentar propuestas cuando estén autenticados.

Nexora busca centralizar la publicación de proyectos, la evaluación de propuestas, la selección del proveedor y el registro del proceso de pago, sin convertirse inicialmente en una herramienta de gestión de proyectos ni de comunicación interna.

## 2. Problema que resuelve

Encontrar un desarrollador adecuado para un proyecto puede requerir publicar solicitudes en diferentes comunidades, recibir ofertas por distintos canales y comparar condiciones manualmente.

Nexora ofrece un espacio común donde los clientes pueden presentar sus necesidades y los desarrolladores pueden descubrir oportunidades y competir mediante propuestas estructuradas.

## 3. Objetivos

- Permitir que los clientes publiquen proyectos de desarrollo de software.
- Facilitar la exploración pública de proyectos disponibles.
- Permitir que los desarrolladores autenticados presenten propuestas.
- Facilitar la comparación y selección de propuestas.
- Garantizar que cada proyecto tenga como máximo un proveedor ganador.
- Incorporar un flujo de pago demostrable con Stripe en modo de prueba.
- Mantener una estructura técnica organizada, segura y ampliable para futuras funcionalidades.

## 4. Usuarios y roles

### Visitante

- Consultar el catálogo público de proyectos.
- Visualizar los detalles públicos de cada proyecto.
- Registrarse e iniciar sesión.

No puede presentar propuestas ni ejecutar acciones que requieran una cuenta autenticada.

### Cliente

- Crear y administrar sus propios proyectos.
- Consultar las propuestas recibidas.
- Comparar precios, plazos y descripciones de las propuestas.
- Seleccionar una propuesta ganadora.
- Continuar con el flujo de pago de prueba.
- Consultar el estado de aceptación y pago de sus proyectos.

### Desarrollador

- Consultar proyectos públicos.
- Presentar propuestas cuando el proyecto admita nuevas propuestas.
- Consultar y administrar sus propias propuestas.
- Consultar si una propuesta fue aceptada, rechazada o continúa pendiente.
- Consultar el estado del pago asociado a la propuesta ganadora.

### Administrador

El rol administrativo se limitará inicialmente a las tareas esenciales de supervisión y soporte que se definan durante las especificaciones. No se incluirá un sistema avanzado de moderación, disputas o gestión financiera.

## 5. Propuesta de valor

**Para los clientes:** encontrar y comparar desarrolladores en un mismo lugar, seleccionar la propuesta que mejor se adapte a sus necesidades y disponer de un proceso claro de aceptación.

**Para los desarrolladores:** descubrir oportunidades de trabajo, presentar ofertas estructuradas y dar seguimiento al resultado de sus propuestas.

**Para el portafolio:** demostrar un producto full stack con autenticación, permisos por rol, persistencia de datos, reglas de negocio, integración de pagos de prueba y tratamiento seguro de eventos externos.

## 6. Alcance del MVP

### 6.1 Autenticación y perfiles

- Registro e inicio de sesión mediante Clerk.
- Identificación del rol y autorización de acciones.
- Perfil básico del usuario.
- Separación de las acciones permitidas para clientes y desarrolladores.

### 6.2 Publicación y exploración de proyectos

- Crear, editar y consultar proyectos.
- Registrar título, descripción, presupuesto, plazo y categoría.
- Mostrar públicamente los proyectos publicados.
- Consultar el detalle público de un proyecto.
- Controlar cuándo un proyecto admite propuestas.

### 6.3 Propuestas

- Presentar propuestas para proyectos elegibles.
- Registrar precio, plazo estimado y descripción de la solución.
- Consultar las propuestas recibidas como cliente.
- Consultar las propuestas propias como desarrollador.
- Seleccionar una única propuesta ganadora por proyecto.
- Impedir nuevas propuestas cuando el proyecto ya no las admita.
- Actualizar los estados de las propuestas después de la selección.

### 6.4 Pagos con Stripe Test Mode

- Iniciar un flujo de pago de prueba después de aceptar una propuesta.
- Crear sesiones de Stripe Checkout desde el servidor.
- Asociar cada intento de pago con el proyecto, la propuesta ganadora y el cliente correspondiente.
- Procesar eventos mediante webhooks verificados.
- Registrar el estado del pago.
- Gestionar cancelaciones, errores e intentos repetidos.
- Mostrar una confirmación cuando el pago de prueba haya sido verificado.

El MVP no procesará cobros reales. Los pagos completados en Test Mode no representan dinero recibido ni transferido.

### 6.5 Pago directo al desarrollador: modelo previsto

El modelo de negocio contempla que el pago correspondiente a una propuesta aceptada se destine directamente al desarrollador seleccionado, sin comisiones ni suscripciones de Nexora dentro del alcance actual.

Para mantener esta regla separada de la implementación de prueba:

- El cliente pagará únicamente mediante el flujo de prueba habilitado.
- La arquitectura distinguirá el pago confirmado de la transferencia o liquidación al desarrollador.
- La transferencia se representará como simulada o pendiente de una integración compatible con Stripe Connect.
- No se afirmará que el desarrollador ha recibido dinero real.
- Las transferencias reales quedan fuera del MVP.

La modalidad técnica definitiva de Stripe Connect se documentará antes de implementar transferencias reales.

### 6.6 Comunicación externa

- No habrá chat ni mensajería interna.
- La coordinación entre el cliente y el desarrollador se realizará por medios externos.
- La información de contacto que se muestre deberá respetar las reglas de privacidad y los permisos definidos para cada usuario.

## 7. Reglas de negocio

1. Los proyectos publicados son visibles para visitantes y usuarios autenticados.
2. Presentar propuestas requiere autenticación y autorización.
3. Un desarrollador no puede presentar una propuesta para un proyecto cerrado o que ya no admita propuestas.
4. Cada proyecto puede tener como máximo una propuesta ganadora.
5. La selección de la propuesta ganadora debe ser atómica para evitar que dos propuestas resulten aceptadas simultáneamente.
6. Al aceptar una propuesta, Nexora debe impedir nuevas propuestas para ese proyecto y actualizar los estados de las propuestas restantes.
7. Solo el cliente propietario del proyecto puede seleccionar la propuesta ganadora.
8. Solo los usuarios autorizados pueden consultar información privada de sus proyectos, propuestas y pagos.
9. La página de retorno de Stripe no es prueba suficiente de que un pago se completó.
10. El pago se considerará confirmado únicamente después de verificar el evento o estado autorizado desde el servidor.
11. Las solicitudes y los webhooks repetidos no deben generar pagos duplicados ni transiciones inconsistentes.
12. Un pago cancelado o fallido no debe marcarse como completado.
13. Los pagos de prueba no deben contabilizarse como ingresos reales.
14. Una transferencia simulada no debe mostrarse como dinero recibido por el desarrollador.
15. No habrá comisiones, suscripciones ni pagos reales en el alcance actual.

## 8. Estados principales

### Proyecto

- Borrador
- Publicado
- Con propuesta seleccionada / pendiente de pago
- En contratación, una vez completado el flujo previsto
- Cerrado o cancelado

Los nombres definitivos y las transiciones se establecerán en las especificaciones funcionales.

### Propuesta

- Pendiente
- Aceptada
- Rechazada
- Retirada, si se permite antes de la selección

### Pago de prueba

- No iniciado
- Pendiente
- Completado en Test Mode
- Fallido
- Cancelado

### Transferencia al desarrollador

- No aplicable en el MVP
- Pendiente de implementación
- Simulada, cuando corresponda

Estos estados no deben confundirse con una liquidación real.

## 9. Stack tecnológico previsto

- **Frontend y backend web:** Next.js 16 con App Router y TypeScript.
- **Base de datos:** PostgreSQL en Neon.
- **ORM:** Drizzle ORM.
- **Autenticación:** Clerk.
- **Archivos privados:** Supabase Storage.
- **Pagos de prueba:** Stripe Checkout en Test Mode; evaluar Stripe Connect para modelar el pago directo al proveedor.
- **Validación:** Zod.
- **Interfaz:** Tailwind CSS v4 y shadcn/ui según el template existente.
- **Pruebas:** Vitest y React Testing Library, con pruebas adicionales para reglas de negocio e integración cuando corresponda.

La adopción concreta de cada dependencia deberá validarse contra el template del repositorio antes de implementar.

## 10. Fuera del alcance

- Cobros reales.
- Transferencias reales a desarrolladores.
- Custodia de fondos o servicio de escrow.
- Comisiones y suscripciones.
- Chat o mensajería interna.
- Gestión de tareas, repositorios o entregables del proyecto.
- Seguimiento avanzado de hitos y aprobaciones.
- Resolución formal de disputas y reembolsos.
- Calificaciones y reputación avanzadas.
- Aplicación móvil.
- Facturación fiscal automatizada.
- Multiempresa, multi moneda y funcionalidades financieras avanzadas.

## 11. Criterios generales de éxito

- Un visitante puede explorar proyectos públicos sin iniciar sesión.
- Un desarrollador autenticado puede presentar una propuesta válida.
- Un cliente solo puede seleccionar propuestas de sus propios proyectos.
- Nunca puede existir más de una propuesta ganadora para el mismo proyecto.
- El flujo de pago de prueba funciona de extremo a extremo.
- Los estados del pago dependen de una verificación del servidor.
- Los eventos repetidos no duplican operaciones.
- Los usuarios no pueden acceder a propuestas, proyectos privados o pagos ajenos.
- La documentación y las pruebas permiten mantener y ampliar el sistema.

## 12. Principios del producto

- Claridad en los estados y responsabilidades.
- Seguridad desde el diseño.
- Una sola propuesta ganadora por proyecto.
- Separación entre aceptación, pago confirmado y transferencia al desarrollador.
- No presentar operaciones de prueba como transacciones reales.
- Mantener el MVP enfocado en el marketplace principal.

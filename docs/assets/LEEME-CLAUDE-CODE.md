# Nexora — diseño completo para implementar

Cada `*.dc.html` es una pantalla (artboard) hecha con /design en claude.ai.
Son HTML con estilos inline: úsalos como referencia visual y de contenido
(colores, tipografías, espaciados, textos, estructura), NO como código final.
Los tags <x-dc> y <helmet> son del runtime de /design: ignóralos y traduce el
contenido a los componentes de nuestro stack.

## 1-perfiles-y-proyectos
- Main.dc.html            → Perfil público del desarrollador
- Account.dc.html         → Mi cuenta · gestión del perfil
- ProjectDetail.dc.html   → Detalle de proyecto (descripción Markdown tipo README)
- ProjectEditor.dc.html   → Editor de proyecto
- ProposalForm.dc.html    → Propuesta con adjuntos
- RateDeveloper.dc.html   → Valoración del desarrollador por el cliente

## 2-landing
- Main.dc.html            → Landing page

## 3-paneles (rediseño)
- Main.dc.html               → Panel del cliente
- DeveloperDashboard.dc.html → Panel del desarrollador
- Payment.dc.html            → Página de pago
- Proposals.dc.html          → Tabla de propuestas
- Projects.dc.html           → Listado de proyectos

## Sistema visual compartido
- Verde primario #183D30, texto #1F2420 / #535E56, bordes #E3E8E3 / #C9D3CB, blanco #FFFFFF
- Fondo base #F5F6F2 (perfiles/proyectos)
- Fuentes (Google Fonts): Bricolage Grotesque (títulos), Instrument Sans y
  Plus Jakarta Sans (texto), JetBrains Mono (código). Revisa cada archivo para
  ver cuál usa cada pantalla.
- Extrae primero los tokens (colores, tipografías, radios, espaciados) a un
  archivo de tema y luego implementa las pantallas con ellos.

## Prompt sugerido
"Lee LEEME-CLAUDE-CODE.md y los .dc.html de la carpeta X. Primero crea el tema
con los tokens compartidos, luego implementa la pantalla Y respetando el diseño."

Nexora — Landing Page Design Specification
Status: Approved visual direction / implementation-ready draft
Version: 1.0
Product: Nexora — marketplace for web development services
Purpose: Guide Claude Code in implementing the approved landing page in the existing repository.
1. Instructions for implementation
Treat assets/nexora-landing-reference.png as the visual reference for the page's overall composition and style. Reproduce its visual language and section hierarchy, but build a responsive, accessible interface rather than inserting the screenshot as a page background.
Before changing files, inspect the repository README, docs/SETUP.md, .claude/ rules and agents, existing app routes, components, design tokens, package scripts, and current dependencies. Follow existing conventions. Do not install packages or replace the project's stack without explicit approval. If this task is being run through the repository's SDD workflow, propose or update the relevant spec and wait for human approval before implementation.
Do not implement authentication, project CRUD, proposal submission, Stripe, or backend integrations as part of this landing-page task unless an approved existing contract already supports them. CTAs and links should use existing routes if available; otherwise, use clearly identified placeholders and document them rather than inventing routes.
2. Product and audience
Nexora connects clients who need web/software development with developers who submit proposals. Visitors can browse public projects. Authentication is required to submit proposals. Communication happens outside the platform; there is no internal chat in the current scope.
The landing page must communicate two main paths:
- Clients: publish a project and compare proposals.
- Developers: explore public projects and find opportunities.
Do not imply that Nexora verifies developers, guarantees delivery, holds funds, or provides payment protection unless those capabilities are actually implemented and approved.
3. Visual direction
Style: premium minimalism, editorial, modern technology marketplace.
Mood: confident, clear, considered, professional, approachable.
Avoid: generic purple gradients, excessive glassmorphism, heavy shadows, noisy backgrounds, excessive animation, oversized icon decoration, fake social proof, and crowded layouts.
Color tokens
Use these as initial design tokens, checking the repository for existing tokens before adding new ones:
- Forest green / primary: #183D30
- Charcoal / main text: #202522
- Warm off-white / page surface: #F5F6F2
- White / cards: #FFFFFF
- Soft green / secondary surface: #DCE6DE
- Muted text: approximately #535E56
- Subtle border: a light gray-green such as #E3E8E3
Use forest green for primary buttons, selected states, and restrained emphasis. Keep body copy and project details high-contrast and readable.
Typography
Prefer the project's installed font and typography system. If no project standard exists, use Geist or Inter if already available; do not install a font package just for this task without approval. Use a bold, compact headline, readable body text, and smaller metadata. Establish a clear scale for hero title, section titles, card titles, body copy, and labels.
Shape, spacing, and depth
- Use a centered content container, approximately 1,160–1,220 px maximum width on wide desktop screens, adjusted to existing conventions.
- Use generous vertical spacing between major sections.
- Cards: subtle borders, approximately 10–14 px corner radius, little or no shadow.
- Buttons: clear hierarchy, comfortable click/tap area, visible focus states.
- Icons: consistent simple line icons from the project's existing icon library, if available.
- Avoid hard-coding layout to the exact pixel dimensions of the reference image.
4. Page structure and content
Implement the following sections in order. Keep content in Spanish.
4.1 Header / navigation
- Wordmark: Nexora.
- Navigation: Explorar proyectos, Cómo funciona, Para desarrolladores, Recursos.
- Secondary action: Iniciar sesión.
- Primary action: Publicar proyecto.
- Desktop: compact horizontal navigation with a clear primary CTA.
- Mobile: responsive compact navigation; use the repository's existing menu pattern if available.
4.2 Hero
Eyebrow: EL TALENTO CORRECTO. UN PROYECTO A LA VEZ.
Headline: Conecta con desarrolladores y haz realidad tus ideas.
Supporting copy: Publica tu proyecto, recibe propuestas de profesionales y encuentra al desarrollador ideal para tu próximo producto digital.
Primary CTA: Publicar un proyecto.
Secondary CTA: Explorar proyectos.
Supporting points:
- Proyectos públicos y transparentes
- Propuestas comparables
- Proceso simple y directo
Composition: a two-column desktop layout, with copy on the left and a product-focused visual on the right. The reference uses a laptop/product dashboard and floating project/developer cards. Recreate this as a tasteful composition with actual UI elements or existing assets; do not use the full reference screenshot as the hero image. On mobile, stack the visual below the CTAs or simplify it to avoid crowding.
4.3 Recent projects
Section title: Proyectos recientes.
Supporting copy: Descubre oportunidades de desarrollo web.
Action: Ver todos los proyectos.
Use a responsive grid: 3 cards on desktop if space allows, 2 on medium screens, 1 on small screens. Each card may contain:
- Category badge
- Project title
- Short summary
- Publication date or relative age
- Technology tags, when known
- Budget or budget range, when supplied
- Ver detalles link
Use clearly marked demo content only when real data is unavailable. Never present invented project listings, budgets, testimonials, or counts as real marketplace data. If there is no project API or fixture, use neutral sample content and mark it as demonstration data in code/content notes, or use an honest empty state.
Suggested visual examples for mock content only:
- Landing page para SaaS
- API para sistema de gestión
- E-commerce personalizado
- Sitio web corporativo
4.4 Why Nexora
Title: ¿Por qué elegir Nexora?
Supporting copy: Una plataforma diseñada para conectar talento y proyectos de forma simple y clara.
Benefit items:
- Proyectos bien definidos
- Propuestas comparables
- Comunicación directa fuera de la plataforma
- Proceso de selección claro
Use a quiet pale-green surface or a restrained benefit grid with simple line icons.
4.5 How it works
Title: Cómo funciona.
Intro: En cuatro pasos, tu proyecto puede encontrar el talento adecuado.
Four steps:
1. Publica tu proyecto — Describe las necesidades, presupuesto y plazo.
2. Recibe propuestas — Los desarrolladores interesados envían sus propuestas.
3. Elige al mejor — Compara las condiciones y selecciona una propuesta.
4. Coordina el trabajo — Continúa la comunicación directamente con el desarrollador.
Use numbered steps with small icons and clear reading order. Do not imply that project delivery is managed within Nexora.
4.6 Popular categories
Title: Categorías populares.
Intro: Explora proyectos en las principales áreas de desarrollo web.
Suggested categories:
- Frontend & UI/UX
- Backend & APIs
- Full Stack
- E-commerce
- WordPress
- Otros
Category tiles should be compact and consistent. Make them interactive only if matching category-filter routes exist; otherwise, do not invent route destinations.
4.7 Developer-focused feature
Eyebrow: PARA DESARROLLADORES.
Headline: Descubre proyectos que se adaptan a tus habilidades y lleva tu talento al siguiente nivel.
CTA: Explorar proyectos.
Use a relevant developer/workspace image or a designed product panel if the repository has no suitable assets. Avoid fabricated endorsements or implying that pictured people are actual Nexora users.
4.8 Final CTA
Eyebrow: TU PRÓXIMO PROYECTO TE ESPERA.
Headline: Conecta, crea, construye.
Supporting copy: Únete a Nexora y encuentra nuevas oportunidades para hacer realidad grandes ideas.
Actions: Publicar un proyecto and Explorar proyectos.
Use a forest-green background with high-contrast text and subtle decorative geometry only if it remains understated.
4.9 Footer
Include:
- Nexora wordmark and a short tagline.
- Explore links: Proyectos, Desarrolladores, Categorías, Cómo funciona.
- Resources: Blog, Centro de ayuda only if those destinations exist; otherwise omit or mark as future placeholders.
- Legal links: Términos de servicio, Privacidad, only when actual pages exist or are explicitly designated placeholders.
- Contact details only when real contact information is configured.
Do not invent social profiles, email addresses, legal copy, or live destinations.
5. Responsive requirements
- Desktop: two-column hero, wide project grid, horizontal navigation.
- Tablet: reduce spacing and use two-column project cards where appropriate.
- Mobile: stacked hero, compact navigation, single-column project cards, full-width or naturally wrapping CTAs, no horizontal overflow.
- Maintain readable line lengths, sufficient touch targets, and clear separation between sections.
- Do not merely scale down desktop; reflow content intentionally.
6. Accessibility and interaction
- Use semantic landmarks and a logical heading hierarchy.
- All navigation and CTA controls must be keyboard accessible.
- Provide visible keyboard focus indicators.
- Give meaningful alt text to informative images; decorative imagery should not add redundant screen-reader content.
- Maintain sufficient text/background contrast.
- Respect reduced-motion preferences if motion is added.
- Buttons and links must have real, understandable destinations/actions. Do not leave decorative controls pretending to be functional.
7. Implementation constraints
- Inspect and follow the repository's README, docs/SETUP.md, Claude rules/agents, component conventions, and installed dependencies before coding.
- Use existing components and libraries when suitable; avoid duplicate UI primitives.
- Keep route files focused on composition and follow the template's module/component structure.
- Do not add dependencies without approval.
- Do not implement backend features, authentication flows, proposal submission, Stripe, or payment logic in this task.
- Do not modify the product brief or unrelated application areas unless requested.
- If existing routes differ from the suggested CTA labels, report the mismatch and ask or document the proposed mapping instead of silently inventing routes.
8. Acceptance criteria
1. The landing page follows the approved premium-minimal visual direction and reference composition.
2. All nine sections are present in the intended order, unless the existing product architecture requires an explicitly approved adjustment.
3. The page is responsive at desktop, tablet, and mobile widths.
4. The hero clearly communicates Nexora's value and has two primary user journeys.
5. Recent project cards have consistent hierarchy and honest demo/empty-state behavior.
6. Colors, typography, borders, spacing, and buttons are consistent across sections.
7. Navigation and CTA links use real existing routes or documented placeholders.
8. The page passes the repository's existing lint/type-check/test commands where applicable.
9. No packages were installed and no unrelated business logic was implemented.
10. The final report lists changed files, verification commands/results, and any remaining placeholders or decisions.
9. Reference asset
Use assets/nexora-landing-reference.png as the visual reference. It is a direction-setting mockup, not a pixel-perfect implementation contract. Match its overall visual hierarchy, palette, spacing, and section sequence while preserving responsive behavior, accessibility, and the existing codebase conventions.
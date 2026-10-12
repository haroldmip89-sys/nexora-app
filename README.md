# next-js-template

Template base para iniciar proyectos con **Next.js 16** y trabajar con Claude Code mediante **Spec Driven Development (SDD)**. No está atado a ningún sector de negocio. Trae el stack ya instalado, reglas de arquitectura definidas y un flujo de agentes listo para usar.

## Stack

| Área | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Lenguaje | TypeScript (strict) |
| Estilos | Tailwind CSS v4 |
| Componentes UI | shadcn/ui (estilo `base-nova`, sobre Base UI) + lucide-react |
| Data fetching | TanStack Query v5 + axios |
| Tablas | TanStack Table v9 |
| Estado global | Zustand v5 |
| Validación | Zod v4 |
| Testing | Vitest + React Testing Library (jsdom) |
| Linting | ESLint (`eslint-config-next`) |

> React Query, axios, Zustand y Zod vienen instalados pero **sin configurar** (no hay `QueryClientProvider`, cliente axios ni stores). Se integran cuando el primer feature los necesite, siguiendo el flujo SDD.

## Inicio rápido

Requisitos: Node.js 20.9 o superior.

```bash
git clone https://github.com/haroldmip89-sys/next-js-template.git mi-proyecto
cd mi-proyecto
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (incluye chequeo de TypeScript) |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run test` | Tests con Vitest (una pasada) |
| `npm run test:watch` | Tests en modo watch |
| `npx shadcn@latest add <componente>` | Agrega un componente de shadcn/ui |

## Estructura y reglas

Las reglas completas están en **[`docs/SETUP.md`](docs/SETUP.md)**: estructura de carpetas, buenas prácticas y metodología. En resumen:

- **Modular por dominio:** la lógica vive en `src/modules/<domain>` (`components/`, `hooks/`, `services/`, `schemas/`, `types/`, `store/`, solo las carpetas que se necesiten).
- **`src/app` es solo routing:** las páginas importan y componen lo que exponen los módulos.
- **Naming:** nombres en inglés, archivos en `kebab-case`, sufijos `.service.ts`, `.schema.ts`, `.types.ts`, `.store.ts`.
- **Buenas prácticas:** SOLID, DRY, KISS y YAGNI. Antes de crear un componente, hook o función, se verifica que no exista ya en el proyecto o en shadcn/ui.

```
src/
  app/            -> rutas (page, layout, route handlers)
  modules/        -> módulos de dominio
  components/
    ui/           -> primitivos de shadcn/ui
    shared/       -> componentes propios reutilizables
  lib/            -> utilidades transversales
docs/
  SETUP.md        -> reglas del proyecto
  specs/          -> specs generadas por el flujo SDD
.claude/agents/   -> agentes del flujo SDD
```

## Flujo de trabajo con agentes (SDD)

El proyecto incluye 4 subagentes de Claude Code en `.claude/agents/`:

| Agente | Rol |
|---|---|
| `orchestrator` | Punto de entrada. Decide si la tarea va por SDD o por modo build directo, la divide en fases alcanzables y define qué tareas pueden correr en paralelo sin conflictos. |
| `spec` | Escribe la spec en `docs/specs/<NNN>-<slug>.md`: alcance, inventario de lo existente, contratos, tareas, criterios de aceptación y tests obligatorios. |
| `developer` | Implementa una tarea de una spec aprobada, solo dentro de sus archivos asignados, con sus tests. |
| `reviewer` | Valida contra la spec y `docs/SETUP.md`, corre lint, test y build. Si encuentra problemas, vuelve al developer (máximo 3 rondas). |

```
orchestrator -> spec (draft) -> APROBACIÓN HUMANA -> developer(s) -> reviewer -> (loop de corrección) -> done
```

**La aprobación humana de la spec es obligatoria:** ningún agente empieza a implementar hasta que apruebes la spec explícitamente.

Para usarlos, pídelo en el chat de Claude Code:

```
usa el agente orchestrator para crear un módulo de productos con listado y detalle
```

Cuando Claude te presente la spec, revísala en `docs/specs/` y responde `apruebo la spec 001` o pide cambios.

## Skills recomendadas para Claude Code

Estas skills complementan el template. Se instalan por usuario (no forman parte del repo), así que cada persona del equipo debe instalarlas en su Claude Code.

| Skill | Para qué sirve en este template |
|---|---|
| [frontend-design](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design) | Plugin oficial de Anthropic. Hace que las interfaces tengan una dirección visual definida en vez de una estética genérica. |
| [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Base de datos de estilos, paletas, tipografías y guías de UX para elegir una dirección de diseño coherente. |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Skills de Vercel. Las más útiles aquí: `react-best-practices` (rendimiento en React/Next.js), `composition-patterns` (componentes reutilizables) y `web-design-guidelines` (revisión de accesibilidad y UX). |
| [ponytail](https://github.com/DietrichGebert/ponytail) | Hace que el agente escriba menos código: antes de crear algo, revisa si hace falta, si ya existe o si se resuelve con lo instalado. Refuerza KISS y YAGNI. |
| [caveman](https://github.com/JuliusBrussee/caveman) | Respuestas del agente mucho más cortas para ahorrar tokens. Se activa y desactiva a demanda. |
| [superpowers](https://github.com/obra/superpowers) | Metodología de desarrollo con skills de brainstorming, planificación por tareas pequeñas, TDD y revisión. |

### Instalación

Dentro de Claude Code (cada `/plugin` va como un mensaje separado):

```
/plugin install frontend-design@claude-plugins-official
/plugin install superpowers@claude-plugins-official

/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill

/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail

/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

Desde la terminal, para las skills de Vercel (permite elegir cuáles instalar):

```bash
npx skills add vercel-labs/agent-skills
```

### Cómo conviven con el flujo del template

- **Las reglas del proyecto mandan.** Si una skill sugiere algo distinto a `docs/SETUP.md` o al flujo de agentes, prevalece lo del proyecto.
- **superpowers** tiene su propio flujo de planificación y ejecución. Para features, usa el flujo de agentes del template (con aprobación humana de la spec). Usa superpowers para lo que el template no cubre, como brainstorming previo o debugging.
- **caveman** conviene para sesiones de código. Desactívalo (`/caveman off`) cuando el agente spec redacte una spec, porque la vas a leer y aprobar.
- **frontend-design** y **ui-ux-pro-max** definen el aspecto visual, pero los componentes se siguen construyendo sobre shadcn/ui y los tokens de `src/app/globals.css`.

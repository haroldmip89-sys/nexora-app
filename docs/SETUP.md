# SETUP.md

Reglas de estructura de carpetas, buenas prácticas y metodología de trabajo para este proyecto. Toda persona (o agente) que contribuya código debe seguir estas reglas.

---

## 1. Estructura de carpetas

### Reglas

1. **Modular por dominio.** Toda lógica de negocio se organiza en módulos bajo `src/modules/<domain>`. Un módulo agrupa todo lo que pertenece a un mismo dominio: componentes, hooks, servicios, schemas y types.
2. **`src/app` es solo routing.** Las carpetas de `src/app` (App Router) contienen únicamente `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`, etc. Estos archivos deben ser delgados: importan y componen lo que exponen los módulos en `src/modules/<domain>`, no contienen lógica de negocio.
3. **Nombres en inglés.** Carpetas y archivos siempre en inglés, sin excepción (`users`, no `usuarios`). Usa plural cuando el dominio representa una colección de entidades (`users`, `products`, `orders`) y singular cuando representa un concepto único (`auth`, `billing`, `profile`).
4. **Naming de archivos (TypeScript/TSX):**
   - Archivos: `kebab-case` — `user-card.tsx`, `use-users.ts`, `users.service.ts`.
   - Componentes: el archivo exporta en `PascalCase` (`user-card.tsx` → `export function UserCard()`). Esta es la misma convención que ya usa shadcn/ui en `src/components/ui`, así que todo el proyecto queda consistente.
   - Hooks: prefijo `use-` en el archivo, `useCamelCase` en el export (`use-users.ts` → `useUsers()`).
   - Servicios: sufijo `.service.ts` (`users.service.ts`).
   - Schemas (Zod): sufijo `.schema.ts` (`user.schema.ts`).
   - Types: sufijo `.types.ts` (`user.types.ts`).
   - Stores (Zustand): sufijo `.store.ts` (`users.store.ts`).
5. **Subcarpetas por necesidad, no por plantilla.** Un módulo no necesita las seis subcarpetas desde el día uno (ver YAGNI en la sección 2). Si un módulo solo necesita `components/` y `schemas/`, no crees `hooks/` ni `services/` vacíos.
6. **Componentes compartidos vs. componentes de dominio:**
   - `src/components/ui` — primitivos de shadcn/ui, sin lógica de negocio.
   - `src/components/shared` — componentes propios reutilizables entre módulos, sin lógica de dominio.
   - `src/modules/<domain>/components` — componentes específicos de ese dominio.
   - `src/lib` — utilidades transversales (ej. `cn`, cliente de axios).

### Ejemplo de uso

```
src/
  app/
    users/
      page.tsx              -> importa <UserList /> desde modules/users
      [id]/
        page.tsx             -> importa <UserDetail /> desde modules/users
  modules/
    users/
      components/
        user-card.tsx         -> export function UserCard()
        user-list.tsx         -> export function UserList()
      hooks/
        use-users.ts          -> export function useUsers()  (react-query)
      services/
        users.service.ts      -> export const usersService = { getAll, getById, ... }
      schemas/
        user.schema.ts        -> export const userSchema = z.object({ ... })
      types/
        user.types.ts         -> export type User = z.infer<typeof userSchema>
      store/
        users-filters.store.ts -> export const useUsersFiltersStore = create(...)
  components/
    ui/
      button.tsx              -> shadcn, no tocar manualmente (regenerar con la CLI)
    shared/
      empty-state.tsx         -> export function EmptyState()
  lib/
    utils.ts                  -> cn()
    axios.ts                  -> cliente axios configurado
```

Una página de `src/app` solo compone:

```tsx
// src/app/users/page.tsx
import { UserList } from "@/modules/users/components/user-list";

export default function UsersPage() {
  return <UserList />;
}
```

---

## 2. Buenas prácticas

Aplicar **SOLID, DRY, KISS y YAGNI** en todo momento: al crear un componente de shadcn, una función utilitaria, un hook, un servicio, un schema o un store. No son opcionales para "casos grandes", son el criterio por defecto para cualquier código nuevo.

### Antes de crear algo, verificar que no exista ya

1. **Componentes de UI:** antes de construir un componente desde cero, revisar si ya existe en el catálogo de shadcn/ui (`npx shadcn@latest add <componente>` o el registro en https://ui.shadcn.com). Si existe, úsalo o extiéndelo (composición, variantes) en vez de reinventarlo.
2. **Si no existe en shadcn:** constrúyelo tú mismo, pero pensando en que sea reutilizable — recíbelo vía props, sin lógica de dominio embebida, y ubícalo en `src/components/shared` (si es transversal) o en `modules/<domain>/components` (si es específico de un dominio).
3. **Funciones, hooks y servicios:** antes de escribir uno nuevo, buscar en `src/modules/**`, `src/components/**` y `src/lib/**` si ya existe algo equivalente o generalizable. Preferir extender/generalizar sobre duplicar.

### SOLID

- **S — Single Responsibility:** un componente renderiza, un hook gestiona estado/datos, un service hace llamadas externas, un schema valida. No mezclar responsabilidades (ej. un componente no debe hacer fetch directo con axios; eso vive en un service, consumido por un hook).
- **O — Open/Closed:** extender comportamiento mediante props, composición o nuevas variantes, no modificando el comportamiento interno de un componente/hook ya en uso por otras partes.
- **L — Liskov Substitution:** si un componente o función reemplaza a otra en una misma interfaz/props, debe poder sustituirla sin romper a quien la consume.
- **I — Interface Segregation:** props e interfaces de TypeScript específicas y mínimas; no forzar a un componente a recibir props que no usa.
- **D — Dependency Inversion:** los componentes dependen de hooks/abstracciones (`useUsers()`), no directamente de `axios` o `fetch`. Los hooks dependen de services, no al revés.

### DRY

No duplicar lógica entre módulos. Si dos módulos necesitan la misma función/hook/componente, se mueve a `src/lib`, `src/components/shared` o un hook/util compartido, no se copia y pega.

### KISS

Preferir la solución más simple que resuelva el problema actual. Evitar capas de abstracción, configuración o indirección que no estén resolviendo un problema real hoy.

### YAGNI

No construir generalidad para casos de uso hipotéticos. No crear carpetas, props, opciones de configuración o abstracciones "por si se necesitan después". Se agregan cuando aparece el segundo caso de uso real, no antes.

---

## 3. Metodología de trabajo: SDD (Spec Driven Development)

El desarrollo se organiza con **Spec Driven Development**: antes de implementar, se define una spec (qué se va a construir y su criterio de aceptación); la implementación y la revisión se verifican contra esa spec, no contra la interpretación de quien escribe el código.

### Roles

El flujo se divide en 4 roles:

1. **Orquestador** — recibe el requerimiento, lo descompone en tareas, decide el orden de trabajo y coordina el handoff entre los demás roles. No escribe la spec ni el código; distribuye y da seguimiento al trabajo.
2. **Spec** — a partir del requerimiento, redacta la especificación: qué debe hacer la funcionalidad, qué módulo(s) de dominio involucra (ver sección 1), contratos de datos (types/schemas), y criterios de aceptación. La spec es la fuente de verdad para developer y reviewer.
3. **Developer** — implementa la spec siguiendo las reglas de estructura de carpetas (sección 1) y las buenas prácticas (sección 2). Incluye unit tests para las partes que lo requieran (ver abajo).
   - **Bloqueante:** el developer no empieza hasta que un humano apruebe la spec (`Estado: approved`). Una spec modificada después de aprobada vuelve a `draft` y requiere nueva aprobación.
4. **Reviewer** — audita el resultado contra la spec: ¿cumple el criterio de aceptación?, ¿respeta la estructura modular?, ¿aplica SOLID/DRY/KISS/YAGNI?, ¿tiene los tests necesarios? Si algo no cumple, regresa al developer (o a spec, si el problema es de la especificación misma).

### Unit testing

Se usa **Vitest + React Testing Library**. No todo requiere test unitario — se aplica donde hay lógica real que pueda romperse silenciosamente:

- **Sí requieren test:** `services/` (lógica de llamadas y transformación de datos), `hooks/` con lógica propia (no solo un wrapper trivial de react-query), `schemas/` de Zod (casos válidos e inválidos), utilidades en `lib/`, stores de Zustand con lógica de transición de estado.
- **No necesariamente requieren test unitario:** componentes puramente presentacionales (reciben props, renderizan JSX sin lógica), páginas de `src/app` (son composición, no lógica).

La spec de cada feature debe indicar qué partes caen en el primer grupo, para que developer y reviewer sepan qué tests son obligatorios antes de considerar la tarea terminada.

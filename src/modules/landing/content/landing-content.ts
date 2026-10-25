import type { HomeCta } from "@/modules/auth/services/home-cta";

/** Landing copy, verbatim from docs/assets/2-landing/Main.dc.html (spec 022b). */

export const HERO = {
  badge: "Marketplace de proyectos de software",
  title: "Tu proyecto, en manos del desarrollador indicado.",
  text: "Publica lo que necesitas construir, recibe propuestas con precio y plazo, compara perfiles y valoraciones, y contrata con un pago seguro a través de Stripe.",
  primaryCta: "Publicar un proyecto",
  secondaryCta: "Soy desarrollador",
  trust: ["Propuestas comparables", "Perfiles con valoraciones", "Pagos con Stripe"],
} as const;

/** Illustrative preview: no people names, no ratings (spec 022b, AC9). */
export const HERO_SLIDES = [
  { src: "/hero/hero-1.jpg" },
  { src: "/hero/hero-2.jpg" },
  { src: "/hero/hero-3.jpg" },
] as const;

export type LandingStep = { n: string; title: string; text: string; icon: string };

export const HOW_IT_WORKS = {
  eyebrow: "Cómo funciona",
  title: "Del proyecto publicado al trabajo contratado",
  tabsLabel: "Ver pasos para",
  tracks: [
    {
      value: "client",
      label: "Para clientes",
      steps: [
        { n: "01", title: "Publica tu proyecto", text: "Describe el alcance en Markdown, elige tecnologías, presupuesto y plazo.", icon: "M12 5v14M5 12h14" },
        { n: "02", title: "Recibe propuestas", text: "Los desarrolladores envían su precio, plazo y cómo lo resolverían.", icon: "M4 6h16M4 12h10M4 18h7" },
        { n: "03", title: "Compara y elige", text: "Ordena por precio o plazo y revisa perfiles, biografías y valoraciones.", icon: "M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" },
        { n: "04", title: "Paga y valora", text: "Paga con Stripe Checkout, sigue el estado y valora al cerrar el proyecto.", icon: "M3 7h18v10H3zM3 11h18" },
      ],
    },
    {
      value: "dev",
      label: "Para desarrolladores",
      steps: [
        { n: "01", title: "Crea tu perfil", text: "Cuenta tu experiencia, enlaces y disponibilidad en una biografía en Markdown.", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
        { n: "02", title: "Configura tus cobros", text: "Conecta tu cuenta de Stripe una vez para poder recibir transferencias.", icon: "M3 7h18v10H3zM3 11h18M7 15h3" },
        { n: "03", title: "Envía propuestas", text: "Filtra proyectos por tecnología y propone tu precio y plazo.", icon: "M22 2L11 13M22 2l-7 20-4-9-9-4z" },
        { n: "04", title: "Recibe la transferencia", text: "Cuando el pago del cliente se confirma, la transferencia se envía a tu cuenta.", icon: "M5 12l5 5L20 7" },
      ],
    },
  ],
} as const;

export const BENEFITS = {
  eyebrow: "Por qué Nexora",
  title: "Decisiones claras, sin intermediarios innecesarios",
  text: "Nexora reúne en un solo lugar lo que necesitas para elegir bien: la propuesta, quién la hace y cómo trabaja, y un pago con estados que puedes seguir.",
  cta: "Crear cuenta gratis",
  items: [
    { title: "Propuestas lado a lado", text: "Precio, plazo y valoración de cada propuesta en una sola tabla, con orden por precio o plazo.", icon: "M4 6h16M4 12h16M4 18h16" },
    { title: "Perfiles verificables", text: "Biografía, enlaces y valoraciones de clientes anteriores antes de decidir.", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
    { title: "Pagos con estado claro", text: "Stripe Checkout, confirmación del servidor y transferencia al desarrollador, paso a paso.", icon: "M3 7h18v10H3zM3 11h18" },
    { title: "Proyectos bien descritos", text: "Descripciones en Markdown con títulos, listas y tablas, como un README.", icon: "M4 4h16v16H4zM8 9h8M8 13h5" },
    { title: "Búsqueda por tecnología", text: "Etiquetas por lenguaje y framework para que cada proyecto llegue a quien lo domina.", icon: "M7 7h.01M3 3h8l10 10-8 8L3 11z" },
    { title: "Valoraciones reales", text: "Solo el cliente que contrató puede valorar, una vez por proyecto.", icon: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" },
  ],
} as const;

export const DEVELOPERS = {
  eyebrow: "Para desarrolladores",
  title: "Encuentra proyectos que encajen con tu stack",
  text: "Filtra por tecnología, presupuesto y plazo. Propón tu precio, muestra tu experiencia en tu perfil y recibe la transferencia cuando el cliente confirma el pago.",
  primaryCta: "Crear perfil de desarrollador",
  secondaryCta: "Ver proyectos",
  points: [
    { title: "Explora sin registrarte", text: "Mira proyectos, presupuestos y plazos antes de crear tu cuenta." },
    { title: "Un perfil que vende por ti", text: "Tu biografía, enlaces y valoraciones acompañan cada propuesta." },
    { title: "Cobros con Stripe Connect", text: "Configura tu cuenta una vez y recibe las transferencias de tus proyectos." },
    { title: "Tu panel, en orden", text: "Propuestas por estado, proyectos ganados y transferencias en un solo lugar." },
  ],
} as const;

export const FAQ = {
  eyebrow: "Preguntas frecuentes",
  title: "Lo que suelen preguntarnos",
  items: [
    { q: "¿Necesito una cuenta para ver los proyectos?", a: "No. El listado de proyectos es público. Necesitas iniciar sesión para publicar un proyecto o enviar una propuesta." },
    { q: "¿Cómo elijo al desarrollador?", a: "Compara las propuestas por precio y plazo, abre el perfil de cada desarrollador para ver su biografía y valoraciones, y selecciona la que mejor encaje." },
    { q: "¿Cómo se paga?", a: "Con Stripe Checkout. El pago solo se da por confirmado cuando el servidor lo verifica con Stripe, y después se envía la transferencia al desarrollador." },
    { q: "¿Los pagos de esta versión son reales?", a: "No. Esta versión funciona en el modo de prueba de Stripe: ningún importe representa dinero real." },
    { q: "¿Qué necesito para enviar propuestas como desarrollador?", a: "Una cuenta de desarrollador y tus cobros de prueba configurados con Stripe, para que puedas recibir la transferencia si te eligen." },
  ],
} as const;

export const FINAL_CTA = {
  title: "¿Tienes un proyecto en mente?",
  text: "Publícalo en minutos y empieza a recibir propuestas de desarrolladores.",
  primaryCta: "Publicar un proyecto",
  secondaryCta: "Explorar proyectos",
} as const;

export const SIGN_UP_HREF = "/sign-up";

/**
 * Account CTA of a landing section: visitor -> sign-up with the section label,
 * member -> panel/onboarding, none -> no button (spec 022b, AC8).
 */
export function resolveAccountCta(cta: HomeCta, visitorLabel: string): { label: string; href: string } | null {
  switch (cta.kind) {
    case "visitor":
      return { label: visitorLabel, href: SIGN_UP_HREF };
    case "member":
      return { label: cta.label, href: cta.href };
    case "none":
      return null;
  }
}

import { z } from "zod";
import {
  PROFILE_LIMITS,
  type DeveloperProfileFieldErrors,
  type DeveloperProfileFieldName,
} from "@/modules/profile/types/developer-profile.types";

const L = PROFILE_LIMITS;
const URL_ERROR = "Escribe la URL completa, empezando por https://";

function isValidHttpsUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

const linkSchema = z
  .object({
    type: z.enum(["github", "linkedin", "portfolio", "other"], {
      error: "Tipo de enlace no válido",
    }),
    url: z
      .string({ error: URL_ERROR })
      .trim()
      .min(1, URL_ERROR)
      .max(L.links.urlMax, `La URL no puede superar ${L.links.urlMax} caracteres`)
      .refine(isValidHttpsUrl, URL_ERROR),
  })
  .strict();

const emailChecker = z.email();

export const developerProfileInputSchema = z
  .object({
    headline: z
      .string({ error: "El titular es obligatorio" })
      .trim()
      .min(L.headline.min, "El titular es obligatorio")
      .max(L.headline.max, `El titular no puede superar ${L.headline.max} caracteres`),
    location: z
      .string({ error: "Ubicación no válida" })
      .trim()
      .max(L.location.max, `La ubicación no puede superar ${L.location.max} caracteres`)
      .transform((v) => (v === "" ? null : v)),
    availability: z.enum(["available", "partial", "unavailable"], {
      error: "Selecciona una disponibilidad válida",
    }),
    bio: z
      .string({ error: "La biografía no es válida" })
      .trim()
      .max(L.bio.max, `La biografía no puede superar ${L.bio.max} caracteres`),
    links: z
      .array(linkSchema, { error: "Enlaces no válidos" })
      .max(L.links.maxItems, `Máximo ${L.links.maxItems} enlaces`),
    contactEmail: z
      .string({ error: "Correo no válido" })
      .trim()
      .max(L.contactEmail.max, `El correo no puede superar ${L.contactEmail.max} caracteres`)
      .refine((v) => v === "" || emailChecker.safeParse(v).success, "Escribe un correo válido")
      .transform((v) => (v === "" ? null : v)),
    contactVisibility: z.enum(["accepted_client", "any_client", "nobody"], {
      error: "Selecciona quién puede ver tu correo",
    }),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.links.forEach((link, index) => {
      if (seen.has(link.url)) {
        ctx.addIssue({
          code: "custom",
          path: ["links", index, "url"],
          message: "Este enlace ya está en tu lista",
        });
      }
      seen.add(link.url);
    });
  });

export type DeveloperProfileInput = z.output<typeof developerProfileInputSchema>;

const FIELD_NAMES: readonly DeveloperProfileFieldName[] = [
  "headline",
  "location",
  "availability",
  "bio",
  "links",
  "contactEmail",
  "contactVisibility",
];

/** First message per field; per-link errors are reported under `links`. */
export function toDeveloperProfileFieldErrors(error: z.ZodError): DeveloperProfileFieldErrors {
  const fieldErrors: DeveloperProfileFieldErrors = {};
  for (const issue of error.issues) {
    const name = issue.path[0];
    const field = FIELD_NAMES.find((f) => f === name);
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

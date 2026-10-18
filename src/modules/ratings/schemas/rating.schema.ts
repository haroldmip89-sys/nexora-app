import { z } from "zod";
import { RATING_COMMENT_MAX } from "@/modules/ratings/types/rating.types";

const RATING_ERROR = "Elige entre 1 y 5 estrellas.";

export const ratingInputSchema = z.object({
  // Arrives as a string from FormData; missing/empty/non-numeric all fail with RATING_ERROR.
  rating: z.coerce
    .number({ error: RATING_ERROR })
    .int(RATING_ERROR)
    .min(1, RATING_ERROR)
    .max(5, RATING_ERROR),
  comment: z
    .string()
    .trim()
    .max(RATING_COMMENT_MAX, `El comentario no puede superar ${RATING_COMMENT_MAX} caracteres.`)
    .refine((v) => !v.includes("\u0000"), "El comentario contiene caracteres no válidos.") // Postgres rejects NUL in text
    .optional()
    .transform((v) => (v ? v : null)),
});

export type RatingInput = z.infer<typeof ratingInputSchema>;

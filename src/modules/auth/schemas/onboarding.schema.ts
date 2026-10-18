import { z } from "zod";

/** `admin` is intentionally not selectable: it is assigned manually in the DB. */
export const onboardingSchema = z.object({
  role: z.enum(["client", "developer"]),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

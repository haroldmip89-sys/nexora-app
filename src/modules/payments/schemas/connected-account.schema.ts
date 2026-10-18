import { z } from "zod";

/** `?onboarding=` is user-controlled and informative only: anything unknown becomes undefined. */
export const payoutsPageQuerySchema = z.object({
  onboarding: z.enum(["returned", "link_failed", "sync_failed"]).optional().catch(undefined),
});

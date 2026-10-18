import { z } from "zod";

export const startCheckoutInputSchema = z.object({ projectId: z.uuid() });

/** `?checkout=` is user-controlled and informative only: anything unknown becomes undefined. */
export const paymentPageQuerySchema = z.object({
  checkout: z.enum(["success", "cancel"]).optional().catch(undefined),
});

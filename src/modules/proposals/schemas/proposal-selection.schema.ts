import { z } from "zod";

/**
 * Input of `selectProposalAction`. `seenUpdatedAt` is the ISO-8601 string (with milliseconds)
 * of `ClientProposalSummary.updatedAt` the client had on screen; extra keys are ignored.
 */
export const selectProposalInputSchema = z.object({
  projectId: z.uuid(),
  proposalId: z.uuid(),
  seenUpdatedAt: z.iso
    .datetime()
    .refine((value) => !Number.isNaN(new Date(value).getTime()))
    .transform((value) => new Date(value)),
});

import type {
  ContactState,
  ContactVisibility,
  ProfileViewer,
} from "@/modules/profile/types/developer-profile.types";

export type ResolveContactEmailArgs = {
  contactEmail: string | null;
  visibility: ContactVisibility;
  viewer: ProfileViewer | null;
  ownerId: string;
  viewerHasAcceptedProposalWithOwner: boolean;
};

/** Decides, server-side, whether the viewer may see the contact email (spec 019 RF4). */
export function resolveContactEmail(args: ResolveContactEmailArgs): {
  email: string | null;
  state: ContactState;
} {
  const { contactEmail, visibility, viewer, ownerId, viewerHasAcceptedProposalWithOwner } = args;
  if (!contactEmail) return { email: null, state: "none" };
  if (viewer && viewer.id === ownerId) return { email: contactEmail, state: "visible" };
  if (visibility === "nobody") return { email: null, state: "hidden_by_owner" };
  if (!viewer || viewer.role !== "client") return { email: null, state: "restricted" };
  if (visibility === "any_client") return { email: contactEmail, state: "visible" };
  if (viewerHasAcceptedProposalWithOwner) return { email: contactEmail, state: "visible" };
  return { email: null, state: "restricted" };
}

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROPOSAL_STATUS_LABELS,
  type ProposalStatus,
} from "@/modules/proposals/types/proposal.types";

// Each status differs in luminosity and in border/weight, not only in hue.
const STATUS_STYLES: Record<ProposalStatus, string> = {
  pending: "border-transparent bg-[#DCE6DE] text-[#183D30]",
  accepted: "border-transparent bg-[#183D30] font-semibold text-white",
  rejected: "border-transparent bg-[#202522] text-[#E3E8E3]",
  withdrawn: "border-[#C9D1CA] bg-white text-[#535E56]",
};

export function ProposalStatusBadge({
  status,
  className,
}: {
  status: ProposalStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto min-h-5 whitespace-normal py-0.5 text-center",
        STATUS_STYLES[status],
        className,
      )}
    >
      {PROPOSAL_STATUS_LABELS[status]}
    </Badge>
  );
}

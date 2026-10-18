import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/modules/projects/types/project.types";

// Each status differs in luminosity and in border/weight, not only in hue.
const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "border-[#C9D1CA] bg-white text-[#535E56]",
  published: "border-transparent bg-[#DCE6DE] text-[#183D30]",
  proposal_selected: "border-[#183D30] bg-[#F5F6F2] font-semibold text-[#183D30]",
  contracted: "border-transparent bg-[#183D30] font-semibold text-white",
  closed: "border-transparent bg-[#202522] text-[#E3E8E3]",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
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
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

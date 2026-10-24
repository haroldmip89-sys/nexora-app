import Link from "next/link";
import { cn } from "@/lib/utils";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";

type Props = {
  developerId: string;
  name: string;
  className?: string;
};

/** Public developer profile link; opens in a new tab so a comparison or payment page is not lost. */
export function DeveloperProfileLink({ developerId, name, className }: Props) {
  return (
    <Link
      href={`/developers/${developerId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("break-words rounded-sm underline underline-offset-2 hover:text-[#183D30]", FOCUS, className)}
    >
      {name}
      <span className="sr-only"> (ver perfil, se abre en una pestaña nueva)</span>
    </Link>
  );
}

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type RatingStarsProps = {
  /** Whole number from 1 to 5 (the average is rounded for display). */
  value: number;
  className?: string;
  starClassName?: string;
};

const STARS = [1, 2, 3, 4, 5];

/** Read-only stars. Filled vs outline shape plus the aria-label carry the value (not only color). */
export function RatingStars({ value, className, starClassName }: RatingStarsProps) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span role="img" aria-label={`${rounded} de 5`} className={cn("inline-flex items-center gap-0.5", className)}>
      {STARS.map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn(
            "size-4",
            n <= rounded ? "fill-star text-star" : "fill-border text-border",
            starClassName,
          )}
        />
      ))}
    </span>
  );
}

import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-9 text-sm",
  md: "size-16 text-xl",
  lg: "size-24 text-3xl",
} as const;

type Props = {
  initials: string;
  displayName: string;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Default avatar: initials over a flat background (no image upload in 019). */
export function DeveloperAvatar({ initials, displayName, size = "md", className }: Props) {
  return (
    <div
      role="img"
      aria-label={`Foto por defecto de ${displayName}`}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-[#DCE6DE] font-semibold text-[#183D30]",
        SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{initials}</span>
    </div>
  );
}

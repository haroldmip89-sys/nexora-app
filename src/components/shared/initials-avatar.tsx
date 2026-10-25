import { cn } from "cn";
import { getInitials } from "@/lib/initials";

const SIZES = {
  sm: "size-[30px] text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

type InitialsAvatarProps = {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Decorative initials avatar: the name is already in the adjacent text. */
export function InitialsAvatar({ name, size = "md", className }: InitialsAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary font-extrabold text-primary",
        SIZES[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}

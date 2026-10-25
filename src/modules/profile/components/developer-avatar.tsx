import { UserAvatar } from "@/components/shared/user-avatar";

const SIZES = {
  sm: "size-9 text-sm",
  md: "size-16 text-xl",
  lg: "size-24 text-3xl",
  xl: "size-32 text-5xl",
} as const;

type Props = {
  displayName: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Developer avatar: Clerk photo with initials as fallback (decorative, the name sits beside it). */
export function DeveloperAvatar({ displayName, imageUrl, size = "md", className }: Props) {
  return (
    <UserAvatar
      name={displayName}
      imageUrl={imageUrl}
      className={[SIZES[size], className].filter(Boolean).join(" ")}
    />
  );
}

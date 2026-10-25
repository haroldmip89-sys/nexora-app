"use client";

import Image from "next/image";
import { useState } from "react";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { normalizeClerkImageUrl } from "@/lib/clerk-image";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-[30px]",
  md: "size-10",
  lg: "size-14",
} as const;

type UserAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Decorative avatar: Clerk photo when trusted, initials otherwise (also if the image fails). */
export function UserAvatar({ name, imageUrl, size = "md", className }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const safeUrl = normalizeClerkImageUrl(imageUrl, true);

  if (!safeUrl || failedUrl === safeUrl) {
    return <InitialsAvatar name={name} size={size} className={className} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-full bg-secondary",
        SIZES[size],
        className,
      )}
    >
      <Image
        src={safeUrl}
        alt=""
        fill
        sizes="128px"
        className="object-cover"
        onError={() => setFailedUrl(safeUrl)}
      />
    </span>
  );
}

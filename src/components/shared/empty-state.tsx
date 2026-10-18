import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = {
  title: string
  description?: string
  /** Call to action (e.g. a link or button). */
  action?: ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center",
        className,
      )}
    >
      <h2 className="text-lg font-medium">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

"use client";

import { useEffect, useState } from "react";
import { useAnnouncerStore } from "@/lib/announcer.store";
import { cn } from "@/lib/utils";

const TOAST_MS = 6000;

export function LiveAnnouncer() {
  const message = useAnnouncerStore((state) => state.message);
  const kind = useAnnouncerStore((state) => state.kind);
  const id = useAnnouncerStore((state) => state.id);
  // Visual copy of the last announcement: the emitting component often unmounts after a refresh,
  // so its own inline message disappears. Hidden from assistive tech (the regions below announce).
  const [dismissedId, setDismissedId] = useState(0);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setDismissedId(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, id]);

  const showToast = message !== "" && dismissedId !== id;

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message && kind === "status" ? <p key={id}>{message}</p> : null}
      </div>
      <div role="alert" aria-atomic="true" className="sr-only">
        {message && kind === "alert" ? <p key={id}>{message}</p> : null}
      </div>
      {showToast ? (
        <div
          aria-hidden="true"
          data-testid="visual-toast"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
        >
          <p
            className={cn(
              "max-w-md rounded-[10px] border px-4 py-3 text-sm shadow-md",
              kind === "alert"
                ? "border-destructive/30 bg-white text-destructive"
                : "border-[#183D30]/30 bg-white text-[#183D30]",
            )}
          >
            {message}
          </p>
        </div>
      ) : null}
    </>
  );
}

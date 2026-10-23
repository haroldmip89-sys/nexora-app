"use client";

import { useAnnouncerStore } from "@/lib/announcer.store";

export function LiveAnnouncer() {
  const message = useAnnouncerStore((state) => state.message);
  const kind = useAnnouncerStore((state) => state.kind);
  const id = useAnnouncerStore((state) => state.id);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message && kind === "status" ? <p key={id}>{message}</p> : null}
      </div>
      <div role="alert" aria-atomic="true" className="sr-only">
        {message && kind === "alert" ? <p key={id}>{message}</p> : null}
      </div>
    </>
  );
}

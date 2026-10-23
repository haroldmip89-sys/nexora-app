import { create } from "zustand";

export type AnnouncementKind = "status" | "alert";

export type AnnouncerState = {
  message: string;
  kind: AnnouncementKind;
  id: number;
  announce: (message: string, kind?: AnnouncementKind) => void;
  clear: () => void;
};

export const useAnnouncerStore = create<AnnouncerState>((set) => ({
  message: "",
  kind: "status",
  id: 0,
  announce: (message, kind = "status") =>
    set((state) => ({ message, kind, id: state.id + 1 })),
  clear: () => set({ message: "" }),
}));

/** Shortcut for code outside render and handlers. */
export function announce(message: string, kind?: AnnouncementKind): void {
  useAnnouncerStore.getState().announce(message, kind);
}

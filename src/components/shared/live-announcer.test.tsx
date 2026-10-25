import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announce, useAnnouncerStore } from "@/lib/announcer.store";
import { LiveAnnouncer } from "./live-announcer";

function Emitter() {
  return (
    <button type="button" onClick={() => announce("Hecho")}>
      emit
    </button>
  );
}

describe("LiveAnnouncer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    act(() => useAnnouncerStore.setState({ message: "", kind: "status", id: 0 }));
  });

  it("renders both regions before any announcement", () => {
    render(<LiveAnnouncer />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("puts status messages in the status region", () => {
    render(<LiveAnnouncer />);
    act(() => announce("Guardado"));
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("puts alert messages in the alert region", () => {
    render(<LiveAnnouncer />);
    act(() => announce("Fallo", "alert"));
    expect(screen.getByRole("alert")).toHaveTextContent("Fallo");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("re-renders the node when the same text is repeated", () => {
    render(<LiveAnnouncer />);
    act(() => announce("Igual"));
    const first = within(screen.getByRole("status")).getByText("Igual");
    act(() => announce("Igual"));
    const second = within(screen.getByRole("status")).getByText("Igual");
    expect(second).not.toBe(first);
  });

  it("keeps the message after the emitting component unmounts", () => {
    const { rerender } = render(
      <>
        <LiveAnnouncer />
        <Emitter />
      </>,
    );
    act(() => screen.getByRole("button", { name: "emit" }).click());
    rerender(<LiveAnnouncer />);
    expect(screen.queryByRole("button", { name: "emit" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Hecho");
  });
  describe("visual toast", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows a copy hidden from assistive tech and keeps it after the emitter unmounts", () => {
      const { rerender } = render(
        <>
          <LiveAnnouncer />
          <Emitter />
        </>,
      );
      expect(screen.queryByTestId("visual-toast")).toBeNull();
      act(() => screen.getByRole("button", { name: "emit" }).click());
      rerender(<LiveAnnouncer />);
      const toast = screen.getByTestId("visual-toast");
      expect(toast).toHaveAttribute("aria-hidden", "true");
      expect(toast).toHaveTextContent("Hecho");
    });

    it("disappears after a few seconds but the live region keeps the message", () => {
      vi.useFakeTimers();
      render(<LiveAnnouncer />);
      act(() => announce("Guardado"));
      expect(screen.getByTestId("visual-toast")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(6100);
      });
      expect(screen.queryByTestId("visual-toast")).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Guardado");
    });

    it("a new announcement shows the toast again", () => {
      vi.useFakeTimers();
      render(<LiveAnnouncer />);
      act(() => announce("Uno"));
      act(() => {
        vi.advanceTimersByTime(6100);
      });
      expect(screen.queryByTestId("visual-toast")).toBeNull();
      act(() => announce("Dos"));
      expect(screen.getByTestId("visual-toast")).toHaveTextContent("Dos");
    });
  });
});

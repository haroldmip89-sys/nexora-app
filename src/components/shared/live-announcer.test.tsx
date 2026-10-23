import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    const first = screen.getByText("Igual");
    act(() => announce("Igual"));
    const second = screen.getByText("Igual");
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
});

// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { announce, useAnnouncerStore } from "./announcer.store";

describe("announcer store", () => {
  beforeEach(() => {
    useAnnouncerStore.setState({ message: "", kind: "status", id: 0 });
  });

  it("updates message and kind and increments id", () => {
    announce("Hola", "alert");
    const first = useAnnouncerStore.getState();
    expect(first.message).toBe("Hola");
    expect(first.kind).toBe("alert");
    expect(first.id).toBe(1);

    announce("Hola", "alert");
    expect(useAnnouncerStore.getState().id).toBe(2);
  });

  it("defaults kind to status", () => {
    useAnnouncerStore.getState().announce("Listo");
    expect(useAnnouncerStore.getState().kind).toBe("status");
  });

  it("clear empties the message", () => {
    announce("Listo");
    useAnnouncerStore.getState().clear();
    expect(useAnnouncerStore.getState().message).toBe("");
  });
});

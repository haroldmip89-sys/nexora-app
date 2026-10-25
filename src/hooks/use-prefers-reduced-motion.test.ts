import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePrefersReducedMotion } from "./use-prefers-reduced-motion";

function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const addEventListener = vi.fn((_: string, cb: () => void) => listeners.add(cb));
  const removeEventListener = vi.fn((_: string, cb: () => void) =>
    listeners.delete(cb),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener,
      removeEventListener,
    })),
  );
  return {
    addEventListener,
    removeEventListener,
    set(value: boolean) {
      matches = value;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns false when the query does not match", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it("returns true when the query matches", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it("reacts to change events", () => {
    const mq = mockMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    act(() => mq.set(false));
    expect(result.current).toBe(false);
  });

  it("removes the listener on unmount", () => {
    const mq = mockMatchMedia(false);
    const { unmount } = renderHook(() => usePrefersReducedMotion());
    expect(mq.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledWith(
      "change",
      mq.addEventListener.mock.calls[0][1],
    );
  });
});

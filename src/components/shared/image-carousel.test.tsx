import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCarousel } from "./image-carousel";

const slides = [{ src: "/a.webp" }, { src: "/b.webp" }, { src: "/c.webp" }];

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduce,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function activeIndex(container: HTMLElement) {
  return Array.from(container.querySelectorAll("[data-active]")).findIndex(
    (el) => el.getAttribute("data-active") === "true",
  );
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ImageCarousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts on the first slide and loops every interval", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    expect(activeIndex(container)).toBe(0);
    tick(3000);
    expect(activeIndex(container)).toBe(1);
    tick(3000);
    expect(activeIndex(container)).toBe(2);
    tick(3000);
    expect(activeIndex(container)).toBe(0);
  });

  it("respects a custom interval", () => {
    const { container } = render(<ImageCarousel slides={slides} intervalMs={1000} />);
    tick(999);
    expect(activeIndex(container)).toBe(0);
    tick(1);
    expect(activeIndex(container)).toBe(1);
  });

  it("pauses and resumes with the button", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    const pause = screen.getByRole("button", { name: "Pausar carrusel" });
    fireEvent.click(pause);
    tick(9000);
    expect(activeIndex(container)).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Reproducir carrusel" }));
    tick(3000);
    expect(activeIndex(container)).toBe(1);
  });

  it("pauses on mouse enter and resumes on mouse leave", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    fireEvent.mouseEnter(container.firstElementChild!);
    tick(6000);
    expect(activeIndex(container)).toBe(0);
    fireEvent.mouseLeave(container.firstElementChild!);
    tick(3000);
    expect(activeIndex(container)).toBe(1);
  });

  it("pauses on focus and resumes on blur", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    const button = screen.getByRole("button", { name: "Pausar carrusel" });
    fireEvent.focus(button);
    tick(6000);
    expect(activeIndex(container)).toBe(0);
    fireEvent.blur(button);
    tick(3000);
    expect(activeIndex(container)).toBe(1);
  });

  it("does not resume a manual pause on mouse leave", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    fireEvent.click(screen.getByRole("button", { name: "Pausar carrusel" }));
    fireEvent.mouseEnter(container.firstElementChild!);
    fireEvent.mouseLeave(container.firstElementChild!);
    tick(6000);
    expect(activeIndex(container)).toBe(0);
  });

  it("does not advance and hides the button with reduced motion", () => {
    mockReducedMotion(true);
    const { container } = render(<ImageCarousel slides={slides} />);
    tick(9000);
    expect(activeIndex(container)).toBe(0);
    expect(screen.queryByRole("button")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("has no timer or button with a single slide", () => {
    render(<ImageCarousel slides={[slides[0]]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves no timers after unmount", () => {
    const { unmount } = render(<ImageCarousel slides={slides} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders decorative images inside an aria-hidden container", () => {
    const { container } = render(<ImageCarousel slides={slides} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(3);
    images.forEach((img) => expect(img).toHaveAttribute("alt", ""));
    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(
      images[0],
    );
  });
  it("applies slidesClassName to the image layer and controlsClassName to the pause button", () => {
    const { container } = render(
      <ImageCarousel
        slides={slides}
        slidesClassName="fade-mask"
        controlsClassName="right-4"
      />,
    );
    expect(container.querySelector('[aria-hidden="true"].fade-mask')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Pausar carrusel" })).toHaveClass("right-4");
  });
});

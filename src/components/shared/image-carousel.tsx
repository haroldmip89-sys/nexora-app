"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type CarouselSlide = { src: string; alt?: string };

type ImageCarouselProps = {
  slides: CarouselSlide[];
  intervalMs?: number;
  className?: string;
  /** Extra classes for the layer that holds the images (e.g. a fade mask). */
  slidesClassName?: string;
  /** Overrides the position of the pause button (default: bottom-left). */
  controlsClassName?: string;
  sizes?: string;
};

export function ImageCarousel({
  slides,
  intervalMs = 3000,
  className,
  slidesClassName,
  controlsClassName,
  sizes,
}: ImageCarouselProps) {
  const count = slides.length;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const animated = count >= 2 && !reducedMotion;
  const running = animated && playing && !hovered && !focused;
  const activeIndex = animated ? index : 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [running, count, intervalMs]);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div aria-hidden="true" className={cn("absolute inset-0", slidesClassName)}>
        {slides.map((slide, i) => {
          const offset = (i - activeIndex + count) % count;
          const translate = offset === 0 ? "0%" : offset === 1 ? "100%" : "-100%";
          return (
            <div
              key={slide.src}
              data-active={offset === 0}
              className={cn(
                "absolute inset-0",
                animated &&
                  offset !== 1 &&
                  "motion-safe:transition-transform motion-safe:duration-[600ms] motion-safe:ease-in-out",
              )}
              style={{ transform: `translateX(${translate})` }}
            >
              <Image
                src={slide.src}
                alt={slide.alt ?? ""}
                fill
                sizes={sizes}
                loading={i === 0 ? "eager" : "lazy"}
                className="object-cover object-center"
              />
            </div>
          );
        })}
      </div>
      {animated && (
        <Button
          type="button"
          variant="outline"
          size="touch"
          className={cn("absolute bottom-4 left-4", controlsClassName)}
          aria-label={playing ? "Pausar carrusel" : "Reproducir carrusel"}
          onClick={() => setPlaying((p) => !p)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-4"
          >
            {playing ? (
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            ) : (
              <path d="M8 5v14l11-7z" />
            )}
          </svg>
        </Button>
      )}
    </div>
  );
}

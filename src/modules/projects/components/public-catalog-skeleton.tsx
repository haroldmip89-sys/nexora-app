const PLACEHOLDERS = Array.from({ length: 6 }, (_, index) => index);

const BLOCK = "rounded bg-border animate-pulse motion-reduce:animate-none";

export function PublicCatalogSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Cargando proyectos…</span>
      <ul
        aria-hidden="true"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"
      >
        {PLACEHOLDERS.map((key) => (
          <li
            key={key}
            className="flex flex-col gap-3 surface p-5 sm:p-[22px]"
          >
            <div className={`${BLOCK} h-5 w-1/3`} />
            <div className={`${BLOCK} h-5 w-4/5`} />
            <div className={`${BLOCK} h-4 w-full`} />
            <div className={`${BLOCK} h-4 w-2/3`} />
            <div className="flex gap-2">
              <div className={`${BLOCK} h-5 w-14`} />
              <div className={`${BLOCK} h-5 w-14`} />
            </div>
            <div className={`${BLOCK} mt-2 h-4 w-1/2`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

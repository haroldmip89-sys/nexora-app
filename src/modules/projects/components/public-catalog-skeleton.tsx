const PLACEHOLDERS = Array.from({ length: 6 }, (_, index) => index);

const BLOCK = "rounded bg-[#E3E8E3] animate-pulse motion-reduce:animate-none";

export function PublicCatalogSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Cargando proyectos…</span>
      <ul
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {PLACEHOLDERS.map((key) => (
          <li
            key={key}
            className="flex flex-col gap-3 rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5"
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

export function PaymentsLoading({ label = "Cargando pago de prueba..." }: { label?: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6" aria-busy="true">
      <p role="status" className="text-sm text-[#535E56]">
        {label}
      </p>
      <div className="mt-4 flex flex-col gap-3" aria-hidden="true">
        <div className="h-16 animate-pulse rounded-xl bg-[#DCE6DE] motion-reduce:animate-none" />
        <div className="h-32 animate-pulse rounded-xl bg-[#DCE6DE] motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-xl bg-[#DCE6DE] motion-reduce:animate-none" />
      </div>
    </main>
  );
}

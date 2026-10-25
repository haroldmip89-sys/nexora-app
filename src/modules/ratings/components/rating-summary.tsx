import Link from "next/link";
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types";
import { RatingStars } from "./rating-stars";

type RatingSummaryProps = { summary: DeveloperRatingSummary; developerId: string };

const averageFormat = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Own-account summary (used only in "Mi cuenta"; the public profile uses the `rating` prop). */
export function RatingSummary({ summary, developerId }: RatingSummaryProps) {
  if (summary.count === 0 || summary.average === null) {
    return <p className="text-sm text-muted-foreground">Aún sin valoraciones</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[40px] leading-none font-extrabold tracking-tight text-primary">
          {averageFormat.format(summary.average)}
        </span>
        <div className="flex flex-col gap-1">
          <RatingStars value={summary.average} />
          <span className="text-sm text-muted-foreground">
            de 5 · {summary.count} {summary.count === 1 ? "valoración" : "valoraciones"}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        La calculan las respuestas de tus clientes. No se puede editar.
      </p>
      <Link
        href={`/developers/${developerId}#valoraciones`}
        className="inline-flex min-h-11 w-fit items-center rounded-lg text-sm font-medium text-primary underline outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        Ver valoraciones recibidas
      </Link>
    </div>
  );
}

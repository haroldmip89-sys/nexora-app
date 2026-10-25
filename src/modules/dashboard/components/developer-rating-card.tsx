import Link from "next/link";
import type { DeveloperRatingSummary } from "@/modules/profile/types/developer-profile.types";
import { RatingStars } from "@/modules/ratings/components/rating-stars";

const averageFormat = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Props = { summary: DeveloperRatingSummary; developerId: string };

export function DeveloperRatingCard({ summary, developerId }: Props) {
  const hasRatings = summary.count > 0 && summary.average !== null;

  return (
    <section
      aria-labelledby="developer-rating-title"
      className="flex flex-wrap items-center gap-5 rounded-2xl bg-primary p-6 text-primary-foreground"
    >
      <div className="flex min-w-0 flex-1 basis-44 flex-col gap-1">
        <h2
          id="developer-rating-title"
          className="text-[13px] font-bold tracking-[0.06em] text-on-dark uppercase"
        >
          Valoración media
        </h2>
        {hasRatings ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[40px] leading-none font-extrabold">
              {averageFormat.format(summary.average as number)}
            </span>
            <span className="text-[15px] text-on-dark">
              de 5 · {summary.count} {summary.count === 1 ? "valoración" : "valoraciones"}
            </span>
          </p>
        ) : (
          <p className="text-lg font-extrabold">Aún sin valoraciones</p>
        )}
        <Link
          href={`/developers/${developerId}#valoraciones`}
          className="mt-1 inline-flex min-h-11 w-fit items-center rounded-lg text-sm font-bold text-primary-foreground underline outline-none focus-visible:ring-3 focus-visible:ring-primary-foreground/40"
        >
          Ver valoraciones recibidas
        </Link>
      </div>
      {hasRatings ? (
        <RatingStars
          value={summary.average as number}
          starClassName="size-6 fill-star-on-dark text-star-on-dark"
          className="gap-1"
        />
      ) : null}
    </section>
  );
}

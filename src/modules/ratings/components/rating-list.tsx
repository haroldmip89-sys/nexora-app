import { EmptyState } from "@/components/shared/empty-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import type { PublicDeveloperRating } from "../types/rating.types";
import { RatingStars } from "./rating-stars";

type RatingListProps = { ratings: PublicDeveloperRating[] };

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" });

export function RatingList({ ratings }: RatingListProps) {
  if (ratings.length === 0) {
    return <EmptyState title="Aún sin valoraciones" />;
  }

  return (
    <ul className="flex flex-col">
      {ratings.map((item, index) => (
        <li
          key={index}
          className="flex gap-3 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0"
        >
          <InitialsAvatar name={item.clientName} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-foreground">{item.clientName}</span>
              <RatingStars value={item.rating} />
              <span className="text-sm text-muted-foreground">{item.rating} de 5</span>
              <time dateTime={item.createdAt.toISOString()} className="text-sm text-muted-foreground">
                {dateFormat.format(item.createdAt)}
              </time>
            </div>
            {item.comment ? (
              <p className="text-sm break-words whitespace-pre-line text-foreground">{item.comment}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

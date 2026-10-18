import { EmptyState } from "@/components/shared/empty-state";
import type { PublicDeveloperRating } from "../types/rating.types";
import { RatingStars } from "./rating-stars";

type RatingListProps = { ratings: PublicDeveloperRating[] };

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" });

export function RatingList({ ratings }: RatingListProps) {
  if (ratings.length === 0) {
    return <EmptyState title="Aún sin valoraciones" />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {ratings.map((item, index) => (
        <li key={index} className="flex flex-col gap-2 border-b border-[#183D30]/10 pb-4 last:border-b-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <RatingStars value={item.rating} />
            <span className="text-sm font-medium text-[#202522]">{item.clientName}</span>
            <time dateTime={item.createdAt.toISOString()} className="text-sm text-[#202522]/70">
              {dateFormat.format(item.createdAt)}
            </time>
          </div>
          {item.comment ? (
            <p className="text-sm break-words whitespace-pre-line text-[#202522]">{item.comment}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

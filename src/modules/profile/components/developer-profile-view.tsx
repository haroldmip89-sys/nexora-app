import { Globe, Link2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MarkdownContent } from "@/components/shared/markdown-content";
import { cn } from "@/lib/utils";
import type { Role } from "@/modules/auth/types/auth.types";
import { DeveloperAvatar } from "@/modules/profile/components/developer-avatar";
import {
  AVAILABILITY_LABELS,
  LINK_TYPE_LABELS,
  type DeveloperRatingSummary,
  type ProfileLink,
  type ProfileLinkType,
  type PublicDeveloperProfile,
} from "@/modules/profile/types/developer-profile.types";
import { RatingStars } from "@/modules/ratings/components/rating-stars";

type Props = {
  profile: PublicDeveloperProfile;
  isOwner: boolean;
  viewerRole: Role | null;
  rating?: DeveloperRatingSummary;
  reviewsSlot?: ReactNode;
};

const RATING_FORMATTER = new Intl.NumberFormat("es", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const CARD = "surface p-5 sm:p-6";
const CARD_TITLE = "text-lg font-semibold text-foreground";

function pluralize(count: number) {
  return count === 1 ? "valoración" : "valoraciones";
}

function RatingBlock({ rating }: { rating: DeveloperRatingSummary }) {
  if (rating.count === 0 || rating.average === null) {
    return <p className="text-sm text-muted-foreground">Aún sin valoraciones</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <RatingStars value={rating.average} starClassName="size-5" />
      <strong className="text-lg font-bold text-foreground">
        {RATING_FORMATTER.format(rating.average)}
      </strong>
      <span className="text-sm text-muted-foreground">
        ({rating.count} {pluralize(rating.count)})
      </span>
    </div>
  );
}

function LinkIcon({ type }: { type: ProfileLinkType }) {
  const svgProps = {
    "aria-hidden": true,
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "shrink-0 text-primary",
  };
  if (type === "github") {
    return (
      <svg {...svgProps}>
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3.1-.4 6.4-1.6 6.4-7A5.4 5.4 0 0 0 20 4.8 5 5 0 0 0 19.9 1S18.7.7 16 2.5a13.4 13.4 0 0 0-7 0C6.3.7 5.1 1 5.1 1A5 5 0 0 0 5 4.8a5.4 5.4 0 0 0-1.5 3.7c0 5.4 3.3 6.6 6.4 7A3.4 3.4 0 0 0 9 18.1V22" />
      </svg>
    );
  }
  if (type === "linkedin") {
    return (
      <svg {...svgProps}>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </svg>
    );
  }
  const Icon = type === "portfolio" ? Globe : Link2;
  return <Icon aria-hidden="true" className="size-[18px] shrink-0 text-primary" />;
}

/** Contact section copy by state (RF4). Hidden states render nothing. */
function ContactSection({
  profile,
  viewerRole,
}: {
  profile: PublicDeveloperProfile;
  viewerRole: Role | null;
}) {
  const { contactState, contactEmail, displayName } = profile;
  if (contactState === "none" || contactState === "hidden_by_owner") return null;

  let content: ReactNode;
  if (contactState === "visible" && contactEmail) {
    content = (
      <a
        href={`mailto:${contactEmail}`}
        className={cn(
          "inline-flex min-h-11 max-w-full items-center break-all rounded-sm text-sm font-medium text-primary underline",
          FOCUS_RING,
        )}
      >
        {contactEmail}
      </a>
    );
  } else {
    const text =
      viewerRole === null
        ? "Inicia sesión como cliente para ver el correo"
        : viewerRole === "client"
          ? `Visible cuando contrates a ${displayName}`
          : "Solo visible para clientes";
    content = <p className="break-words text-sm text-muted-foreground">{text}</p>;
  }

  return (
    <section aria-labelledby="developer-contact" className={CARD}>
      <h2 id="developer-contact" className={CARD_TITLE}>
        Contacto
      </h2>
      <div className="mt-2">{content}</div>
    </section>
  );
}

function getLinkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.host : null;
  } catch {
    return null;
  }
}

function LinksSection({ links }: { links: ProfileLink[] }) {
  const items = links
    .map((link) => ({ link, host: getLinkHost(link.url) }))
    .filter((item): item is { link: ProfileLink; host: string } => item.host !== null);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="developer-links" className={CARD}>
      <h2 id="developer-links" className={CARD_TITLE}>
        Enlaces
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map(({ link, host }) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-[10px] border border-border px-3 py-1 text-sm text-foreground hover:bg-surface-subtle",
                FOCUS_RING,
              )}
            >
              <LinkIcon type={link.type} />
              <span className="flex-1 font-medium">{LINK_TYPE_LABELS[link.type]}</span>
              <span className="min-w-0 break-all text-[13px] text-muted-foreground">{host}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Markdown bio (same safe renderer as project descriptions, spec 018). */
function DeveloperBio({ bio }: { bio: string }) {
  return <MarkdownContent source={bio} className="text-sm [&>:first-child]:mt-0 [&>:last-child]:mb-0" />;
}

/** Public developer profile. Presentational: the page provides `<main>`. */
export function DeveloperProfileView({
  profile,
  isOwner,
  viewerRole,
  rating,
  reviewsSlot,
}: Props) {
  const location = profile.location?.trim() ? profile.location : null;
  const bio = profile.bio?.trim() ? profile.bio : null;
  const headlineLine = [profile.headline, location].filter(Boolean).join(" · ");

  return (
    <article className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <aside
          aria-label="Resumen del desarrollador"
          className={cn(CARD, "flex flex-col items-center gap-3 text-center")}
        >
          <DeveloperAvatar
            displayName={profile.displayName}
            imageUrl={profile.imageUrl}
            size="xl"
          />
          <h1 className="break-words text-2xl font-extrabold tracking-tight text-foreground">
            {profile.displayName}
          </h1>
          {headlineLine ? (
            <p className="break-words text-sm text-muted-foreground">{headlineLine}</p>
          ) : null}
          {rating ? <RatingBlock rating={rating} /> : null}
          {profile.availability ? (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
              {AVAILABILITY_LABELS[profile.availability]}
            </span>
          ) : null}
          {isOwner ? (
            <Link
              href="/dashboard/account"
              className={cn(
                "mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover",
                FOCUS_RING,
              )}
            >
              Editar mi perfil
            </Link>
          ) : null}
        </aside>

        <ContactSection profile={profile} viewerRole={viewerRole} />
        <LinksSection links={profile.links} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="developer-about" className={CARD}>
          <h2 id="developer-about" className={CARD_TITLE}>
            Sobre mí
          </h2>
          <div className="mt-2">
            {!profile.hasProfile ? (
              <p className="text-sm text-muted-foreground">
                Este desarrollador aún no completó su perfil
              </p>
            ) : bio ? (
              <DeveloperBio bio={bio} />
            ) : (
              <p className="text-sm text-muted-foreground">Sin biografía todavía</p>
            )}
          </div>
        </section>

        {reviewsSlot ? (
          <section aria-labelledby="developer-reviews" id="valoraciones" className={CARD}>
            <h2 id="developer-reviews" className={CARD_TITLE}>
              Valoraciones
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Solo clientes con un proyecto contratado pueden valorar.
            </p>
            {rating && rating.count > 0 && rating.average !== null ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-5xl leading-none font-extrabold tracking-tight text-primary">
                  {RATING_FORMATTER.format(rating.average)}
                </span>
                <div className="flex flex-col gap-1">
                  <RatingStars value={rating.average} starClassName="size-5" />
                  <span className="text-sm text-muted-foreground">
                    promedio de {rating.count} {pluralize(rating.count)}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="mt-4">{reviewsSlot}</div>
          </section>
        ) : null}
      </div>
    </article>
  );
}

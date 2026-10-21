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
  type PublicDeveloperProfile,
} from "@/modules/profile/types/developer-profile.types";

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

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const CARD = "rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5";

function RatingBlock({ rating }: { rating: DeveloperRatingSummary }) {
  if (rating.count === 0 || rating.average === null) {
    return <p className="text-sm text-[#535E56]">Aún sin valoraciones</p>;
  }
  const average = RATING_FORMATTER.format(rating.average);
  const label = rating.count === 1 ? "valoración" : "valoraciones";
  return (
    <span
      role="img"
      aria-label={`${average} de 5 estrellas`}
      className="text-sm font-medium text-[#202522]"
    >
      {average} · {rating.count} {label}
    </span>
  );
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
          "inline-flex min-h-11 max-w-full items-center break-all rounded-sm text-sm font-medium text-[#183D30] underline",
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
    content = <p className="break-words text-sm text-[#535E56]">{text}</p>;
  }

  return (
    <section aria-labelledby="developer-contact" className={CARD}>
      <h2 id="developer-contact" className="text-lg font-semibold text-[#202522]">
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
      <h2 id="developer-links" className="text-lg font-semibold text-[#202522]">
        Enlaces
      </h2>
      <ul className="mt-2 flex flex-col">
        {items.map(({ link, host }) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={cn(
                "flex min-h-11 flex-wrap items-center gap-x-2 rounded-sm text-sm text-[#183D30]",
                FOCUS_RING,
              )}
            >
              <span className="font-medium underline">{LINK_TYPE_LABELS[link.type]}</span>
              <span className="break-all text-[#535E56]">{host}</span>
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

  return (
    <article className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <aside
        aria-label="Resumen del desarrollador"
        className={cn(CARD, "flex flex-col items-start gap-4")}
      >
        <DeveloperAvatar
          initials={profile.initials}
          displayName={profile.displayName}
          size="lg"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-[#202522]">
            {profile.displayName}
          </h1>
          {profile.headline ? (
            <p className="break-words text-sm text-[#202522]">{profile.headline}</p>
          ) : null}
          {location ? <p className="break-words text-sm text-[#535E56]">{location}</p> : null}
        </div>
        {profile.availability ? (
          <span className="rounded-full bg-[#DCE6DE] px-2.5 py-1 text-xs font-medium text-[#183D30]">
            {AVAILABILITY_LABELS[profile.availability]}
          </span>
        ) : null}
        {rating ? <RatingBlock rating={rating} /> : null}
        {isOwner ? (
          <Link
            href="/dashboard/account"
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-lg bg-[#183D30] px-4 text-sm font-medium text-white hover:bg-[#183D30]/90",
              FOCUS_RING,
            )}
          >
            Editar mi perfil
          </Link>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="developer-about" className={CARD}>
          <h2 id="developer-about" className="text-lg font-semibold text-[#202522]">
            Sobre mí
          </h2>
          <div className="mt-2">
            {!profile.hasProfile ? (
              <p className="text-sm text-[#535E56]">
                Este desarrollador aún no completó su perfil
              </p>
            ) : bio ? (
              <DeveloperBio bio={bio} />
            ) : (
              <p className="text-sm text-[#535E56]">Sin biografía todavía</p>
            )}
          </div>
        </section>

        <ContactSection profile={profile} viewerRole={viewerRole} />
        <LinksSection links={profile.links} />

        {reviewsSlot ? (
          <section aria-labelledby="developer-reviews" id="valoraciones" className={CARD}>
            <h2 id="developer-reviews" className="text-lg font-semibold text-[#202522]">
              Valoraciones
            </h2>
            <div className="mt-2">{reviewsSlot}</div>
          </section>
        ) : null}
      </div>
    </article>
  );
}

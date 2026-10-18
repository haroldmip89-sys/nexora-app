"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { saveDeveloperProfileAction } from "@/modules/profile/actions/developer-profile.actions";
import { DeveloperAvatar } from "@/modules/profile/components/developer-avatar";
import {
  AVAILABILITY_LABELS,
  CONTACT_VISIBILITY_LABELS,
  LINK_TYPE_LABELS,
  PROFILE_LIMITS,
  type ContactVisibility,
  type DeveloperAvailability,
  type DeveloperProfileFieldErrors,
  type DeveloperProfileFieldName,
  type OwnDeveloperProfile,
  type ProfileLink,
  type ProfileLinkType,
} from "@/modules/profile/types/developer-profile.types";

type Props = {
  profile: OwnDeveloperProfile;
  initials: string;
  /** Slot for spec 020 ("Tu valoración"). The section is not rendered without it. */
  ratingSlot?: ReactNode;
};

type FormValues = Omit<OwnDeveloperProfile, "displayName" | "hasProfile">;
type LinkRow = ProfileLink & { key: number };

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const CONTROL = "min-h-11 rounded-[10px] border-[#E3E8E3] bg-white text-[#202522]";
const CARD = "rounded-[14px] border border-[#E3E8E3] bg-white p-4 sm:p-5";
const SECTION_TITLE = "text-lg font-semibold text-[#202522]";
const HINT = "text-xs text-[#535E56]";
const ERROR_TEXT = "text-sm text-[#B42318]";

const LINK_TYPES = Object.keys(LINK_TYPE_LABELS) as ProfileLinkType[];
const AVAILABILITIES = Object.keys(AVAILABILITY_LABELS) as DeveloperAvailability[];
const VISIBILITIES = Object.keys(CONTACT_VISIBILITY_LABELS) as ContactVisibility[];

function toValues(profile: OwnDeveloperProfile): FormValues {
  return {
    headline: profile.headline,
    location: profile.location,
    availability: profile.availability,
    bio: profile.bio,
    links: profile.links,
    contactEmail: profile.contactEmail,
    contactVisibility: profile.contactVisibility,
  };
}

function toRows(links: ProfileLink[]): LinkRow[] {
  return links.map((link, index) => ({ ...link, key: index }));
}

export function DeveloperProfileForm({ profile, initials, ratingSlot }: Props) {
  const router = useRouter();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const [saved, setSaved] = useState<FormValues>(() => toValues(profile));
  const [values, setValues] = useState<Omit<FormValues, "links">>(() => {
    const { links: _links, ...rest } = toValues(profile);
    void _links;
    return rest;
  });
  const [rows, setRows] = useState<LinkRow[]>(() => toRows(profile.links));
  const [nextKey, setNextKey] = useState(profile.links.length);
  const [errors, setErrors] = useState<DeveloperProfileFieldErrors>({});
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null);
  const [notice, setNotice] = useState<"saved" | null>(null);
  const [unknownError, setUnknownError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus();
  }, [focusTarget]);

  const L = PROFILE_LIMITS;
  const atMaxLinks = rows.length >= L.links.maxItems;

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function updateRow(key: number, patch: Partial<ProfileLink>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setNotice(null);
  }

  function addRow() {
    if (atMaxLinks) return;
    setRows((current) => [...current, { key: nextKey, type: "github", url: "" }]);
    setNextKey((k) => k + 1);
    setNotice(null);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
    setNotice(null);
  }

  function discard() {
    const { links, ...rest } = saved;
    setValues(rest);
    setRows(toRows(links));
    setNextKey(links.length);
    setErrors({});
    setUnknownError(null);
    setNotice(null);
  }

  function firstErrorId(fieldErrors: DeveloperProfileFieldErrors): string | null {
    const order: DeveloperProfileFieldName[] = [
      "headline",
      "location",
      "availability",
      "bio",
      "links",
      "contactEmail",
      "contactVisibility",
    ];
    const name = order.find((field) => fieldErrors[field]);
    if (!name) return null;
    if (name === "links") {
      return rows.length > 0 ? `${fid("link-url")}-${rows[0].key}` : fid("links-add");
    }
    if (name === "contactVisibility") return `${fid("visibility")}-${VISIBILITIES[0]}`;
    return fid(name);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setUnknownError(null);
    const links: ProfileLink[] = rows
      .filter((row) => row.url.trim() !== "")
      .map(({ type, url }) => ({ type, url }));

    startTransition(async () => {
      const result = await saveDeveloperProfileAction({ ...values, links });
      if (result.ok) {
        setErrors({});
        setSaved({ ...values, links });
        setNotice("saved");
        router.refresh();
        return;
      }
      if (result.code === "VALIDATION") {
        setErrors(result.fieldErrors);
        const id = firstErrorId(result.fieldErrors);
        if (id) setFocusTarget({ id });
        return;
      }
      setErrors({});
      setUnknownError(result.message);
    });
  }

  const describedBy = (name: string, ...extra: string[]) =>
    [...extra, errors[name as DeveloperProfileFieldName] ? `${fid(name)}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldError = (name: DeveloperProfileFieldName) =>
    errors[name] ? (
      <p id={`${fid(name)}-error`} role="alert" className={ERROR_TEXT}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6" aria-busy={pending}>
      <section aria-labelledby={fid("photo-title")} className={CARD}>
        <h2 id={fid("photo-title")} className={SECTION_TITLE}>
          Foto de perfil
        </h2>
        <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <DeveloperAvatar initials={initials} displayName={profile.displayName} size="lg" />
          <p className="text-sm text-[#535E56]">
            Tu foto por defecto se genera con tus iniciales. La subida de fotos llegará más
            adelante.
          </p>
        </div>
      </section>

      <section aria-labelledby={fid("basic-title")} className={CARD}>
        <h2 id={fid("basic-title")} className={SECTION_TITLE}>
          Información básica
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fid("displayName")} className="text-sm font-medium text-[#202522]">
              Nombre visible
            </Label>
            <Input
              id={fid("displayName")}
              value={profile.displayName}
              readOnly
              aria-readonly="true"
              aria-describedby={`${fid("displayName")}-hint`}
              className={cn(CONTROL, "bg-[#F5F6F2]")}
            />
            <p id={`${fid("displayName")}-hint`} className={HINT}>
              Se gestiona desde tu cuenta de acceso
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fid("headline")} className="text-sm font-medium text-[#202522]">
              Titular
            </Label>
            <Input
              id={fid("headline")}
              value={values.headline}
              onChange={(e) => set("headline", e.target.value)}
              maxLength={L.headline.max}
              required
              aria-invalid={Boolean(errors.headline)}
              aria-describedby={describedBy("headline", `${fid("headline")}-hint`)}
              className={CONTROL}
            />
            <p id={`${fid("headline")}-hint`} className={HINT}>
              Hasta {L.headline.max} caracteres. Ej.: Desarrolladora full-stack
            </p>
            {fieldError("headline")}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fid("location")} className="text-sm font-medium text-[#202522]">
              Ubicación
            </Label>
            <Input
              id={fid("location")}
              value={values.location}
              onChange={(e) => set("location", e.target.value)}
              maxLength={L.location.max}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={describedBy("location")}
              className={CONTROL}
            />
            {fieldError("location")}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fid("availability")} className="text-sm font-medium text-[#202522]">
              Disponibilidad
            </Label>
            <NativeSelect
              id={fid("availability")}
              value={values.availability}
              onChange={(e) => set("availability", e.target.value as DeveloperAvailability)}
              aria-invalid={Boolean(errors.availability)}
              aria-describedby={describedBy("availability")}
              className="min-h-11 w-full"
            >
              {AVAILABILITIES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {AVAILABILITY_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {fieldError("availability")}
          </div>
        </div>
      </section>

      <section aria-labelledby={fid("bio-title")} className={CARD}>
        <h2 id={fid("bio-title")} className={SECTION_TITLE}>
          Biografía
        </h2>
        <div className="mt-3 flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={fid("bio")} className="text-sm font-medium text-[#202522]">
            Sobre ti
          </Label>
          <Textarea
            id={fid("bio")}
            value={values.bio}
            onChange={(e) => set("bio", e.target.value)}
            rows={6}
            aria-invalid={Boolean(errors.bio)}
            aria-describedby={describedBy("bio", `${fid("bio")}-hint`, `${fid("bio")}-count`)}
            className="rounded-[10px] border-[#E3E8E3] bg-white font-sans text-[#202522]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`${fid("bio")}-hint`} className={HINT}>
              Texto plano. Los saltos de línea se conservan.
            </p>
            <p
              id={`${fid("bio")}-count`}
              className={cn(HINT, values.bio.length > L.bio.max && "font-medium text-[#B42318]")}
            >
              {values.bio.length} / {L.bio.max}
            </p>
          </div>
          {fieldError("bio")}
        </div>
      </section>

      <section aria-labelledby={fid("links-title")} className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={fid("links-title")} className={SECTION_TITLE}>
            Enlaces
          </h2>
          <p className={HINT}>
            Hasta {L.links.maxItems} · solo https://
          </p>
        </div>
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="sm:w-40 sm:shrink-0">
                <Label htmlFor={`${fid("link-type")}-${row.key}`} className="sr-only">
                  Tipo del enlace {index + 1}
                </Label>
                <NativeSelect
                  id={`${fid("link-type")}-${row.key}`}
                  value={row.type}
                  onChange={(e) => updateRow(row.key, { type: e.target.value as ProfileLinkType })}
                  className="min-h-11 w-full"
                >
                  {LINK_TYPES.map((type) => (
                    <NativeSelectOption key={type} value={type}>
                      {LINK_TYPE_LABELS[type]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="min-w-0 flex-1">
                <Label htmlFor={`${fid("link-url")}-${row.key}`} className="sr-only">
                  URL del enlace {index + 1}
                </Label>
                <Input
                  id={`${fid("link-url")}-${row.key}`}
                  type="url"
                  inputMode="url"
                  value={row.url}
                  onChange={(e) => updateRow(row.key, { url: e.target.value })}
                  maxLength={L.links.urlMax}
                  placeholder="https://"
                  aria-invalid={Boolean(errors.links)}
                  aria-describedby={describedBy("links")}
                  className={CONTROL}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => removeRow(row.key)}
                aria-label={`Quitar enlace ${index + 1}`}
                className="min-h-11 rounded-[10px] px-4 sm:shrink-0"
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
        {fieldError("links")}
        <Button
          id={fid("links-add")}
          type="button"
          variant="outline"
          onClick={addRow}
          disabled={atMaxLinks}
          className="mt-3 min-h-11 rounded-[10px] px-4"
        >
          Añadir enlace
        </Button>
      </section>

      <section aria-labelledby={fid("contact-title")} className={CARD}>
        <h2 id={fid("contact-title")} className={SECTION_TITLE}>
          Contacto
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={fid("contactEmail")} className="text-sm font-medium text-[#202522]">
              Correo de contacto
            </Label>
            <Input
              id={fid("contactEmail")}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              maxLength={L.contactEmail.max}
              aria-invalid={Boolean(errors.contactEmail)}
              aria-describedby={describedBy("contactEmail", `${fid("contactEmail")}-hint`)}
              className={CONTROL}
            />
            <p id={`${fid("contactEmail")}-hint`} className={HINT}>
              No es el correo de tu cuenta de acceso; tu correo de acceso nunca se muestra
            </p>
            {fieldError("contactEmail")}
          </div>

          <fieldset
            className="flex min-w-0 flex-col gap-1"
            aria-describedby={describedBy("contactVisibility")}
          >
            <legend className="mb-1 text-sm font-medium text-[#202522]">
              ¿Quién ve tu correo?
            </legend>
            {VISIBILITIES.map((value) => (
              <label
                key={value}
                htmlFor={`${fid("visibility")}-${value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[#202522]"
              >
                <input
                  id={`${fid("visibility")}-${value}`}
                  type="radio"
                  name="contactVisibility"
                  value={value}
                  checked={values.contactVisibility === value}
                  onChange={() => set("contactVisibility", value)}
                  className={cn("size-5 shrink-0 accent-[#183D30]", FOCUS_RING)}
                />
                <span>{CONTACT_VISIBILITY_LABELS[value]}</span>
              </label>
            ))}
            {fieldError("contactVisibility")}
          </fieldset>
        </div>
      </section>

      {ratingSlot ? (
        <section aria-labelledby={fid("rating-title")} className={CARD}>
          <h2 id={fid("rating-title")} className={SECTION_TITLE}>
            Tu valoración
          </h2>
          <div className="mt-3">{ratingSlot}</div>
        </section>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-3">
        {notice === "saved" ? (
          <p
            role="status"
            className="rounded-[10px] bg-[#DCE6DE] p-3 text-sm font-medium text-[#183D30]"
          >
            Perfil guardado
          </p>
        ) : null}
        {unknownError ? (
          <p
            role="alert"
            className="rounded-[10px] border border-[#B42318]/30 bg-[#B42318]/5 p-3 text-sm text-[#B42318]"
          >
            {unknownError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={discard}
          disabled={pending}
          className="min-h-11 rounded-[10px] px-4"
        >
          Descartar cambios
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-[10px] bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
        >
          {pending ? "Guardando..." : "Guardar perfil"}
        </Button>
      </div>
    </form>
  );
}

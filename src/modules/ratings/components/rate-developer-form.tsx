"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import {
  createDeveloperRatingAction,
  updateDeveloperRatingAction,
} from "@/modules/ratings/actions/rating.actions";
import {
  RATING_COMMENT_MAX,
  RATING_EDIT_WINDOW_DAYS,
  type ProjectRatingView,
  type RatingFormState,
} from "@/modules/ratings/types/rating.types";

const IDLE: RatingFormState = { status: "idle" };
const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-[#183D30]/40";
const STAR_LABELS = ["Muy malo", "Malo", "Correcto", "Bueno", "Excelente"] as const;
const STARS = [1, 2, 3, 4, 5] as const;

function ratingText(value: number): string {
  return value >= 1 && value <= 5 ? `${value} de 5 · ${STAR_LABELS[value - 1]}` : "Elige una valoración";
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star
      aria-hidden="true"
      className={cn("size-9", filled ? "fill-[#B7791F] stroke-[#8A5A12]" : "fill-none stroke-[#9AA79D]")}
    />
  );
}

function ReadOnlyStars({ value }: { value: number }) {
  return (
    <div role="img" aria-label={`${value} de 5`} className="flex items-center gap-1">
      {STARS.map((n) => (
        <StarIcon key={n} filled={n <= value} />
      ))}
    </div>
  );
}

type Rating = NonNullable<ProjectRatingView["rating"]>;

function daysText(days: number): string {
  return `Te quedan ${days} ${days === 1 ? "día" : "días"} para editarla.`;
}

type FormProps = {
  projectId: string;
  developerName: string;
  previewName: string;
  existing: Rating | null;
};

function RatingForm({ projectId, developerName, previewName, existing }: FormProps) {
  const router = useRouter();
  const isEdit = existing !== null;
  const action = isEdit
    ? updateDeveloperRatingAction.bind(null, projectId)
    : createDeveloperRatingAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, IDLE);

  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const errors = state.status === "error" ? state.fieldErrors : {};
  const firstName = developerName.split(" ")[0] || developerName;

  return (
    <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
      <div aria-live="polite">
        {state.status === "error" && state.message ? (
          <p
            role="alert"
            className="rounded-[10px] border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p
            role="status"
            className="rounded-[10px] border border-[#183D30]/30 bg-[#183D30]/5 p-3 text-sm text-[#183D30]"
          >
            Valoración publicada.
          </p>
        ) : null}
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-[15px] font-semibold text-[#202522]">Valoración general</legend>
        <input type="hidden" name="rating" value={rating || ""} />
        <div className="flex flex-wrap items-center gap-1">
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={n === 1 ? "1 estrella" : `${n} estrellas`}
              aria-pressed={rating === n}
              aria-describedby={errors.rating ? "rating-error" : undefined}
              disabled={pending}
              onClick={() => setRating(n)}
              className={cn(
                "inline-flex size-[52px] min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl bg-transparent",
                "disabled:cursor-not-allowed disabled:opacity-60",
                FOCUS,
              )}
            >
              <StarIcon filled={n <= rating} />
            </button>
          ))}
          <p aria-live="polite" className="ml-2.5 text-base font-semibold text-[#183D30]">
            {ratingText(rating)}
          </p>
        </div>
        {errors.rating ? (
          <p id="rating-error" role="alert" className="mt-1 text-sm text-destructive">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>

      <FormField
        name="comment"
        label="Comentario (opcional)"
        error={errors.comment}
        hint={`${comment.length} / ${RATING_COMMENT_MAX}`}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            maxLength={RATING_COMMENT_MAX}
            placeholder="Qué funcionó bien, qué mejorarías…"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="rounded-[10px] border-[#C9D1CA] bg-white text-[#202522]"
          />
        )}
      </FormField>

      <div className="rounded-xl bg-[#F5F6F2] p-4 text-[13px] leading-relaxed text-[#202522]">
        <p className="mb-1.5 font-semibold">Antes de enviar</p>
        <ul className="list-disc pl-[18px]">
          <li>Una valoración por proyecto contratado.</li>
          <li>
            Se publica en el perfil de {firstName} con tu nombre abreviado ({previewName}).
          </li>
          <li>Puedes editarla durante {RATING_EDIT_WINDOW_DAYS} días.</li>
        </ul>
      </div>

      {isEdit ? <p className="text-sm text-[#535E56]">{daysText(existing.daysLeft)}</p> : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/dashboard/projects"
          className={cn(buttonVariants({ variant: "outline" }), "min-h-11 rounded-[10px] px-4", FOCUS)}
        >
          {isEdit ? "Volver a mis proyectos" : "Más tarde"}
        </Link>
        <Button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-[10px] bg-[#183D30] px-5 text-white hover:bg-[#183D30]/90"
        >
          {pending
            ? isEdit
              ? "Guardando..."
              : "Publicando..."
            : isEdit
              ? "Guardar cambios"
              : "Publicar valoración"}
        </Button>
      </div>
    </form>
  );
}

export function RateDeveloperForm({ view }: { view: ProjectRatingView }) {
  const { rating } = view;
  const readOnly = rating !== null && !rating.canEdit;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-[#E3E8E3] bg-white p-5 sm:p-7">
        <div className="min-w-0">
          <p className="break-words text-[13px] text-[#535E56]">
            Proyecto contratado · {view.project.title}
          </p>
          <h1 className="mt-0.5 break-words text-2xl font-semibold leading-tight text-[#202522]">
            ¿Cómo fue trabajar con {view.developerName}?
          </h1>
        </div>

        {readOnly ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-[15px] font-semibold text-[#202522]">Valoración general</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <ReadOnlyStars value={rating.rating} />
                <p className="text-base font-semibold text-[#183D30]">{ratingText(rating.rating)}</p>
              </div>
            </div>
            {rating.comment ? (
              <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-[#202522]">
                {rating.comment}
              </p>
            ) : null}
            <p className="text-sm text-[#535E56]">Ya no puedes editarla.</p>
            <div>
              <Link
                href="/dashboard/projects"
                className={cn(buttonVariants({ variant: "outline" }), "min-h-11 rounded-[10px] px-4", FOCUS)}
              >
                Volver a mis proyectos
              </Link>
            </div>
          </div>
        ) : (
          <RatingForm
            key={rating ? "edit" : "create"}
            projectId={view.project.id}
            developerName={view.developerName}
            previewName={view.previewName}
            existing={rating}
          />
        )}
      </div>
    </main>
  );
}

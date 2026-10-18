"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FormField } from "@/components/shared/form-field";
import { TagPicker } from "@/components/shared/tag-picker";
import { centsToUsd } from "@/lib/money";
import { MarkdownEditor } from "@/modules/projects/components/markdown-editor";
import {
  createProjectAction,
  updateProjectAction,
} from "@/modules/projects/actions/project.actions";
import {
  PROJECT_CATEGORIES,
  PROJECT_LIMITS,
} from "@/modules/projects/schemas/project.schema";
import type {
  Project,
  ProjectFormState,
  ProjectFormValues,
  TechnologyOption,
} from "@/modules/projects/types/project.types";

type EditableProject = Pick<
  Project,
  | "id"
  | "status"
  | "title"
  | "category"
  | "description"
  | "budgetMinCents"
  | "budgetMaxCents"
  | "timelineWeeks"
> & { technologies: string[] };

type Props = {
  /** Omit to create a new project. */
  project?: EditableProject;
  /** Catalog of selectable technologies. */
  technologies: TechnologyOption[];
};

const IDLE: ProjectFormState = { status: "idle" };

function toFormValues(project?: EditableProject): ProjectFormValues {
  return {
    title: project?.title ?? "",
    category: project?.category ?? "",
    description: project?.description ?? "",
    budgetMinUsd: project ? centsToUsd(project.budgetMinCents) : "",
    budgetMaxUsd: project ? centsToUsd(project.budgetMaxCents) : "",
    timelineWeeks: project ? String(project.timelineWeeks) : "",
    technologies: project?.technologies ?? [],
  };
}

const CONTROL = "h-10 rounded-[10px] border-[#E3E8E3] bg-white text-[#202522]";

export function ProjectForm({ project, technologies }: Props) {
  const isEdit = Boolean(project);
  const status = project?.status;
  // draft/new: everything editable; published: only title, description, technologies.
  const fullyReadOnly = isEdit && status !== "draft" && status !== "published";
  const budgetLocked = fullyReadOnly || status === "published";

  const action = project
    ? updateProjectAction.bind(null, project.id)
    : createProjectAction;
  const [state, formAction, pending] = useActionState(action, IDLE);

  const initial = toFormValues(project);
  const values = state.status === "error" ? state.values : initial;
  const errors = state.status === "error" ? state.fieldErrors : {};
  const L = PROJECT_LIMITS;

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
      </div>

      {status === "published" ? (
        <p className="rounded-[10px] bg-[#DCE6DE] p-3 text-sm text-[#183D30]">
          Este proyecto está publicado: la categoría, el presupuesto y el plazo no se pueden
          modificar porque los desarrolladores ya pueden ofertar sobre ellos.
        </p>
      ) : null}
      {fullyReadOnly ? (
        <p className="rounded-[10px] bg-[#DCE6DE] p-3 text-sm text-[#183D30]">
          Este proyecto ya no se puede editar. Solo puedes consultarlo.
        </p>
      ) : null}

      <FormField name="title" label="Título del proyecto" error={errors.title}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="title"
            defaultValue={values.title}
            required
            minLength={L.title.min}
            maxLength={L.title.max}
            readOnly={fullyReadOnly}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={CONTROL}
          />
        )}
      </FormField>

      <FormField name="category" label="Categoría" error={errors.category}>
        {({ id, describedBy, invalid }) =>
          budgetLocked ? (
            <>
              {/* Disabled selects are not submitted; keep the value in FormData. */}
              <input type="hidden" name="category" value={values.category} />
              <NativeSelect
                id={id}
                defaultValue={values.category}
                disabled
                aria-describedby={describedBy}
                className="w-full"
              >
                <NativeSelectOption value={values.category}>
                  {values.category}
                </NativeSelectOption>
              </NativeSelect>
            </>
          ) : (
            <NativeSelect
              id={id}
              name="category"
              defaultValue={values.category}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className="w-full"
            >
              <NativeSelectOption value="" disabled>
                Selecciona una categoría
              </NativeSelectOption>
              {PROJECT_CATEGORIES.map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {category}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )
        }
      </FormField>

      <FormField
        name="description"
        label="Descripción"
        hint={`Entre ${L.description.min} y ${L.description.max} caracteres.`}
        error={errors.description}
      >
        {({ id, describedBy, invalid }) => (
          <MarkdownEditor
            id={id}
            name="description"
            defaultValue={values.description}
            minLength={L.description.min}
            maxLength={L.description.max}
            readOnly={fullyReadOnly}
            invalid={invalid}
            describedBy={describedBy}
          />
        )}
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField name="budgetMinUsd" label="Presupuesto mínimo (USD)" error={errors.budgetMinUsd}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="budgetMinUsd"
              defaultValue={values.budgetMinUsd}
              inputMode="decimal"
              placeholder="1500"
              required
              readOnly={budgetLocked}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={CONTROL}
            />
          )}
        </FormField>
        <FormField name="budgetMaxUsd" label="Presupuesto máximo (USD)" error={errors.budgetMaxUsd}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="budgetMaxUsd"
              defaultValue={values.budgetMaxUsd}
              inputMode="decimal"
              placeholder="3000"
              required
              readOnly={budgetLocked}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={CONTROL}
            />
          )}
        </FormField>
        <FormField name="timelineWeeks" label="Plazo (semanas)" error={errors.timelineWeeks}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="timelineWeeks"
              defaultValue={values.timelineWeeks}
              inputMode="numeric"
              placeholder="8"
              required
              readOnly={budgetLocked}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={CONTROL}
            />
          )}
        </FormField>
      </div>

      <TagPicker
        name="technologies"
        legend="Tecnologías"
        options={technologies.map((t) => ({ value: t.slug, label: t.name }))}
        defaultSelected={values.technologies}
        disabled={fullyReadOnly}
        hint="Elige entre 1 y 10"
        error={errors.technologies}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/dashboard/projects"
          className="inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-[#183D30] outline-none hover:bg-[#DCE6DE] focus-visible:ring-3 focus-visible:ring-[#183D30]/40"
        >
          {fullyReadOnly ? "Volver a mis proyectos" : "Cancelar"}
        </Link>
        {fullyReadOnly ? null : (
          <>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              disabled={pending}
              className="h-10 rounded-[10px] px-4"
            >
              {pending ? "Guardando..." : status === "published" ? "Guardar cambios" : "Guardar borrador"}
            </Button>
            {status === "published" ? null : (
              <Button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className="h-10 rounded-[10px] bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
              >
                {pending ? "Guardando..." : "Publicar"}
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

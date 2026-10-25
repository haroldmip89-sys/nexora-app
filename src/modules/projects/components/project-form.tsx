"use client";

import Link from "next/link";
import { Fragment, useActionState } from "react";
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
import { MarkdownHelpCard } from "@/modules/projects/components/markdown-help-card";
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

const CONTROL = "h-11 rounded-[10px] border-input bg-card text-foreground";
const NOTE = "rounded-[10px] bg-secondary p-3 text-sm text-secondary-foreground";

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
  // Uncontrolled fields: remount them when the server returns the submitted values, so `defaultValue` never changes on a mounted input.
  const fieldsKey = state.status === "error" ? JSON.stringify(state.values) : "initial";
  const L = PROJECT_LIMITS;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
    <form action={formAction} className="surface flex min-w-0 flex-col gap-5 p-5 sm:p-6" aria-busy={pending}>
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
        <p className={NOTE}>
          Este proyecto está publicado: la categoría, el presupuesto y el plazo no se pueden
          modificar porque los desarrolladores ya pueden ofertar sobre ellos.
        </p>
      ) : null}
      {fullyReadOnly ? (
        <p className={NOTE}>
          Este proyecto ya no se puede editar. Solo puedes consultarlo.
        </p>
      ) : null}

      <Fragment key={fieldsKey}>
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

      <div className="grid gap-5 sm:grid-cols-2">
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

      </Fragment>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/dashboard/projects"
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-border bg-card px-4 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40"
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
              className="min-h-11 rounded-[10px] px-4"
            >
              {pending ? "Guardando..." : status === "published" ? "Guardar cambios" : "Guardar borrador"}
            </Button>
            {status === "published" ? null : (
              <Button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className="min-h-11 rounded-[10px] px-4"
              >
                {pending ? "Guardando..." : "Publicar"}
              </Button>
            )}
          </>
        )}
      </div>
    </form>
    <MarkdownHelpCard />
    </div>
  );
}

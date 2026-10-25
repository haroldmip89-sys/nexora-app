"use client";

import { Fragment, useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/modules/projects/components/markdown-editor";
import { FormField } from "@/components/shared/form-field";
import { centsToUsd } from "@/lib/money";
import {
  createProposalAction,
  updateProposalAction,
} from "@/modules/proposals/actions/proposal.actions";
import { PROPOSAL_LIMITS } from "@/modules/proposals/schemas/proposal.schema";
import type {
  DeveloperProposal,
  ProposalFormState,
  ProposalFormValues,
} from "@/modules/proposals/types/proposal.types";

const IDLE: ProposalFormState = { status: "idle" };
const CONTROL = "h-11 rounded-[10px] border-input bg-card text-foreground";

type Props =
  | {
      mode: "create";
      projectId: string;
      /** Client budget shown as help; the price is not restricted to it. */
      budgetHint?: string;
    }
  | {
      mode: "edit";
      proposal: Pick<DeveloperProposal, "id" | "priceCents" | "timelineWeeks" | "description">;
      onDone: () => void;
    };

function initialValues(props: Props): ProposalFormValues {
  if (props.mode === "edit") {
    return {
      priceUsd: centsToUsd(props.proposal.priceCents),
      timelineWeeks: String(props.proposal.timelineWeeks),
      description: props.proposal.description,
    };
  }
  return { priceUsd: "", timelineWeeks: "", description: "" };
}

export function ProposalForm(props: Props) {
  const action =
    props.mode === "edit"
      ? updateProposalAction.bind(null, props.proposal.id)
      : createProposalAction.bind(null, props.projectId);
  const [state, formAction, pending] = useActionState(action, IDLE);

  const onDone = props.mode === "edit" ? props.onDone : undefined;
  useEffect(() => {
    if (state.status === "success") onDone?.();
  }, [state, onDone]);

  const values = state.status === "error" ? state.values : initialValues(props);
  const errors = state.status === "error" ? state.fieldErrors : {};
  // Uncontrolled fields: remount them when the server returns the submitted values, so `defaultValue` never changes on a mounted input.
  const fieldsKey = state.status === "error" ? JSON.stringify(state.values) : "initial";
  const L = PROPOSAL_LIMITS;

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-busy={pending}>
      <div aria-live="polite">
        {state.status === "error" && state.message ? (
          <p
            role="alert"
            className="rounded-[10px] border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg"
          >
            {state.message}
          </p>
        ) : null}
      </div>

      <Fragment key={fieldsKey}>
      <fieldset className="flex flex-col gap-4 rounded-[10px] border border-border bg-surface-subtle p-4 sm:p-5">
      <legend className="px-1 text-base font-semibold text-foreground">Tu oferta</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        name="priceUsd"
        label="Precio (USD)"
        hint={
          props.mode === "create" && props.budgetHint
            ? `Presupuesto del cliente: ${props.budgetHint}. Puedes ofertar por encima o por debajo.`
            : undefined
        }
        error={errors.priceUsd}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="priceUsd"
            defaultValue={values.priceUsd}
            inputMode="decimal"
            placeholder="2500"
            required
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
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={CONTROL}
          />
        )}
      </FormField>
      </div>
      </fieldset>

      <FormField
        name="description"
        label="Descripción de tu propuesta"
        hint={`Admite Markdown. Entre ${L.description.min} y ${L.description.max} caracteres.`}
        error={errors.description}
      >
        {({ id, describedBy, invalid }) => (
          <MarkdownEditor
            id={id}
            name="description"
            defaultValue={values.description}
            minLength={L.description.min}
            maxLength={L.description.max}
            invalid={invalid}
            describedBy={describedBy}
          />
        )}
      </FormField>

      {props.mode === "create" ? (
        <p className="text-xs text-muted-foreground">
          Podrás editarla mientras esté pendiente. Si la retiras, no podrás enviar otra a este
          proyecto.
        </p>
      ) : null}

      </Fragment>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {props.mode === "edit" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={props.onDone}
            className="h-11 rounded-[10px] px-4"
          >
            Cancelar
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-[10px] bg-primary px-4 text-primary-foreground hover:bg-primary-hover"
        >
          {pending
            ? "Guardando..."
            : props.mode === "edit"
              ? "Guardar cambios"
              : "Enviar propuesta"}
        </Button>
      </div>
    </form>
  );
}

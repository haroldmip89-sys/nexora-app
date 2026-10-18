"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
const CONTROL = "h-10 rounded-[10px] border-[#E3E8E3] bg-white text-[#202522]";

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
  const L = PROPOSAL_LIMITS;

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-busy={pending}>
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

      <FormField
        name="description"
        label="Descripción de tu propuesta"
        hint={`Entre ${L.description.min} y ${L.description.max} caracteres.`}
        error={errors.description}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="description"
            defaultValue={values.description}
            required
            minLength={L.description.min}
            maxLength={L.description.max}
            rows={6}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="rounded-[10px] border-[#E3E8E3] bg-white text-[#202522]"
          />
        )}
      </FormField>

      {props.mode === "create" ? (
        <p className="text-xs text-[#535E56]">
          Podrás editarla mientras esté pendiente. Si la retiras, no podrás enviar otra a este
          proyecto.
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {props.mode === "edit" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={props.onDone}
            className="h-10 rounded-[10px] px-4"
          >
            Cancelar
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={pending}
          className="h-10 rounded-[10px] bg-[#183D30] px-4 text-white hover:bg-[#183D30]/90"
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

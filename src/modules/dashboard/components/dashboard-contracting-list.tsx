import Link from "next/link";
import { DeveloperProfileLink } from "@/components/shared/developer-profile-link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DashboardProjectPayment } from "@/modules/dashboard/types/dashboard.types";
import { CancelPaymentButton } from "@/modules/payments/components/cancel-payment-button";
import {
  PaymentStatusBadge,
  TransferStatusBadge,
} from "@/modules/payments/components/payment-status-badge";
import { TRANSFER_TEST_NOTICE } from "@/modules/payments/types/developer-transfer.types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const HEAD =
  "h-auto bg-surface-subtle px-4 py-3 text-xs font-bold tracking-wider text-muted-foreground uppercase";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });

type Props = {
  items: DashboardProjectPayment[];
  total: number;
};

function ContractingRow({ item }: { item: DashboardProjectPayment }) {
  const { payment, transfer } = item;
  const awaitingDeveloper =
    item.status === "proposal_selected" && !item.developerPayoutsReady && payment?.status !== "pending";

  return (
    <TableRow>
      <TableHead
        scope="row"
        className="h-auto max-w-64 px-4 py-4 align-top font-bold whitespace-normal"
      >
        <span className="block break-words">{item.title}</span>
        <ProjectStatusBadge status={item.status} className="mt-1.5" />
      </TableHead>
      <TableCell className="px-4 py-4 align-top whitespace-normal">
        <span className="inline-flex items-center gap-2.5 font-semibold">
          <UserAvatar name={item.developerName} imageUrl={item.imageUrl} size="sm" />
          <DeveloperProfileLink developerId={item.developerId} name={item.developerName} />
        </span>
      </TableCell>
      <TableCell className="px-4 py-4 text-right align-top font-bold">
        {formatUsd(item.amountCents)}
      </TableCell>
      <TableCell className="px-4 py-4 align-top whitespace-normal">
        <div className="flex flex-col items-start gap-1">
          {payment ? (
            <>
              <PaymentStatusBadge status={payment.status} />
              <span className="text-xs text-muted-foreground">
                {dateFormatter.format(payment.updatedAt)}
              </span>
            </>
          ) : (
            <Badge variant="neutral">No iniciado</Badge>
          )}
          {awaitingDeveloper ? (
            <span className="max-w-48 text-xs text-muted-foreground">
              Esperando que el desarrollador configure sus cobros de prueba
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="px-4 py-4 align-top whitespace-normal">
        <div className="flex flex-col items-start gap-1">
          {transfer ? (
            <>
              <TransferStatusBadge status={transfer.status} />
              <span className="max-w-48 text-xs text-muted-foreground">{TRANSFER_TEST_NOTICE}</span>
            </>
          ) : (
            <Badge variant="neutral">Sin transferencia todavía</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="px-4 py-3 align-top whitespace-normal">
        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/projects/${item.projectId}/payment`}
            className={cn(buttonVariants({ variant: "outline", size: "touch" }), "text-primary", FOCUS)}
          >
            Ver pago
          </Link>
          {item.status === "contracted" && item.rated ? (
            <Link
              href={`/projects/${item.projectId}/rate`}
              className={cn(buttonVariants({ variant: "outline", size: "touch" }), "text-primary", FOCUS)}
            >
              Ver tu valoración
            </Link>
          ) : null}
          {payment?.status === "pending" ? <CancelPaymentButton projectId={item.projectId} /> : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function DashboardContractingList({ items, total }: Props) {
  const showAll = total > items.length;
  return (
    <section aria-labelledby="dashboard-contracting-title" className="surface overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-5">
        <div className="flex flex-col gap-0.5">
          <h2 id="dashboard-contracting-title" className="text-base font-bold">
            En contratación
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Pago y transferencia de prueba de cada proyecto con desarrollador elegido.
          </p>
        </div>
        <p
          role="note"
          className="rounded-[10px] border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg"
        >
          <strong className="font-semibold">Modo de prueba · No se mueve dinero real</strong>
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted-foreground">
          Aún no tienes proyectos en contratación.
        </p>
      ) : (
        <div
          role="region"
          tabIndex={0}
          aria-label="Proyectos en contratación"
          className={cn("overflow-x-auto", FOCUS)}
        >
          <div className="min-w-[860px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD}>Proyecto</TableHead>
                  <TableHead className={HEAD}>Desarrollador</TableHead>
                  <TableHead className={cn(HEAD, "text-right")}>Importe</TableHead>
                  <TableHead className={HEAD}>Pago</TableHead>
                  <TableHead className={HEAD}>Transferencia</TableHead>
                  <TableHead className={HEAD}>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <ContractingRow key={item.projectId} item={item} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {showAll ? (
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-6 py-2 text-sm">
          <Link
            href="/dashboard/projects?status=proposal_selected"
            className={cn("inline-flex min-h-11 items-center rounded-sm font-bold text-primary underline", FOCUS)}
          >
            Ver todos (en contratación)
          </Link>
          <Link
            href="/dashboard/projects?status=contracted"
            className={cn("inline-flex min-h-11 items-center rounded-sm font-bold text-primary underline", FOCUS)}
          >
            Ver todos (contratados)
          </Link>
        </p>
      ) : null}
    </section>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DeveloperWonProject } from "@/modules/dashboard/types/developer-dashboard.types";
import { PaymentStatusBadge, TransferStatusBadge } from "@/modules/payments/components/payment-status-badge";
import { TRANSFER_REASON_MESSAGES, TRANSFER_TEST_NOTICE } from "@/modules/payments/types/developer-transfer.types";
import { ProjectStatusBadge } from "@/modules/projects/components/project-status-badge";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const dateFormatter = new Intl.DateTimeFormat("es", { dateStyle: "medium" });
const HEAD = "h-11 bg-surface-subtle px-4 text-xs font-bold tracking-[0.05em] text-muted-foreground uppercase";
const CELL = "px-4 py-4 align-top whitespace-normal";

type Props = {
  items: DeveloperWonProject[];
  total: number;
};

function WonRow({ item }: { item: DeveloperWonProject }) {
  const { payment, transfer } = item;
  return (
    <TableRow>
      <TableHead scope="row" className={cn(CELL, "h-auto min-w-48 font-bold text-foreground")}>
        <span className="block break-words">{item.title}</span>
        <span className="mt-1 block">
          <ProjectStatusBadge status={item.status} />
        </span>
      </TableHead>
      <TableCell className={cn(CELL, "break-words")}>{item.clientName}</TableCell>
      <TableCell className={cn(CELL, "text-right font-bold")}>{formatUsd(item.amountCents)}</TableCell>
      <TableCell className={CELL}>
        {payment ? (
          <div className="flex flex-col items-start gap-1">
            <PaymentStatusBadge status={payment.status} />
            <span className="text-xs text-muted-foreground">{dateFormatter.format(payment.updatedAt)}</span>
          </div>
        ) : (
          <Badge variant="neutral">No iniciado</Badge>
        )}
      </TableCell>
      <TableCell className={cn(CELL, "min-w-56")}>
        {transfer ? (
          <div className="flex flex-col items-start gap-1">
            <TransferStatusBadge status={transfer.status} />
            {transfer.completedAt ? (
              <span className="text-xs text-muted-foreground">{dateFormatter.format(transfer.completedAt)}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">{TRANSFER_TEST_NOTICE}</span>
            {transfer.reason && transfer.status !== "completed_test" ? (
              <span className="text-xs text-muted-foreground">{TRANSFER_REASON_MESSAGES[transfer.reason]}</span>
            ) : null}
            <Link
              href="/dashboard/payouts"
              className={cn(buttonVariants({ variant: "outline" }), "mt-1 h-10 px-4", FOCUS)}
            >
              Ver en Cobros de prueba
            </Link>
          </div>
        ) : (
          <Badge variant="neutral">Sin transferencia todavía</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export function DeveloperWonProjects({ items, total }: Props) {
  const showAll = total > items.length;
  return (
    <section aria-labelledby="developer-won-title" className="surface overflow-hidden">
      <div className="flex flex-col gap-0.5 border-b border-border px-6 py-5">
        <h2 id="developer-won-title" className="text-base font-bold text-foreground">
          Proyectos ganados
        </h2>
        <span className="text-[13px] text-muted-foreground">{TRANSFER_TEST_NOTICE}</span>
      </div>
      <p
        role="note"
        className="mx-6 mt-4 rounded-[14px] border border-primary bg-secondary p-3 text-sm text-foreground"
      >
        <strong className="font-semibold">Modo de prueba · No se mueve dinero real</strong>
      </p>
      {items.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted-foreground">Aún no tienes propuestas aceptadas.</p>
      ) : (
        <div
          role="region"
          tabIndex={0}
          aria-label="Proyectos ganados"
          className={cn("mt-4 overflow-x-auto [&_[data-slot=table-container]]:overflow-visible", FOCUS)}
        >
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Proyecto</TableHead>
                <TableHead className={HEAD}>Cliente</TableHead>
                <TableHead className={cn(HEAD, "text-right")}>Importe</TableHead>
                <TableHead className={HEAD}>Pago del cliente</TableHead>
                <TableHead className={HEAD}>Transferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <WonRow key={item.projectId} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {showAll ? (
        <p className="border-t border-border px-6 text-sm">
          <Link
            href="/dashboard/proposals?status=accepted"
            className={cn("inline-flex min-h-11 items-center rounded-lg font-bold text-primary underline", FOCUS)}
          >
            Ver todas
          </Link>
        </p>
      ) : null}
    </section>
  );
}

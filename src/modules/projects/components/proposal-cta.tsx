import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicViewer } from "@/modules/projects/types/public-project.types";

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const PRIMARY = "h-11 rounded-[10px] bg-primary px-4 text-primary-foreground hover:bg-primary-hover";
const SECONDARY = "h-11 rounded-[10px] px-4";

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

type Props = { projectId: string; viewer: PublicViewer };

/**
 * Role-based call to action of the public detail. Pure decision table over
 * `viewer`; the developer branch links to the proposal section (`#propuesta`),
 * which `PublicProjectDetail` renders in the main column.
 */
export function ProposalCta({ projectId, viewer }: Props) {
  if (viewer.kind === "visitor") {
    return (
      <div className="flex flex-col gap-3">
        <Note>Inicia sesión para enviar una propuesta.</Note>
        <Link
          href={`/sign-in?redirect_url=${encodeURIComponent(`/projects/${projectId}`)}`}
          className={cn(buttonVariants({ size: "lg" }), PRIMARY, FOCUS)}
        >
          Iniciar sesión
        </Link>
        <Link
          href="/sign-up"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), SECONDARY, FOCUS)}
        >
          Crear cuenta
        </Link>
      </div>
    );
  }

  if (viewer.kind === "needs_onboarding") {
    return (
      <div className="flex flex-col gap-3">
        <Note>Completa tu registro para enviar propuestas.</Note>
        <Link href="/onboarding" className={cn(buttonVariants({ size: "lg" }), PRIMARY, FOCUS)}>
          Completar registro
        </Link>
      </div>
    );
  }

  if (viewer.role === "developer") {
    return (
      <div className="flex flex-col gap-3">
        <Link href="#propuesta" className={cn(buttonVariants({ size: "lg" }), PRIMARY, FOCUS)}>
          Ir a la propuesta
        </Link>
      </div>
    );
  }

  if (viewer.role === "client") {
    if (!viewer.isOwner) {
      return <Note>Los clientes no envían propuestas.</Note>;
    }
    return (
      <div className="flex flex-col gap-3">
        <Note>Este es tu proyecto.</Note>
        <Link
          href={`/projects/${projectId}/edit`}
          className={cn(buttonVariants({ size: "lg" }), PRIMARY, FOCUS)}
        >
          Editar proyecto
        </Link>
        <Link
          href="/dashboard/projects"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), SECONDARY, FOCUS)}
        >
          Mis proyectos
        </Link>
      </div>
    );
  }

  return null;
}

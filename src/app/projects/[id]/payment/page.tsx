import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { PaymentPageView } from "@/modules/payments/components/payment-page-view";
import { paymentPageQuerySchema } from "@/modules/payments/schemas/payment.schema";
import { getProjectPaymentOverview } from "@/modules/payments/services/payment-overview.service";

export const metadata: Metadata = { title: "Pago de prueba | Nexora" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectPaymentPage({ params, searchParams }: Props) {
  const { id } = await params;
  // Malformed ids are indistinguishable from missing ones (404, no DB access).
  if (!z.uuid().safeParse(id).success) notFound();
  const { checkout } = paymentPageQuerySchema.parse(await searchParams);

  let overview;
  try {
    const user = await requireRole("client");
    overview = await getProjectPaymentOverview(user, id);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return <PaymentPageView overview={overview} returnNotice={checkout} />;
}

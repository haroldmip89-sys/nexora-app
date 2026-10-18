import type { Metadata } from "next";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { PayoutsPageView } from "@/modules/payments/components/payouts-page-view";
import { payoutsPageQuerySchema } from "@/modules/payments/schemas/connected-account.schema";
import { getConnectedAccountOverview } from "@/modules/payments/services/connected-account.service";

export const metadata: Metadata = { title: "Cobros de prueba | Nexora" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PayoutsPage({ searchParams }: Props) {
  // Unknown or missing values fall back to undefined (.catch in the schema).
  const { onboarding } = payoutsPageQuerySchema.parse(await searchParams);

  let overview;
  try {
    const user = await requireRole("developer");
    overview = await getConnectedAccountOverview(user);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  return <PayoutsPageView overview={overview} notice={onboarding} />;
}

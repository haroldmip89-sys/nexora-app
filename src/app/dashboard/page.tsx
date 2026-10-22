import type { Metadata } from "next";
import { handleAuthErrorForPage } from "@/modules/auth/services/auth-errors";
import { requireRole } from "@/modules/auth/services/current-user.service";
import { ClientDashboardView } from "@/modules/dashboard/components/client-dashboard-view";
import { DeveloperDashboardView } from "@/modules/dashboard/components/developer-dashboard-view";
import { getClientDashboard } from "@/modules/dashboard/services/client-dashboard.service";
import { getDeveloperDashboard } from "@/modules/dashboard/services/developer-dashboard.service";

export const metadata: Metadata = { title: "Mi panel | Nexora" };

export default async function DashboardPage() {
  let loaded;
  try {
    const user = await requireRole("client", "developer");
    loaded =
      user.role === "developer"
        ? ({ role: "developer", developerId: user.id, data: await getDeveloperDashboard(user) } as const)
        : ({ role: "client", data: await getClientDashboard(user) } as const);
  } catch (error) {
    handleAuthErrorForPage(error);
  }

  if (loaded.role === "developer") {
    return <DeveloperDashboardView data={loaded.data} developerId={loaded.developerId} />;
  }
  return <ClientDashboardView data={loaded.data} />;
}

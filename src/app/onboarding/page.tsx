import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/modules/auth/services/clerk-identity.service";
import { getCurrentUser } from "@/modules/auth/services/current-user.service";
import { RoleSelector } from "@/modules/auth/components/role-selector";

export const metadata: Metadata = { title: "Elige tu rol | Nexora" };

export default async function OnboardingPage() {
  const clerkUserId = await getSessionUserId();
  if (!clerkUserId) redirect("/sign-in");

  // The role is fixed once created (D1): users with a row cannot choose again.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center bg-[#F5F6F2] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-[#E3E8E3] bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202522]">
          Bienvenido a Nexora
        </h1>
        <p className="mt-2 mb-6 text-sm text-[#535E56]">
          Cuéntanos cómo usarás la plataforma. Esta elección no se puede cambiar después.
        </p>
        <RoleSelector />
      </div>
    </main>
  );
}

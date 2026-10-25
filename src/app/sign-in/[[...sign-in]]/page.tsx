import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthSplitLayout } from "@/modules/auth/components/auth-split-layout";
import { clerkAppearance } from "@/modules/auth/clerk-appearance";

export const metadata: Metadata = { title: "Iniciar sesión | Nexora" };

export default function SignInPage() {
  return (
    <AuthSplitLayout>
      <SignIn appearance={clerkAppearance} />
    </AuthSplitLayout>
  );
}

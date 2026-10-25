import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthSplitLayout } from "@/modules/auth/components/auth-split-layout";
import { clerkAppearance } from "@/modules/auth/clerk-appearance";

export const metadata: Metadata = { title: "Crear cuenta | Nexora" };

export default function SignUpPage() {
  return (
    <AuthSplitLayout>
      <SignUp appearance={clerkAppearance} />
    </AuthSplitLayout>
  );
}

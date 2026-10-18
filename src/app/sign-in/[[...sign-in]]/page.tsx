import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Iniciar sesión | Nexora" };

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#F5F6F2] px-4 py-12">
      <SignIn />
    </main>
  );
}

import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Crear cuenta | Nexora" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#F5F6F2] px-4 py-12">
      <SignUp />
    </main>
  );
}

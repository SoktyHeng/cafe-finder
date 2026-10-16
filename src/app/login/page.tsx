import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginView } from "@/features/auth/components/login-view";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <Suspense>
        <LoginView />
      </Suspense>
    </div>
  );
}

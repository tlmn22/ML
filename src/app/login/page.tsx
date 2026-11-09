import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/primitives";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = { title: getDictionary().auth.loginTitle, robots: { index: false } };

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-md" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}

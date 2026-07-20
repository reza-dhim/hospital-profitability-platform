"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@hpp/ui";
import { LoginForm } from "../../../components/login-form";
import { useAuth } from "../../../lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);

  if (status === "authenticated") return null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Hospital Profitability Intelligence</CardTitle>
        <CardDescription>Masuk untuk melanjutkan ke dashboard.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}

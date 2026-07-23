"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CredentialsForm } from "../../components/CredentialsForm";
import { AuthLayout } from "../../components/AuthLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { useAuth } from "../../auth/AuthProvider";

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [checkInbox, setCheckInbox] = useState(false);

  if (checkInbox) {
    return (
      <AuthLayout>
        <Card>
          <CardHeader>
            <CardTitle>Confirm your email</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              We sent you a confirmation link. Once you have followed it you can{" "}
              <Link href="/login" className="font-medium text-teal hover:underline">
                sign in
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <CredentialsForm
      heading="Create an account"
      submitLabel="Sign up"
      onSubmit={async (email, password) => {
        const { needsEmailConfirmation } = await signUp(email, password);
        // With confirmation enabled there is no session yet, so routing to the
        // dashboard would land on a redirect straight back to /login.
        if (needsEmailConfirmation) setCheckInbox(true);
        else router.replace("/");
      }}
      footer={
        <Link href="/login" className="font-medium text-teal hover:underline">
          Already have an account? Sign in
        </Link>
      }
    />
  );
}

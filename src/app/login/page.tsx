"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CredentialsForm } from "../../components/CredentialsForm";
import { useAuth } from "../../auth/AuthProvider";

export default function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const router = useRouter();

  // Someone arriving here with a live session — a stale bookmark, or the back
  // button after signing in — has no business seeing the form.
  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  return (
    <CredentialsForm
      heading="Sign in"
      submitLabel="Sign in"
      onSubmit={async (email, password) => {
        await signIn(email, password);
        router.replace("/");
      }}
      footer={<Link href="/signup">Need an account? Sign up</Link>}
    />
  );
}

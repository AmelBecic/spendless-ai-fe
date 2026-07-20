"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CredentialsForm } from "../../components/CredentialsForm";
import { useAuth } from "../../auth/AuthProvider";

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [checkInbox, setCheckInbox] = useState(false);

  if (checkInbox) {
    return (
      <main>
        <h1>Confirm your email</h1>
        <p>
          We sent you a confirmation link. Once you have followed it you can{" "}
          <Link href="/login">sign in</Link>.
        </p>
      </main>
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
      footer={<Link href="/login">Already have an account? Sign in</Link>}
    />
  );
}

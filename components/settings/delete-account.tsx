"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";

export function DeleteAccount() {
  const { signOut } = useClerk();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setPending(true);
    setError("");
    const response = await fetch("/api/user/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
    if (!response.ok || !body?.ok) {
      setPending(false);
      setError(body?.error ?? "Deletion did not finish.");
      return;
    }
    await signOut({ redirectUrl: "/" });
  }

  return (
    <section className="border-t px-4 py-6 md:px-5">
      <h2 className="text-base font-bold text-danger">Delete account</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        This permanently removes your clips, comments, follows, and sign-in account. It cannot be undone.
      </p>
      <Field label="Type DELETE to confirm" className="mt-4">
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className={inputClass} />
      </Field>
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      <Button variant="dangerSolid" className="mt-4" loading={pending} disabled={confirmation !== "DELETE"} onClick={() => void remove()}>
        {pending ? "Deleting…" : "Delete account"}
      </Button>
    </section>
  );
}

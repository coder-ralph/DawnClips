"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";

const reasons = [
  ["spam", "Spam"],
  ["harassment", "Harassment"],
  ["hate", "Hate"],
  ["violence", "Violence"],
  ["sexual", "Sexual content"],
  ["copyright", "Copyright"],
  ["other", "Other"],
] as const;

export function ReportDialog({
  open,
  onClose,
  targetId,
  targetType,
}: {
  open: boolean;
  onClose: () => void;
  targetId: string;
  targetType: "clip" | "comment";
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId,
          targetType,
          reason: formData.get("reason"),
          description: formData.get("description"),
        }),
      });
      if (!response.ok) {
        setError(await apiErrorMessage(response, "Could not submit the report."));
        return;
      }
      toast("Report sent. Thanks for helping keep DawnClips safe.");
      onClose();
    } catch {
      setError("Could not submit the report. Check your connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Report this ${targetType}`} description="Tell us what is wrong. Reports are reviewed by moderators.">
      <form action={submit} className="space-y-4">
        <Field label="Reason">
          <select name="reason" defaultValue="spam" className={inputClass}>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Details (optional)">
          <textarea name="description" maxLength={1000} rows={3} className={inputClass} />
        </Field>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={pending}>{pending ? "Sending…" : "Submit report"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

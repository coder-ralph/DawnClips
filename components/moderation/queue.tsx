"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string;
  status: string;
};

export function ModerationQueue({ initial }: { initial: Report[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");

  async function update(id: string, status: string) {
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== id));
    const response = await fetch("/api/moderation/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      setItems(previous);
      setError("Could not update the report.");
    }
  }

  async function removeClip(targetId: string, reportId: string) {
    const response = await fetch(`/api/clips/${targetId}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not remove the clip.");
      return;
    }
    await update(reportId, "resolved");
  }

  if (items.length === 0) return <p className="text-sm text-muted">No open reports.</p>;
  return (
    <ul className="space-y-3">
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {items.map((report) => (
        <li key={report.id} className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{report.target_type} · {report.reason}</p>
          <p className="mt-1 text-muted">{report.description || "No details."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => void update(report.id, "dismissed")}>Dismiss</Button>
            {report.target_type === "clip" ? <Button size="sm" variant="danger" onClick={() => void removeClip(report.target_id, report.id)}>Remove clip</Button> : null}
            <Button size="sm" variant="secondary" onClick={() => void update(report.id, "resolved")}>Resolve</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

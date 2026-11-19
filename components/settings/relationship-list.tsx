"use client";

import { Ban, Loader2, ShieldAlert, Users, VolumeX } from "lucide-react";
import { useState } from "react";
import { PersonListItem } from "@/components/profile/person-row";
import { BlockDialog } from "@/components/social/relationship-dialogs";
import { useRelationshipPatcher } from "@/components/social/relationship-store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import { relationshipLists, type PeoplePage, type PersonRow, type RelationshipListKind } from "@/lib/relationships";

const icons = { blocked: Ban, restricted: ShieldAlert, muted: VolumeX, none: Users } as const;
const pastTense: Record<RelationshipListKind, string> = { blocked: "Unblocked", muted: "Unmuted", restricted: "Unrestricted" };

/**
 * The profiles you blocked, muted or restricted, with the action that reverses it. Muting and restricting are easy to
 * undo, so Unmute and Unrestrict act straight away; Unblock asks first. The row leaves the list at once and comes back
 * (in its old place, with an error message) if the server refuses. The empty states are the wording from the brief.
 */
export function RelationshipList({ kind, initial }: { kind: RelationshipListKind; initial: PeoplePage }) {
  const config = relationshipLists[kind];
  const toast = useToast();
  const patchRelationship = useRelationshipPatcher();
  const [people, setPeople] = useState<PersonRow[]>(initial.people);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<PersonRow | null>(null);

  async function reverse(person: PersonRow) {
    const index = people.findIndex((item) => item.id === person.id);
    setPeople((current) => current.filter((item) => item.id !== person.id));
    const restore = () =>
      setPeople((current) => {
        if (current.some((item) => item.id === person.id)) return current;
        const next = [...current];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, person);
        return next;
      });
    try {
      const response = await fetch(`/api/profiles/${person.id}/${config.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: false }),
      });
      if (!response.ok) {
        restore();
        toast(await apiErrorMessage(response, `Could not ${config.action.toLowerCase()} @${person.username}.`), "error");
        return;
      }
      // Other menus and buttons for this person (clips on screen, their profile) now show the new state.
      patchRelationship(person.id, kind === "blocked" ? { blocked: false } : kind === "muted" ? { muted: false } : { restricted: false });
      toast(`${pastTense[kind]} @${person.username}`);
    } catch {
      restore();
      toast(`Could not ${config.action.toLowerCase()} @${person.username}. Check your connection.`, "error");
    }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/relationships/${kind}?cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not load more."), "error");
        return;
      }
      const page = (await response.json().catch(() => null)) as PeoplePage | null;
      if (!page || !Array.isArray(page.people)) {
        toast("Could not load more.", "error");
        return;
      }
      setPeople((current) => {
        const seen = new Set(current.map((person) => person.id));
        return [...current, ...page.people.filter((person) => !seen.has(person.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      toast("Could not load more. Check your connection.", "error");
    } finally {
      setLoading(false);
    }
  }

  if (people.length === 0 && !cursor) {
    return <EmptyState icon={icons[kind] ?? icons.none} title={config.empty} />;
  }

  return (
    <>
      <ul className="divide-y" aria-label={config.title}>
        {people.map((person) => (
          <li key={person.id}>
            <PersonListItem
              person={person}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`${config.action} ${person.displayName} (@${person.username})`}
                  onClick={() => (kind === "blocked" ? setConfirming(person) : void reverse(person))}
                >
                  {config.action}
                </Button>
              }
            />
          </li>
        ))}
      </ul>
      {cursor ? (
        <div className="flex justify-center border-t px-4 py-4">
          <Button variant="secondary" onClick={() => void loadMore()} disabled={loading} aria-busy={loading}>
            {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Loading" : "Load more"}
          </Button>
        </div>
      ) : null}
      {confirming ? (
        <BlockDialog
          username={confirming.username}
          blocked
          pending={false}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const person = confirming;
            setConfirming(null);
            void reverse(person);
          }}
        />
      ) : null}
    </>
  );
}

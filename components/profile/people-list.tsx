"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PersonListItem } from "@/components/profile/person-row";
import { FollowButton } from "@/components/social/follow-button";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import type { PeoplePage, PersonRow, ProfilePeopleKind } from "@/lib/relationships";

/**
 * A profile's followers or following, newest first, 30 at a time with "Load more" until the whole list has been shown.
 * Each row has the viewer's own follow button: "Follow back" in your own followers list (they follow you, you don't
 * follow them), "Following" when you already do (click to unfollow), "Follow" otherwise. The first page comes from the
 * server; later pages come from /api/profiles/[id]/people.
 */
export function PeopleList({
  profileId,
  kind,
  initial,
  canFollow,
  isOwnList,
}: {
  profileId: string;
  kind: ProfilePeopleKind;
  initial: PeoplePage;
  /** The viewer is signed in. */
  canFollow: boolean;
  /** The viewer is looking at their own list. */
  isOwnList: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [people, setPeople] = useState<PersonRow[]>(initial.people);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/profiles/${profileId}/people?kind=${kind}&cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not load more people."), "error");
        return;
      }
      const page = (await response.json().catch(() => null)) as PeoplePage | null;
      if (!page || !Array.isArray(page.people)) {
        toast("Could not load more people.", "error");
        return;
      }
      // A follow made while the list was open can shift rows between pages, so never show the same person twice.
      setPeople((current) => {
        const seen = new Set(current.map((person) => person.id));
        return [...current, ...page.people.filter((person) => !seen.has(person.id))];
      });
      setCursor(page.nextCursor);
    } catch {
      toast("Could not load more people. Check your connection.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ul className="divide-y" aria-label={kind === "followers" ? "Followers" : "Following"}>
        {people.map((person) => (
          <li key={person.id}>
            <PersonListItem
              person={person}
              action={
                canFollow && !person.isSelf ? (
                  <FollowButton
                    profileId={person.id}
                    following={person.following ?? false}
                    size="sm"
                    name={person.displayName}
                    followLabel={isOwnList && kind === "followers" ? "Follow back" : "Follow"}
                    // Your own "following" count (in the header above) changes with each follow or unfollow here.
                    onChange={isOwnList ? () => router.refresh() : undefined}
                  />
                ) : null
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
    </>
  );
}

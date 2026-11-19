import { Ban, ChevronRight, ShieldAlert, VolumeX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { relationshipLists, type RelationshipListKind } from "@/lib/relationships";

const rows: Array<{ kind: RelationshipListKind; icon: LucideIcon }> = [
  { kind: "blocked", icon: Ban },
  { kind: "restricted", icon: ShieldAlert },
  { kind: "muted", icon: VolumeX },
];

/** Settings entry points for the three relationship lists. Each opens its own page at /settings/<kind>. */
export function RelationshipLinks() {
  return (
    <section id="people" aria-labelledby="people-title" className="scroll-mt-28 border-t px-4 py-6 md:px-5">
      <h2 id="people-title" className="text-base font-bold">Blocked, restricted &amp; muted</h2>
      <p className="mt-2 text-sm leading-6 text-muted">Manage the people you have limited. They are never told.</p>
      <ul className="mt-3 divide-y rounded-xl border">
        {rows.map(({ kind, icon: Icon }) => (
          <li key={kind}>
            <Link
              href={`/settings/${kind}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{relationshipLists[kind].title}</span>
                <span className="block truncate text-sm text-muted">{relationshipLists[kind].summary}</span>
              </span>
              <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

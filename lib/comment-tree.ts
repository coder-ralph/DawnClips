type TreeComment = { id: string; parent_id: string | null; created_at: string; deleted?: boolean };

/** Ids of a comment and every reply beneath it, however deep. */
export function subtreeIds(comments: TreeComment[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const item of comments) {
    if (!item.parent_id) continue;
    const siblings = children.get(item.parent_id);
    if (siblings) siblings.push(item.id);
    else children.set(item.parent_id, [item.id]);
  }
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return seen;
}

/** Splits the list into what stays and what goes when a comment is deleted (the comment and all of its replies). */
export function removeSubtree<T extends TreeComment>(comments: T[], rootId: string) {
  const doomed = subtreeIds(comments, rootId);
  return {
    remaining: comments.filter((item) => !doomed.has(item.id)),
    removed: comments.filter((item) => doomed.has(item.id)),
  };
}

/** Puts removed comments back after a failed delete, in their original order, without touching anything else. */
export function restoreComments<T extends TreeComment>(current: T[], removed: T[]) {
  const present = new Set(current.map((item) => item.id));
  const merged = [...current, ...removed.filter((item) => !present.has(item.id))];
  return merged.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** Drops anything the server marks as deleted, together with its replies, so no placeholder is ever shown. */
export function visibleComments<T extends TreeComment>(comments: T[]) {
  const hidden = new Set<string>();
  for (const item of comments) {
    if (item.deleted) for (const id of subtreeIds(comments, item.id)) hidden.add(id);
  }
  return comments.filter((item) => !hidden.has(item.id));
}

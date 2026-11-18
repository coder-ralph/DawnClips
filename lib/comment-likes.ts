export type LikeState = { liked: boolean; likes_count: number };
type Likeable = { id: string } & LikeState;

/** Comments from the server, with the like fields filled in (older responses may not carry them). */
export function withLikeDefaults<T extends object>(comment: T): T & LikeState {
  const raw = comment as Partial<LikeState>;
  return { ...comment, liked: Boolean(raw.liked), likes_count: Math.max(0, Number(raw.likes_count) || 0) };
}

/** The optimistic step: one comment becomes liked or unliked and its count moves by one, never below zero. */
export function withLike<T extends Likeable>(comments: T[], id: string, liked: boolean): T[] {
  return comments.map((item) => {
    if (item.id !== id || item.liked === liked) return item;
    return { ...item, liked, likes_count: Math.max(0, item.likes_count + (liked ? 1 : -1)) };
  });
}

/** Sets one comment's like state outright: the server's answer, or the previous state when a request failed. */
export function withLikeState<T extends Likeable>(comments: T[], id: string, state: LikeState): T[] {
  return comments.map((item) => (item.id === id ? { ...item, liked: state.liked, likes_count: Math.max(0, state.likes_count) } : item));
}

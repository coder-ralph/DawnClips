export type FeedName = "foryou" | "following" | "trending" | "latest";
export type ClipVisibility = "public" | "unlisted" | "private";

export type FeedClip = {
  id: string;
  title: string;
  description: string;
  heroTags: string[];
  duration: number | null;
  thumbnailUrl: string | null;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  score: number | null;
  editedAt?: string | null;
  editableUntil?: string | null;
  pinnedAt?: string | null;
  visibility?: ClipVisibility;
  commentsMode?: "everyone" | "followers" | "disabled";
  liked?: boolean;
  bookmarked?: boolean;
  following?: boolean;
  isOwn?: boolean;
  /** Timestamp tags ("Savage" at 0:21). Filled for list views by hydrateClips. */
  moments?: ClipMoment[];
};

export type FeedCursor = {
  createdAt: string;
  id: string;
  score: number | null;
};

export type ClipDetail = FeedClip & {
  visibility: ClipVisibility;
  status: string;
  isOwn: boolean;
  commentsMode: "everyone" | "followers" | "disabled";
};

export type ClipMoment = { id: string; at: number; label: string };

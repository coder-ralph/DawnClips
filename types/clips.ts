export type FeedName = "foryou" | "following" | "trending" | "latest";
export type ClipVisibility = "public" | "unlisted" | "private";

export type ClipKind = "video" | "photo";

/** One image of a photo post, with a signed (private bucket) URL and its original pixel size. */
export type PostImage = { id: string; url: string; width: number; height: number };

export type FeedClip = {
  id: string;
  /** "video" for a highlight clip, "photo" for a photo post. */
  kind: ClipKind;
  /** Number of images in a photo post (0 for a video). */
  mediaCount: number;
  /** First image of a photo post, signed; also used as thumbnailUrl so every grid and card shows it. */
  cover?: PostImage | null;
  title: string;
  description: string;
  heroTags: string[];
  duration: number | null;
  thumbnailUrl: string | null;
  /** Stable public video URL for public clips, so a card can start loading without the playback API. */
  videoUrl?: string | null;
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
  /** The viewer muted / restricted this clip's author. */
  muted?: boolean;
  restricted?: boolean;
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
  /** All images of a photo post, in order, signed. Empty for a video. */
  media?: PostImage[];
};

export type ClipMoment = { id: string; at: number; label: string };

export type DeletionStatus = "active" | "pending_deletion" | "deleted";

export type OwnProfile = {
  id: string;
  clerkUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  roleId: string | null;
  zoneId: string | null;
  country: string;
  language: string;
  deletionStatus: DeletionStatus;
  createdAt: string;
};

export type PublicProfile = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  /** Public Mobile Legends role id. The zone id is never part of the public profile. */
  roleId: string | null;
  country: string;
  createdAt: string;
  isOwn: boolean;
  showHighlights: boolean;
  showFollowing: boolean;
  showFollowers: boolean;
  showComments: boolean;
  showLikes: boolean;
  clipsCount: number | null;
  followersCount: number | null;
  followingCount: number | null;
};

export type ProfileRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  email_verified: boolean;
  display_name: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  role_id: string | null;
  zone_id: string | null;
  country: string;
  language: string;
  deletion_status: DeletionStatus;
  created_at: string;
};

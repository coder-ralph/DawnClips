import { renderProfileCard } from "@/lib/og/profile-card";
import { getPublicProfile } from "@/lib/profile";

export const alt = "DawnClips profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProfileOpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPublicProfile(id);
  const profile = result.status === "ready" ? result.profile : null;
  return renderProfileCard(
    profile ? { displayName: profile.displayName, username: profile.username, bio: profile.bio, avatarUrl: profile.avatarUrl } : null,
  );
}

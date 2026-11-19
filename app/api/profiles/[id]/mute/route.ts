import { handleProfileControl } from "@/lib/profile-controls";

/** Mute or unmute the profile: its clips leave (or return to) the signed-in person's feeds. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleProfileControl(request, context, "mute");
}

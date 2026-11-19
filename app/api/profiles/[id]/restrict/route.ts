import { handleProfileControl } from "@/lib/profile-controls";

/** Restrict or unrestrict the profile: their comments are hidden from others and their activity stops notifying. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleProfileControl(request, context, "restrict");
}

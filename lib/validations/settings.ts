import { z } from "zod";

const flag = z.enum(["on", "off"]).optional();

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  language: z.enum(["en", "tl", "id"]),
  showHighlights: flag,
  showFollowing: flag,
  showFollowers: flag,
  showComments: flag,
  showLikes: flag,
  autoplay: flag,
  defaultMuted: flag,
  inAppNotifications: flag,
  notifyLikes: flag,
  notifyComments: flag,
  notifyReplies: flag,
  notifyFollows: flag,
});

export function flagValue(value: string | undefined) {
  return value === "on";
}

import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { isRank, rolesError, starsError } from "@/lib/mlbb-profile";
import { usernameError } from "@/lib/username";

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(40),
  username: z.string().trim().superRefine((value, ctx) => {
    const message = usernameError(value);
    if (message) ctx.addIssue({ code: "custom", message });
  }),
  bio: z.string().trim().max(160, "Bio must be 160 characters or fewer."),
  roleId: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9]{1,12}$/.test(value), {
      message: "Role ID must be 1–12 digits.",
    }),
  zoneId: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9]{1,8}$/.test(value), {
      message: "Zone ID must be 1–8 digits.",
    }),
  country: z.string().trim().refine(isCountryCode, "Choose a country."),
  // Highest rank and its stars come as text ("" = not set). Which star counts fit which rank is checked below.
  highestRank: z.string().trim().default("").refine((value) => value === "" || isRank(value), "Choose a rank from the list."),
  rankStars: z.string().trim().default(""),
  favoriteRoles: z.array(z.string()).default([]),
}).superRefine((value, ctx) => {
  const stars = starsError(value.highestRank, value.rankStars);
  if (stars) ctx.addIssue({ code: "custom", path: ["rankStars"], message: stars });
  const roles = rolesError(value.favoriteRoles);
  if (roles) ctx.addIssue({ code: "custom", path: ["favoriteRoles"], message: roles });
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

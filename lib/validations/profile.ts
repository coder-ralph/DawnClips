import { z } from "zod";
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
  country: z.string().trim().regex(/^[A-Z]{2}$/, "Choose a country."),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const countries = [
  { code: "PH", label: "Philippines" },
  { code: "ID", label: "Indonesia" },
  { code: "MY", label: "Malaysia" },
  { code: "SG", label: "Singapore" },
  { code: "TH", label: "Thailand" },
  { code: "VN", label: "Vietnam" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
] as const;

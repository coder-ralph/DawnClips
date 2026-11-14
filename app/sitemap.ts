import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteConfig } from "@/config/site";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const staticRoutes: MetadataRoute.Sitemap = [
    ...["", "/explore"].map((path) => ({ url: `${base}${path || "/"}`, changeFrequency: "daily" as const })),
    ...["/about", "/privacy", "/terms"].map((path) => ({ url: `${base}${path}`, changeFrequency: "monthly" as const })),
  ];
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  const supabase = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  if (!supabase) return staticRoutes;
  const { data } = await supabase.rpc("public_index");
  const payload = data as { clips?: Array<{ id: string; updated_at: string }>; profiles?: Array<{ username: string; updated_at: string }> } | null;
  const clips = (payload?.clips ?? []).map((clip) => ({
    url: `${base}/clip/${clip.id}`,
    lastModified: clip.updated_at,
  }));
  const profiles = (payload?.profiles ?? []).map((profile) => ({
    url: `${base}/profile/${profile.username}`,
    lastModified: profile.updated_at,
  }));
  return [...staticRoutes, ...clips, ...profiles];
}

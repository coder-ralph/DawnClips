import { ImageResponse } from "next/og";
import { loadClip } from "@/lib/clips";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ClipImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = await loadClip(id);
  const title = clip?.visibility === "public" ? clip.title : "DawnClips";
  return new ImageResponse(
    (
      <div style={{ display: "flex", height: "100%", width: "100%", background: "#0B0F19", color: "#F8FAFC", padding: 64, fontSize: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ color: "#E0A84A", fontSize: 28 }}>DawnClips</div>
          <div>{title}</div>
        </div>
      </div>
    ),
    size,
  );
}

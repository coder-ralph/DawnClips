import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { callSocial } from "@/lib/social";
import { commentEditSchema } from "@/lib/validations/social";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = commentEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid comment." }, { status: 400 });
  const result = await callSocial("edit_comment", { target: id, body: parsed.data.content });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "Comment not found." }, { status: 404 });
  // delete_comment checks that the signed-in profile wrote the comment, deletes it with its replies, and returns the
  // new clip count and the ids that were removed. Comments have no R2 objects, so nothing else is deleted here.
  const result = await callSocial<{ deleted: boolean; comments_count: number; removed_ids: string[] }>("delete_comment", { target: id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.data);
}

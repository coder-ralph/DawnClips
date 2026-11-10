/** Turns a failed API response into a message that is safe to show to the person. */
export async function apiErrorMessage(response: Response, fallback: string) {
  if (response.status === 401) return "Log in to do that.";
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

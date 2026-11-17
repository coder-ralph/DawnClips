/**
 * Inserts text into a field at the caret, replacing any selection. Returns the new value and where the caret goes,
 * or null when the result would be longer than `maxLength` (counted in UTF-16 units, like the textarea's maxLength).
 */
export function insertAtCursor(value: string, selectionStart: number | null, selectionEnd: number | null, insert: string, maxLength: number) {
  const start = Math.min(Math.max(selectionStart ?? value.length, 0), value.length);
  const end = Math.min(Math.max(selectionEnd ?? start, start), value.length);
  const next = value.slice(0, start) + insert + value.slice(end);
  if (next.length > maxLength) return null;
  return { value: next, cursor: start + insert.length };
}

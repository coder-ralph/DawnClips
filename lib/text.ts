export function plainText(value: string, max = 1000) {
  return value.replace(/<[^>]*>/g, "").replace(/\u0000/g, "").trim().slice(0, max);
}

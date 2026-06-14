/** Slugify a string into a lowercase, dash-separated token (falls back to `fallback`). */
export function slugify(value: string, fallback = 'item'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

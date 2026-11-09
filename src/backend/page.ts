import type { Page } from "../domain.js";

export function paginate<T>(items: T[], limit: number, cursor: string | undefined): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  if (!Number.isInteger(start) || start < 0) {
    return { items: [] };
  }
  const slice = items.slice(start, start + limit);
  const next = start + slice.length;
  return next < items.length ? { items: slice, nextCursor: String(next) } : { items: slice };
}

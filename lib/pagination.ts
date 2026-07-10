/**
 * Reusable server-side pagination for list endpoints.
 *
 * Public API envelope shape (used by GET /habits, /rewards, /sync/download):
 *   { data, pagination: { page, pageSize, total, totalPages, hasNext, hasPrev } }
 *
 * Query params (case-insensitive):
 *   page     — 1-based page number (default 1)
 *   limit    — page size (default 20, max 100). `pageSize` also accepted.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Parse + clamp pagination params out of an Express request query object.
 * Never throws — invalid input falls back to safe defaults.
 */
export function parsePagination(query: Record<string, unknown>): PaginationParams {
  const rawPage = query.page ?? "1";
  const rawSize = query.limit ?? query.pageSize ?? String(DEFAULT_PAGE_SIZE);

  let page = parseInt(String(rawPage), 10);
  let pageSize = parseInt(String(rawSize), 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return { page, pageSize };
}

/**
 * Slice an in-memory array into a single page and compute metadata.
 * `page` is clamped to the last page so out-of-range requests don't 404.
 */
export function paginate<T>(
  items: readonly T[],
  { page, pageSize }: PaginationParams,
): { data: T[]; pagination: PaginationMeta } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const start = (safePage - 1) * pageSize;
  const data = items.slice(start, start + pageSize);

  return {
    data,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
    },
  };
}

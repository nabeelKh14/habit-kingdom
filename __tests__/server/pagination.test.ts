import { describe, it, expect } from "vitest";
import {
  parsePagination,
  paginate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../../lib/pagination";

describe("parsePagination", () => {
  it("uses safe defaults when no query params", () => {
    const p = parsePagination({});
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("accepts valid page + limit", () => {
    const p = parsePagination({ page: "3", limit: "15" });
    expect(p.page).toBe(3);
    expect(p.pageSize).toBe(15);
  });

  it("accepts `pageSize` as an alias for `limit`", () => {
    const p = parsePagination({ page: "2", pageSize: "40" });
    expect(p.page).toBe(2);
    expect(p.pageSize).toBe(40);
  });

  it("clamps page below 1 to 1", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
  });

  it("clamps pageSize below 1 to default", () => {
    expect(parsePagination({ limit: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("caps pageSize at MAX_PAGE_SIZE", () => {
    expect(parsePagination({ limit: "99999" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("ignores non-numeric input and falls back to defaults", () => {
    const p = parsePagination({ page: "abc", limit: "xyz" });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 53 }, (_, i) => ({ id: i + 1 }));

  it("returns the first page with default size", () => {
    const { data, pagination } = paginate(items, parsePagination({}));
    expect(data).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(data[0].id).toBe(1);
    expect(pagination.total).toBe(53);
    expect(pagination.totalPages).toBe(3);
    expect(pagination.hasNext).toBe(true);
    expect(pagination.hasPrev).toBe(false);
  });

  it("slices the correct window for a middle page", () => {
    const { data, pagination } = paginate(items, parsePagination({ page: "2", limit: "20" }));
    expect(data).toHaveLength(20);
    expect(data[0].id).toBe(21);
    expect(pagination.page).toBe(2);
    expect(pagination.hasPrev).toBe(true);
    expect(pagination.hasNext).toBe(true);
  });

  it("returns the remaining tail on the last page", () => {
    const { data, pagination } = paginate(items, parsePagination({ page: "3", limit: "20" }));
    expect(data).toHaveLength(13);
    expect(data[0].id).toBe(41);
    expect(pagination.hasNext).toBe(false);
  });

  it("clamps an out-of-range page to the last page", () => {
    const { data, pagination } = paginate(items, parsePagination({ page: "99", limit: "20" }));
    expect(pagination.page).toBe(3);
    expect(data).toHaveLength(13);
  });

  it("handles an empty collection", () => {
    const { data, pagination } = paginate([], parsePagination({ page: "1" }));
    expect(data).toHaveLength(0);
    expect(pagination.total).toBe(0);
    expect(pagination.totalPages).toBe(1);
    expect(pagination.hasNext).toBe(false);
    expect(pagination.hasPrev).toBe(false);
  });
});

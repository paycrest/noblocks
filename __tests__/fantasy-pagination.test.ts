jest.mock("server-only", () => ({}));

import { chunkArray, DB_PAGE } from "@/app/lib/fantasy/pagination";

describe("pagination helpers", () => {
  it("chunkArray splits without loss", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("DB_PAGE matches PostgREST cap", () => {
    expect(DB_PAGE).toBe(1000);
  });
});

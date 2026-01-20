import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../config", () => ({
  default: {
    TANSHU_API_KEY: "test-key",
  },
}));

import { getBookMetadata } from "../services/bookMetadataService";

describe("bookMetadataService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retry on server errors and return metadata on success", async () => {
    const mockGet = vi.mocked(axios.get);

    mockGet.mockResolvedValueOnce({
      status: 500,
      data: { code: 0, msg: "error" },
    });
    mockGet.mockResolvedValueOnce({
      status: 200,
      data: {
        code: 1,
        msg: "ok",
        data: {
          title: "Test Book",
          img: "https://example.com/cover.jpg",
          author: "Author",
          isbn: "9780000000000",
          publisher: "Publisher",
          pubdate: "2020-01-01",
          price: "10.00",
          summary: "Summary",
        },
      },
    });

    const result = await getBookMetadata("9780000000000");

    expect(result?.title).toBe("Test Book");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});

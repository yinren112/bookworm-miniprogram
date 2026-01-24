import { describe, it, expect } from "vitest";
import { normalizeCheatsheetContent } from "../services/study/cheatsheetService";

describe("cheatsheetService", () => {
  describe("normalizeCheatsheetContent", () => {
    it("should convert literal \\n sequences into real newlines", () => {
      const input = "# Title\\n\\n- A\\n- B\\n";
      const out = normalizeCheatsheetContent(input);
      expect(out).toContain("\n");
      expect(out).not.toContain("\\n");
    });
  });
});


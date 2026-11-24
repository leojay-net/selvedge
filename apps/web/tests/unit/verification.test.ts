import { describe, expect, it } from "vitest";
import { renderVerificationMarkdown } from "@/lib/verification";

describe("renderVerificationMarkdown", () => {
  it("renders headings and tables and lists section titles", () => {
    const document = renderVerificationMarkdown("# Record\n\n## Kani\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(document.html).toContain("<table>");
    expect(document.headings).toEqual(["Kani"]);
  });
});

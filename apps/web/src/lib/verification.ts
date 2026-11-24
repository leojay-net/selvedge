import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";

const VERIFICATION_RELATIVE_PATH = join("content", "verification.md");
const MAXIMUM_HEADING_DEPTH = 6;
const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    heading({ tokens, depth }) {
      const shiftedDepth = Math.min(depth + 1, MAXIMUM_HEADING_DEPTH);
      return `<h${shiftedDepth}>${this.parser.parseInline(tokens)}</h${shiftedDepth}>\n`;
    },
  },
});

export interface VerificationDocument {
  readonly html: string;
  readonly headings: readonly string[];
}

export function renderVerificationMarkdown(markdown: string): VerificationDocument {
  const html = marked.parse(markdown, { async: false });
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1] ?? "");
  return { html, headings };
}

export function loadVerificationDocument(): VerificationDocument | null {
  const filePath = join(process.cwd(), VERIFICATION_RELATIVE_PATH);
  if (!existsSync(filePath)) return null;
  const markdown = readFileSync(filePath, "utf8").trim();
  if (markdown.length === 0) return null;
  return renderVerificationMarkdown(markdown);
}

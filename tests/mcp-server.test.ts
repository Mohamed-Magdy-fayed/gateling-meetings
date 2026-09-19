import { describe, expect, it } from "vitest";

import {
  DOC_SECTIONS,
  docTitle,
  isDocSection,
  readDoc,
} from "@/features/integrations/server/docs";

/**
 * The MCP tools and the in-app docs page both read `docs/*.md` from the
 * repo at request time: every section named in code must exist on disk and
 * start with a heading, or an agent's `get_docs` comes back empty.
 */
describe("developer docs", () => {
  it("has a markdown file for every section", async () => {
    for (const section of DOC_SECTIONS) {
      const markdown = await readDoc(section);
      expect(markdown.trimStart().startsWith("# ")).toBe(true);
      expect(docTitle(section).length).toBeGreaterThan(0);
    }
  });

  it("only accepts known sections", () => {
    expect(isDocSection("mcp")).toBe(true);
    expect(isDocSection("../.env")).toBe(false);
  });

  it("documents every MCP tool the server registers", async () => {
    const mcp = await readDoc("mcp");
    for (const tool of [
      "get_docs",
      "list_meetings",
      "get_meeting",
      "create_meeting",
      "update_meeting",
      "end_meeting",
      "delete_meeting",
      "create_join_link",
      "list_participants",
    ]) {
      expect(mcp).toContain(`\`${tool}\``);
    }
  });
});

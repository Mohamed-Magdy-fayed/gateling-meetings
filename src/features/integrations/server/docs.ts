import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The developer docs, read from `docs/` in the repo. One source feeds the
 * in-app docs page, the MCP `get_docs` tool and its resources, so the
 * markdown in git is the only copy to keep current.
 */
export const DOC_SECTIONS = ["integration", "webhooks", "mcp"] as const;

export type DocSection = (typeof DOC_SECTIONS)[number];

const TITLES: Record<DocSection, string> = {
  integration: "REST API",
  webhooks: "Webhooks",
  mcp: "MCP server",
};

export function docTitle(section: DocSection): string {
  return TITLES[section];
}

export function isDocSection(value: string): value is DocSection {
  return (DOC_SECTIONS as readonly string[]).includes(value);
}

export async function readDoc(section: DocSection): Promise<string> {
  return readFile(path.join(process.cwd(), "docs", `${section}.md`), "utf8");
}

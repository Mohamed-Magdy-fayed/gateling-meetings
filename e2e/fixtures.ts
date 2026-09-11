import { type BrowserContext, test as base, type Page } from "@playwright/test";

type Fixtures = {
  /** A page in a fresh, isolated context (own cookies, own media permission). Closed after the test. */
  newPage: () => Promise<Page>;
};

/**
 * Every meeting test wants several *independent* people — separate cookie
 * jars, each with camera/mic permission. The base `page` fixture is one
 * person; this hands out more and closes them all afterwards so a LiveKit
 * connection from one test never lingers into the next.
 */
export const test = base.extend<Fixtures>({
  newPage: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        permissions: ["camera", "microphone"],
      });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";

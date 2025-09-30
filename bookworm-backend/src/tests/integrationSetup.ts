import { beforeEach, afterEach } from "vitest";

declare global {
  // eslint-disable-next-line no-var
  var __BOOKWORM_TRUNCATE__: ((workerId?: number) => Promise<void>) | undefined;
}

async function resetDatabase() {
  if (typeof globalThis.__BOOKWORM_TRUNCATE__ === "function") {
    await globalThis.__BOOKWORM_TRUNCATE__();
  }
}

beforeEach(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

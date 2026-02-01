const useExistingDb =
  process.env.BOOKWORM_TEST_USE_EXISTING_DB === "1" ||
  process.env.BOOKWORM_TEST_USE_EXISTING_DB === "true";

import * as dockerCli from "./globalSetup.testcontainers";
import * as simple from "./globalSetup.simple";

const impl = useExistingDb ? simple : dockerCli;

export const setup = impl.setup;
export const teardown = impl.teardown;
export const getPrismaClientForWorker = impl.getPrismaClientForWorker;
export const createTestUser = impl.createTestUser;
export const createTestInventoryItems = impl.createTestInventoryItems;

import type { FullConfig } from "@playwright/test";
import { removeTree } from "@thinkrail/shared/removeTree";
import { E2E_BINARY_CACHE, E2E_DATA_DIR, E2E_DESKTOP_CACHE, E2E_PORT } from "./fixtures/paths";
import { closeFixtureTerminals } from "./fixtures/terminalCleanup";

export default async function globalTeardown(config: FullConfig): Promise<void> {
	if (config.webServer) await closeFixtureTerminals(E2E_PORT);
	removeTree(E2E_DATA_DIR);
	removeTree(E2E_BINARY_CACHE);
	removeTree(E2E_DESKTOP_CACHE);
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Workspace } from "@thinkrail/contracts";
import { E2E_DATA_DIR } from "./paths";
import { E2eWire } from "./wire";

export async function closeFixtureTerminals(port: number): Promise<void> {
	const path = join(E2E_DATA_DIR, "workspaces.json");
	if (!existsSync(path)) return;
	const workspaces: Workspace[] = JSON.parse(readFileSync(path, "utf8"));
	if (workspaces.length === 0) return;
	const wire = await E2eWire.connect(port);
	try {
		for (const workspace of workspaces) {
			const { tabs } = await wire.request("terminal.list", { workspaceId: workspace.id });
			for (const tab of tabs) {
				await wire.request("terminal.close", {
					workspaceId: workspace.id,
					tabKey: tab.tabKey,
					force: true,
				});
			}
		}
	} finally {
		wire.close();
	}
}

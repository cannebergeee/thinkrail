import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { hermeticE2ePath, hermeticE2eShell } from "../e2e/fixtures/executables";

test("the isolated PATH keeps the fake-bin slot before global setup creates it", () => {
	const fakeBin = join(tmpdir(), "thinkrail-e2e-not-yet-created", "bin");
	const directories = hermeticE2ePath(fakeBin).split(delimiter);
	expect(directories[0]).toBe(fakeBin);
	expect(directories).not.toContain(join(homedir(), ".bun", "bin"));
});

test.skipIf(process.platform !== "win32")(
	"the Windows host can run Git and names an executable shell",
	() => {
		const fakeBin = join(tmpdir(), "thinkrail-e2e-not-yet-created", "bin");
		const result = spawnSync("git", ["--version"], {
			env: { ...process.env, PATH: hermeticE2ePath(fakeBin) },
			encoding: "utf8",
			windowsHide: true,
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("git version");
		expect(existsSync(hermeticE2eShell(fakeBin))).toBe(true);
	},
);

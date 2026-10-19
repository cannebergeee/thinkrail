import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import type { Workspace } from "@thinkrail/contracts";
import { saveWorkspaces } from "../persistence";
import { readDir, workspaceRelativePath } from "./files";

let root: string;
let worktree: string;
const savedDataDir = process.env.THINKRAIL_DATA_DIR;

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "trpi-fs-paths-")));
	process.env.THINKRAIL_DATA_DIR = join(root, "data");
	worktree = join(root, "wt");
	mkdirSync(join(worktree, "src", "inner"), { recursive: true });
	writeFileSync(join(worktree, "src", "inner", "a.ts"), "export {};\n");
	saveWorkspaces([
		{
			id: "w",
			projectId: "p",
			name: "wt",
			branch: "main",
			worktreePath: worktree,
			baseBranch: "main",
		} satisfies Workspace,
	]);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	if (savedDataDir === undefined) delete process.env.THINKRAIL_DATA_DIR;
	else process.env.THINKRAIL_DATA_DIR = savedDataDir;
});

test("workspaceRelativePath names a contained path worktree-relative with / separators", () => {
	expect(workspaceRelativePath(worktree, join(worktree, "src", "inner", "a.ts"))).toBe(
		"src/inner/a.ts",
	);
	expect(workspaceRelativePath(worktree, join("src", "inner", "a.ts"))).toBe("src/inner/a.ts");
	expect(workspaceRelativePath(worktree, "./src/../src/inner")).toBe("src/inner");
	expect(workspaceRelativePath(`${worktree}${sep}.`, "src")).toBe("src");
	expect(workspaceRelativePath(worktree, "..env")).toBe("..env");
	expect(workspaceRelativePath(worktree, ".")).toBe("");
});

test("workspaceRelativePath rejects a path outside the worktree", () => {
	expect(workspaceRelativePath(worktree, "../wt-sibling/a.ts")).toBeNull();
	expect(workspaceRelativePath(worktree, join(root, "elsewhere"))).toBeNull();
});

test("readDir lists nested entries worktree-relative with / separators", () => {
	expect(readDir("w", "src").map((node) => node.path)).toEqual(["src/inner"]);
	expect(readDir("w", join("src", "inner")).map((node) => node.path)).toEqual(["src/inner/a.ts"]);
});

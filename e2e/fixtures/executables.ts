import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { LOGIN_ENV_MARKER } from "@thinkrail/shared/shellEnv";

export function resolveBunExecutable(env: NodeJS.ProcessEnv = process.env): string {
	const name = process.platform === "win32" ? "bun.exe" : "bun";
	const executable = (env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((directory) => join(directory, name))
		.find(existsSync);
	if (!executable) throw new Error("bun executable not found for the e2e host");
	return executable;
}

export function hermeticE2ePath(fakeBinDir: string): string {
	if (process.platform === "win32") {
		const gitRoot = windowsGitRoot();
		const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
		return [
			fakeBinDir,
			join(gitRoot, "cmd"),
			join(gitRoot, "usr", "bin"),
			join(gitRoot, "mingw64", "bin"),
			join(systemRoot, "System32"),
			systemRoot,
		].join(delimiter);
	}
	return [fakeBinDir, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(delimiter);
}

export function hermeticE2eShell(fakeBinDir: string): string {
	if (process.platform === "win32") return join(windowsGitRoot(), "bin", "bash.exe");
	return join(fakeBinDir, "login-shell");
}

export function writeHermeticE2eShell(fakeBinDir: string, realShell: string): void {
	if (process.platform === "win32") return;
	const script = [
		"#!/bin/sh",
		'case "$*" in',
		`\t*${shellQuote(LOGIN_ENV_MARKER)}*) printf '%sPATH=%s\\0' ${shellQuote(LOGIN_ENV_MARKER)} ${shellQuote(hermeticE2ePath(fakeBinDir))}; exit 0 ;;`,
		"esac",
		`exec ${shellQuote(realShell)} "$@"`,
		"",
	].join("\n");
	const target = hermeticE2eShell(fakeBinDir);
	writeFileSync(target, script);
	chmodSync(target, 0o755);
}

function windowsGitRoot(): string {
	for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
		if (!existsSync(join(directory, "git.exe"))) continue;
		for (const root of [dirname(resolve(directory)), resolve(directory, "../..")]) {
			if (existsSync(join(root, "cmd", "git.exe")) && existsSync(join(root, "bin", "bash.exe")))
				return root;
		}
	}
	throw new Error("Git for Windows is required by the e2e host");
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CustomProviderInput } from "@thinkrail/contracts";
import { parse } from "jsonc-parser";
import {
	customProviderIds,
	deleteCustomProvider,
	discoverProviderModels,
	listCustomProviders,
	saveCustomProvider,
	setCustomProviderPublisher,
} from "./customProviders";
import { configurePiRuntime } from "./piRuntime";

let directory: string;
let path: string;
let priorAgentDir: string | undefined;
let priorOffline: string | undefined;

const SECRET = "sk-fixture-secret-value";

function draft(overrides: Partial<CustomProviderInput> = {}): CustomProviderInput {
	return {
		id: "my-gateway",
		name: "My Gateway",
		baseUrl: "https://gateway.example/v1",
		api: "openai-completions",
		models: [
			{
				id: "glm-4.6",
				name: "GLM 4.6",
				contextWindow: 200_000,
				maxTokens: 32_768,
				input: ["text"],
			},
		],
		...overrides,
	};
}

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "thinkrail-custom-provider-"));
	path = join(directory, "models.json");
	priorAgentDir = process.env.PI_CODING_AGENT_DIR;
	priorOffline = process.env.PI_OFFLINE;
	process.env.PI_CODING_AGENT_DIR = directory;
	process.env.PI_OFFLINE = "1";
});

afterEach(() => {
	setCustomProviderPublisher(null);
	configurePiRuntime(null);
	if (priorAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = priorAgentDir;
	if (priorOffline === undefined) delete process.env.PI_OFFLINE;
	else process.env.PI_OFFLINE = priorOffline;
	rmSync(directory, { recursive: true, force: true });
});

async function runtime(): Promise<ModelRuntime> {
	const result = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		allowModelNetwork: false,
	});
	await result.refresh({ allowNetwork: false });
	configurePiRuntime(result);
	return result;
}

function config(): Record<string, unknown> {
	return parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function providers(): Record<string, unknown> {
	return (config().providers ?? {}) as Record<string, unknown>;
}

function temporaryFiles(): string[] {
	return readdirSync(directory).filter((entry) => entry.startsWith(".models"));
}

test("saving writes the provider definition and composes it into pi's catalog", async () => {
	const pi = await runtime();
	let published = 0;
	setCustomProviderPublisher(() => {
		published++;
	});

	const saved = await saveCustomProvider(draft());

	expect(saved).toEqual([draft()]);
	expect(config()).toEqual({
		$schema: "https://pi.dev/schemas/models.schema.json",
		providers: {
			"my-gateway": {
				name: "My Gateway",
				baseUrl: "https://gateway.example/v1",
				api: "openai-completions",
				models: [
					{
						id: "glm-4.6",
						name: "GLM 4.6",
						contextWindow: 200_000,
						maxTokens: 32_768,
						input: ["text"],
					},
				],
			},
		},
	});
	expect(pi.getProvider("my-gateway")?.name).toBe("My Gateway");
	expect(pi.getModel("my-gateway", "glm-4.6")).toMatchObject({
		api: "openai-completions",
		baseUrl: "https://gateway.example/v1",
		contextWindow: 200_000,
		maxTokens: 32_768,
	});
	expect(published).toBe(1);
	expect(temporaryFiles()).toEqual([]);
});

test("the API key lands in pi's credential store and never in models.json", async () => {
	const pi = await runtime();
	await saveCustomProvider(draft({ apiKey: SECRET }));

	const stored = readFileSync(path, "utf8");
	expect(stored).not.toContain(SECRET);
	expect(pi.getProviderAuthStatus("my-gateway")).toMatchObject({
		configured: true,
		source: "stored",
	});
	expect((await pi.getAuth("my-gateway"))?.auth.apiKey).toBe(SECRET);

	await deleteCustomProvider("my-gateway");
	expect(providers()).toEqual({});
	expect(await pi.listCredentials()).toEqual([]);
});

test("editing keeps the stored key while replacing the catalog", async () => {
	const pi = await runtime();
	await saveCustomProvider(draft({ apiKey: SECRET }));
	await saveCustomProvider(
		draft({
			name: "Gateway Two",
			models: [
				{
					id: "qwen3-coder",
					name: "Qwen3 Coder",
					contextWindow: 256_000,
					maxTokens: 65_536,
					input: ["text", "image"],
				},
			],
		}),
	);

	expect(pi.getProvider("my-gateway")?.name).toBe("Gateway Two");
	expect(pi.getModels("my-gateway").map((model) => model.id)).toEqual(["qwen3-coder"]);
	expect(pi.getProviderAuthStatus("my-gateway").source).toBe("stored");
	expect(listCustomProviders()).toHaveLength(1);
});

test("a provider id that already exists is refused", async () => {
	const pi = await runtime();
	expect(pi.getProvider("openai")).toBeDefined();
	await expect(saveCustomProvider(draft({ id: "openai", name: "Overlay" }))).rejects.toThrow(
		"already exists",
	);
	expect(readdirSync(directory)).not.toContain("models.json");
});

test("malformed definitions are refused before the file is touched", async () => {
	const cases: [Partial<CustomProviderInput>, RegExp][] = [
		[{ id: "My-Gateway" }, /lowercase letter/],
		[{ baseUrl: "ftp://gateway.example/v1" }, /absolute HTTP\(S\) base URL/],
		[{ baseUrl: "https://user:pass@gateway.example/v1" }, /credential/],
		[{ models: [] }, /at least one model/],
		[
			{
				models: [
					{ id: "same", name: "Same", contextWindow: 200_000, maxTokens: 1024, input: ["text"] },
					{ id: "same", name: "Same", contextWindow: 200_000, maxTokens: 1024, input: ["text"] },
				],
			},
			/listed twice/,
		],
		[
			{
				models: [{ id: "m", name: "M", contextWindow: 10, maxTokens: 1024, input: ["text"] }],
			},
			/context window/,
		],
		[
			{
				models: [{ id: "m", name: "M", contextWindow: 200_000, maxTokens: 0, input: ["text"] }],
			},
			/maximum output/,
		],
	];
	for (const [overrides, message] of cases) {
		await expect(saveCustomProvider(draft(overrides))).rejects.toThrow(message);
	}
	await expect(
		saveCustomProvider({ ...draft(), api: "google-generative-ai" } as unknown),
	).rejects.toThrow("supported API protocol");
	expect(readdirSync(directory)).not.toContain("models.json");
});

test("hand-written entries outside the editable shape stay untouched and invisible", async () => {
	const original = JSON.stringify({
		providers: {
			legacy: {
				baseUrl: "http://localhost:11434/v1",
				api: "openai-completions",
				models: [{ id: "qwen2.5-coder:7b" }],
			},
			overlay: { modelOverrides: { "gpt-5.5": { contextWindow: 900_000 } } },
		},
	});
	writeFileSync(path, original);
	await runtime();

	expect(listCustomProviders()).toEqual([
		{
			id: "legacy",
			name: "legacy",
			baseUrl: "http://localhost:11434/v1",
			api: "openai-completions",
			models: [
				{
					id: "qwen2.5-coder:7b",
					name: "qwen2.5-coder:7b",
					contextWindow: 128_000,
					maxTokens: 16_384,
					input: ["text"],
				},
			],
		},
	]);
	expect(customProviderIds()).toEqual(["legacy"]);

	await saveCustomProvider(draft());
	expect(providers()).toEqual({
		legacy: {
			baseUrl: "http://localhost:11434/v1",
			api: "openai-completions",
			models: [{ id: "qwen2.5-coder:7b" }],
		},
		overlay: { modelOverrides: { "gpt-5.5": { contextWindow: 900_000 } } },
		"my-gateway": {
			name: "My Gateway",
			baseUrl: "https://gateway.example/v1",
			api: "openai-completions",
			models: [
				{
					id: "glm-4.6",
					name: "GLM 4.6",
					contextWindow: 200_000,
					maxTokens: 32_768,
					input: ["text"],
				},
			],
		},
	});
});

test("an invalid models.json is refused rather than rewritten", async () => {
	writeFileSync(path, '{"providers": {');
	await runtime();
	await expect(saveCustomProvider(draft())).rejects.toThrow("isn't valid JSON");
	await expect(deleteCustomProvider("my-gateway")).rejects.toThrow();
	expect(readFileSync(path, "utf8")).toBe('{"providers": {');
	expect(temporaryFiles()).toEqual([]);
});

test("editing preserves settings the form does not own and rejects exotic entries", async () => {
	const { apiKey: _key, id: _id, ...entry } = draft();
	writeFileSync(
		path,
		JSON.stringify({
			providers: {
				"my-gateway": {
					...entry,
					headers: { "X-Gateway": "fixture" },
					authHeader: true,
					models: entry.models.map((model) => ({
						...model,
						reasoning: true,
						compat: { supportsStore: false },
					})),
				},
				exotic: { baseUrl: "https://example.test", modelOverrides: {} },
				unsupported: { ...entry, models: [{ id: "special", contextWindow: 1 }] },
			},
		}),
	);
	await runtime();
	expect(listCustomProviders().map((provider) => provider.id)).toEqual(["my-gateway"]);
	await saveCustomProvider(draft({ name: "Renamed" }));
	expect(providers()["my-gateway"]).toMatchObject({
		name: "Renamed",
		headers: { "X-Gateway": "fixture" },
		authHeader: true,
		models: [{ reasoning: true, compat: { supportsStore: false } }],
	});
	const before = readFileSync(path, "utf8");
	await expect(saveCustomProvider(draft({ id: "exotic" }))).rejects.toThrow(
		"edited in models.json",
	);
	await expect(deleteCustomProvider("exotic")).rejects.toThrow("Unknown custom provider");
	expect(readFileSync(path, "utf8")).toBe(before);
});

test("a read-only models.json is refused and left byte-for-byte intact", async () => {
	writeFileSync(path, '{"providers": {}}');
	chmodSync(path, 0o400);
	await runtime();
	await expect(saveCustomProvider(draft())).rejects.toThrow("Couldn't save");
	expect(readFileSync(path, "utf8")).toBe('{"providers": {}}');
	expect(temporaryFiles()).toEqual([]);
});

test("concurrent saves serialize so neither provider is lost", async () => {
	await runtime();
	await Promise.all([
		saveCustomProvider(draft()),
		saveCustomProvider(draft({ id: "second-gateway", name: "Second" })),
	]);
	expect(Object.keys(providers()).sort()).toEqual(["my-gateway", "second-gateway"]);
});

test("a failed login restores the previous definition and publishes no change", async () => {
	const pi = await runtime();
	await saveCustomProvider(draft());
	const before = readFileSync(path, "utf8");
	let changed = false;
	setCustomProviderPublisher(() => {
		changed = true;
	});
	const login = spyOn(pi, "login").mockRejectedValue(new Error("fixture login refused"));
	try {
		await expect(saveCustomProvider(draft({ name: "Rejected", apiKey: SECRET }))).rejects.toThrow(
			"fixture login refused",
		);
		expect(readFileSync(path, "utf8")).toBe(before);
		expect(pi.getProvider("my-gateway")?.name).toBe("My Gateway");
		expect(changed).toBe(false);
	} finally {
		login.mockRestore();
	}
});

test("a failed delete refresh restores the definition and keeps the credential", async () => {
	const pi = await runtime();
	await saveCustomProvider(draft({ apiKey: SECRET }));
	const before = readFileSync(path, "utf8");
	const original = pi.refresh.bind(pi);
	const refresh = spyOn(pi, "refresh")
		.mockImplementation(original)
		.mockImplementationOnce(original)
		.mockRejectedValueOnce(new Error("fixture refresh refused"));
	try {
		await expect(deleteCustomProvider("my-gateway")).rejects.toThrow("fixture refresh refused");
		expect(readFileSync(path, "utf8")).toBe(before);
		expect(pi.getProvider("my-gateway")).toBeDefined();
		expect((await pi.getAuth("my-gateway"))?.auth.apiKey).toBe(SECRET);
	} finally {
		refresh.mockRestore();
	}
});

test("discovery lists an OpenAI-compatible endpoint's models with the bearer key", async () => {
	const seen: { path: string; authorization: string | null } = { path: "", authorization: null };
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			seen.path = url.pathname;
			seen.authorization = request.headers.get("authorization");
			return Response.json({ data: [{ id: "glm-4.6" }, { id: "glm-4.6" }, { id: "qwen3" }] });
		},
	});
	try {
		const result = await discoverProviderModels({
			baseUrl: `http://127.0.0.1:${server.port}/v1`,
			api: "openai-completions",
			apiKey: SECRET,
		});
		expect(result.models).toEqual(["glm-4.6", "qwen3"]);
		expect(seen.path).toBe("/v1/models");
		expect(seen.authorization).toBe(`Bearer ${SECRET}`);
	} finally {
		server.stop(true);
	}
});

test("discovery asks an Anthropic endpoint with its own path and headers", async () => {
	const seen: { path: string; key: string | null; version: string | null } = {
		path: "",
		key: null,
		version: null,
	};
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			seen.path = url.pathname;
			seen.key = request.headers.get("x-api-key");
			seen.version = request.headers.get("anthropic-version");
			return Response.json({ data: [{ id: "claude-fixture" }], has_more: false });
		},
	});
	try {
		const result = await discoverProviderModels({
			baseUrl: `http://127.0.0.1:${server.port}`,
			api: "anthropic-messages",
			apiKey: SECRET,
		});
		expect(result.models).toEqual(["claude-fixture"]);
		expect(seen.path).toBe("/v1/models");
		expect(seen.key).toBe(SECRET);
		expect(seen.version).toBe("2023-06-01");
	} finally {
		server.stop(true);
	}
});

test("discovery falls back to the stored credential of an existing provider", async () => {
	const seen: { authorization: string | null } = { authorization: null };
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			seen.authorization = request.headers.get("authorization");
			return Response.json({ models: ["stored-model"] });
		},
	});
	try {
		await runtime();
		const baseUrl = `http://127.0.0.1:${server.port}/v1`;
		await saveCustomProvider(draft({ baseUrl, apiKey: SECRET }));
		const result = await discoverProviderModels({
			providerId: "my-gateway",
			baseUrl,
			api: "openai-completions",
		});
		expect(result.models).toEqual(["stored-model"]);
		expect(seen.authorization).toBe(`Bearer ${SECRET}`);
	} finally {
		server.stop(true);
	}
});

test("discovery reports a refusal, a non-JSON answer and an empty listing", async () => {
	const unauthorized = Bun.serve({ port: 0, fetch: () => new Response("nope", { status: 401 }) });
	try {
		await expect(
			discoverProviderModels({
				baseUrl: `http://127.0.0.1:${unauthorized.port}/v1`,
				api: "openai-completions",
			}),
		).rejects.toThrow("answered 401");
	} finally {
		unauthorized.stop(true);
	}

	const broken = Bun.serve({ port: 0, fetch: () => new Response("<html>", { status: 200 }) });
	try {
		await expect(
			discoverProviderModels({
				baseUrl: `http://127.0.0.1:${broken.port}/v1`,
				api: "openai-completions",
			}),
		).rejects.toThrow("didn't answer with JSON");
	} finally {
		broken.stop(true);
	}

	const empty = Bun.serve({ port: 0, fetch: () => Response.json({ data: [] }) });
	try {
		await expect(
			discoverProviderModels({
				baseUrl: `http://127.0.0.1:${empty.port}/v1`,
				api: "openai-completions",
			}),
		).rejects.toThrow("listed no models");
	} finally {
		empty.stop(true);
	}
});

test("discovery never sends a stored key to a changed endpoint or protocol", async () => {
	const seen: (string | null)[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			seen.push(request.headers.get("authorization"), request.headers.get("x-api-key"));
			return Response.json({ data: [{ id: "fixture" }] });
		},
	});
	try {
		await runtime();
		const baseUrl = `http://127.0.0.1:${server.port}/v1`;
		await saveCustomProvider(draft({ baseUrl, apiKey: SECRET }));
		await discoverProviderModels({
			providerId: "my-gateway",
			baseUrl: `${baseUrl}/other`,
			api: "openai-completions",
		});
		await discoverProviderModels({ providerId: "my-gateway", baseUrl, api: "anthropic-messages" });
		expect(seen).toEqual([null, null, null, null]);
	} finally {
		server.stop(true);
	}
});

test("discovery refuses redirects before forwarding an API key", async () => {
	let forwarded = false;
	const server = Bun.serve({
		port: 0,
		fetch(request) {
			if (new URL(request.url).pathname === "/v1/models")
				return new Response(null, { status: 302, headers: { location: "/other" } });
			forwarded = true;
			return Response.json({ data: [{ id: "fixture" }] });
		},
	});
	try {
		await expect(
			discoverProviderModels({
				baseUrl: `http://127.0.0.1:${server.port}/v1`,
				api: "anthropic-messages",
				apiKey: SECRET,
			}),
		).rejects.toThrow("Couldn't reach");
		expect(forwarded).toBe(false);
	} finally {
		server.stop(true);
	}
});

import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
	CUSTOM_PROVIDER_LIMITS,
	type CustomProvider,
	type CustomProviderApi,
	type CustomProviderInput,
	type CustomProviderModel,
	type DiscoverModelsResult,
	isCustomProviderApi,
	isCustomProviderId,
} from "@thinkrail/contracts";
import { applyEdits, modify, type ParseError, parse } from "jsonc-parser";
import { logger } from "../log";
import { usePiRuntime } from "./agentSessionManager";
import {
	deleteModelsSource,
	MODELS_FORMAT_OPTIONS,
	MODELS_SCHEMA_URL,
	modelsJsonPath,
	readModelsSource,
	serializeModelsWrite,
	writeModelsSource,
} from "./modelsFile";
import { piLoginOptions } from "./piRuntime";

const log = logger("agent");

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
const DISCOVERY_TIMEOUT_MS = 10_000;
const DISCOVERY_MAX_BYTES = 2_000_000;
const ANTHROPIC_VERSION = "2023-06-01";

type JsonObject = Record<string, unknown>;

let publishProviderChange: (() => void) | null = null;

export function setCustomProviderPublisher(publisher: (() => void) | null): void {
	publishProviderChange = publisher;
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function readProviders(source: string | undefined): JsonObject {
	if (source === undefined) return {};
	const errors: ParseError[] = [];
	const root = parse(source.replace(/^\uFEFF/, ""), errors, { allowTrailingComma: true });
	if (errors.length > 0)
		throw new Error("Pi's models.json isn't valid JSON. Fix the file and retry.");
	const providers = isObject(root) ? root.providers : undefined;
	return isObject(providers) ? providers : {};
}

function boundedInteger(value: unknown, fallback: number, label: string): number {
	if (value === undefined) return fallback;
	const bounds =
		label === "context window"
			? CUSTOM_PROVIDER_LIMITS.contextWindow
			: CUSTOM_PROVIDER_LIMITS.maxTokens;
	if (
		typeof value === "number" &&
		Number.isSafeInteger(value) &&
		value >= bounds.min &&
		value <= bounds.max
	)
		return value;
	throw new Error(
		`The ${label} must be a whole number between ${bounds.min.toLocaleString("en-US")} and ${bounds.max.toLocaleString("en-US")}`,
	);
}

function inputKinds(value: unknown): ("text" | "image")[] {
	if (value === undefined) return ["text"];
	if (!Array.isArray(value)) throw new Error("Model input types are malformed");
	const kinds = new Set<"text" | "image">();
	for (const kind of value) {
		if (kind !== "text" && kind !== "image")
			throw new Error("Model input types are text and image only");
		kinds.add(kind);
	}
	return kinds.has("image") ? ["text", "image"] : ["text"];
}

function modelFromEntry(value: unknown): CustomProviderModel | undefined {
	if (!isObject(value)) return undefined;
	const id = text(value.id);
	if (id === "") return undefined;
	return {
		id,
		name: text(value.name) || id,
		contextWindow: boundedInteger(value.contextWindow, DEFAULT_CONTEXT_WINDOW, "context window"),
		maxTokens: boundedInteger(value.maxTokens, DEFAULT_MAX_TOKENS, "maximum output"),
		input: inputKinds(value.input),
	};
}

function providerFromEntry(id: string, entry: unknown): CustomProvider | undefined {
	if (!isCustomProviderId(id) || !isObject(entry)) return undefined;
	const baseUrl = text(entry.baseUrl);
	if (baseUrl === "" || !isCustomProviderApi(entry.api)) return undefined;
	if (!Array.isArray(entry.models)) return undefined;
	try {
		const models = entry.models.map(modelFromEntry);
		if (models.length === 0 || models.some((model) => model === undefined)) return undefined;
		return {
			id,
			name: text(entry.name) || id,
			baseUrl,
			api: entry.api,
			models: models.filter((model) => model !== undefined),
		};
	} catch {
		return undefined;
	}
}

export function listCustomProviders(): CustomProvider[] {
	return Object.entries(readProviders(readModelsSource(modelsJsonPath())))
		.flatMap(([id, entry]) => {
			const provider = providerFromEntry(id, entry);
			return provider ? [provider] : [];
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function customProviderIds(): string[] {
	try {
		return Object.entries(readProviders(readModelsSource(modelsJsonPath())))
			.filter(([, entry]) => isObject(entry) && text(entry.baseUrl) !== "")
			.map(([id]) => id);
	} catch {
		return [];
	}
}

function normalizeBaseUrl(value: unknown): string {
	const trimmed = text(value).replace(/\/+$/u, "");
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Enter an absolute HTTP(S) base URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw new Error("Enter an absolute HTTP(S) base URL");
	if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
		throw new Error("A base URL can't carry credentials, a query or a fragment");
	return trimmed;
}

function normalizeModels(value: unknown): CustomProviderModel[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error("Add at least one model ID");
	if (value.length > CUSTOM_PROVIDER_LIMITS.models)
		throw new Error(`A provider can define at most ${CUSTOM_PROVIDER_LIMITS.models} models`);
	const seen = new Set<string>();
	return value.map((entry) => {
		if (!isObject(entry)) throw new Error("A model entry is malformed");
		const id = text(entry.id);
		if (id === "" || id.length > CUSTOM_PROVIDER_LIMITS.modelId)
			throw new Error(
				`Each model needs an ID of at most ${CUSTOM_PROVIDER_LIMITS.modelId} characters`,
			);
		if (seen.has(id)) throw new Error(`The model ID ${id} is listed twice`);
		seen.add(id);
		const name = text(entry.name) || id;
		if (name.length > CUSTOM_PROVIDER_LIMITS.modelId)
			throw new Error(`A model name can be at most ${CUSTOM_PROVIDER_LIMITS.modelId} characters`);
		return {
			id,
			name,
			contextWindow: boundedInteger(entry.contextWindow, DEFAULT_CONTEXT_WINDOW, "context window"),
			maxTokens: boundedInteger(entry.maxTokens, DEFAULT_MAX_TOKENS, "maximum output"),
			input: inputKinds(entry.input),
		};
	});
}

function normalizeApiKey(value: unknown): string | undefined {
	const key = text(value);
	if (key === "") return undefined;
	if (key.length > CUSTOM_PROVIDER_LIMITS.apiKey) throw new Error("That API key is too long");
	return key;
}

function normalizeProvider(value: unknown): CustomProviderInput {
	if (!isObject(value)) throw new Error("The provider definition is malformed");
	const id = text(value.id);
	if (!isCustomProviderId(id))
		throw new Error(
			"The provider ID must start with a lowercase letter and use only lowercase letters, digits and dashes",
		);
	const name = text(value.name) || id;
	if (name.length > CUSTOM_PROVIDER_LIMITS.name)
		throw new Error(`A provider name can be at most ${CUSTOM_PROVIDER_LIMITS.name} characters`);
	if (!isCustomProviderApi(value.api)) throw new Error("Choose a supported API protocol");
	const apiKey = normalizeApiKey(value.apiKey);
	return {
		id,
		name,
		baseUrl: normalizeBaseUrl(value.baseUrl),
		api: value.api,
		models: normalizeModels(value.models),
		...(apiKey === undefined ? {} : { apiKey }),
	};
}

function providerEntry(provider: CustomProviderInput, previous: unknown): JsonObject {
	const existing = isObject(previous) ? previous : {};
	const models = Array.isArray(existing.models) ? existing.models.filter(isObject) : [];
	return {
		...existing,
		name: provider.name,
		baseUrl: provider.baseUrl,
		api: provider.api,
		models: provider.models.map((model) => ({
			...models.find((entry) => entry.id === model.id),
			id: model.id,
			name: model.name,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
			input: model.input,
		})),
	};
}

function emptyModelsSource(): string {
	return `{\n  "$schema": "${MODELS_SCHEMA_URL}",\n  "providers": {}\n}\n`;
}

async function restoreModelsFile(
	runtime: ModelRuntime,
	path: string,
	source: string | undefined,
): Promise<void> {
	try {
		if (source === undefined) deleteModelsSource(path);
		else writeModelsSource(path, source);
		await runtime.refresh({ allowNetwork: false });
	} catch (error) {
		log.warn(
			`custom provider rollback failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function saveCustomProvider(value: unknown): Promise<CustomProvider[]> {
	return serializeModelsWrite(() => save(normalizeProvider(value)));
}

function save(provider: CustomProviderInput): Promise<CustomProvider[]> {
	return usePiRuntime(async (runtime) => {
		await runtime.refresh({ allowNetwork: false });
		const path = modelsJsonPath();
		const source = readModelsSource(path);
		const entries = readProviders(source);
		if (
			Object.hasOwn(entries, provider.id) &&
			!providerFromEntry(provider.id, entries[provider.id])
		)
			throw new Error("That provider's configuration must be edited in models.json");
		if (!Object.hasOwn(entries, provider.id) && runtime.getProvider(provider.id))
			throw new Error("A provider with that ID already exists — choose another ID");
		const bom = source?.startsWith("\uFEFF") ? "\uFEFF" : "";
		const current = source === undefined ? emptyModelsSource() : source.slice(bom.length);
		const next = applyEdits(
			current,
			modify(
				current,
				["providers", provider.id],
				providerEntry(provider, entries[provider.id]),
				MODELS_FORMAT_OPTIONS,
			),
		);
		try {
			writeModelsSource(path, bom + next);
			await runtime.refresh({ allowNetwork: false });
			if (!runtime.getProvider(provider.id))
				throw new Error("Pi rejected that provider definition");
			if (provider.apiKey)
				await runtime.login(
					provider.id,
					"api_key",
					{ prompt: async () => provider.apiKey ?? "", notify: () => {} },
					piLoginOptions,
				);
		} catch (error) {
			await restoreModelsFile(runtime, path, source);
			throw error;
		}
		publishProviderChange?.();
		return listCustomProviders();
	});
}

export function deleteCustomProvider(providerId: unknown): Promise<CustomProvider[]> {
	return serializeModelsWrite(() => remove(providerId));
}

function remove(providerId: unknown): Promise<CustomProvider[]> {
	return usePiRuntime(async (runtime) => {
		const id = text(providerId);
		if (!isCustomProviderId(id)) throw new Error("Unknown custom provider");
		await runtime.refresh({ allowNetwork: false });
		const path = modelsJsonPath();
		const source = readModelsSource(path);
		if (!providerFromEntry(id, readProviders(source)[id]))
			throw new Error("Unknown custom provider");
		const bom = source?.startsWith("\uFEFF") ? "\uFEFF" : "";
		const current = source?.slice(bom.length) ?? "";
		const next = applyEdits(
			current,
			modify(current, ["providers", id], undefined, MODELS_FORMAT_OPTIONS),
		);
		try {
			writeModelsSource(path, bom + next);
			await runtime.refresh({ allowNetwork: false });
		} catch (error) {
			await restoreModelsFile(runtime, path, source);
			throw error;
		}
		await dropCredential(runtime, id);
		publishProviderChange?.();
		return listCustomProviders();
	});
}

async function dropCredential(runtime: ModelRuntime, providerId: string): Promise<void> {
	try {
		const credentials = await runtime.listCredentials();
		if (!credentials.some((credential) => credential.providerId === providerId)) return;
		await runtime.logout(providerId);
	} catch (error) {
		log.warn(
			`couldn't remove the stored credential for ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function modelsEndpoint(baseUrl: string, api: CustomProviderApi): string {
	if (api !== "anthropic-messages") return `${baseUrl}/models`;
	return baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
}

function discoveryHeaders(
	api: CustomProviderApi,
	apiKey: string | undefined,
): Record<string, string> {
	const headers: Record<string, string> = { accept: "application/json" };
	if (api === "anthropic-messages") headers["anthropic-version"] = ANTHROPIC_VERSION;
	if (apiKey === undefined) return headers;
	if (api === "anthropic-messages") {
		headers["x-api-key"] = apiKey;
	} else headers.authorization = `Bearer ${apiKey}`;
	return headers;
}

async function storedApiKey(
	providerId: string,
	baseUrl: string,
	api: CustomProviderApi,
): Promise<string | undefined> {
	if (!isCustomProviderId(providerId)) return undefined;
	const provider = listCustomProviders().find((entry) => entry.id === providerId);
	if (!provider || normalizeBaseUrl(provider.baseUrl) !== baseUrl || provider.api !== api)
		return undefined;
	return usePiRuntime(async (runtime) => {
		const auth = await runtime.getAuth(providerId);
		const key = auth?.auth.apiKey;
		return typeof key === "string" && key !== "" ? key : undefined;
	});
}

function modelIdsFromListing(text_: string): string[] {
	let value: unknown;
	try {
		value = JSON.parse(text_);
	} catch {
		throw new Error("That endpoint didn't answer with JSON");
	}
	const entries = Array.isArray(value)
		? value
		: isObject(value) && Array.isArray(value.data)
			? value.data
			: isObject(value) && Array.isArray(value.models)
				? value.models
				: [];
	const ids: string[] = [];
	for (const entry of entries) {
		const id = text(typeof entry === "string" ? entry : isObject(entry) ? entry.id : "");
		if (id === "" || id.length > CUSTOM_PROVIDER_LIMITS.modelId) continue;
		if (!ids.includes(id)) ids.push(id);
		if (ids.length === CUSTOM_PROVIDER_LIMITS.models) break;
	}
	return ids;
}

export async function discoverProviderModels(value: unknown): Promise<DiscoverModelsResult> {
	if (!isObject(value)) throw new Error("The discovery request is malformed");
	const baseUrl = normalizeBaseUrl(value.baseUrl);
	if (!isCustomProviderApi(value.api)) throw new Error("Choose a supported API protocol");
	const apiKey =
		normalizeApiKey(value.apiKey) ??
		(await storedApiKey(text(value.providerId), baseUrl, value.api));
	let response: Response;
	try {
		response = await fetch(modelsEndpoint(baseUrl, value.api), {
			redirect: "error",
			headers: discoveryHeaders(value.api, apiKey),
			signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
		});
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError")
			throw new Error("That endpoint didn't answer in time");
		throw new Error("Couldn't reach that endpoint — check the base URL");
	}
	if (!response.ok) throw new Error(`That endpoint answered ${response.status}`);
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > DISCOVERY_MAX_BYTES)
		throw new Error("That endpoint's model list is too large");
	const body = await response.text();
	if (body.length > DISCOVERY_MAX_BYTES) throw new Error("That endpoint's model list is too large");
	const models = modelIdsFromListing(body);
	if (models.length === 0) throw new Error("That endpoint listed no models — add the IDs by hand");
	return { models };
}

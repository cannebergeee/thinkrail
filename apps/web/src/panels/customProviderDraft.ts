import {
	CUSTOM_PROVIDER_LIMITS,
	type CustomProvider,
	type CustomProviderApi,
	type CustomProviderInput,
	type CustomProviderModel,
	isCustomProviderId,
} from "@thinkrail/contracts";
import { t } from "@/i18n";
import { randomId } from "@/lib";

export interface CustomProviderModelDraft {
	key: string;
	id: string;
	name: string;
	contextWindow: string;
	maxTokens: string;
	images: boolean;
}

export interface CustomProviderDraft {
	id: string;
	name: string;
	baseUrl: string;
	api: CustomProviderApi;
	apiKey: string;
	models: CustomProviderModelDraft[];
}

export type CustomProviderField = "id" | "name" | "baseUrl" | "apiKey" | "models";

export interface CustomProviderProblem {
	field: CustomProviderField;
	modelIndex?: number;
	message: string;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

export function apiLabel(api: CustomProviderApi): string {
	switch (api) {
		case "openai-completions":
			return t("OpenAI Chat Completions");
		case "openai-responses":
			return t("OpenAI Responses");
		case "anthropic-messages":
			return t("Anthropic Messages");
	}
}

export function apiPathHint(api: CustomProviderApi): string {
	switch (api) {
		case "openai-completions":
			return "/chat/completions";
		case "openai-responses":
			return "/responses";
		case "anthropic-messages":
			return "/v1/messages";
	}
}

function modelDraft(model: CustomProviderModel): CustomProviderModelDraft {
	return {
		key: randomId("model"),
		id: model.id,
		name: model.name,
		contextWindow: String(model.contextWindow),
		maxTokens: String(model.maxTokens),
		images: model.input.includes("image"),
	};
}

export function emptyProviderDraft(): CustomProviderDraft {
	return {
		id: "",
		name: "",
		baseUrl: "",
		api: "openai-completions",
		apiKey: "",
		models: [emptyModelDraft()],
	};
}

export function draftFromProvider(provider: CustomProvider): CustomProviderDraft {
	return {
		id: provider.id,
		name: provider.name,
		baseUrl: provider.baseUrl,
		api: provider.api,
		apiKey: "",
		models: provider.models.map(modelDraft),
	};
}

function wholeNumber(value: string, bounds: { min: number; max: number }): number | null {
	if (!/^\d+$/u.test(value.trim())) return null;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) return null;
	return parsed;
}

export function draftProblem(
	draft: CustomProviderDraft,
	{ editing }: { editing: boolean },
): CustomProviderProblem | null {
	const id = draft.id.trim();
	if (!editing) {
		if (id === "") return { field: "id", message: t("Give the provider an ID") };
		if (!isCustomProviderId(id))
			return {
				field: "id",
				message: t(
					"The ID must start with a lowercase letter and use only lowercase letters, digits and dashes",
				),
			};
	}
	if (draft.name.trim().length > CUSTOM_PROVIDER_LIMITS.name)
		return {
			field: "name",
			message: t("Keep the display name under {0} characters", CUSTOM_PROVIDER_LIMITS.name),
		};
	const baseUrl = draft.baseUrl.trim().replace(/\/+$/u, "");
	if (baseUrl === "") return { field: "baseUrl", message: t("Enter the endpoint's base URL") };
	let url: URL | null = null;
	try {
		url = new URL(baseUrl);
	} catch {}
	if (url === null || (url.protocol !== "http:" && url.protocol !== "https:"))
		return { field: "baseUrl", message: t("Enter an absolute HTTP(S) base URL") };
	if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
		return {
			field: "baseUrl",
			message: t("A base URL can't carry credentials, a query or a fragment"),
		};
	if (draft.models.length === 0)
		return { field: "models", message: t("Add at least one model ID") };
	if (draft.models.length > CUSTOM_PROVIDER_LIMITS.models)
		return {
			field: "models",
			message: t("Keep the catalog under {0} models", CUSTOM_PROVIDER_LIMITS.models),
		};
	const seen = new Set<string>();
	for (const [index, model] of draft.models.entries()) {
		const modelId = model.id.trim();
		if (modelId === "")
			return { field: "models", modelIndex: index, message: t("Enter the model ID") };
		if (modelId.length > CUSTOM_PROVIDER_LIMITS.modelId)
			return {
				field: "models",
				modelIndex: index,
				message: t("Keep the model ID under {0} characters", CUSTOM_PROVIDER_LIMITS.modelId),
			};
		if (seen.has(modelId))
			return {
				field: "models",
				modelIndex: index,
				message: t("{0} is listed twice", modelId),
			};
		seen.add(modelId);
		if (model.name.trim().length > CUSTOM_PROVIDER_LIMITS.modelId)
			return {
				field: "models",
				modelIndex: index,
				message: t("Keep the model name under {0} characters", CUSTOM_PROVIDER_LIMITS.modelId),
			};
		if (wholeNumber(model.contextWindow, CUSTOM_PROVIDER_LIMITS.contextWindow) === null)
			return {
				field: "models",
				modelIndex: index,
				message: t(
					"The context window must be a whole number between {0} and {1}",
					CUSTOM_PROVIDER_LIMITS.contextWindow.min.toLocaleString("en-US"),
					CUSTOM_PROVIDER_LIMITS.contextWindow.max.toLocaleString("en-US"),
				),
			};
		if (wholeNumber(model.maxTokens, CUSTOM_PROVIDER_LIMITS.maxTokens) === null)
			return {
				field: "models",
				modelIndex: index,
				message: t(
					"Maximum output must be a whole number between {0} and {1}",
					CUSTOM_PROVIDER_LIMITS.maxTokens.min.toLocaleString("en-US"),
					CUSTOM_PROVIDER_LIMITS.maxTokens.max.toLocaleString("en-US"),
				),
			};
	}
	if (draft.apiKey.length > CUSTOM_PROVIDER_LIMITS.apiKey)
		return { field: "apiKey", message: t("That API key is too long") };
	return null;
}

export function providerInput(draft: CustomProviderDraft): CustomProviderInput {
	const id = draft.id.trim();
	const apiKey = draft.apiKey.trim();
	return {
		id,
		name: draft.name.trim() || id,
		baseUrl: draft.baseUrl.trim().replace(/\/+$/u, ""),
		api: draft.api,
		models: draft.models.map((model) => {
			const modelId = model.id.trim();
			const input: ("text" | "image")[] = model.images ? ["text", "image"] : ["text"];
			return {
				id: modelId,
				name: model.name.trim() || modelId,
				contextWindow: Number(model.contextWindow),
				maxTokens: Number(model.maxTokens),
				input,
			};
		}),
		...(apiKey === "" ? {} : { apiKey }),
	};
}

export function mergeDiscoveredModels(
	models: readonly CustomProviderModelDraft[],
	discovered: readonly string[],
): CustomProviderModelDraft[] {
	const known = new Set(models.map((model) => model.id.trim()));
	const added: CustomProviderModelDraft[] = [];
	for (const value of discovered) {
		const id = value.trim();
		if (id === "" || known.has(id) || id.length > CUSTOM_PROVIDER_LIMITS.modelId) continue;
		known.add(id);
		added.push({ ...emptyModelDraft(), id });
	}
	return [...models.filter((model) => model.id.trim() !== ""), ...added];
}

export function emptyModelDraft(): CustomProviderModelDraft {
	return {
		key: randomId("model"),
		id: "",
		name: "",
		contextWindow: String(DEFAULT_CONTEXT_WINDOW),
		maxTokens: String(DEFAULT_MAX_TOKENS),
		images: false,
	};
}

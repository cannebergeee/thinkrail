import { expect, test } from "bun:test";
import {
	type CustomProviderDraft,
	draftFromProvider,
	draftProblem,
	emptyProviderDraft,
	mergeDiscoveredModels,
	providerInput,
} from "./customProviderDraft";

function valid(): CustomProviderDraft {
	const draft = emptyProviderDraft();
	return {
		...draft,
		id: "my-gateway",
		name: "My Gateway",
		baseUrl: "https://gateway.example/v1",
		models: [
			{
				key: "fixture-model",
				id: "glm-4.6",
				name: "GLM 4.6",
				contextWindow: "200000",
				maxTokens: "32768",
				images: true,
			},
		],
	};
}

test("a filled-in draft has no problem and becomes a complete provider input", () => {
	expect(draftProblem(valid(), { editing: false })).toBeNull();
	expect(providerInput(valid())).toEqual({
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
				input: ["text", "image"],
			},
		],
	});
});

test("a blank key is omitted so an edit keeps the saved credential", () => {
	const input = providerInput({ ...valid(), apiKey: "   " });
	expect(Object.hasOwn(input, "apiKey")).toBe(false);
	expect(providerInput({ ...valid(), apiKey: " sk-1 " }).apiKey).toBe("sk-1");
});

test("defaults and trimming land in the provider input", () => {
	const draft = valid();
	const model = draft.models[0];
	if (!model) throw new Error("missing fixture model");
	const input = providerInput({
		...draft,
		id: "  my-gateway  ",
		name: "  ",
		baseUrl: "https://gateway.example/v1///",
		models: [{ ...model, name: "  ", images: false }],
	});
	expect(input.id).toBe("my-gateway");
	expect(input.name).toBe("my-gateway");
	expect(input.baseUrl).toBe("https://gateway.example/v1");
	expect(input.models[0]).toMatchObject({ name: "glm-4.6", input: ["text"] });
});

test("the ID is only required while creating", () => {
	expect(draftProblem({ ...valid(), id: "" }, { editing: true })).toBeNull();
	expect(draftProblem({ ...valid(), id: "" }, { editing: false })).toEqual({
		field: "id",
		message: "Give the provider an ID",
	});
	expect(draftProblem({ ...valid(), id: "My-Gateway" }, { editing: false })?.field).toBe("id");
});

test("an invalid base URL names the base URL field", () => {
	expect(draftProblem({ ...valid(), baseUrl: "" }, { editing: false })?.field).toBe("baseUrl");
	expect(draftProblem({ ...valid(), baseUrl: "gateway.example" }, { editing: false })?.field).toBe(
		"baseUrl",
	);
	expect(
		draftProblem({ ...valid(), baseUrl: "ftp://gateway.example" }, { editing: false })?.field,
	).toBe("baseUrl");
	expect(
		draftProblem(
			{ ...valid(), baseUrl: "https://user:pass@gateway.example/v1" },
			{ editing: false },
		)?.message,
	).toBe("A base URL can't carry credentials, a query or a fragment");
});

test("model problems point at the offending row", () => {
	const draft = valid();
	const [model] = draft.models;
	if (!model) throw new Error("missing fixture model");
	const row = (patch: Partial<typeof model>): CustomProviderDraft => ({
		...draft,
		models: [{ ...model, ...patch }],
	});
	expect(draftProblem(row({ id: " " }), { editing: false })).toMatchObject({
		field: "models",
		modelIndex: 0,
		message: "Enter the model ID",
	});
	expect(draftProblem(row({ contextWindow: "12.5" }), { editing: false })?.modelIndex).toBe(0);
	expect(draftProblem(row({ maxTokens: "0" }), { editing: false })?.message).toContain(
		"Maximum output",
	);
	expect(
		draftProblem({ ...draft, models: [model, { ...model }] }, { editing: false })?.message,
	).toBe("glm-4.6 is listed twice");
	expect(draftProblem({ ...draft, models: [] }, { editing: false })).toMatchObject({
		field: "models",
		message: "Add at least one model ID",
	});
});

test("discovered IDs merge once and replace the blank starter row", () => {
	const merged = mergeDiscoveredModels(emptyProviderDraft().models, ["glm-4.6", "qwen3"]);
	expect(merged.map((model) => model.id)).toEqual(["glm-4.6", "qwen3"]);
	expect(merged[0]).toMatchObject({ contextWindow: "128000", maxTokens: "16384", images: false });

	const again = mergeDiscoveredModels(merged, ["qwen3", "kimi-k2", " kimi-k2 "]);
	expect(again.map((model) => model.id)).toEqual(["glm-4.6", "qwen3", "kimi-k2"]);
	expect(mergeDiscoveredModels(merged, ["  "])).toEqual(merged);
});

test("an edited provider never round-trips its secret", () => {
	const draft = draftFromProvider({
		id: "my-gateway",
		name: "My Gateway",
		baseUrl: "https://gateway.example/v1",
		api: "anthropic-messages",
		models: [
			{
				id: "claude-fixture",
				name: "Claude Fixture",
				contextWindow: 200_000,
				maxTokens: 64_000,
				input: ["text"],
			},
		],
	});
	expect(draft.apiKey).toBe("");
	expect(draft.models[0]?.contextWindow).toBe("200000");
	expect(providerInput(draft).models[0]).toMatchObject({ input: ["text"] });
});

import {
	isModelContextWindow,
	isSharedModelContextTarget,
	MODEL_CONTEXT_WINDOW_LIMITS,
	type ModelContextSetting,
	type ModelContextTarget,
} from "@thinkrail/contracts";
import { applyEdits, findNodeAtLocation, modify, parseTree } from "jsonc-parser";
import { usePiRuntime } from "./agentSessionManager";
import {
	MODELS_FORMAT_OPTIONS,
	MODELS_PARSE_OPTIONS,
	modelsJsonPath,
	parseModelsConfig,
	readModelsSource,
	serializeModelsWrite,
	writeModelsSource,
} from "./modelsFile";
import { type AvailableModelsRuntime, settledAvailableModels } from "./piRuntime";

const OPENAI_RESPONSES_APIS = new Set(["openai-responses", "openai-codex-responses"]);
const EMPTY_CONFIG = '{\n  "providers": {}\n}\n';

let publishContextChange: (() => void) | null = null;

export function setModelContextPublisher(publisher: (() => void) | null): void {
	publishContextChange = publisher;
}

function overridePath(model: Pick<ModelContextSetting, "provider" | "id">): string[] {
	return ["providers", model.provider, "modelOverrides", model.id, "contextWindow"];
}

function listSettings(
	runtime: AvailableModelsRuntime,
	config: ReturnType<typeof parseModelsConfig>,
): ModelContextSetting[] {
	return settledAvailableModels(runtime).flatMap((model) => {
		if (!OPENAI_RESPONSES_APIS.has(model.api)) return [];
		const node = config && findNodeAtLocation(config, overridePath(model));
		const override: number | null = node?.type === "number" ? node.value : null;
		if (override === null && model.contextWindow !== MODEL_CONTEXT_WINDOW_LIMITS.min) return [];
		return [
			{
				provider: model.provider,
				id: model.id,
				name: model.name,
				contextWindow: model.contextWindow,
				override,
			},
		];
	});
}

function patch(source: string, path: string[], contextWindow: number | null): string {
	if (contextWindow !== null)
		return applyEdits(source, modify(source, path, contextWindow, MODELS_FORMAT_OPTIONS));
	let current = path;
	while (current.length > 1) {
		source = applyEdits(source, modify(source, current, undefined, MODELS_FORMAT_OPTIONS));
		const parent = current.slice(0, -1);
		const root = parseTree(source, [], MODELS_PARSE_OPTIONS);
		const node = root && findNodeAtLocation(root, parent);
		if (node?.type !== "object" || node.children?.length) break;
		current = parent;
	}
	return source;
}

export function listModelContextSettings(): Promise<ModelContextSetting[]> {
	return usePiRuntime(async (runtime) => {
		await runtime.refresh({ allowNetwork: false });
		return listSettings(runtime, parseModelsConfig(readModelsSource(modelsJsonPath())));
	});
}

export function setModelContextWindow(
	target: ModelContextTarget,
	contextWindow: number | null,
): Promise<ModelContextSetting[]> {
	if (contextWindow !== null && !isModelContextWindow(contextWindow)) {
		return Promise.reject(
			new Error(
				`Context window must be a whole number between ${MODEL_CONTEXT_WINDOW_LIMITS.min.toLocaleString("en-US")} and ${MODEL_CONTEXT_WINDOW_LIMITS.max.toLocaleString("en-US")} tokens`,
			),
		);
	}
	return serializeModelsWrite(() => save(target, contextWindow));
}

function save(
	target: ModelContextTarget,
	contextWindow: number | null,
): Promise<ModelContextSetting[]> {
	return usePiRuntime(async (runtime) => {
		await runtime.refresh({ allowNetwork: false });
		const path = modelsJsonPath();
		const source = readModelsSource(path);
		const settings = listSettings(runtime, parseModelsConfig(source));
		const targets =
			target === "available"
				? settings.filter(isSharedModelContextTarget)
				: settings.filter((model) => model.provider === target.provider && model.id === target.id);
		if (targets.length === 0) throw new Error("Unknown, unavailable or ineligible context target");
		const bom = source?.startsWith("\uFEFF") ? "\uFEFF" : "";
		let next = source === undefined ? EMPTY_CONFIG : source.slice(bom.length);
		for (const model of targets) next = patch(next, overridePath(model), contextWindow);
		if (bom + next !== source) {
			writeModelsSource(path, bom + next);
			await runtime.refresh({ allowNetwork: false });
			publishContextChange?.();
		}
		return listSettings(runtime, parseModelsConfig(bom + next));
	});
}

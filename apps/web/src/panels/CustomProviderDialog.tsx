import {
	RiAddLine as Plus,
	RiRefreshLine as RefreshCw,
	RiDeleteBin6Line as Trash2,
} from "@remixicon/react";
import {
	CUSTOM_PROVIDER_APIS,
	type CustomProvider,
	type CustomProviderApi,
} from "@thinkrail/contracts";
import { Button } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { cn } from "@thinkrail/ui/utils";
import { type ReactNode, useState } from "react";
import { t } from "@/i18n";
import { errorText, getTransport } from "@/transport";
import {
	apiLabel,
	apiPathHint,
	type CustomProviderDraft,
	type CustomProviderModelDraft,
	draftFromProvider,
	draftProblem,
	emptyModelDraft,
	emptyProviderDraft,
	mergeDiscoveredModels,
	providerInput,
} from "./customProviderDraft";
import { ToggleSegment } from "./ToggleSegment";

const INPUT_CLASS =
	"w-full min-w-0 rounded-sm border border-control-border-default bg-control-bg px-8 py-4 tr-text-ui text-text-default outline-none placeholder:text-text-muted focus-visible:border-control-border-active disabled:border-control-disabled-border disabled:bg-control-disabled-bg disabled:text-control-disabled-text";

function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: ReactNode;
	error?: string | undefined;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4">
			<span className="tr-title-compact text-text-default">{label}</span>
			{children}
			{error ? (
				<span role="alert" className="text-feedback-error tr-text-metadata">
					{error}
				</span>
			) : hint ? (
				<span className="text-text-muted tr-text-metadata">{hint}</span>
			) : null}
		</div>
	);
}

function DialogBody({ children }: { children: ReactNode }) {
	return (
		<div className="-mx-16 flex min-h-0 flex-1 flex-col gap-12 overflow-y-auto px-16">
			{children}
		</div>
	);
}

function updateModel(
	models: readonly CustomProviderModelDraft[],
	index: number,
	patch: Partial<CustomProviderModelDraft>,
): CustomProviderModelDraft[] {
	return models.map((model, position) => (position === index ? { ...model, ...patch } : model));
}

export function CustomProviderDialog({
	provider,
	onClose,
	onSaved,
}: {
	provider?: CustomProvider | undefined;
	onClose: () => void;
	onSaved: (providers: CustomProvider[]) => void;
}) {
	const editing = provider !== undefined;
	const [draft, setDraft] = useState<CustomProviderDraft>(() =>
		provider ? draftFromProvider(provider) : emptyProviderDraft(),
	);
	const [submitted, setSubmitted] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [discovering, setDiscovering] = useState(false);
	const [discovered, setDiscovered] = useState<string[] | null>(null);
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [filter, setFilter] = useState("");
	const problem = submitted ? draftProblem(draft, { editing }) : null;
	const fieldError = (field: "id" | "name" | "baseUrl" | "apiKey") =>
		problem?.field === field ? problem.message : undefined;
	const modelError = (index: number) =>
		problem?.field === "models" && problem.modelIndex === index ? problem.message : undefined;
	const modelsError =
		problem?.field === "models" && problem.modelIndex === undefined ? problem.message : undefined;

	const patch = (next: Partial<CustomProviderDraft>) => {
		setDraft((current) => ({ ...current, ...next }));
	};

	const submit = async () => {
		const next = draftProblem(draft, { editing });
		if (next) {
			setSubmitted(true);
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const providers = await getTransport().request("provider.customSave", {
				provider: providerInput(draft),
			});
			onSaved(providers);
		} catch (err) {
			setError(errorText(err));
		}
		setSaving(false);
	};

	const discover = async () => {
		setDiscovering(true);
		setError(null);
		const request = {
			...(editing ? { providerId: provider.id } : {}),
			baseUrl: draft.baseUrl.trim(),
			api: draft.api,
			...(draft.apiKey.trim() === "" ? {} : { apiKey: draft.apiKey.trim() }),
		};
		try {
			const result = await getTransport().request("provider.discoverModels", request);
			setDiscovered(result.models);
			setSelected(new Set());
			setFilter("");
		} catch (err) {
			setError(errorText(err));
		}
		setDiscovering(false);
	};

	const addSelected = () => {
		if (discovered === null || selected.size === 0) return;
		setDraft((current) => ({
			...current,
			models: mergeDiscoveredModels(current.models, [...selected]),
		}));
		setDiscovered(null);
		setSelected(new Set());
	};

	const filtered = (discovered ?? []).filter((id) =>
		id.toLowerCase().includes(filter.trim().toLowerCase()),
	);

	return (
		<Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
			<DialogContent
				data-testid="custom-provider-dialog"
				className="flex max-h-[85vh] max-w-[44rem] flex-col"
			>
				<DialogHeader>
					<DialogTitle>
						{editing ? t("Edit {0}", provider.name) : t("Add a custom provider")}
					</DialogTitle>
					<DialogDescription>
						{t(
							"Point the agent at any endpoint that speaks OpenAI Chat Completions, OpenAI Responses or Anthropic Messages.",
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid grid-cols-2 gap-12">
						<Field
							label={t("Provider ID")}
							hint={
								editing
									? t("The ID is permanent — it names saved chats and credentials.")
									: t("Lowercase letters, digits and dashes, e.g. acme-gateway.")
							}
							error={fieldError("id")}
						>
							<input
								data-testid="custom-provider-id"
								className={INPUT_CLASS}
								value={draft.id}
								disabled={editing || saving}
								placeholder="acme-gateway"
								onChange={(event) => patch({ id: event.target.value })}
							/>
						</Field>
						<Field label={t("Display name")} error={fieldError("name")}>
							<input
								data-testid="custom-provider-name"
								className={INPUT_CLASS}
								value={draft.name}
								disabled={saving}
								placeholder={draft.id.trim() || t("Acme Gateway")}
								onChange={(event) => patch({ name: event.target.value })}
							/>
						</Field>
					</div>

					<Field
						label={t("API protocol")}
						hint={t("Requests go to the base URL plus {0}.", apiPathHint(draft.api))}
					>
						<div className="flex flex-wrap items-center gap-2" data-testid="custom-provider-api">
							{CUSTOM_PROVIDER_APIS.map((api: CustomProviderApi) => (
								<ToggleSegment
									key={api}
									testid={`custom-provider-api-${api}`}
									label={apiLabel(api)}
									active={draft.api === api}
									disabled={saving}
									onClick={() => patch({ api })}
								/>
							))}
						</div>
					</Field>

					<Field
						label={t("Base URL")}
						hint={t("The endpoint root, e.g. https://api.example.com/v1.")}
						error={fieldError("baseUrl")}
					>
						<input
							data-testid="custom-provider-base-url"
							className={INPUT_CLASS}
							value={draft.baseUrl}
							disabled={saving}
							placeholder="https://api.example.com/v1"
							onChange={(event) => patch({ baseUrl: event.target.value })}
						/>
					</Field>

					<Field
						label={t("API key")}
						hint={
							editing
								? t("Leave blank to keep the saved key.")
								: t("Stored through pi's credential store, never in models.json.")
						}
						error={fieldError("apiKey")}
					>
						<input
							data-testid="custom-provider-api-key"
							className={INPUT_CLASS}
							type="password"
							autoComplete="off"
							value={draft.apiKey}
							disabled={saving}
							placeholder={editing ? t("Saved key") : t("Optional")}
							onChange={(event) => patch({ apiKey: event.target.value })}
						/>
					</Field>

					<div className="flex flex-col gap-8" data-testid="custom-provider-models">
						<div className="flex items-center justify-between gap-8">
							<span className="tr-title-compact text-text-default">{t("Models")}</span>
							<Button
								variant="outline"
								size="sm"
								data-testid="custom-provider-discover"
								disabled={saving || discovering}
								onClick={() => void discover()}
							>
								<RefreshCw className={cn("size-14", discovering && "animate-spin")} />
								{t("Fetch available models")}
							</Button>
						</div>
						{modelsError ? (
							<p role="alert" className="text-feedback-error tr-text-metadata">
								{modelsError}
							</p>
						) : null}

						{draft.models.map((model, index) => (
							<div
								key={model.key}
								data-testid="custom-provider-model"
								className="flex flex-col gap-4 rounded-sm border border-border-muted p-8"
							>
								<div className="flex items-center gap-8">
									<input
										data-testid="custom-provider-model-id"
										className={INPUT_CLASS}
										value={model.id}
										disabled={saving}
										placeholder={t("Model ID")}
										aria-label={t("Model ID")}
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												models: updateModel(current.models, index, { id: event.target.value }),
											}))
										}
									/>
									<Button
										variant="ghost"
										size="sm"
										data-testid="custom-provider-model-remove"
										aria-label={t("Remove model")}
										disabled={saving || draft.models.length === 1}
										onClick={() =>
											setDraft((current) => ({
												...current,
												models: current.models.filter((_, position) => position !== index),
											}))
										}
									>
										<Trash2 className="size-14" />
									</Button>
								</div>
								<div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-8">
									<input
										data-testid="custom-provider-model-name"
										className={INPUT_CLASS}
										value={model.name}
										disabled={saving}
										placeholder={t("Display name (optional)")}
										aria-label={t("Model display name")}
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												models: updateModel(current.models, index, { name: event.target.value }),
											}))
										}
									/>
									<input
										data-testid="custom-provider-model-context"
										className={INPUT_CLASS}
										value={model.contextWindow}
										disabled={saving}
										inputMode="numeric"
										placeholder={t("Context window")}
										aria-label={t("Context window")}
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												models: updateModel(current.models, index, {
													contextWindow: event.target.value,
												}),
											}))
										}
									/>
									<input
										data-testid="custom-provider-model-max"
										className={INPUT_CLASS}
										value={model.maxTokens}
										disabled={saving}
										inputMode="numeric"
										placeholder={t("Max output")}
										aria-label={t("Max output tokens")}
										onChange={(event) =>
											setDraft((current) => ({
												...current,
												models: updateModel(current.models, index, {
													maxTokens: event.target.value,
												}),
											}))
										}
									/>
									<ToggleSegment
										testid={`custom-provider-model-images-${index}`}
										label={t("Images")}
										active={model.images}
										disabled={saving}
										onClick={() =>
											setDraft((current) => ({
												...current,
												models: updateModel(current.models, index, { images: !model.images }),
											}))
										}
									/>
								</div>
								{modelError(index) ? (
									<span role="alert" className="text-feedback-error tr-text-metadata">
										{modelError(index)}
									</span>
								) : null}
							</div>
						))}

						<div>
							<Button
								variant="outline"
								size="sm"
								data-testid="custom-provider-model-add"
								disabled={saving}
								onClick={() =>
									setDraft((current) => ({
										...current,
										models: [...current.models, emptyModelDraft()],
									}))
								}
							>
								<Plus className="size-14" />
								{t("Add model")}
							</Button>
						</div>

						{discovered !== null ? (
							<div
								data-testid="custom-provider-discovered"
								className="flex max-h-320 flex-col gap-8 rounded-sm border border-border-muted p-8"
							>
								<div className="flex items-center justify-between gap-8">
									<span className="tr-title-compact text-text-default">
										{t("Available models ({0})", discovered.length)}
									</span>
									<Button
										variant="ghost"
										size="sm"
										data-testid="custom-provider-discovered-cancel"
										onClick={() => setDiscovered(null)}
									>
										{t("Cancel")}
									</Button>
								</div>
								<input
									data-testid="custom-provider-discovered-filter"
									className={INPUT_CLASS}
									value={filter}
									placeholder={t("Filter models")}
									onChange={(event) => setFilter(event.target.value)}
								/>
								<div className="flex min-h-0 flex-col overflow-y-auto">
									{filtered.map((id) => (
										<label
											key={id}
											data-testid="custom-provider-discovered-row"
											className="flex cursor-pointer items-center gap-8 rounded-sm px-4 py-2 tr-text-ui hover:bg-control-bg-hovered"
										>
											<input
												type="checkbox"
												checked={selected.has(id)}
												onChange={(event) => {
													setSelected((current) => {
														const next = new Set(current);
														if (event.target.checked) next.add(id);
														else next.delete(id);
														return next;
													});
												}}
											/>
											<span className="truncate tr-text-metadata">{id}</span>
										</label>
									))}
								</div>
								<div>
									<Button
										variant="soft"
										size="sm"
										data-testid="custom-provider-discovered-add"
										disabled={selected.size === 0}
										onClick={addSelected}
									>
										{t("Add selected ({0})", selected.size)}
									</Button>
								</div>
							</div>
						) : null}
					</div>

					{error ? (
						<p
							role="alert"
							data-testid="custom-provider-error"
							className="text-feedback-error tr-text-ui"
						>
							{error}
						</p>
					) : null}
				</DialogBody>
				<DialogFooter>
					<Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button
						variant="default"
						size="sm"
						data-testid="custom-provider-save"
						disabled={saving}
						onClick={() => void submit()}
					>
						{editing ? t("Save provider") : t("Add provider")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

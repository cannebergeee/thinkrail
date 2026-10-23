import {
	RiKeyLine as KeyRound,
	RiLogoutBoxLine as LogOut,
	RiPencilLine as Pencil,
	RiAddLine as Plus,
	RiDeleteBin6Line as Trash2,
} from "@remixicon/react";
import type { CustomProvider, ProviderStatus } from "@thinkrail/contracts";
import { Button } from "@thinkrail/ui/button";
import { useState } from "react";
import { AUTH_KIND_LABEL } from "@/chat/modelPicker";
import { t } from "@/i18n";
import { errorText, getTransport } from "@/transport";
import { ConfirmDialog } from "./ConfirmDialog";
import { CustomProviderDialog } from "./CustomProviderDialog";
import { SettingsGroup } from "./SettingsGroup";

export function CustomProviderRow({
	provider,
	status,
	busy,
	onEdit,
	onDelete,
	onConnect,
	onSignOut,
}: {
	provider: CustomProvider;
	status?: ProviderStatus | undefined;
	busy: boolean;
	onEdit: () => void;
	onDelete: () => void;
	onConnect: () => void;
	onSignOut: () => void;
}) {
	const auth = status?.kind ? AUTH_KIND_LABEL[status.kind] : t("No key yet");
	const count = t("{0} model{1}", provider.models.length, provider.models.length === 1 ? "" : "s");
	return (
		<div
			data-testid="custom-provider-row"
			data-provider={provider.id}
			data-configured={status?.configured === true ? "true" : "false"}
			className="flex items-center gap-8 border-border-muted border-b py-12"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<span className="truncate tr-text-ui text-text-default">{provider.name}</span>
				<span className="truncate text-text-muted tr-text-metadata">
					{provider.api} · {provider.baseUrl} · {count}
				</span>
			</div>
			<span
				className={
					status?.configured === true
						? "shrink-0 text-text-muted tr-text-metadata"
						: "shrink-0 text-feedback-warning tr-text-metadata"
				}
			>
				{auth}
			</span>
			<div className="flex shrink-0 items-center gap-4">
				{status?.canLogout ? (
					<Button
						variant="soft"
						size="sm"
						data-testid="custom-provider-signout"
						data-provider={provider.id}
						disabled={busy}
						onClick={onSignOut}
					>
						<LogOut className="size-14" />
						{t("Sign out")}
					</Button>
				) : status?.canApiKey ? (
					<Button
						variant="soft"
						size="sm"
						data-testid="custom-provider-apikey"
						data-provider={provider.id}
						disabled={busy}
						onClick={onConnect}
					>
						<KeyRound className="size-14" />
						{t("API key")}
					</Button>
				) : null}
				<Button
					variant="outline"
					size="sm"
					data-testid="custom-provider-edit"
					data-provider={provider.id}
					disabled={busy}
					onClick={onEdit}
				>
					<Pencil className="size-14" />
					{t("Edit")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					data-testid="custom-provider-delete"
					data-provider={provider.id}
					disabled={busy}
					onClick={onDelete}
				>
					<Trash2 className="size-14" />
					{t("Delete")}
				</Button>
			</div>
		</div>
	);
}

type DialogState = { mode: "add" } | { mode: "edit"; provider: CustomProvider } | null;

export function CustomProvidersSection({
	providers,
	statusOf,
	busyOf,
	onChanged,
	onSaved,
	onConnect,
	onSignOut,
}: {
	providers: readonly CustomProvider[];
	statusOf: (providerId: string) => ProviderStatus | undefined;
	busyOf: (providerId: string) => boolean;
	onChanged: () => void;
	onSaved: (providers: CustomProvider[]) => void;
	onConnect: (providerId: string) => void;
	onSignOut: (providerId: string) => void;
}) {
	const [dialog, setDialog] = useState<DialogState>(null);
	const [deleting, setDeleting] = useState<CustomProvider | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const remove = async () => {
		if (deleting === null) return;
		setDeleteBusy(true);
		setError(null);
		try {
			onSaved(await getTransport().request("provider.customDelete", { providerId: deleting.id }));
			setDeleting(null);
			onChanged();
		} catch (err) {
			setError(errorText(err));
		}
		setDeleteBusy(false);
	};

	return (
		<SettingsGroup
			title={t("Custom providers")}
			testId="custom-providers"
			description={t(
				"Relays, self-hosted servers and company gateways that speak a supported API.",
			)}
		>
			{providers.map((provider) => (
				<CustomProviderRow
					key={provider.id}
					provider={provider}
					status={statusOf(provider.id)}
					busy={busyOf(provider.id)}
					onEdit={() => setDialog({ mode: "edit", provider })}
					onDelete={() => setDeleting(provider)}
					onConnect={() => onConnect(provider.id)}
					onSignOut={() => onSignOut(provider.id)}
				/>
			))}
			<div className="flex flex-col gap-8 pt-12">
				<div>
					<Button
						variant="outline"
						size="sm"
						data-testid="custom-provider-add"
						onClick={() => setDialog({ mode: "add" })}
					>
						<Plus className="size-14" />
						{t("Add custom provider")}
					</Button>
				</div>
				{error ? (
					<p
						role="alert"
						data-testid="custom-provider-section-error"
						className="text-feedback-error tr-text-ui"
					>
						{error}
					</p>
				) : null}
			</div>

			{dialog ? (
				<CustomProviderDialog
					{...(dialog.mode === "edit" ? { provider: dialog.provider } : {})}
					onClose={() => setDialog(null)}
					onSaved={(next) => {
						onSaved(next);
						setDialog(null);
						onChanged();
					}}
				/>
			) : null}

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
				title={t("Delete {0}?", deleting?.name ?? "")}
				description={t(
					"Its models leave the picker and its saved API key is removed. The chat history keeps its text.",
				)}
				confirmLabel={t("Delete provider")}
				destructive
				confirmTestId="custom-provider-delete-confirm"
				onConfirm={() => void remove()}
			/>
		</SettingsGroup>
	);
}

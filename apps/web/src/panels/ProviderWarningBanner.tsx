import { RiAlertLine as TriangleAlert } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { useAppStore } from "@/store";
import { getTransport } from "@/transport";

export function ProviderWarningBanner() {
	const [hasProvider, setHasProvider] = useState<boolean | null>(null);
	const settingsOpen = useAppStore((s) => s.settingsOpen);

	const check = useCallback(async () => {
		try {
			const report = await getTransport().request("provider.status", {});
			setHasProvider(report.providers.some((p) => p.configured));
		} catch {
			setHasProvider(true);
		}
	}, []);

	useEffect(() => {
		if (!settingsOpen) void check();
	}, [check, settingsOpen]);

	if (hasProvider !== false) return null;

	return (
		<div
			data-testid="welcome-provider-warning"
			className="mt-16 grid w-full max-w-[560px] grid-cols-[auto_minmax(0,1fr)] items-center gap-8 rounded-sm border border-feedback-warning-muted bg-container-elevated-bg px-12 py-8 text-left sm:grid-cols-[auto_minmax(0,1fr)_auto]"
		>
			<TriangleAlert className="-mt-2 size-14 shrink-0 text-feedback-warning" aria-hidden />
			<span className="min-w-0 flex-1 tr-text-ui text-text-default">
				{t("No model provider connected — the agent can't run.")}
			</span>
			<Button
				variant="outline"
				size="sm"
				data-testid="welcome-connect-provider"
				onClick={() => useAppStore.getState().openSettings("providers")}
				className="col-start-2 shrink-0 justify-self-start sm:col-start-auto"
			>
				{t("Connect a provider")}
			</Button>
		</div>
	);
}

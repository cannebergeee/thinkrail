import type { HostPlatform, TerminalWindowsShell } from "@thinkrail/contracts";
import { WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION } from "@thinkrail/contracts";
import { t } from "@/i18n";
import { toast, useAppStore } from "@/store";
import { getTransport } from "@/transport";
import { SegmentedControl, type SegmentedControlOption } from "./SegmentedControl";
import { SettingsRadioCards, type SettingsRadioChoice } from "./SettingsRadioCards";
import { SETTINGS_ROWS_CONTAINER } from "./SettingsRow";

type ScrollbackOption = "0" | "16" | "64" | "256" | "1024";

const SCROLLBACK_OPTIONS: SegmentedControlOption<ScrollbackOption>[] = [
	{ id: "0", label: t("Off"), testId: "terminal-replay-0" },
	{ id: "16", label: t("16 KB"), testId: "terminal-replay-16" },
	{ id: "64", label: t("64 KB"), testId: "terminal-replay-64" },
	{ id: "256", label: t("256 KB"), testId: "terminal-replay-256" },
	{ id: "1024", label: t("1 MB"), testId: "terminal-replay-1024" },
];

const WINDOWS_SHELL_CHOICES: SettingsRadioChoice<TerminalWindowsShell>[] = [
	{
		id: "auto",
		label: t("Auto"),
		hint: t("Recommended"),
		description: t("PowerShell 7 when installed, otherwise Windows PowerShell."),
		testId: "terminal-shell-auto",
	},
	{
		id: "pwsh",
		label: t("PowerShell 7"),
		description: t("Requires pwsh to be installed."),
		testId: "terminal-shell-pwsh",
	},
	{
		id: "powershell",
		label: t("Windows PowerShell"),
		description: t("Built into Windows."),
		testId: "terminal-shell-powershell",
	},
	{
		id: "cmd",
		label: t("Command Prompt"),
		description: t("Classic cmd.exe shell."),
		testId: "terminal-shell-cmd",
	},
];

export function WindowsShellSettings({
	platform,
	protocolVersion,
	value,
	onSelect,
}: {
	platform: HostPlatform | null;
	protocolVersion: number | null;
	value: TerminalWindowsShell;
	onSelect: (shell: TerminalWindowsShell) => void;
}) {
	if (
		platform !== "win32" ||
		protocolVersion === null ||
		protocolVersion < WINDOWS_SHELL_SETTINGS_PROTOCOL_VERSION
	) {
		return null;
	}
	return (
		<div className="pt-24">
			<div className="flex flex-col">
				<div className="flex flex-col gap-2 pb-8">
					<h3 className="tr-title-section text-text-default">{t("Windows shell")}</h3>
					<p className="tr-text-metadata text-text-muted">{t("Shell for new terminal tabs.")}</p>
				</div>
				<SettingsRadioCards
					name="terminal-windows-shell"
					label={t("Windows shell")}
					choices={WINDOWS_SHELL_CHOICES}
					value={value}
					onSelect={onSelect}
				/>
			</div>
		</div>
	);
}

export function TerminalSettings() {
	const replayKb = useAppStore((s) => s.terminalReplayKb);
	const windowsShell = useAppStore((s) => s.terminalWindowsShell);
	const hostPlatform = useAppStore((s) => s.hostPlatform);
	const protocolVersion = useAppStore((s) => s.protocolVersion);

	const select = (kb: number) => {
		if (kb === replayKb) return;
		getTransport()
			.request("settings.update", { config: { terminalReplayKb: kb } })
			.catch(() => toast.error(t("Couldn't change the replay size")));
	};

	const selectWindowsShell = (shell: TerminalWindowsShell) => {
		if (shell === windowsShell) return;
		getTransport()
			.request("settings.update", { config: { terminalWindowsShell: shell } })
			.catch(() => toast.error(t("Couldn't change the Windows shell")));
	};

	const scrollbackValue =
		SCROLLBACK_OPTIONS.find((option) => Number(option.id) === replayKb)?.id ?? null;

	return (
		<div data-testid="settings-terminal" className={SETTINGS_ROWS_CONTAINER}>
			<div className="flex flex-col gap-12 py-12">
				<div className="flex flex-col gap-2">
					<span className="tr-text-ui text-text-default">{t("Scrollback")}</span>
					<span className="tr-text-metadata text-text-muted">
						{t("How much recent output to restore when reattaching.")}
					</span>
				</div>
				<SegmentedControl
					name="terminal-scrollback"
					label={t("Scrollback buffer size")}
					options={SCROLLBACK_OPTIONS}
					value={scrollbackValue}
					onSelect={(id) => select(Number(id))}
					testId="terminal-scrollback-control"
				/>
			</div>

			<WindowsShellSettings
				platform={hostPlatform}
				protocolVersion={protocolVersion}
				value={windowsShell}
				onSelect={selectWindowsShell}
			/>
		</div>
	);
}

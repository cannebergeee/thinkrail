import type { StopReason } from "@thinkrail/contracts";
import { t } from "@/i18n";

interface AssistantTerminal {
	stopReason: StopReason;
	errorMessage?: string;
}

export function assistantFailureText(
	terminal: AssistantTerminal | null | undefined,
): string | null {
	if (terminal?.stopReason === "error") {
		return terminal.errorMessage || "The agent run ended in an error.";
	}
	if (terminal?.stopReason === "length") {
		return t("The response was truncated before completion. Ask the agent to continue.");
	}
	return null;
}

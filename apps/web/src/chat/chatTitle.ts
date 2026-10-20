import { normalizeSessionTitle, SESSION_TITLE_MAX_LENGTH } from "@thinkrail/contracts";
import { t } from "@/i18n";

export type PreparedChatTitle = { title: string } | { reason: string };

export function prepareChatTitle(titleInput: string): PreparedChatTitle {
	const title = normalizeSessionTitle(titleInput);
	if (title) return { title };
	return titleInput.trim()
		? { reason: t("Keep chat names to {0} characters or fewer.", SESSION_TITLE_MAX_LENGTH) }
		: { reason: t("Enter a chat name.") };
}

import type { McpServerEntryInput, McpServerScope } from "@thinkrail/contracts";
import { t } from "@/i18n";

export interface McpPreset {
	id: string;
	name: string;
	title: string;
	description: string;
	entry: McpServerEntryInput;
	scope: McpServerScope;
	modifiesData?: string;
	optInPerProject?: boolean;
}

export const MCP_PRESETS: readonly McpPreset[] = [
	{
		id: "context7",
		name: "context7",
		title: "Context7",
		description: t("Current library and framework documentation. No sign-in."),
		entry: { url: "https://mcp.context7.com/mcp", exposure: "direct" },
		scope: "user",
	},
	{
		id: "deepwiki",
		name: "deepwiki",
		title: "DeepWiki",
		description: t("Ask about any public GitHub repository. No sign-in."),
		entry: { url: "https://mcp.deepwiki.com/mcp", exposure: "direct" },
		scope: "user",
	},
	{
		id: "linear",
		name: "linear",
		title: t("Linear (read-only)"),
		description: t(
			"Issues, projects and comments through Linear's read-only endpoint. Sign in after adding.",
		),
		entry: { url: "https://mcp.linear.app/mcp/readonly" },
		scope: "user",
	},
	{
		id: "sentry",
		name: "sentry",
		title: t("Sentry"),
		description: t("Issues, events and releases. Sign in after adding."),
		entry: { url: "https://mcp.sentry.dev/mcp" },
		scope: "user",
		modifiesData: "Sentry",
	},
	{
		id: "playwright",
		name: "playwright",
		title: t("Playwright"),
		description: t("Drives a browser on this host. Enabled for this project only."),
		entry: { command: "npx", args: ["-y", "@playwright/mcp@0.0.83"], enabled: false },
		scope: "user",
		modifiesData: "the websites its browser opens",
		optInPerProject: true,
	},
];

export const GITHUB_MCP_RECIPE_JSON = JSON.stringify(
	{
		mcpServers: {
			github: {
				url: "https://api.githubcopilot.com/mcp/readonly",
				headers: { Authorization: '!t=$(gh auth token) && echo "Bearer $t"' },
			},
		},
	},
	null,
	2,
);

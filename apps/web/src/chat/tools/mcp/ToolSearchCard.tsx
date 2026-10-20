import { RiSearchLine } from "@remixicon/react";
import { numArg, strArg, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { t } from "@/i18n";
import { McpHeader, McpOutput, McpRunning } from "./McpCardParts";
import { mcpText, readToolSearchLoaded, toolSearchDescriptions } from "./mcpResult";

export function toolSearchSummary({ args }: ToolRenderProps): string {
	return strArg(args, "query");
}

export function ToolSearchCard({ toolCallId, args, result, status }: ToolRenderProps) {
	const query = strArg(args, "query");
	const limit = numArg(args, "limit");
	const text = mcpText(result);
	const loaded = status === "done" ? readToolSearchLoaded(result) : null;
	const descriptions = toolSearchDescriptions(text);
	return (
		<div data-testid="tool-tool_search" className="flex min-w-0 flex-col gap-4">
			<McpHeader icon={<RiSearchLine className="size-12 shrink-0 text-text-muted" />}>
				<span className="min-w-0 truncate text-primary" title={query}>
					{query}
				</span>
				{limit !== null ? <span className="shrink-0 text-text-subtle">limit {limit}</span> : null}
			</McpHeader>
			{status === "running" ? (
				<McpRunning label={t("Searching tools…")} />
			) : loaded && loaded.length > 0 ? (
				<div className="flex min-w-0 flex-col gap-2 tr-text-metadata">
					<span className="text-text-muted">
						{loaded.length === 1
							? t("Loaded 1 tool, available from the next call")
							: t("Loaded {0} tools, available from the next call", loaded.length)}
					</span>
					<ul data-testid="tool-search-loaded" className="flex min-w-0 flex-col gap-4">
						{loaded.map((name) => {
							const description = descriptions.get(name);
							return (
								<li key={name} className="flex min-w-0 flex-col">
									<span className="truncate tr-code-text text-text-default" title={name}>
										{name}
									</span>
									{description ? (
										<span className="truncate text-text-muted" title={description}>
											{description}
										</span>
									) : null}
								</li>
							);
						})}
					</ul>
				</div>
			) : (
				<McpOutput
					id={`${toolCallId}:content`}
					text={text}
					result={result}
					failed={status === "error"}
				/>
			)}
		</div>
	);
}

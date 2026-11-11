import { RiCodeSSlashLine, RiSearchLine, RiSparkling2Line } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { t } from "@/i18n";

export function ChatStarter({ onUsePrompt }: { onUsePrompt: (prompt: string) => void }) {
	const suggestions = [
		{
			icon: RiSearchLine,
			label: t("Explore this project"),
			prompt: t("Explain this project's structure and the main entry points."),
		},
		{
			icon: RiCodeSSlashLine,
			label: t("Review code"),
			prompt: t("Review the current changes for bugs and suggest focused improvements."),
		},
		{
			icon: RiSparkling2Line,
			label: t("Plan a change"),
			prompt: t("Help me plan a change. Start by asking what I want to build."),
		},
	];
	return (
		<div
			data-testid="chat-starter"
			className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-auto px-24 py-24"
		>
			<div className="my-auto flex max-w-[560px] flex-col items-center text-center">
				<RiSparkling2Line aria-hidden="true" className="mb-16 size-32 text-text-subtle" />
				<h2 className="tr-heading-xl text-text-default">{t("What would you like to build?")}</h2>
				<p className="mt-8 tr-text-ui text-text-muted">
					{t("Start with an idea, a question, or a change to your code.")}
				</p>
				<div className="mt-24 flex flex-wrap justify-center gap-8">
					{suggestions.map(({ icon: Icon, label, prompt }) => (
						<Button
							key={label}
							variant="outline"
							className="gap-4 rounded-full"
							onClick={() => onUsePrompt(prompt)}
						>
							<Icon className="size-14" />
							{label}
						</Button>
					))}
				</div>
			</div>
		</div>
	);
}

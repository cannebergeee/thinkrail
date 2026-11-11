import {
	RiFolderOpenLine as FolderOpen,
	RiHome2Line as House,
	type RemixiconComponentType as LucideIcon,
	RiArrowUpLine,
	RiSparkling2Line as Sparkles,
} from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { cn } from "@thinkrail/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef, useEffect, useState } from "react";
import { t } from "@/i18n";
import { PRODUCT_NAME } from "../constants/branding";
import { isPromptKeyEventComposing } from "../prompt";
import { useAppStore } from "../store";
import { getTransport } from "../transport";
import { AddProjectMenu } from "./AddProjectMenu";
import { enterDefaultWorkspace } from "./defaultWorkspace";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";
import { ProjectTrustNotice } from "./ProjectTrustNotice";
import { ProviderWarningBanner } from "./ProviderWarningBanner";
import { useOpenProject } from "./useOpenProject";

const SETUP_PROMPT = "/skill:setting-up-a-project ";

const SETUP_NOTE =
	"Runs the setting-up-a-project skill — the agent drafts your project's specs, starting from its goal, before building.";

export function WelcomePanel() {
	const projects = useAppStore((s) => s.projects);
	const recentProjects = useAppStore((s) => s.recentProjects);
	const selectedProjectId = useAppStore((s) => s.selectedProjectId);
	const [dialog, setDialog] = useState<{
		projectId: string;
		prompt: string;
		note?: string;
	} | null>(null);
	const [hasSpecs, setHasSpecs] = useState<boolean | null>(null);

	const project = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

	useEffect(() => {
		const projectId = project?.id;
		if (!projectId) {
			setHasSpecs(null);
			return;
		}
		let cancelled = false;
		setHasSpecs(null);
		getTransport()
			.request("project.hasSpecs", { projectId })
			.then((r) => {
				if (!cancelled) setHasSpecs(r.hasSpecs);
			})
			.catch(() => {
				if (!cancelled) setHasSpecs(true);
			});
		return () => {
			cancelled = true;
		};
	}, [project?.id]);

	const { openProject, pickAndOpen, enterHostPath, dialogs } = useOpenProject((opened) =>
		useAppStore.getState().selectProject(opened.id, { reveal: true }),
	);

	const projectFolderCard = (projectId: string) => (
		<Card
			icon={House}
			title={t("Work in project folder")}
			subtitle={t(
				"Chats, changes, and terminals run directly in your project folder — no isolation.",
			)}
			onClick={() => void enterDefaultWorkspace(projectId)}
			className="motion-safe:animate-reveal"
		/>
	);

	const openProjectCard = () => (
		<AddProjectMenu
			recentProjects={recentProjects}
			onOpen={() => void pickAndOpen()}
			onEnterHostPath={enterHostPath}
			onOpenRecent={(path) => void openProject(path)}
			align="start"
		>
			<Card
				cta
				primary
				icon={FolderOpen}
				title={t("Open project")}
				subtitle={t("Choose a local git repository to work in.")}
			/>
		</AddProjectMenu>
	);

	return (
		<div
			data-testid="welcome"
			className="flex h-full min-h-0 flex-col items-center overflow-auto px-24 py-24 text-center"
		>
			<div className="my-auto flex w-full max-w-[680px] flex-col items-center">
				<span className="mb-16 tr-text-label-pill text-text-subtle">{PRODUCT_NAME}</span>
				<h1
					data-testid="welcome-title"
					className="tr-heading-xl max-w-full break-words text-text-default"
				>
					{project ? project.name : t("What would you like to build?")}
				</h1>
				<p className="mt-8 tr-text-ui text-text-muted">
					{project
						? t("Describe a task, then choose how to work on it.")
						: t("Open a project and turn your ideas into working code.")}
				</p>

				<ProviderWarningBanner />
				{project ? <ProjectTrustNotice projectId={project.id} /> : null}

				{project ? (
					<ProjectTaskEntry
						key={project.id}
						projectName={project.name}
						onStart={(prompt) => setDialog({ projectId: project.id, prompt })}
					/>
				) : null}
				<div className="mt-16 flex w-full flex-wrap justify-center gap-8">
					{!project ? (
						openProjectCard()
					) : hasSpecs === null ? (
						<>
							<CardSkeleton />
							<CardSkeleton />
						</>
					) : hasSpecs ? (
						projectFolderCard(project.id)
					) : (
						<>
							<Card
								icon={Sparkles}
								title={t("Set up project")}
								subtitle={t(
									"Draft the project's specs with the agent before building, starting from its goal.",
								)}
								onClick={() =>
									setDialog({
										projectId: project.id,
										prompt: SETUP_PROMPT,
										note: SETUP_NOTE,
									})
								}
								className="motion-safe:animate-reveal"
							/>
							{projectFolderCard(project.id)}
						</>
					)}
				</div>
			</div>

			{dialog ? (
				<NewWorkspaceDialog
					open
					projectId={dialog.projectId}
					initialPrompt={dialog.prompt}
					{...(dialog.note !== undefined ? { promptNote: dialog.note } : {})}
					onOpenChange={(o) => {
						if (!o) setDialog(null);
					}}
				/>
			) : null}
			{dialogs}
		</div>
	);
}

function ProjectTaskEntry({
	projectName,
	onStart,
}: {
	projectName: string;
	onStart: (prompt: string) => void;
}) {
	const [prompt, setPrompt] = useState("");
	return (
		<form
			className="mt-24 w-full rounded-lg border border-control-border-default bg-control-bg p-12 text-left shadow-sm transition-colors focus-within:border-control-border-active"
			onSubmit={(event) => {
				event.preventDefault();
				onStart(prompt.trim());
			}}
		>
			<textarea
				data-testid="welcome-prompt"
				aria-label={t("Describe your task")}
				value={prompt}
				onChange={(event) => setPrompt(event.target.value)}
				placeholder={t("Describe your task")}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!isPromptKeyEventComposing(event.nativeEvent)
					) {
						event.preventDefault();
						onStart(prompt.trim());
					}
				}}
				className="min-h-96 w-full resize-y bg-transparent px-4 py-8 tr-text-ui text-text-default outline-none placeholder:text-text-muted"
			/>
			<div className="flex items-center justify-between gap-12">
				<span className="flex min-w-0 items-center gap-4 text-text-muted tr-text-metadata">
					<FolderOpen className="size-14 shrink-0" />
					<span className="truncate">{projectName}</span>
				</span>
				<Button type="submit" data-testid="welcome-cta" className="shrink-0 rounded-full">
					<span>{t("Start building")}</span>
					<RiArrowUpLine className="size-16" />
				</Button>
			</div>
		</form>
	);
}

function CardSkeleton() {
	return (
		<div
			role="status"
			aria-label={t("Loading")}
			aria-busy="true"
			className="flex min-h-96 min-w-0 flex-1 items-start gap-12 rounded-md border border-border-default bg-container-workspace-bg p-16"
		>
			<span className="size-24 shrink-0 animate-pulse rounded-full bg-control-bg-hovered" />
			<span className="flex w-full flex-col gap-8">
				<span className="h-3 w-3/4 animate-pulse rounded-sm bg-control-bg-hovered" />
				<span className="h-3 w-full animate-pulse rounded-sm bg-control-bg-hovered" />
			</span>
		</div>
	);
}

type CardProps = {
	cta?: boolean;
	primary?: boolean;
	icon: LucideIcon;
	title: string;
	subtitle: string;
} & ComponentPropsWithoutRef<"button">;

const Card = forwardRef<HTMLButtonElement, CardProps>(function Card(
	{ cta, primary, icon: Icon, title, subtitle, className, ...rest },
	ref,
) {
	return (
		<button
			ref={ref}
			type="button"
			data-testid={cta ? "welcome-cta" : "welcome-action"}
			{...rest}
			className={cn(
				"relative flex min-h-96 w-full min-w-0 items-start gap-12 rounded-md border bg-clip-padding p-16 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary sm:flex-1",
				primary
					? "border-control-border-default bg-control-bg hover:bg-control-bg-hovered"
					: "border-border-muted bg-container-workspace-bg hover:border-control-border-active hover:bg-control-bg-hovered",
				className,
			)}
		>
			<Icon className="mt-2 size-16 shrink-0 text-text-muted" />
			<span className="w-full">
				<span className="block tr-title-card text-text-default">{title}</span>
				<span className="mt-2 block text-text-muted tr-text-metadata leading-snug">{subtitle}</span>
			</span>
		</button>
	);
});

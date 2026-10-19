import {
	type ResourceFileReviewProps,
	type ResourceHost,
	ResourceHostProvider,
	type ResourceReviewSendProps,
	registerBundledResourceRenderers,
} from "@thinkrail/resource-renderers";
import { type ReactNode, useMemo } from "react";
import { usePhoneViewport } from "../lib";
import { openFileComparisonInTab, openFileInTab } from "../panels/openTabs";
import { resourceBytesUrl } from "../panels/resourcePane";
import { SendReviewButton } from "../panels/SendReviewButton";
import { useFileReview } from "../panels/useReviewCommenting";
import { useAppStore } from "../store";
import { getTransport } from "../transport";

registerBundledResourceRenderers();

const loadMarkdown = () => import("../chat/Markdown").then((module) => module.Markdown);

const loadCode = () => import("./resourceCode").then((module) => module.resourceCode);

const openFile: ResourceHost["openFile"] = (workspaceId, path, options) => {
	void openFileInTab(workspaceId, path, options?.keep ? "keep" : "preview");
};

const openComparison: ResourceHost["openComparison"] = (workspaceId, before, path) => {
	void openFileComparisonInTab(workspaceId, before, path, "keep");
};

const readFile: ResourceHost["readFile"] = (workspaceId, path) =>
	getTransport().request("fs.readFile", { workspaceId, path });

const subscribeFileChanges: ResourceHost["subscribeFileChanges"] = (workspaceId, onChange) =>
	useAppStore.subscribe((state, previous) => {
		const change = state.fsChangesByWorkspace[workspaceId];
		if (!change || change === previous.fsChangesByWorkspace[workspaceId]) return;
		onChange(change.truncated || change.paths.length === 0 ? null : change.paths);
	});

function FileReview({ workspaceId, path, kind, sessionId, children }: ResourceFileReviewProps) {
	return children(useFileReview(workspaceId, path, kind, undefined, sessionId).worktree);
}

function ReviewSend({ workspaceId, paths, sessionId }: ResourceReviewSendProps) {
	return <SendReviewButton workspaceId={workspaceId} path={paths} chatSessionId={sessionId} />;
}

export function AppResourceHost({ children }: { children: ReactNode }) {
	const fileLineWidth = useAppStore((state) => state.fileLineWidth);
	const fileLineWidthBounded = useAppStore((state) => state.fileLineWidthBounded);
	const mobile = usePhoneViewport();
	const host = useMemo<ResourceHost>(
		() => ({
			loadMarkdown,
			loadCode,
			bytesUrl: resourceBytesUrl,
			openFile,
			openComparison,
			readFile,
			subscribeFileChanges,
			FileReview,
			ReviewSend,
			fileLineWidth,
			fileLineWidthBounded,
			mobile,
		}),
		[fileLineWidth, fileLineWidthBounded, mobile],
	);
	return <ResourceHostProvider value={host}>{children}</ResourceHostProvider>;
}

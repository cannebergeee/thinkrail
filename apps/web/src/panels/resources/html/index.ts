import { t } from "@/i18n";
import type { ResourceRenderer } from "@/resources";

export const htmlRenderer: ResourceRenderer = {
	id: "thinkrail/html",
	label: t("Preview"),
	match: { glob: ["*.html", "*.htm"], text: true },
	rank: 120,
	capabilities: {
		view: true,
		diff: true,
		anchors: { view: [], diff: [] },
		mobile: true,
		copy: false,
		layout: false,
		whitespace: false,
		boundedDiff: "always",
	},
	loadView: () => import("./View"),
	loadDiff: () => import("./Diff"),
};

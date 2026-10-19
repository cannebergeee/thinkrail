import "./index.css";
import { TooltipProvider } from "@thinkrail/ui/tooltip";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initChatPreferencesPersistence } from "./chat/chatPreferences";
import { initModelVisibilityPersistence } from "./chat/modelVisibility";
import { ErrorBoundary, setErrorBoundaryReporter } from "./components/ErrorBoundary";
import { initNavigation } from "./navigation";
import { initProjectExpansionPersistence } from "./panels/projectExpansion";
import { Shell } from "./shell/Shell";
import { applyThemePreference, initializeBundledThemes, readThemeHint } from "./themes";
import {
	clientErrorReport,
	initTransport,
	installClientErrorReporting,
	reportClientError,
} from "./transport";

initializeBundledThemes();
applyThemePreference(readThemeHint());
initTransport();
installClientErrorReporting();
setErrorBoundaryReporter((error, label) =>
	reportClientError(clientErrorReport("render", error, label)),
);
initChatPreferencesPersistence();
initModelVisibilityPersistence();
initProjectExpansionPersistence();
initNavigation();

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<ErrorBoundary label="app">
				<TooltipProvider delayDuration={250} skipDelayDuration={400}>
					<Shell />
				</TooltipProvider>
			</ErrorBoundary>
		</StrictMode>,
	);
}

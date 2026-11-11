import { expect, test } from "@playwright/test";
import {
	hideAuxiliaryWorkbench,
	openAppFresh,
	openFixtureProject,
	openWorkspaceChat,
	pressPlatformShortcut,
} from "./fixtures/app";
import { shot } from "./fixtures/screenshots";
import { E2eWire } from "./fixtures/wire";

test("project task entry preserves IME and multiline drafts until workspace confirmation", async ({
	page,
}) => {
	await openFixtureProject(page);
	const input = page.getByTestId("welcome-prompt");
	await input.fill("Plan a small UI improvement");
	await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await input.press("End");
	await input.press("Shift+Enter");
	await input.pressSequentially("Keep the existing behavior");
	await expect(input).toHaveValue("Plan a small UI improvement\nKeep the existing behavior");
	await shot(page, "zcode-ui", "project-home");
	await input.press("Enter");
	await expect(page.getByRole("dialog").locator("textarea").first()).toHaveValue(
		"Plan a small UI improvement\nKeep the existing behavior",
	);
	await page.keyboard.press("Escape");
	await expect(input).toHaveValue("Plan a small UI improvement\nKeep the existing behavior");
	await page.getByTestId("sidebar-session-switcher").click();
	await expect(page.getByTestId("session-switcher")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByTestId("sidebar-extensions").click();
	await expect(page.getByTestId("settings-nav-extensions")).toHaveAttribute("aria-current", "page");
	await shot(page, "zcode-ui", "settings");
});

test("starter prompts fill and focus the draft without sending or replacing user text", async ({
	page,
}) => {
	await openWorkspaceChat(page);
	const starter = page.getByTestId("chat-starter");
	await expect(starter).toBeVisible();
	await starter.getByRole("button", { name: "Explore this project" }).click();
	const input = page.getByTestId("chat-input");
	await expect(input).toBeFocused();
	await expect(input).toHaveValue("Explain this project's structure and the main entry points.");
	await expect(page.getByTestId("chat-row")).toHaveCount(0);
	await input.fill("My own task");
	await starter.getByRole("button", { name: "Review code" }).click();
	await expect(input).toHaveValue("My own task");
	await expect(input).toBeFocused();
	await expect(page.getByTestId("chat-scroll")).toHaveAttribute("data-streaming", "false");
	await shot(page, "zcode-ui", "workspace-dark");
	const wire = await E2eWire.connect(Number(new URL(page.url()).port));
	try {
		await wire.request("settings.update", { config: { theme: "light" } });
		await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
		await shot(page, "zcode-ui", "workspace-light");
		await hideAuxiliaryWorkbench(page);
		await page.setViewportSize({ width: 390, height: 780 });
		await expect(input).toBeVisible();
		await expect(page.getByTestId("chat-send")).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390,
		);
		await shot(page, "zcode-ui", "narrow-chat");
	} finally {
		await wire.request("settings.update", { config: { theme: "dark" } });
		wire.close();
	}
});

test("home and settings remain usable at narrow widths", async ({ page }) => {
	await openAppFresh(page);
	await page.setViewportSize({ width: 390, height: 780 });
	await pressPlatformShortcut(page, "B");
	await expect(page.getByTestId("welcome-cta")).toBeVisible();
	await expect(page.getByTestId("welcome-title")).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await shot(page, "zcode-ui", "narrow-home");
	await page.getByTestId("open-settings").click();
	await expect(page.getByTestId("settings-dialog")).toBeVisible();
	await page.getByTestId("settings-nav-appearance").click();
	await expect(page.getByTestId("settings-nav-appearance")).toHaveAttribute("aria-current", "page");
	await shot(page, "zcode-ui", "narrow-settings");
});

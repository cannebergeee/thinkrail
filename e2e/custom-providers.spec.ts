import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { openAppFresh } from "./fixtures/app";
import { shot } from "./fixtures/screenshots";
import { E2eWire } from "./fixtures/wire";

test("custom provider discovery, editing, sign-out and deletion use the live host", async ({
	page,
}) => {
	const server = createServer((request, response) => {
		expect(request.url).toBe("/v1/models");
		expect(request.headers.authorization).toBe("Bearer fixture-custom-key");
		response.setHeader("content-type", "application/json");
		response.end(JSON.stringify({ data: [{ id: "discovered-model" }] }));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing fixture endpoint");
	let wire: E2eWire | undefined;
	const providerId = "e2e-custom-gateway";
	try {
		await openAppFresh(page);
		wire = await E2eWire.connect(Number(new URL(page.url()).port));
		await page.getByTestId("open-settings").click();
		await page.getByTestId("custom-provider-add").click();
		await page.getByTestId("custom-provider-id").fill(providerId);
		await page.getByTestId("custom-provider-name").fill("Fixture Gateway");
		await page.getByTestId("custom-provider-base-url").fill(`http://127.0.0.1:${address.port}/v1`);
		await page.getByTestId("custom-provider-api-key").fill("fixture-custom-key");
		const modelId = page.getByTestId("custom-provider-model-id");
		await modelId.pressSequentially("manual-model");
		await expect(modelId).toBeFocused();
		await expect(modelId).toHaveValue("manual-model");
		await page.getByTestId("custom-provider-discover").click();
		await page.getByTestId("custom-provider-discovered-row").getByRole("checkbox").check();
		await page.getByTestId("custom-provider-discovered-add").click();
		await expect(page.getByTestId("custom-provider-model-id")).toHaveCount(2);
		await shot(page.getByTestId("custom-provider-dialog"), "custom-providers", "add");
		await page.getByTestId("custom-provider-save").click();
		await expect(page.getByTestId("custom-provider-dialog")).toHaveCount(0);
		const row = page.locator(`[data-testid="custom-provider-row"][data-provider="${providerId}"]`);
		await expect(row).toHaveAttribute("data-configured", "true");
		expect(
			(await wire.request("model.list", {}))
				.filter((model) => model.provider === providerId)
				.map((model) => model.id)
				.sort(),
		).toEqual(["discovered-model", "manual-model"]);
		await row.getByTestId("custom-provider-edit").click();
		await expect(page.getByTestId("custom-provider-api-key")).toHaveValue("");
		await expect(page.getByTestId("custom-provider-id")).toBeDisabled();
		await page.getByTestId("custom-provider-name").fill("Updated Gateway");
		await page.getByTestId("custom-provider-save").click();
		await expect(page.getByTestId("custom-provider-dialog")).toHaveCount(0);
		await expect(row).toContainText("Updated Gateway");
		await expect(row).toHaveAttribute("data-configured", "true");
		await row.getByTestId("custom-provider-signout").click();
		await expect(row).toHaveAttribute("data-configured", "false");
		expect(
			(await wire.request("model.list", {})).filter((model) => model.provider === providerId),
		).toEqual([]);
		await row.getByTestId("custom-provider-delete").click();
		await page.getByTestId("custom-provider-delete-confirm").click();
		await expect(row).toHaveCount(0);
		expect(await wire.request("provider.customList", {})).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ id: providerId })]),
		);
	} finally {
		if (wire) {
			const remaining = await wire.request("provider.customList", {});
			if (remaining.some((provider) => provider.id === providerId))
				await wire.request("provider.customDelete", { providerId });
			wire.close();
		}
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

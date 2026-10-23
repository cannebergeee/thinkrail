import { expect, test } from "bun:test";
import type { CustomProvider, ProviderStatus } from "@thinkrail/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomProviderRow } from "./CustomProvidersSettings";

const provider: CustomProvider = {
	id: "my-gateway",
	name: "My Gateway",
	baseUrl: "https://gateway.example/v1",
	api: "openai-completions",
	models: [
		{
			id: "glm-4.6",
			name: "GLM 4.6",
			contextWindow: 200_000,
			maxTokens: 32_768,
			input: ["text"],
		},
	],
};

function render(status?: ProviderStatus) {
	return renderToStaticMarkup(
		<CustomProviderRow
			provider={provider}
			status={status}
			busy={false}
			onEdit={() => {}}
			onDelete={() => {}}
			onConnect={() => {}}
			onSignOut={() => {}}
		/>,
	);
}

test("a custom provider row names the endpoint, its protocol and its model count", () => {
	const html = render({
		id: "my-gateway",
		name: "My Gateway",
		configured: false,
		canApiKey: true,
	});
	expect(html).toContain("My Gateway");
	expect(html).toContain("openai-completions");
	expect(html).toContain("https://gateway.example/v1");
	expect(html).toContain("1 model");
	expect(html).toContain('data-configured="false"');
	expect(html).toContain("No key yet");
	expect(html).toContain('data-testid="custom-provider-apikey"');
	expect(html).not.toContain('data-testid="custom-provider-signout"');
	expect(html).toContain('data-testid="custom-provider-edit"');
	expect(html).toContain('data-testid="custom-provider-delete"');
});

test("a connected custom provider signs out instead of asking for a key", () => {
	const html = render({
		id: "my-gateway",
		name: "My Gateway",
		configured: true,
		kind: "api-key",
		canApiKey: true,
		canLogout: true,
	});
	expect(html).toContain('data-configured="true"');
	expect(html).toContain("API key");
	expect(html).toContain('data-testid="custom-provider-signout"');
	expect(html).not.toContain('data-testid="custom-provider-apikey"');
});

test("a provider whose credential lives outside the app shows no removal affordance", () => {
	const html = render({
		id: "my-gateway",
		name: "My Gateway",
		configured: true,
		kind: "env",
	});
	expect(html).toContain("environment key");
	expect(html).not.toContain('data-testid="custom-provider-signout"');
	expect(html).not.toContain('data-testid="custom-provider-apikey"');
});

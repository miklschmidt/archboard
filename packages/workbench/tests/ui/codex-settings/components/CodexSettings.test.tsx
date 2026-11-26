import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, jest, mock, spyOn, test } from "bun:test";
import type { CodexSettingsReply } from "#shared/codex-settings/schemas/codex-settings.ts";

GlobalRegistrator.register();
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { Dialog } = await import("@archboard/ui-kit/components");
const { CodexSettings } = await import("#ui/codex-settings/components/CodexSettings.tsx");

afterEach(async () => {
	await act(async () => {
		cleanup();
	});
	jest.restoreAllMocks();
});
afterAll(() => GlobalRegistrator.unregister());

test("retry loads the signed-out controls after the first read fails", async () => {
	const signedOut: CodexSettingsReply = {
		success: true,
		auth: { state: "signed_out", requiresOpenaiAuth: true, reason: null },
		models: [],
		modelError: null,
		selection: { version: 1, orchestrator: null, workhorse: null, voiceLanguage: null },
		defaults: {
			orchestrator: { model: "gpt-6.1-terra", effort: "low", serviceTier: null },
			workhorse: { model: "gpt-6.2-sol", effort: "high", serviceTier: null },
		},
	};
	spyOn(globalThis, "fetch")
		.mockRejectedValueOnce(new Error("Unreachable"))
		.mockResolvedValueOnce(Response.json(signedOut));

	const view = render(
		<Dialog open>
			<Dialog.Content>
				<Dialog.Title>Settings</Dialog.Title>
				<CodexSettings onSuccess={mock()} onClose={mock()} />
			</Dialog.Content>
		</Dialog>,
	);
	const retry = await view.findByRole("button", { name: "Retry" });
	await act(async () => {
		fireEvent.click(retry);
	});
	expect((await view.findByRole("button", { name: "Sign in with ChatGPT" })).textContent).toContain(
		"Sign in with ChatGPT",
	);
	const fields = view.getAllByRole("combobox");
	expect(fields).toHaveLength(7);
	expect(fields.every((field) => field.hasAttribute("disabled"))).toBe(true);
	expect(view.getByRole("group", { name: "Orchestrator" })).toBeTruthy();
	expect(view.getByRole("group", { name: "Workhorse" })).toBeTruthy();
	expect(view.getByRole("group", { name: "Voice" })).toBeTruthy();
});

test("the signed-in email stays hidden until it is clicked, and a second click hides it again", async () => {
	const signedIn: CodexSettingsReply = {
		success: true,
		auth: {
			state: "authenticated",
			account: { type: "chatgpt", email: "dev@example.com", planType: "pro", workspaceName: null },
		},
		models: [],
		modelError: null,
		selection: { version: 1, orchestrator: null, workhorse: null, voiceLanguage: null },
		defaults: {
			orchestrator: { model: "gpt-6.1-terra", effort: "low", serviceTier: null },
			workhorse: { model: "gpt-6.2-sol", effort: "high", serviceTier: null },
		},
	};
	spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(signedIn));

	const view = render(
		<Dialog open>
			<Dialog.Content>
				<Dialog.Title>Settings</Dialog.Title>
				<CodexSettings onSuccess={mock()} onClose={mock()} />
			</Dialog.Content>
		</Dialog>,
	);
	const email = await view.findByRole("button", { name: "dev@example.com" });
	expect(email.getAttribute("aria-pressed")).toBe("false");
	await act(async () => {
		fireEvent.click(email);
	});
	expect(email.getAttribute("aria-pressed")).toBe("true");
	await act(async () => {
		fireEvent.click(email);
	});
	expect(email.getAttribute("aria-pressed")).toBe("false");
});

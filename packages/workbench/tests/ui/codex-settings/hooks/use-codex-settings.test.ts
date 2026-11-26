import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, jest, mock, spyOn, test } from "bun:test";
import type { CodexSettingsReply } from "#shared/codex-settings/schemas/codex-settings.ts";
import { useCodexSettings } from "#ui/codex-settings/hooks/use-codex-settings.ts";

GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");

const pending: CodexSettingsReply = {
	success: true,
	auth: { state: "login_pending", loginId: "login", variant: "chatgpt", authUrl: null },
	models: [],
	modelError: null,
	selection: { version: 1, orchestrator: null, workhorse: null },
	defaults: {
		orchestrator: { model: "gpt-6.1-terra", effort: "low", serviceTier: "priority" },
		workhorse: { model: "gpt-6.2-sol", effort: "high", serviceTier: null },
	},
};

afterEach(() => {
	cleanup();
	jest.restoreAllMocks();
	jest.useRealTimers();
});
afterAll(() => GlobalRegistrator.unregister());

test("a late account poll cannot restore a canceled sign-in", async () => {
	jest.useFakeTimers();
	const waiting = Promise.withResolvers<Response>();
	const signedOut: CodexSettingsReply = {
		...pending,
		auth: { state: "signed_out", requiresOpenaiAuth: true, reason: null },
	};
	const request = spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(Response.json(pending))
		.mockReturnValueOnce(waiting.promise)
		.mockResolvedValueOnce(Response.json(signedOut));

	const onSuccess = mock();
	const view = renderHook(() => useCodexSettings({ onSuccess }));
	await act(async () => {});
	expect(view.result.current.settings).toMatchObject({ auth: { state: "login_pending" } });

	await act(async () => {
		jest.advanceTimersByTime(3000);
	});
	expect(request).toHaveBeenCalledTimes(2);
	const signal = request.mock.calls[1]?.[1]?.signal;
	await act(async () => view.result.current.cancelLogin());
	expect(signal?.aborted).toBe(true);
	expect(view.result.current.settings).toMatchObject({ auth: { state: "signed_out" } });

	await act(async () => waiting.resolve(Response.json(pending)));
	expect(view.result.current.settings).toMatchObject({ auth: { state: "signed_out" } });
});

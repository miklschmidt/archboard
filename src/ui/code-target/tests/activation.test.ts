import { afterEach, describe, expect, mock, test } from "bun:test";

import type { CodeTargetNotice, CodeTargetOpenSuccess } from "@/shared/code-target";
import { activateCodeTarget } from "@/ui/code-target";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/**
 * Install a fetch that answers every request the same way.
 * @param body The reply body.
 * @param status The HTTP status.
 * @returns The mock, to count calls.
 */
function answering(body: unknown, status = 200): ReturnType<typeof mock> {
	const fetchMock = mock(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		),
	);
	// The test stands in for the browser's fetch; only the reply matters.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	return fetchMock;
}

/**
 * An activation with spies for both outcomes.
 * @returns The two spies.
 */
function outcomes(): {
	onSuccess: ReturnType<typeof mock<(reply: CodeTargetOpenSuccess) => void>>;
	onFailure: ReturnType<typeof mock<(notice: CodeTargetNotice) => void>>;
} {
	return {
		onSuccess: mock((_reply: CodeTargetOpenSuccess) => undefined),
		onFailure: mock((_notice: CodeTargetNotice) => undefined),
	};
}

/** Let the reply settle. */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

const SUCCESS = {
	success: true,
	code: "CODE_TARGET_OPENED",
	repository: "github.com/acme/repo",
	path: "src/index.ts",
	kind: "file",
} as const;

describe("code-target activation", () => {
	test("posts the board and the subject's identity, and nothing else", async () => {
		const fetchMock = answering(SUCCESS);
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({
			boardKey: "system/payments",
			elementId: "7c40IV7N",
			onSuccess,
			onFailure,
		});
		// The browser states which board and which subject; the binding, the
		// checkout registry and the opener are all the server's (ADR 0023).
		expect(fetchMock).toHaveBeenCalledWith("/api/code-targets/open", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board: "system/payments", element: "7c40IV7N" }),
		});
		await settle();
		expect(onSuccess).toHaveBeenCalledWith(SUCCESS);
		expect(onFailure).not.toHaveBeenCalled();
	});

	test("carries the variant a pane is reading, because a proposal binds its own code", async () => {
		const fetchMock = answering(SUCCESS);
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({
			boardKey: "system/payments@proposed",
			elementId: "7c40IV7N",
			onSuccess,
			onFailure,
		});

		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			body: JSON.stringify({ board: "system/payments@proposed", element: "7c40IV7N" }),
		});
	});

	test("refuses a pane that is on no board without reaching the server", () => {
		const fetchMock = answering({});
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({ boardKey: null, elementId: "7c40IV7N", onSuccess, onFailure });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
			message: "No board is available for this code target.",
		});
	});

	test("routes a schema-valid non-2xx reply to a typed failure once", async () => {
		answering(
			{
				success: false,
				code: "OPENER_UNAVAILABLE",
				error: "Cursor is not installed.",
				actions: [{ kind: "settings", label: "Opener settings" }],
			},
			422,
		);
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({ boardKey: "board-a", elementId: "7c40IV7N", onSuccess, onFailure });
		await settle();

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(onFailure.mock.calls[0]?.[0]).toEqual({
			kind: "error",
			message: "Cursor is not installed.",
			actions: [{ kind: "settings", label: "Opener settings" }],
		});
	});

	test("treats a schema-valid failure sent with HTTP 200 as an invalid response", async () => {
		answering({
			success: false,
			code: "OPENER_UNAVAILABLE",
			error: "This must not use the normal failure path.",
		});
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({ boardKey: "board-a", elementId: "7c40IV7N", onSuccess, onFailure });
		await settle();

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
		expect(onFailure.mock.calls[0]?.[0]).not.toMatchObject({
			message: "This must not use the normal failure path.",
		});
	});

	test.each([200, 500])("converts an invalid %i reply to RESPONSE_INVALID", async (status) => {
		answering({ success: true, path: "/tmp/private" }, status);
		const { onSuccess, onFailure } = outcomes();

		activateCodeTarget({ boardKey: "board-a", elementId: "7c40IV7N", onSuccess, onFailure });
		await settle();

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onFailure).toHaveBeenCalledTimes(1);
		expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
	});
});

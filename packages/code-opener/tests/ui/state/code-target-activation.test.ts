import { afterEach, describe, expect, mock, test } from "bun:test";

import type { CodeTargetNotice } from "#shared/schemas/code-target-open.ts";
import { activateCodeTarget } from "#ui/state/code-target-activation.ts";

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
 * Activate a subject's code target, with a spy for what the person is told.
 * @param boardKey The board key the subject is on.
 * @returns The spy.
 */
function activate(
	boardKey: string | null = "board-a",
): ReturnType<typeof mock<(notice: CodeTargetNotice) => void>> {
	const onNotice = mock((_notice: CodeTargetNotice) => undefined);
	activateCodeTarget({ vault: VAULT, boardKey, elementId: "7c40IV7N", onNotice });
	return onNotice;
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

/** The vault of the pane the subject is in. */
const VAULT = "/work/archboard/.archboard/vault";

describe("code-target activation", () => {
	test("posts the board and the subject's identity, and a plain open tells nothing", async () => {
		const fetchMock = answering(SUCCESS);

		const onNotice = activate("system/payments");
		// The browser states which board and which subject; the binding, the
		// checkout registry and the opener are all the server's (ADR 0023).
		expect(fetchMock).toHaveBeenCalledWith("/api/code-targets/open", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board: "system/payments", element: "7c40IV7N", vault: VAULT }),
		});
		await settle();
		// The editor that shows the code says it all.
		expect(onNotice).not.toHaveBeenCalled();
	});

	test("carries the variant a pane is reading, because a proposal binds its own code", () => {
		const fetchMock = answering(SUCCESS);

		activate("system/payments@proposed");

		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
			body: JSON.stringify({
				board: "system/payments@proposed",
				element: "7c40IV7N",
				vault: VAULT,
			}),
		});
	});

	test("refuses a pane that is on no board without reaching the server", () => {
		const fetchMock = answering({});

		const onNotice = activate(null);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(onNotice.mock.calls[0]?.[0]).toMatchObject({
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

		const onNotice = activate();
		await settle();

		expect(onNotice).toHaveBeenCalledTimes(1);
		expect(onNotice.mock.calls[0]?.[0]).toEqual({
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

		const onNotice = activate();
		await settle();

		expect(onNotice).toHaveBeenCalledTimes(1);
		expect(onNotice.mock.calls[0]?.[0]).toMatchObject({
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
		expect(onNotice.mock.calls[0]?.[0]).not.toMatchObject({
			message: "This must not use the normal failure path.",
		});
	});

	test.each([200, 500])("converts an invalid %i reply to RESPONSE_INVALID", async (status) => {
		answering({ success: true, path: "/tmp/private" }, status);

		const onNotice = activate();
		await settle();

		expect(onNotice).toHaveBeenCalledTimes(1);
		expect(onNotice.mock.calls[0]?.[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
	});
});

describe("code on another ref than the binding names", () => {
	test("a checkout's version opened in its place names both refs", async () => {
		answering({ ...SUCCESS, otherRef: { named: "release/2.1", checkedOut: "main" } });

		const onNotice = activate("system/payments");
		await settle();

		expect(onNotice).toHaveBeenCalledTimes(1);
		const notice = onNotice.mock.calls[0]?.[0];
		expect(notice?.kind).toBe("info");
		expect(notice?.message).toContain("release/2.1");
		expect(notice?.message).toContain("main");
	});

	test("a refusal to open another ref is information, with the way to the bound one", async () => {
		const href = "https://github.com/acme/repo/tree/release%2F2.1/src/index.ts";
		answering(
			{
				success: false,
				code: "CHECKOUT_ON_OTHER_REF",
				error: "The checkout is on main, and this binding names release/2.1.",
				actions: [{ kind: "github", label: "Open on GitHub", href }],
			},
			409,
		);
		const onNotice = activate("system/payments");
		await settle();
		expect(onNotice).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "info", actions: [expect.objectContaining({ href })] }),
		);
	});
});

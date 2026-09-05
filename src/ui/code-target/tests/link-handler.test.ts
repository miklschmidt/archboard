import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import type { CodeTargetNotice, CodeTargetOpenSuccess } from "@/shared/code-target";
import { activateCodeTarget, createCodeTargetLinkHandler } from "@/ui/code-target";

type LinkHandler = NonNullable<ExcalidrawProps["onLinkOpen"]>;
type LinkElement = Parameters<LinkHandler>[0];
type LinkEvent = Parameters<LinkHandler>[1];

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
 * An element with a link, as Excalidraw hands one to the handler.
 * @param id The element id.
 * @param link Its link.
 * @returns The element.
 */
function element(id: string, link: string | null): LinkElement {
	// The handler reads only id and link.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return { id, link } as LinkElement;
}

/**
 * A link event whose default can be prevented.
 * @returns The event and its spy.
 */
function event(): { value: LinkEvent; preventDefault: ReturnType<typeof mock> } {
	const preventDefault = mock(() => undefined);
	// The handler calls only preventDefault.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return { value: { preventDefault } as unknown as LinkEvent, preventDefault };
}

/**
 * A handler with spies for both outcomes.
 * @param boardKey The board the pane holds.
 * @returns The handler and its spies.
 */
function handler(boardKey: string | null): {
	value: LinkHandler;
	onSuccess: ReturnType<typeof mock<(reply: CodeTargetOpenSuccess) => void>>;
	onFailure: ReturnType<typeof mock<(notice: CodeTargetNotice) => void>>;
} {
	const onSuccess = mock((_reply: CodeTargetOpenSuccess) => undefined);
	const onFailure = mock((_notice: CodeTargetNotice) => undefined);
	return {
		value: createCodeTargetLinkHandler({ boardKey, onSuccess, onFailure }),
		onSuccess,
		onFailure,
	};
}

/** A success the test does not care about. */
function ignoreSuccess(): void {
	// The failure path is what this case asserts.
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

const RESERVED_LINK = "/api/code-targets/open?board=board-a&element=box-1";

describe("code-target link handler", () => {
	test("the shared activation helper posts board and element identity only", async () => {
		const fetchMock = answering(SUCCESS);
		const onSuccess = mock((_reply: CodeTargetOpenSuccess) => undefined);
		const onFailure = mock((_notice: CodeTargetNotice) => undefined);

		activateCodeTarget({ boardKey: "system/payments", elementId: "box 1", onSuccess, onFailure });
		expect(fetchMock).toHaveBeenCalledWith("/api/code-targets/open", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board: "system/payments", element: "box 1" }),
		});
		await settle();
		expect(onSuccess).toHaveBeenCalledWith(SUCCESS);
		expect(onFailure).not.toHaveBeenCalled();
	});

	test("the shared activation helper refuses absent board identity without fetching", () => {
		const fetchMock = answering({});
		const onFailure = mock((_notice: CodeTargetNotice) => undefined);
		activateCodeTarget({
			boardKey: null,
			elementId: "box-1",
			onSuccess: ignoreSuccess,
			onFailure,
		});
		expect(fetchMock).not.toHaveBeenCalled();
		expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
			message: "No board is available for this code target.",
		});
	});

	test.each([
		"https://github.com/acme/repo",
		"/api/code-targets/open?board=board-a&element=box-1&extra=true",
		"/api/code-targets/open?element=box-1&board=board-a",
	])("leaves an ordinary or non-exact link untouched: %s", async (link) => {
		const fetchMock = answering({});
		const opened = handler("board-a");
		const activated = event();

		opened.value(element("box-1", link), activated.value);
		await settle();

		expect(activated.preventDefault).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).not.toHaveBeenCalled();
	});

	test.each([
		["board-b", "box-1", "The link belongs to another board."],
		["board-a", "box-2", "The link belongs to another element."],
		[null, "box-1", "The link belongs to another board."],
	] as const)(
		"prevents a reserved link with a context mismatch and never fetches",
		(boardKey, clickedId, message) => {
			const fetchMock = answering({});
			const opened = handler(boardKey);
			const activated = event();

			opened.value(element(clickedId, RESERVED_LINK), activated.value);

			expect(activated.preventDefault).toHaveBeenCalledTimes(1);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(opened.onSuccess).not.toHaveBeenCalled();
			expect(opened.onFailure).toHaveBeenCalledTimes(1);
			expect(opened.onFailure.mock.calls[0]?.[0]).toMatchObject({ kind: "error", message });
		},
	);

	test("prevents synchronously, posts identity only, and routes a valid success once", async () => {
		const fetchMock = answering(SUCCESS);
		const opened = handler("system/payments");
		const activated = event();

		opened.value(
			element("box 1", "/api/code-targets/open?board=system%2Fpayments&element=box+1"),
			activated.value,
		);

		expect(activated.preventDefault).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith("/api/code-targets/open", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ board: "system/payments", element: "box 1" }),
		});
		expect(opened.onSuccess).not.toHaveBeenCalled();

		await settle();
		expect(opened.onSuccess).toHaveBeenCalledTimes(1);
		expect(opened.onSuccess).toHaveBeenCalledWith(SUCCESS);
		expect(opened.onFailure).not.toHaveBeenCalled();
	});

	test("routes a schema-valid non-2xx reply to typed failure once", async () => {
		answering(
			{
				success: false,
				code: "OPENER_UNAVAILABLE",
				error: "Cursor is not installed.",
				actions: [{ kind: "settings", label: "Opener settings" }],
			},
			422,
		);
		const opened = handler("board-a");

		opened.value(element("box-1", RESERVED_LINK), event().value);
		await settle();

		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).toHaveBeenCalledTimes(1);
		expect(opened.onFailure.mock.calls[0]?.[0]).toEqual({
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
		const opened = handler("board-a");

		opened.value(element("box-1", RESERVED_LINK), event().value);
		await settle();

		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).toHaveBeenCalledTimes(1);
		expect(opened.onFailure.mock.calls[0]?.[0]).toMatchObject({
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
		expect(opened.onFailure.mock.calls[0]?.[0]).not.toMatchObject({
			message: "This must not use the normal failure path.",
		});
	});

	test.each([200, 500])("converts an invalid %i reply to RESPONSE_INVALID", async (status) => {
		answering({ success: true, path: "/tmp/private" }, status);
		const opened = handler("board-a");

		opened.value(element("box-1", RESERVED_LINK), event().value);
		await settle();

		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).toHaveBeenCalledTimes(1);
		expect(opened.onFailure.mock.calls[0]?.[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
	});
});

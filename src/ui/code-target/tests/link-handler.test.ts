import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";

import type { CodeTargetNotice, CodeTargetOpenSuccess } from "../../../shared/code-target";
import { createCodeTargetLinkHandler } from "../index.ts";

type LinkHandler = NonNullable<ExcalidrawProps["onLinkOpen"]>;
type LinkElement = Parameters<LinkHandler>[0];
type LinkEvent = Parameters<LinkHandler>[1];

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function element(id: string, link: string | null): LinkElement {
	return { id, link } as LinkElement;
}

function event() {
	const preventDefault = mock(() => undefined);
	return {
		value: { preventDefault } as unknown as LinkEvent,
		preventDefault,
	};
}

function handler(
	boardKey: string | null,
	onSuccess = mock((_reply: CodeTargetOpenSuccess) => undefined),
	onFailure = mock((_notice: CodeTargetNotice) => undefined),
) {
	return {
		value: createCodeTargetLinkHandler({ boardKey, onSuccess, onFailure }),
		onSuccess,
		onFailure,
	};
}

function reply(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("code-target link handler", () => {
	test.each([
		"https://github.com/acme/repo",
		"/api/code-targets/open?board=board-a&element=box-1&extra=true",
		"/api/code-targets/open?element=box-1&board=board-a",
	])("leaves an ordinary or non-exact link untouched: %s", async (link) => {
		const fetchMock = mock(async () => reply({}));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
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
			const fetchMock = mock(async () => reply({}));
			globalThis.fetch = fetchMock as unknown as typeof fetch;
			const opened = handler(boardKey);
			const activated = event();

			opened.value(
				element(clickedId, "/api/code-targets/open?board=board-a&element=box-1"),
				activated.value,
			);

			expect(activated.preventDefault).toHaveBeenCalledTimes(1);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(opened.onSuccess).not.toHaveBeenCalled();
			expect(opened.onFailure).toHaveBeenCalledTimes(1);
			expect(opened.onFailure.mock.calls[0]?.[0]).toMatchObject({
				kind: "error",
				message,
			});
		},
	);

	test("prevents synchronously, posts identity only, and routes a valid success once", async () => {
		const success = {
			success: true,
			code: "CODE_TARGET_OPENED",
			repository: "github.com/acme/repo",
			path: "src/index.ts",
			kind: "file",
		} as const;
		const fetchMock = mock(async () => reply(success));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
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
		expect(opened.onSuccess).toHaveBeenCalledWith(success);
		expect(opened.onFailure).not.toHaveBeenCalled();
	});

	test("routes a schema-valid non-2xx reply to typed failure once", async () => {
		globalThis.fetch = mock(async () =>
			reply(
				{
					success: false,
					code: "OPENER_UNAVAILABLE",
					error: "Cursor is not installed.",
					actions: [{ kind: "settings", label: "Opener settings" }],
				},
				422,
			),
		) as unknown as typeof fetch;
		const opened = handler("board-a");

		opened.value(
			element("box-1", "/api/code-targets/open?board=board-a&element=box-1"),
			event().value,
		);
		await settle();

		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).toHaveBeenCalledTimes(1);
		expect(opened.onFailure.mock.calls[0]?.[0]).toEqual({
			kind: "error",
			message: "Cursor is not installed.",
			actions: [{ kind: "settings", label: "Opener settings" }],
		});
	});

	test.each([200, 500])("converts an invalid %i reply to RESPONSE_INVALID", async (status) => {
		globalThis.fetch = mock(async () =>
			reply({ success: true, path: "/tmp/private" }, status),
		) as unknown as typeof fetch;
		const opened = handler("board-a");

		opened.value(
			element("box-1", "/api/code-targets/open?board=board-a&element=box-1"),
			event().value,
		);
		await settle();

		expect(opened.onSuccess).not.toHaveBeenCalled();
		expect(opened.onFailure).toHaveBeenCalledTimes(1);
		expect(opened.onFailure.mock.calls[0]?.[0]).toMatchObject({
			kind: "error",
			message: expect.stringContaining("RESPONSE_INVALID"),
		});
	});
});

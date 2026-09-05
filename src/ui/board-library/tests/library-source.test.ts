import { afterEach, describe, expect, mock, test } from "bun:test";

// Excalidraw's runtime needs a browser; the policy under test does not. The
// normaliser is stood in for by identity, so what reaches it is what is asserted.
await mock.module("@excalidraw/excalidraw", () => ({
	/**
	 * Hand the raw items back unchanged.
	 * @param items The raw items.
	 * @returns The same items.
	 */
	restoreLibraryItems: (items: unknown[]) => items,
	/**
	 * No request in the address bar.
	 * @returns Null.
	 */
	parseLibraryTokensFromUrl: () => null,
	/**
	 * A constant hash.
	 * @returns Zero.
	 */
	getLibraryItemsHash: () => 0,
	/**
	 * Concatenate.
	 * @param left One palette.
	 * @param right The other.
	 * @returns Both.
	 */
	mergeLibraryItems: (left: unknown[], right: unknown[]) => [...left, ...right],
}));

const { fetchLibraryFrom, validateLibrarySource } = await import("@/ui/board-library");

const LIB = "https://excalidraw.com/lib.excalidrawlib";

/**
 * The message a promise fails with.
 * @param promise The promise expected to fail.
 * @returns Its error message.
 */
async function failureOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("The promise did not fail");
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

/**
 * Install a fetch that answers every request the same way.
 * @param body The reply body.
 * @param init The response options.
 * @returns The requests seen, with their options.
 */
function answering(body: string, init: ResponseInit = {}): { url: string; init: RequestInit }[] {
	const seen: { url: string; init: RequestInit }[] = [];
	/**
	 * The fake fetch.
	 * @param input The URL.
	 * @param options The request options.
	 * @returns The scripted response.
	 */
	function fakeFetch(input: string | URL | Request, options?: RequestInit): Promise<Response> {
		const url = input instanceof Request ? input.url : input.toString();
		seen.push({ url, init: options ?? {} });
		return Promise.resolve(new Response(body, init));
	}
	// The test stands in for the browser's fetch; only the reply matters.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	globalThis.fetch = fakeFetch as typeof fetch;
	return seen;
}

describe("library source policy", () => {
	test("accepts excalidraw.com, its subdomains and the excalidraw-libraries repository", () => {
		expect(validateLibrarySource("https://excalidraw.com/lib.excalidrawlib").hostname).toBe(
			"excalidraw.com",
		);
		expect(validateLibrarySource("https://libraries.excalidraw.com/x.excalidrawlib").hostname).toBe(
			"libraries.excalidraw.com",
		);
		expect(
			validateLibrarySource(
				"https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries/a.excalidrawlib",
			).pathname,
		).toStartWith("/excalidraw/excalidraw-libraries/");
	});

	test.each([
		["not a url", "not a URL"],
		["http://excalidraw.com/lib.excalidrawlib", "https only"],
		["https://evil.example/lib.excalidrawlib", "Refusing to install a library from evil.example"],
		["https://notexcalidraw.com/lib.excalidrawlib", "Refusing to install a library from"],
		["https://raw.githubusercontent.com/someone/else/lib.excalidrawlib", "Refusing to install"],
	])("refuses %s", (candidate, message) => {
		expect(() => validateLibrarySource(candidate)).toThrow(message);
	});

	test("fetches without credentials and normalises both published formats", async () => {
		const seen = answering(
			JSON.stringify({
				type: "excalidrawlib",
				version: 2,
				libraryItems: [
					{
						id: "item-1",
						status: "published",
						created: 1,
						elements: [{ id: "e1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
					},
				],
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
		const fetched = await fetchLibraryFrom("https://excalidraw.com/lib.excalidrawlib");
		expect(seen[0]?.url).toBe("https://excalidraw.com/lib.excalidrawlib");
		expect(seen[0]?.init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
		expect(fetched.url.hostname).toBe("excalidraw.com");
		expect(fetched.items).toHaveLength(1);
		expect(fetched.items[0]?.status).toBe("published");
	});

	test("refuses a document that is not a library, and an empty one", async () => {
		answering(JSON.stringify({ type: "excalidraw", elements: [] }));
		expect(await failureOf(fetchLibraryFrom(LIB))).toContain("is not an .excalidrawlib file");
		answering(JSON.stringify({ type: "excalidrawlib", libraryItems: [] }));
		expect(await failureOf(fetchLibraryFrom(LIB))).toContain("nothing in it");
		answering("<html>");
		expect(await failureOf(fetchLibraryFrom(LIB))).toContain("did not return a library file");
	});

	test("refuses a failed answer and an oversized one", async () => {
		answering("", { status: 404 });
		expect(await failureOf(fetchLibraryFrom(LIB))).toContain("answered 404");
		answering("{}", { headers: { "content-length": String(9 * 1024 * 1024) } });
		expect(await failureOf(fetchLibraryFrom(LIB))).toContain("Refusing to load it");
	});
});

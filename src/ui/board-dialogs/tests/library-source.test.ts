import { describe, expect, test } from "bun:test";

import { checkLibrarySource } from "@/ui/board-dialogs";

describe("library source check", () => {
	test("accepts an https URL and normalises it", () => {
		expect(
			checkLibrarySource("  https://libraries.excalidraw.com/libraries/x.excalidrawlib "),
		).toEqual({
			ok: true,
			url: "https://libraries.excalidraw.com/libraries/x.excalidrawlib",
		});
	});

	test("refuses blanks, non-URLs, other schemes and credentials", () => {
		expect(checkLibrarySource("").ok).toBe(false);
		expect(checkLibrarySource("not a url").ok).toBe(false);
		expect(checkLibrarySource("http://example.com/lib").ok).toBe(false);
		expect(checkLibrarySource("file:///tmp/lib.excalidrawlib").ok).toBe(false);
		expect(checkLibrarySource("https://user:secret@example.com/lib").ok).toBe(false);
	});
});

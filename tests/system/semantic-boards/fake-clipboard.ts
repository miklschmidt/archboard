// Preload only in the command subprocess. No desktop clipboard is touched.
import { mock } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import type { ClipboardManager } from "@teddyzhu/clipboard";

const destination = process.env["ARCHBOARD_TEST_COPIED"]!;

mock.module("@teddyzhu/clipboard", () => ({
	ClipboardManager: class {
		/**
		 * Capture one native multi-format write.
		 * @param contents The native library's exact input contract.
		 */
		setContents(contents: Parameters<ClipboardManager["setContents"]>[0]): void {
			if (process.env["ARCHBOARD_TEST_CLIPBOARD_FAIL"] === "1") {
				throw new Error("Clipboard connection failed");
			}
			writeFileSync(
				destination,
				JSON.stringify({
					pid: process.pid,
					formats: contents.availableFormats,
					payload: { png: contents.image?.data.toString("base64"), html: contents.html },
				}),
			);
		}

		/**
		 * Observe replacement or removal of the fake clipboard.
		 * @returns The current HTML representation.
		 */
		getHtml(): string {
			return JSON.parse(readFileSync(destination, "utf8")).payload.html;
		}
	},
}));

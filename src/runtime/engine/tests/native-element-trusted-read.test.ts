import { expect, test } from "bun:test";

import { validatePersistedBoardElement } from "../native-element.js";
import { completeElement } from "./support/elements.js";

test("trusted reads validate customData and confine rawText to text", () => {
	const text = completeElement({ id: "text", type: "text", x: 0, y: 0, text: "native" });
	expect(
		validatePersistedBoardElement({ ...text, rawText: "plugin" }, "note /vault/raw.excalidraw.md"),
	).toMatchObject({ rawText: "plugin" });
	expect(() =>
		validatePersistedBoardElement({ ...text, rawText: 4 }, "note /vault/raw.excalidraw.md"),
	).toThrow("note /vault/raw.excalidraw.md: invalid element text (text) at element.rawText");
	const box = completeElement({ id: "box", type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
	expect(() =>
		validatePersistedBoardElement(
			{ ...box, rawText: "forbidden" },
			"note /vault/raw.excalidraw.md",
		),
	).toThrow("note /vault/raw.excalidraw.md: invalid element box (rectangle) at element.rawText");
	expect(() =>
		validatePersistedBoardElement({ ...box, customData: [] }, "note /vault/custom.excalidraw.md"),
	).toThrow(
		"note /vault/custom.excalidraw.md: invalid element box (rectangle) at element.customData",
	);
	expect(() =>
		validatePersistedBoardElement(
			{ ...box, customData: { archboard: { createdAt: 5 } } },
			"note /vault/custom.excalidraw.md",
		),
	).toThrow(
		"note /vault/custom.excalidraw.md: invalid element box (rectangle) at element.customData.archboard.createdAt",
	);
});

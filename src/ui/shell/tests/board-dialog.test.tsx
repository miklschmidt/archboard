import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BoardDialog, type BoardDialogMode } from "../BoardDialog";

const panes = [
	{ clientId: "left", label: "Left", board: "payments" },
	{ clientId: "right", label: "Right", board: "systems" },
];

function render(mode: BoardDialogMode): string {
	return renderToStaticMarkup(
		createElement(BoardDialog, {
			mode,
			current: null,
			panes,
			onSubmit: () => {},
			onCancel: () => {},
		}),
	);
}

describe("board dialog pane choice", () => {
	test("offers pane placement only when opening a board", () => {
		expect(render("open")).toContain("Into which pane");
		expect(render("new")).not.toContain("Into which pane");
	});
});

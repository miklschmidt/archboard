import { describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
	BoardDialogMode,
	BoardDialogPane,
	BoardDialogProps,
} from "../board-dialog-contract.ts";

const loadedModule: unknown = await import(new URL("../BoardDialog.tsx", import.meta.url).href);
if (typeof loadedModule !== "object" || loadedModule === null) {
	throw new Error("Board dialog module did not load as an object.");
}
const BoardDialog = (loadedModule as Readonly<Record<string, unknown>>)
	.BoardDialog as ComponentType<BoardDialogProps>;
if (typeof BoardDialog !== "function") throw new Error("BoardDialog export is not a component.");

const panes = [
	{ clientId: "left", label: "Left", board: "payments" },
	{ clientId: "right", label: "Right", board: "systems" },
] satisfies BoardDialogPane[];

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

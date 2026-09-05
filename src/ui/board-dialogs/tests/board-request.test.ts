import { describe, expect, test } from "bun:test";

import {
	boardDialogCopy,
	buildBoardDialogRequest,
	buildOpenRequest,
	draftHasBoardName,
	issuesFor,
	type BoardDialogIssue,
} from "@/ui/board-dialogs";
import type { PersistedBoardListing } from "@/ui/types";

const LISTING: PersistedBoardListing = {
	vault: "/vault",
	boards: [
		{ key: "payments", identity: { board: "payments", variant: "current" } },
		{
			key: "payments@option-a#l2",
			identity: { board: "payments", variant: "option-a", level: "l2" },
			file: "/vault/payments@option-a#l2.md",
		},
	],
};

describe("board dialog requests", () => {
	test("names the primary action after the mode", () => {
		expect(boardDialogCopy("open").submitLabel).toBe("Open board");
		expect(boardDialogCopy("create").submitLabel).toBe("Create board");
		expect(boardDialogCopy("save-as").submitLabel).toBe("Save as");
	});

	test("drops empty variant and level instead of sending empty strings", () => {
		expect(
			buildBoardDialogRequest("create", { board: "  payments ", variant: "  ", level: null }),
		).toEqual({ mode: "create", board: "payments" });
		expect(
			buildBoardDialogRequest("save-as", { board: "payments", variant: "option-a", level: "l2" }),
		).toEqual({ mode: "save-as", board: "payments", variant: "option-a", level: "l2" });
	});

	test("an open request carries the listed identity, never a re-parsed key", () => {
		expect(buildOpenRequest(LISTING, "payments@option-a#l2")).toEqual({
			mode: "open",
			board: "payments",
			variant: "option-a",
			level: "l2",
		});
		expect(buildOpenRequest(LISTING, "payments")).toEqual({
			mode: "open",
			board: "payments",
			variant: "current",
		});
		expect(buildOpenRequest(LISTING, "missing")).toBeNull();
		expect(buildOpenRequest(null, "payments")).toBeNull();
	});

	test("a blank name cannot be submitted", () => {
		expect(draftHasBoardName({ board: "   ", variant: "", level: null })).toBe(false);
		expect(draftHasBoardName({ board: "x", variant: "", level: null })).toBe(true);
	});

	test("issues are routed to their field in the order reported", () => {
		const issues: BoardDialogIssue[] = [
			{ field: "board", message: "first" },
			{ field: "form", message: "whole" },
			{ field: "board", message: "second" },
		];
		expect(issuesFor(issues, "board")).toEqual(["first", "second"]);
		expect(issuesFor(issues, "form")).toEqual(["whole"]);
		expect(issuesFor(issues, "level")).toEqual([]);
	});
});

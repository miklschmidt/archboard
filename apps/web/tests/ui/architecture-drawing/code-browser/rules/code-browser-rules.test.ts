// Where the picture goes with an open file, and which names of the file the code view marks.

import { expect, test } from "bun:test";
import { ownerPicture } from "#ui/architecture-drawing/code-browser/rules/file-owners.ts";
import { fileMarks } from "#ui/architecture-drawing/code-browser/rules/symbol-marks.ts";
import { lineSegments } from "#ui/architecture-drawing/code-browser/rules/line-segments.ts";

const MODULES = [
	{ id: "Shop#Api" },
	{ id: "Shop#Orders", parent: "Shop#Api" },
	{ id: "Shop#Payments", parent: "Shop#Api" },
	{ id: "Shop#Ledger" },
];

/**
 * Whether the picture draws a module open: here, none.
 * @returns False.
 */
function closed(): boolean {
	return false;
}

test("owners with one parent open that parent, and owners with several become a focus", () => {
	expect(ownerPicture(["Shop#Orders", "Shop#Payments"], MODULES, closed, null)).toEqual({
		scope: "Shop#Api",
	});
	expect(ownerPicture(["Shop#Orders"], MODULES, (id) => id === "Shop#Api", "Shop#Ledger")).toEqual({
		scope: "Shop#Ledger",
	});
	expect(ownerPicture(["Shop#Orders", "Shop#Ledger"], MODULES, closed, null)).toEqual({
		focus: ["Shop#Orders", "Shop#Ledger"],
	});
	expect(ownerPicture([], MODULES, closed, null)).toBeNull();
});

const TEXT = [
	"const post = 1;",
	"export function post(entry: Entry): void {",
	"\tledger.post(entry);",
	"}",
].join("\n");

test("a bound name is marked inside its declaration only, and an anchor on its own line", () => {
	const definition = { symbol: "post", kind: "function", start: 2, end: 4 } as const;
	const marks = fileMarks(
		TEXT,
		{
			file: [],
			symbols: [
				{
					subject: "Shop#Orders",
					symbol: "Ledger.post",
					definition,
				},
				{ subject: "Shop#Gone", symbol: "missing", definition: null },
			],
			anchors: [{ subject: "Shop#Writes", symbol: "ledger", line: 3 }],
		},
		[definition],
	);
	expect(marks.names.get(1)).toBeUndefined();
	expect(marks.names.get(2)).toEqual([
		{ kind: "binding", subject: "Shop#Orders", symbol: "Ledger.post", start: 16, end: 20 },
	]);
	expect(marks.names.get(3)).toEqual([
		{ kind: "anchor", subject: "Shop#Writes", symbol: "ledger", start: 1, end: 7 },
	]);
	expect(marks.spans).toEqual([{ subject: "Shop#Orders", start: 2, end: 4 }]);
});

test("a pinned owner marks its declaration in the quoted checkout after it moves", () => {
	const marks = fileMarks(
		TEXT,
		{
			file: [],
			symbols: [
				{
					subject: "Shop#Orders",
					symbol: "post",
					definition: { symbol: "post", kind: "function", start: 1, end: 3 },
				},
			],
			anchors: [],
		},
		[{ symbol: "post", kind: "function", start: 2, end: 4 }],
	);
	expect(marks.names.has(1)).toBe(false);
	expect(marks.names.get(2)?.[0]?.subject).toBe("Shop#Orders");
	expect(marks.spans).toEqual([{ subject: "Shop#Orders", start: 2, end: 4 }]);
});

test("a marked name gathers the coloured runs it covers, cut at its edges", () => {
	const line = "export function post(";
	const mark = {
		kind: "binding",
		subject: "Shop#Orders",
		symbol: "post",
		start: 16,
		end: 20,
	} as const;
	const segments = lineSegments(
		line,
		[
			{ content: "export function ", color: "var(--a)" },
			{ content: "post(", color: "var(--b)" },
		],
		[mark],
	);
	expect(
		segments.map((one) => [one.kind, one.pieces.map((piece) => piece.content).join("")]),
	).toEqual([
		["text", "export function "],
		["mark", "post"],
		["text", "("],
	]);
});

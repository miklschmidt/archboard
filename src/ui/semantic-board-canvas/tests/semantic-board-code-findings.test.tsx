// What a pane shows of the last code check (TASK-367.24, ADR 0046).
//
// The server remembers the findings of the last pass, and a pane reads that
// memory and never starts a pass. A warning puts the picture's own warning
// triangle on its subject, where the picture puts it for a subject nobody has
// decided; information draws nothing; findings about another version of the
// board draw nothing; and the selection tab lists the findings of the subject
// picked out, warnings first.
//
// What these catch: a mark on the wrong subject or in another place than the
// picture's own badge, a mark for information, a mark that outlives the board
// version it was found on, a pane that asks for a pass, and a selection tab that
// does not list what the mark stands for.

import { expect, test } from "bun:test";

import { cornerWarning, lineWarning } from "@/transformers/semantic-renderer/index";
import {
	drawing,
	mountStage,
	server,
	settle,
	surface,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The attribute the viewer marks its own warnings with. */
const MARK = "[data-code-warning]";

/**
 * One finding, as the code check reports it.
 * @param severity Warning or information.
 * @param subject The subject's id and kind.
 * @param subject.id Its id.
 * @param subject.kind Its kind.
 * @param message What the check says.
 * @returns The finding.
 */
function finding(
	severity: "warning" | "information",
	subject: { id: string; kind: "node" | "edge" },
	message: string,
): Record<string, unknown> {
	return {
		code: severity === "warning" ? "ANCHOR_SYMBOL_MISSING" : "RELATIONSHIP_UNSUPPORTED",
		severity,
		file: "pipeline.semantic.json",
		path: "variants[0]",
		board: "pipeline",
		variant: "v1",
		subject: { ...subject, name: subject.id },
		message,
	};
}

/**
 * What the server remembers of one pass over the pane's board.
 * @param version The version of the board the pass read.
 * @param findings What it found.
 * @returns The route's answer.
 */
function remembered(version: number, findings: readonly Record<string, unknown>[]): unknown {
	return {
		success: true,
		readings: [
			{
				board: "pipeline",
				variant: "v1",
				version,
				checkedAt: "2026-10-06T12:00:00.000Z",
				findings,
			},
		],
	};
}

/** One board document with the subjects of the fake drawing. */
const DOCUMENT = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "b1",
	name: "pipeline",
	level: "system",
	version: 1,
	createdAt: "2026-09-11T00:00:00.000Z",
	updatedAt: "2026-09-11T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "n1", name: "board-io", kind: "module" },
					{ id: "n2", name: "Write Lease", kind: "module" },
				],
				edges: [{ id: "e1", from: "n1", to: "n2", kind: "call", label: "writes" }],
			},
		},
	],
};

/**
 * Where a mark is centred, by its transform.
 * @param markup A mark, as the renderer writes one, or the element the viewer drew.
 * @returns Its translation.
 */
function centreOf(markup: string | Element): string | null {
	const element =
		typeof markup === "string"
			? new DOMParser().parseFromString(
					`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
					"image/svg+xml",
				).documentElement.firstElementChild
			: markup;
	return element?.getAttribute("transform") ?? null;
}

/**
 * Serve the fake drawing of version 1 and its board, with what the last pass left.
 * @param findings The route's answer.
 */
function serving(findings: unknown): void {
	server.reply = { status: 200, body: drawing(1) };
	server.documents["pipeline"] = DOCUMENT;
	server.findings = findings;
}

/**
 * Let the picture, the board and the findings arrive.
 */
async function settled(): Promise<void> {
	await settle();
	await settle();
	await settle();
}

test("a warning wears the picture's own warning where the picture puts one; information wears none", async () => {
	serving(
		remembered(1, [
			finding("warning", { id: "n1", kind: "node" }, "The anchored file has no writeBoard."),
			finding("information", { id: "e1", kind: "edge" }, "No call joins the ends."),
		]),
	);
	mountStage();
	await settled();

	const card = surface().querySelector("[data-semantic-id='n1']");
	const marks = card?.querySelectorAll(MARK) ?? [];
	expect(marks.length).toBe(1);
	// The fake card's body is 80 by 40 at the origin: the badge of a subject
	// nobody has decided stands on its top-right corner, and so does this.
	expect(centreOf(marks[0]!)).toBe(centreOf(cornerWarning({ x: 0, y: 0, width: 80, height: 40 })));
	// The information about the line draws nothing anywhere.
	expect(surface().querySelectorAll(MARK).length).toBe(1);
	// Reading the memory is the whole of what the pane asked: no pass.
	expect(server.calls.some((url) => url.includes("code-check"))).toBe(false);
});

test("a line with no words wears the warning at the middle of its longest straight run", async () => {
	serving(remembered(1, [finding("warning", { id: "e1", kind: "edge" }, "The anchor is gone.")]));
	mountStage();
	await settled();

	// The fake line runs straight from (0,0) to (10,10).
	const marks = surface().querySelectorAll(`${MARK}[data-semantic-id='e1'] > *`);
	expect(marks.length).toBe(1);
	expect(centreOf(marks[0]!)).toBe(centreOf(lineWarning({ x: 5, y: 5 })));
});

test("a container wears it on its header and a labelled line on the leading edge of its words", async () => {
	serving(
		remembered(1, [
			finding("warning", { id: "n1", kind: "node" }, "Gone."),
			finding("warning", { id: "e1", kind: "edge" }, "Gone."),
		]),
	);
	// The groups as the renderer draws a container and a labelled line, at a
	// shift of the canvas: its frame, its header over what it holds, the line,
	// and the line's words on their plate.
	server.reply = {
		status: 200,
		body: {
			...drawing(1),
			svg:
				`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g transform="translate(4,6)">` +
				`<g data-semantic-kind="region" data-semantic-id="n1" data-depiction="container">` +
				`<rect class="ab-halo" x="17" y="17" width="206" height="126"></rect>` +
				`<rect x="20" y="20" width="200" height="120"></rect></g>` +
				`<g data-semantic-kind="edge" data-semantic-id="e1"><path d="M0,0 L10,10"></path></g>` +
				`<g data-semantic-kind="region" data-semantic-id="n1" data-semantic-part="header"><text>Box</text></g>` +
				`<g data-semantic-kind="edge" data-semantic-id="e1" data-semantic-part="label">` +
				`<rect x="300" y="50" width="60" height="30"></rect><text>writes</text></g>` +
				`</g></svg>`,
		},
	};
	mountStage();
	await settled();

	const header = surface().querySelectorAll(`[data-semantic-part='header'] > ${MARK}`);
	expect(header.length).toBe(1);
	expect(centreOf(header[0]!)).toBe(
		centreOf(cornerWarning({ x: 20, y: 20, width: 200, height: 120 })),
	);
	const words = surface().querySelectorAll(`[data-semantic-part='label'] > ${MARK}`);
	expect(words.length).toBe(1);
	expect(centreOf(words[0]!)).toBe(centreOf(lineWarning({ x: 300, y: 65 })));
	expect(surface().querySelectorAll(MARK).length).toBe(2);
});

test("findings about another version of the board draw nothing", async () => {
	serving(remembered(2, [finding("warning", { id: "n1", kind: "node" }, "Gone.")]));
	mountStage();
	await settled();

	expect(surface().querySelectorAll(MARK).length).toBe(0);
});

test("the selection tab lists the findings of the subject picked out, warnings first", async () => {
	serving(
		remembered(1, [
			finding("information", { id: "n1", kind: "node" }, "Nothing outside reaches it."),
			finding("warning", { id: "n1", kind: "node" }, "The bound file has no writeBoard."),
			finding("warning", { id: "n2", kind: "node" }, "Another part's finding."),
		]),
	);
	mountStage("n1");
	await settled();

	const listed = document.querySelectorAll(
		"[data-slot='semantic-inspector-findings'] > li[data-severity]",
	);
	expect([...listed].map((row) => row.getAttribute("data-severity"))).toEqual([
		"warning",
		"information",
	]);
	expect(listed[0]?.textContent).toContain("The bound file has no writeBoard.");
});

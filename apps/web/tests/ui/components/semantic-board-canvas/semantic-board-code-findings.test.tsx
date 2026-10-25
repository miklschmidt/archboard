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
import { act } from "@testing-library/react";

import { cornerWarning, lineWarning } from "@archboard/renderer/picture";
import { cameraNow } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	drawing,
	mountStage,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

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
 * A subject of these pictures by its id: `n…` names a part, `e…` a relationship.
 * @param id The id.
 * @returns The subject.
 */
function nodeOrEdge(id: string): { id: string; kind: "node" | "edge" } {
	return { id, kind: id.startsWith("n") ? "node" : "edge" };
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

test("each warning stands where the picture puts its own badge, in the group that holds it", async () => {
	serving(
		remembered(
			1,
			["n1", "n2", "e1", "e2"].map((id) => finding("warning", nodeOrEdge(id), "Gone.")),
		),
	);
	// The groups as the renderer draws them, at a shift of the canvas: a
	// container's frame and its header over what it holds; a labelled line and
	// its words on their plate; a line with no words, which defines its head
	// before its halo and its stroke; and a participant of two exchanges, with
	// a lifeline and a card in each.
	const route = "M20,150 L20,250 C20,256 24,260 30,260 L60,260";
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
				`<g data-semantic-kind="edge" data-semantic-id="e2"><defs><marker id="head">` +
				`<path d="M0,0 L10,5 L0,10 z"></path></marker></defs>` +
				`<path class="ab-halo" d="${route}"></path><path d="${route}" marker-end="url(#head)"></path></g>` +
				[150, 220]
					.map(
						(top) =>
							`<g data-semantic-kind="node" data-semantic-id="n2" data-semantic-part="lifeline"></g>` +
							`<g data-flow-head="f${top}"><g data-semantic-kind="node" data-semantic-id="n2">` +
							`<rect x="250" y="${top}" width="80" height="40"></rect></g></g>`,
					)
					.join("") +
				`<g data-semantic-kind="region" data-semantic-id="n1" data-semantic-part="header"><text>Box</text></g>` +
				`<g data-semantic-kind="edge" data-semantic-id="e1" data-semantic-part="label">` +
				`<rect x="300" y="50" width="60" height="30"></rect><text>writes</text></g>` +
				`</g></svg>`,
		},
	};
	mountStage();
	await settled();

	const placed = [...surface().querySelectorAll(`${MARK}[transform]`)].map((mark) => {
		const holder = mark.parentElement;
		const part = holder?.getAttribute("data-semantic-part") ?? "body";
		return `${holder?.getAttribute("data-semantic-id")}/${part} ${centreOf(mark)}`;
	});
	expect(placed.toSorted()).toEqual(
		[
			`n1/header ${centreOf(cornerWarning({ x: 20, y: 20, width: 200, height: 120 }))}`,
			`e1/label ${centreOf(lineWarning({ x: 300, y: 65 }))}`,
			// The middle of the longest straight run, as the picture puts the words.
			`e2/label ${centreOf(lineWarning({ x: 20, y: 200 }))}`,
			`n2/body ${centreOf(cornerWarning({ x: 250, y: 150, width: 80, height: 40 }))}`,
			`n2/body ${centreOf(cornerWarning({ x: 250, y: 220, width: 80, height: 40 }))}`,
		].toSorted(),
	);
});

test("findings about another version of the board draw nothing", async () => {
	serving(remembered(2, [finding("warning", { id: "n1", kind: "node" }, "Gone.")]));
	mountStage();
	await settled();

	expect(surface().querySelectorAll(MARK).length).toBe(0);
	expect(document.querySelector("[data-slot='code-warning-count']")).toBeNull();
});

test("the header counts only warnings and cycles their subjects with a focused camera", async () => {
	serving(
		remembered(1, [
			finding("warning", { id: "n1", kind: "node" }, "Missing file."),
			finding("information", { id: "e1", kind: "edge" }, "No call."),
			finding("warning", { id: "e1", kind: "edge" }, "Missing anchor."),
		]),
	);
	server.reply = { status: 200, body: { ...drawing(1), width: 4000, height: 3000 } };
	const mounted = mountStage(null, { live: true, reducedMotion: true });
	await settled();
	const button = document.querySelector<HTMLButtonElement>("[data-slot='code-warning-count']")!;
	expect(button.tagName).toBe("BUTTON");
	expect(button.getAttribute("data-count")).toBe("2");
	expect(button.closest("[data-slot='pane-header']")).not.toBeNull();
	const fit = cameraNow();
	act(() => button.click());
	await settled();
	const first = cameraNow();
	expect(first.scale).toBeGreaterThan(fit.scale);
	act(() => button.click());
	await settled();
	expect(cameraNow()).not.toEqual(first);
	act(() => button.click());
	await settled();
	expect(mounted.picks).toEqual(["n1", "e1", "n1"]);
	expect(cameraNow()).toEqual(first);
	expect(server.calls.some((url) => url.includes("code-check"))).toBe(false);
});

test("a warning hidden by a limited view opens the whole board before focusing", async () => {
	serving(remembered(1, [finding("warning", { id: "e1", kind: "edge" }, "Missing anchor.")]));
	const limited = drawing(1);
	server.reply = {
		status: 200,
		body: {
			...limited,
			view: { id: "parts", name: "Parts", grammar: "architecture" },
			width: 4000,
			height: 3000,
			drawn: { nodes: [], edges: [], flows: [], steps: [] },
			atlas: { nodes: {}, edges: {}, regions: {} },
		},
	};
	const mounted = mountStage(null, { view: "parts", live: true, reducedMotion: true });
	await settled();
	const fit = cameraNow();
	server.reply = { status: 200, body: drawing(1) };
	const button = document.querySelector<HTMLButtonElement>("[data-slot='code-warning-count']")!;
	act(() => button.click());
	await settled();
	expect(mounted.picks).toEqual(["e1"]);
	expect(
		server.calls.some((url) => url.includes("render") && url.includes("view=Everything")),
	).toBe(true);
	expect(cameraNow().scale).toBeGreaterThan(fit.scale);
});

test("a pass with information alone shows zero warnings and offers no warning navigation", async () => {
	serving(remembered(1, [finding("information", { id: "e1", kind: "edge" }, "No call.")]));
	mountStage();
	await settled();
	const button = document.querySelector<HTMLButtonElement>("[data-slot='code-warning-count']")!;
	expect(button.getAttribute("data-count")).toBe("0");
	expect(button.disabled).toBe(true);
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

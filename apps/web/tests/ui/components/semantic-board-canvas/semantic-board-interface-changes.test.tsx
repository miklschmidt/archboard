// What a proposal changed about each container's interface, said first in the
// Board tab (TASK-538.01, ADR 0044): each container whose interface moved, with
// each part named by how it moved, before the counts of the comparison. Choosing
// a part picks it on the picture, and nothing sets a comparison status.
//
// The list comes from `compareInterfaces`, the rule `semantic compare` lists by,
// so the two cannot differ.
//
// What these catch: a part missing or named with the wrong move, a container
// listed whose interface did not move, a list
// below the counts, a proposal that changed no interface saying nothing, and a
// list on the current variant, which is read against nothing.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import {
	mountStage,
	openSidebarTab,
	pickablePicture,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

// Checkout's Place order calls Payments. Basket is reached from the storefront
// on the current variant only, and Shipping does not change.
const CURRENT_NODES = [
	{ id: "sf", name: "Storefront", kind: "route" },
	{ id: "co", name: "Checkout", kind: "service" },
	{ id: "po", name: "Place order", kind: "route", parent: "co" },
	{ id: "bsk", name: "Basket", kind: "route", parent: "co" },
	{ id: "pay", name: "Payments", kind: "service" },
	{ id: "adm", name: "Admin", kind: "route" },
	{ id: "ship", name: "Shipping", kind: "service" },
	{ id: "lbl", name: "Print label", kind: "job", parent: "ship" },
];
const CURRENT_EDGES = [
	{ id: "e1", from: "sf", to: "po", kind: "http" },
	{ id: "e2", from: "po", to: "pay", kind: "http" },
	{ id: "e3", from: "sf", to: "bsk", kind: "http" },
	{ id: "e4", from: "po", to: "lbl", kind: "call" },
];

// The proposal: the storefront reaches new tax rules, the basket is reached
// only from Place order inside Checkout, and the admin depends on Checkout as a
// whole.
const DRAFT_NODES = [
	...CURRENT_NODES,
	{ id: "tax", name: "Tax rules", kind: "route", parent: "co" },
];
const DRAFT_EDGES = [
	...CURRENT_EDGES.map((edge) =>
		edge.id === "e3" ? { id: "e3", from: "po", to: "bsk", kind: "call" } : edge,
	),
	{ id: "e5", from: "sf", to: "tax", kind: "http" },
	{ id: "e6", from: "adm", to: "co", kind: "call" },
];

/** The standing of each subject the proposal's picture draws. */
const STANDING = { tax: "added", e5: "added", e6: "added", e3: "changed" };

/**
 * The board document: the current variant, and a proposal branched from it.
 * @param draftEdges What the proposal draws, which a case may make the current variant's.
 * @returns The document.
 */
function boardOf(draftEdges: readonly unknown[]): Record<string, unknown> {
	return {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-10-25T00:00:00.000Z",
		updatedAt: "2026-10-25T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{
				id: "v1",
				name: "as built",
				lifecycle: "current",
				content: { nodes: CURRENT_NODES, edges: CURRENT_EDGES },
			},
			{
				id: "v2",
				name: "tax at checkout",
				lifecycle: "draft",
				parent: "v1",
				content: { nodes: DRAFT_NODES, edges: draftEdges },
			},
		],
	};
}

/**
 * Show one variant of the board in a pane whose selection is held above it, and open its Board tab.
 * @param variant The variant on screen.
 * @param draftEdges What the proposal draws.
 */
async function served(
	variant: "v1" | "v2",
	draftEdges: readonly unknown[] = DRAFT_EDGES,
): Promise<void> {
	server.documents["pipeline"] = boardOf(draftEdges);
	const proposal = variant === "v2";
	server.reply = {
		status: 200,
		body: pickablePicture(
			{
				regions: ["co", "ship"],
				nodes: ["sf", "po", "bsk", "pay", "adm", "lbl", "tax"],
				edges: ["e1", "e2", "e3", "e4", "e5", "e6"],
			},
			{
				variant: proposal
					? { id: "v2", name: "tax at checkout", lifecycle: "draft" }
					: { id: "v1", name: "as built", lifecycle: "current" },
				changes: proposal
					? { against: { id: "v1", name: "as built", lifecycle: "current" }, standing: STANDING }
					: null,
			},
		),
	};
	mountStage(null, { live: true, variant });
	await settle();
	await settle();
	openSidebarTab("board");
	await settle();
}

/**
 * The rows of the interface changes, as a reader meets them.
 * @returns Each row's part and how it moved, the container's row with no move.
 */
function rows(): string[][] {
	return [
		...document.querySelectorAll(
			"[data-slot='semantic-interface-container'], [data-slot='semantic-interface-move']",
		),
	].map((row) => [row.getAttribute("data-part") ?? "", row.getAttribute("data-move") ?? ""]);
}

test("a proposal lists what it changed about each container's interface, as semantic compare does, before its counts", async () => {
	await served("v2");
	expect(rows()).toEqual([
		["co", ""],
		["tax", "entryPointsAdded"],
		["bsk", "becameHidden"],
		["adm", "callersGained"],
	]);
	const list = document.querySelector("[data-slot='semantic-interface-changes']");
	const counts = document.querySelector("[data-slot='semantic-change-key']");
	expect(list?.getAttribute("data-count")).toBe("1");
	expect(counts).not.toBeNull();
	expect(list!.compareDocumentPosition(counts!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

	const basket = document.querySelector<HTMLElement>(
		"[data-slot='semantic-interface-move'][data-part='bsk']",
	);
	await act(async () => {
		fireEvent.click(basket!);
	});
	await settle();
	const selected = [...surface().querySelectorAll(".is-selected")];
	expect(selected.map((group) => group.getAttribute("data-semantic-id"))).toEqual(["bsk"]);
});

test("a proposal that changed no interface says so, and the current variant shows no list", async () => {
	await served("v2", [...CURRENT_EDGES, { id: "e7", from: "po", to: "pay", kind: "data" }]);
	expect(rows()).toEqual([]);
	expect(document.querySelector("[data-slot='semantic-interface-unchanged']")).not.toBeNull();
});

test("the current variant, read against nothing, shows no interface changes", async () => {
	await served("v1");
	expect(document.querySelector("[data-slot='semantic-interface-changes']")).toBeNull();
});

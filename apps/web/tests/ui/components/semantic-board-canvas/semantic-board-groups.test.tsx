// Selecting one group from a pane: the list of groups, selecting every member
// across containers, and letting go of it. Nothing here writes: a selected
// group is the reader's, like the camera and the selection.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import {
	PANE_VAULT,
	chooseVariantInShell,
	driveInShell,
	mountStage,
	openSidebarTab,
	server,
	settle,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/** The vault's groups: two configured, named for reading. */
const GROUPS = {
	fulfillment: { name: "Fulfillment", color: "teal" },
	billing: { name: "Billing", color: "amber" },
} satisfies SemanticPolicy["groups"];

/**
 * The checker's answer, with whichever groups the vault defines.
 * @param groups The configured groups.
 * @returns The vault check body.
 */
function vaultWith(groups: SemanticPolicy["groups"]): Record<string, unknown> {
	return {
		success: true,
		policy: { ...DEFAULT_SEMANTIC_POLICY, groups },
		configurationValid: true,
		configurationFile: ".archboard/config.yaml",
		fingerprint: JSON.stringify(groups),
		diagnostics: [],
	};
}

/** One node as the board file spells it, as far as these tests need. */
interface Node {
	readonly id: string;
	readonly name: string;
	readonly kind: string;
	readonly parent?: string;
	readonly groups?: readonly string[];
}

// Fulfillment crosses two containers; the worker inside Shipping is also
// Billing's; the ledger belongs to Billing alone; the gateway to nothing.
const NODES: readonly Node[] = [
	{ id: "orders", name: "Orders", kind: "service" },
	{ id: "shipping", name: "Shipping", kind: "service" },
	{ id: "h", name: "Handler", kind: "route", parent: "orders", groups: ["fulfillment"] },
	{ id: "q", name: "Queue", kind: "queue", parent: "orders", groups: ["fulfillment"] },
	{ id: "w", name: "Worker", kind: "job", parent: "shipping", groups: ["billing", "fulfillment"] },
	{ id: "l", name: "Ledger", kind: "datastore", groups: ["billing"] },
	{ id: "g", name: "Gateway", kind: "route" },
];
const EDGES = [
	{ id: "e1", from: "g", to: "h", kind: "http" },
	{ id: "e2", from: "h", to: "q", kind: "queue" },
	{ id: "e3", from: "q", to: "w", kind: "queue" },
	{ id: "e4", from: "w", to: "l", kind: "data" },
];

/**
 * One board document, as its route answers with it.
 * @param nodes The current variant's nodes.
 * @param variants Other variants, when the family has them.
 * @returns The document.
 */
function boardOf(
	nodes: readonly Node[] = NODES,
	variants: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
	return {
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes, edges: EDGES } },
			...variants,
		],
	};
}

/**
 * One drawn subject of the picture.
 * @param kind What it is.
 * @param id Its id.
 * @returns The markup.
 */
function drawn(kind: string, id: string): string {
	return `<g data-semantic-kind="${kind}" data-semantic-id="${id}"><path class="ab-halo"></path><rect width="10" height="10"></rect></g>`;
}

/** Where every drawn subject of these pictures sits: the same box, since nothing here measures. */
const BOX = { x: 0, y: 0, width: 10, height: 10 };

/**
 * Where some subjects sit, all in the one box.
 * @param ids The subjects.
 * @returns The atlas entries.
 */
function placed(ids: readonly string[]): Record<string, typeof BOX> {
	return Object.fromEntries(ids.map((id) => [id, BOX]));
}

/**
 * A picture of the board, drawing every subject except those named.
 *
 * Containers are regions rather than nodes, the way the renderer draws a node
 * with visible children. What is left out stands for what a view hides or a
 * collapsed container swallows: still on the board, not in this picture.
 * @param hidden Subjects this picture does not draw.
 * @returns The render route's success body.
 */
function picture(hidden: readonly string[] = []): Record<string, unknown> {
	const containers = NODES.filter(
		(node) => !hidden.includes(node.id) && NODES.some((child) => child.parent === node.id),
	);
	const cards = NODES.filter((node) => !hidden.includes(node.id) && !containers.includes(node));
	const wires = EDGES.filter((edge) => !hidden.includes(edge.id));
	const svg = [
		...containers.map((node) => drawn("region", node.id)),
		...cards.map((node) => drawn("node", node.id)),
		...wires.map((edge) => drawn("edge", edge.id)),
	].join("");
	return {
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "as it is", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${svg}</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		appearances: [],
		key: null,
		atlas: {
			nodes: placed(cards.map((node) => node.id)),
			edges: placed(wires.map((edge) => edge.id)),
			regions: placed(containers.map((node) => node.id)),
		},
	};
}

/** Put the board, a picture of it and the vault's groups in front of a pane. */
function serving(): void {
	server.documents["pipeline"] = boardOf();
	server.reply = { status: 200, body: picture() };
	server.vault = vaultWith(GROUPS);
}

/**
 * Let every read the pane starts reach the screen: the picture, the board and
 * the vault check.
 */
async function settled(): Promise<void> {
	await settle();
	await settle();
	await settle();
}

/**
 * One element of the pane, when it drew one.
 * @param name The `data-slot` wanted.
 * @returns The element, or null.
 */
function slot(name: string): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[data-slot='${name}']`);
}

/**
 * The group list's buttons.
 * @returns Each group's button, in the order listed.
 */
function choices(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-group-choice']")];
}

/**
 * One group's button in the list.
 * @param group The group's id.
 * @returns The button.
 */
function choice(group: string): HTMLElement {
	const button = choices().find((each) => each.getAttribute("data-group") === group);
	if (button === undefined) throw new Error(`no ${group} in the group list`);
	return button;
}

/**
 * The group the list shows selected.
 * @returns Its id, or null for none.
 */
function listed(): string | null {
	const pressed = choices().find((each) => each.getAttribute("aria-pressed") === "true");
	return pressed?.getAttribute("data-group") ?? null;
}

/**
 * Click a group in the list, the way a person does.
 * @param group The group's id.
 */
async function toggle(group: string): Promise<void> {
	await act(async () => {
		fireEvent.click(choice(group));
	});
	await settled();
}

/**
 * The drawn subjects the picture marks selected.
 * @returns Their ids, in the order of {@link EVERYTHING}.
 */
function selected(): string[] {
	return EVERYTHING.filter((id) =>
		document
			.querySelector(`[data-slot='semantic-board-surface'] [data-semantic-id='${id}']`)
			?.classList.contains("is-selected"),
	);
}

/**
 * The one explanation the variant offers, when it offers one.
 * @returns Its button.
 */
function walkthrough(): HTMLElement {
	return document.querySelector<HTMLElement>("[data-slot='semantic-walkthrough-choice']")!;
}

/** Every drawn subject of the full picture. */
const EVERYTHING = ["orders", "shipping", "h", "q", "w", "l", "g", "e1", "e2", "e3", "e4"];

test("the list names each group the variant uses, in its colour, with nothing selected", async () => {
	serving();
	mountStage();
	await settled();
	expect(choices().map((button) => button.getAttribute("data-group"))).toEqual([
		"billing",
		"fulfillment",
	]);
	expect(choices().map((button) => button.textContent)).toEqual(["Billing", "Fulfillment"]);
	expect(
		choice("fulfillment").querySelector<HTMLElement>("[data-slot='semantic-group-chip']")?.style
			.borderColor,
	).toBe("var(--semantic-teal)");
	expect(listed()).toBeNull();
	expect(selected()).toEqual([]);
});

test("clicking a group selects every member across containers, and clicking it again lets go", async () => {
	serving();
	mountStage();
	await settled();
	await toggle("fulfillment");
	expect(listed()).toBe("fulfillment");
	expect(slot("semantic-board-stage")?.getAttribute("data-group")).toBe("fulfillment");
	// The members in both containers; neither container, no relationship, and
	// nothing outside the group.
	expect(selected()).toEqual(["h", "q", "w"]);
	await toggle("fulfillment");
	expect(listed()).toBeNull();
	expect(selected()).toEqual([]);
});

test("selecting a group replaces the picked subject, and picking a subject lets the group go", async () => {
	serving();
	const { picks } = mountStage("g", { live: true });
	await settled();
	openSidebarTab("board");
	await toggle("billing");
	expect(picks.at(-1)).toBeNull();
	expect(selected()).toEqual(["w", "l"]);

	act(() => {
		const viewport = slot("semantic-board-viewport")!;
		const card = document.querySelector(
			"[data-slot='semantic-board-surface'] [data-semantic-id='g']",
		)!;
		fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
		fireEvent.pointerUp(viewport, { pointerId: 1, button: 0, clientX: 5, clientY: 5 });
		fireEvent.click(card, { button: 0, clientX: 5, clientY: 5 });
	});
	await settled();
	expect(picks.at(-1)).toBe("g");
	expect(selected()).toEqual(["g"]);
	openSidebarTab("board");
	expect(listed()).toBeNull();

	// Escape lets a selected group go, as it lets a picked subject go.
	await toggle("billing");
	act(() => {
		fireEvent.keyDown(slot("semantic-board-viewport")!, { key: "Escape" });
	});
	await settled();
	expect(listed()).toBeNull();
	expect(selected()).toEqual([]);
});

test("a membership in the inspector selects the same group, with its colour", async () => {
	serving();
	mountStage("w", { live: true });
	await settled();
	const memberships = [
		...document.querySelectorAll<HTMLElement>("[data-slot='semantic-inspector-group']"),
	];
	expect(memberships.map((button) => button.getAttribute("data-group"))).toEqual([
		"billing",
		"fulfillment",
	]);
	expect(
		memberships[0]?.querySelector<HTMLElement>("[data-slot='semantic-group-chip']")?.style
			.borderColor,
	).toBe("var(--semantic-amber)");
	act(() => memberships[1]!.focus());
	await act(async () => {
		fireEvent.click(memberships[1]!);
	});
	await settled();
	expect(selected()).toEqual(["h", "q", "w"]);
	// The control goes with the selection it let go of, and the keyboard is not left on the page.
	expect(document.activeElement).not.toBe(document.body);
	openSidebarTab("board");
	expect(listed()).toBe("fulfillment");
});

test("a variant with no memberships offers no groups, as a board without views offers no views", async () => {
	server.documents["pipeline"] = boardOf(NODES.map(({ groups: _groups, ...node }) => node));
	server.reply = { status: 200, body: picture() };
	server.vault = vaultWith(GROUPS);
	mountStage();
	await settled();
	expect(choices()).toEqual([]);
	expect(slot("semantic-board-panel-groups")).toBeNull();
});

test("an id the configuration no longer defines is still listed, by its id, without a colour", async () => {
	serving();
	server.vault = vaultWith({ fulfillment: GROUPS.fulfillment });
	mountStage();
	await settled();
	expect(choice("billing").getAttribute("data-configured")).toBe("false");
	expect(choice("billing").textContent).toBe("billing");
	expect(
		choice("billing").querySelector<HTMLElement>("[data-slot='semantic-group-chip']")?.style
			.borderColor,
	).toBe("");
	await toggle("billing");
	expect(selected()).toEqual(["w", "l"]);
});

test("a board change refreshes who the selected group selects", async () => {
	serving();
	mountStage();
	await settled();
	await toggle("billing");
	expect(selected()).toEqual(["w", "l"]);
	server.documents["pipeline"] = boardOf(
		NODES.map((node) => (node.id === "w" ? { ...node, groups: ["fulfillment"] } : node)),
	);
	await act(async () => {
		announceSemanticBoardChange(PANE_VAULT, "pipeline", 2);
	});
	await settled();
	expect(listed()).toBe("billing");
	expect(selected()).toEqual(["l"]);

	// Once nothing belongs to it, the list no longer offers it to let go of,
	// so the selection lets go by itself.
	server.documents["pipeline"] = boardOf(
		NODES.map((node) => (node.id === "w" || node.id === "l" ? { ...node, groups: [] } : node)),
	);
	await act(async () => {
		announceSemanticBoardChange(PANE_VAULT, "pipeline", 3);
	});
	await settled();
	expect(listed()).toBeNull();
	expect(selected()).toEqual([]);
	server.documents["pipeline"] = boardOf();
	await act(async () => {
		announceSemanticBoardChange(PANE_VAULT, "pipeline", 4);
	});
	await settled();
	expect(listed()).toBeNull();
});

test("moving to another variant drops the group; changing the view keeps it", async () => {
	server.documents["pipeline"] = boardOf(NODES, [
		{
			id: "v2",
			name: "proposed",
			lifecycle: "draft",
			parent: "v1",
			content: { nodes: NODES, edges: EDGES },
		},
	]);
	const view = { id: "vw", name: "Narrow", grammar: "architecture" };
	server.reply = { status: 200, body: { ...picture(), views: [view] } };
	server.vault = vaultWith(GROUPS);
	mountStage(null, { live: true });
	await settled();
	await toggle("fulfillment");
	expect(listed()).toBe("fulfillment");

	// Another way of reading the same state: the group stays.
	server.reply = { status: 200, body: { ...picture(["l", "e4"]), views: [view], view } };
	await act(async () => {
		fireEvent.click(
			[...document.querySelectorAll<HTMLElement>("[data-slot='semantic-view-choice']")].at(-1)!,
		);
	});
	await settled();
	expect(listed()).toBe("fulfillment");

	// Another state of the architecture: the ids belong to one variant, so the
	// group is let go rather than carried across.
	server.reply = {
		status: 200,
		body: {
			...picture(),
			views: [view],
			variant: { id: "v2", name: "proposed", lifecycle: "draft" },
		},
	};
	chooseVariantInShell("v2");
	await settled();
	expect(listed()).toBeNull();
	expect(selected()).toEqual([]);

	// Returning is another navigation, not permission to restore the old choice.
	server.reply = { status: 200, body: { ...picture(), views: [view] } };
	chooseVariantInShell(undefined);
	await settled();
	expect(listed()).toBeNull();
});

/** Put a board whose variant tells one walkthrough, about the gateway, in front of a pane. */
function servingWalkthrough(): void {
	server.documents["pipeline"] = {
		...boardOf(),
		variants: [
			{
				id: "v1",
				name: "as it is",
				lifecycle: "current",
				content: {
					nodes: NODES,
					edges: EDGES,
					walkthroughs: [
						{
							id: "wt",
							name: "The write path",
							beats: [{ id: "b1", heading: "Start", body: "At the gateway.", subjects: ["g"] }],
						},
					],
				},
			},
		],
	};
	server.reply = { status: 200, body: picture() };
	server.vault = vaultWith(GROUPS);
}

test("selecting a group leaves a walkthrough, and opening a walkthrough lets the group go", async () => {
	servingWalkthrough();
	mountStage();
	await settled();
	await act(async () => {
		fireEvent.click(walkthrough());
	});
	await settled();
	expect(slot("semantic-presentation")).not.toBeNull();

	await toggle("fulfillment");
	expect(slot("semantic-presentation")).toBeNull();
	expect(slot("semantic-board-surface")?.classList.contains("is-veiled")).toBe(false);
	expect(listed()).toBe("fulfillment");

	await act(async () => {
		fireEvent.click(walkthrough());
	});
	await settled();
	expect(slot("semantic-presentation")).not.toBeNull();
	expect(listed()).toBeNull();
	expect(selected()).toEqual(["g"]);
});

test("a walkthrough a narration opens lets the group go too", async () => {
	servingWalkthrough();
	mountStage(null, { live: true });
	await settled();
	await toggle("fulfillment");
	driveInShell({ request: "narration-1", walkthrough: "wt", beat: 0 });
	await settled();
	expect(slot("semantic-presentation")).not.toBeNull();
	expect(listed()).toBeNull();
	expect(selected()).toEqual(["g"]);
});

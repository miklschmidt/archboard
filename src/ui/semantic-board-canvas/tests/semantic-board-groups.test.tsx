// Inspecting one group from a pane: choosing it, seeing who is in it across
// containers, what is lit and what recedes, which members this picture does
// not draw, and letting go of it. Nothing here writes: a group under
// inspection is the reader's, like the camera and the selection.

import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { announceSemanticBoardChange } from "@/ui/semantic-board-canvas";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import {
	chooseVariantInShell,
	mountStage,
	openSidebarTab,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";

/** The vault's groups: two configured, named for reading. */
const GROUPS = { fulfillment: { name: "Fulfillment" }, billing: { name: "Billing" } };

/**
 * The checker's answer, with whichever groups the vault defines.
 * @param groups The configured groups.
 * @returns The vault check body.
 */
function vaultWith(groups: Record<string, { name: string }>): Record<string, unknown> {
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
		theme: "light",
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${svg}</svg>`,
		atlas: {
			nodes: placed(cards.map((node) => node.id)),
			edges: placed(wires.map((edge) => edge.id)),
			regions: placed(containers.map((node) => node.id)),
		},
	};
}

/**
 * Put the board, a picture of it and the vault's groups in front of a pane.
 * @param hidden Subjects the picture leaves out.
 */
function serving(hidden: readonly string[] = []): void {
	server.documents["pipeline"] = boardOf();
	server.reply = { status: 200, body: picture(hidden) };
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
 * The group control.
 * @returns The select.
 */
function chooser(): HTMLSelectElement {
	const select = document.querySelector<HTMLSelectElement>("[data-slot='semantic-group-choice']");
	if (select === null) throw new Error("no group control");
	return select;
}

/**
 * Choose a group through the control, the way a person does.
 * @param group The group's id, or "" for none.
 */
async function choose(group: string): Promise<void> {
	await act(async () => {
		fireEvent.change(chooser(), { target: { value: group } });
	});
	await settled();
}

/**
 * The classes one drawn subject carries.
 * @param id The subject's id.
 * @returns Its class list.
 */
function classesOf(id: string): string[] {
	return [
		...(document.querySelector(`[data-slot='semantic-board-surface'] [data-semantic-id='${id}']`)
			?.classList ?? []),
	];
}

/**
 * Which of some drawn subjects carry one group mark.
 * @param ids The subjects.
 * @param role The mark.
 * @returns The ids that carry it, in the order given.
 */
function carrying(ids: readonly string[], role: string): string[] {
	return ids.filter((id) => classesOf(id).includes(role));
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

test("the control lists the groups the variant uses by their configured names, and nothing recedes until one is chosen", async () => {
	serving();
	mountStage();
	await settled();
	const options = [...chooser().options].map((option) => option.textContent);
	expect(options.slice(1)).toEqual(["Billing", "Fulfillment"]);
	expect(slot("semantic-group-status")).toBeNull();
	expect(slot("semantic-group-clear")).toBeNull();
	expect(slot("semantic-board-surface")?.classList.contains("is-group-focus")).toBe(false);
});

test("choosing a group lights its members across containers, keeps the boundary readable, and subdues the rest", async () => {
	serving();
	mountStage();
	await settled();
	await choose("fulfillment");
	expect(slot("semantic-board-stage")?.getAttribute("data-group")).toBe("fulfillment");
	expect(slot("semantic-board-surface")?.classList.contains("is-group-focus")).toBe(true);
	// Members in both containers, and the wiring between them; the immediate
	// neighbours and the relationships that cross the boundary; and the
	// containers, which are context and never members.
	expect(carrying(EVERYTHING, "is-group-member")).toEqual(["h", "q", "w", "e2", "e3"]);
	expect(carrying(EVERYTHING, "is-group-boundary")).toEqual(["l", "g", "e1", "e4"]);
	expect(carrying(EVERYTHING, "is-group-context")).toEqual(["orders", "shipping"]);
	expect(slot("semantic-group-status")?.getAttribute("data-members")).toBe("3");
	expect(slot("semantic-group-status")?.getAttribute("data-hidden")).toBe("0");
});

test("a member this picture does not draw is still counted, and its drawn container is context rather than a member", async () => {
	// The worker is inside a collapsed Shipping: the board has it, the picture
	// draws only its container.
	serving(["w", "e3", "e4"]);
	mountStage();
	await settled();
	await choose("fulfillment");
	expect(slot("semantic-group-status")?.getAttribute("data-members")).toBe("3");
	expect(slot("semantic-group-status")?.getAttribute("data-hidden")).toBe("1");
	expect(slot("semantic-group-status")?.textContent).toContain("not drawn");
	expect(classesOf("shipping")).toContain("is-group-context");
	expect(classesOf("shipping")).not.toContain("is-group-member");
});

test("the group report identifies hidden members and all relationships with boundary direction", async () => {
	serving(["w", "e3", "e4"]);
	mountStage();
	await settled();
	await choose("fulfillment");
	const report = slot("semantic-group-report")!;
	const members = [...report.querySelectorAll("[data-node][data-hidden]")];
	expect(
		members
			.filter((node) => node.getAttribute("data-hidden") === "true")
			.map((node) => node.getAttribute("data-node")),
	).toEqual(["w"]);
	expect(report.querySelector("[data-node='w']")?.textContent).toContain("Worker");
	expect(
		[...report.querySelectorAll("[data-edge]")].map((edge) => edge.getAttribute("data-edge")),
	).toEqual(["e2", "e3", "e1", "e4"]);
	expect(report.querySelector("[data-edge='e1']")?.getAttribute("data-direction")).toBe("incoming");
	expect(report.querySelector("[data-edge='e4']")?.getAttribute("data-direction")).toBe("outgoing");
	expect(members.map((node) => node.getAttribute("data-node"))).toEqual(["h", "q", "w", "l", "g"]);
});

test("the clear control lets go, and so does choosing none", async () => {
	serving();
	mountStage();
	await settled();
	await choose("billing");
	expect(chooser().value).toBe("billing");
	await act(async () => {
		fireEvent.click(slot("semantic-group-clear")!);
	});
	await settled();
	expect(chooser().value).toBe("");
	expect(slot("semantic-board-surface")?.classList.contains("is-group-focus")).toBe(false);
	expect(classesOf("w")).not.toContain("is-group-member");
	await choose("billing");
	await choose("");
	expect(slot("semantic-group-status")).toBeNull();
});

test("a membership in the inspector is the same choice, and picking a subject keeps the group", async () => {
	serving();
	mountStage("w", { live: true });
	await settled();
	const memberships = [
		...document.querySelectorAll<HTMLElement>("[data-slot='semantic-inspector-group']"),
	];
	expect(memberships.map((button) => button.textContent)).toEqual(["Billing", "Fulfillment"]);
	await act(async () => {
		fireEvent.click(memberships[1]!);
	});
	await settled();
	expect(
		document
			.querySelector("[data-slot='semantic-inspector-group'][data-group='fulfillment']")
			?.getAttribute("aria-pressed"),
	).toBe("true");
	// The picked worker is both attended and a member: one does not hide the other.
	expect(classesOf("w")).toContain("is-selected");
	expect(classesOf("w")).toContain("is-group-member");
	// And the board's own control says the same group.
	openSidebarTab("board");
	expect(chooser().value).toBe("fulfillment");
});

test("a variant with no memberships says so in the control's own place", async () => {
	server.documents["pipeline"] = boardOf(NODES.map(({ groups: _groups, ...node }) => node));
	server.reply = { status: 200, body: picture() };
	server.vault = vaultWith(GROUPS);
	mountStage();
	await settled();
	expect(chooser().disabled).toBe(true);
	expect(chooser().options[0]?.textContent).toBe("No groups");
});

test("an id the configuration no longer defines is still offered, by its id, and marked", async () => {
	serving();
	server.vault = vaultWith({ fulfillment: { name: "Fulfillment" } });
	mountStage();
	await settled();
	const options = [...chooser().options].map((option) => option.textContent);
	expect(options).toContain("billing (not configured)");
	await choose("billing");
	expect(slot("semantic-group-status")?.textContent).toContain("not configured");
});

test("the inspection follows the board and the configuration, and stays recoverable when the last member goes", async () => {
	serving();
	mountStage();
	await settled();
	await choose("billing");
	expect(slot("semantic-group-status")?.getAttribute("data-members")).toBe("2");

	// The vault renames Billing: the name moves, the group does not.
	server.vault = vaultWith({ ...GROUPS, billing: { name: "Invoicing" } });
	await act(async () => {
		announceSemanticBoardChange("pipeline", 2);
	});
	await settled();
	// A rename reaches the pane through the checker's own cadence; a board
	// change reaches it now. Both end in the same derived reading.
	server.documents["pipeline"] = boardOf(
		NODES.map((node) => (node.id === "l" || node.id === "w" ? { ...node, groups: [] } : node)),
	);
	await act(async () => {
		announceSemanticBoardChange("pipeline", 3);
	});
	await settled();
	expect(chooser().value).toBe("billing");
	expect(slot("semantic-group-status")?.getAttribute("data-members")).toBe("0");
	expect(slot("semantic-group-status")?.textContent).toContain("No member");
	expect(slot("semantic-group-clear")).not.toBeNull();
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
	await choose("fulfillment");
	expect(chooser().value).toBe("fulfillment");

	// Another way of reading the same state: the group stays.
	server.reply = { status: 200, body: { ...picture(["l", "e4"]), views: [view], view } };
	await act(async () => {
		fireEvent.click(
			[...document.querySelectorAll<HTMLElement>("[data-slot='semantic-view-choice']")].at(-1)!,
		);
	});
	await settled();
	expect(chooser().value).toBe("fulfillment");

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
	expect(chooser().value).toBe("");
	expect(slot("semantic-board-surface")?.classList.contains("is-group-focus")).toBe(false);

	// Returning is another navigation, not permission to restore the old choice.
	server.reply = { status: 200, body: { ...picture(), views: [view] } };
	chooseVariantInShell(undefined);
	await settled();
	expect(chooser().value).toBe("");
	// The group is let go; what recedes now is whatever the step is not about.
	expect(slot("semantic-board-stage")?.hasAttribute("data-group")).toBe(false);
});

test("inspecting a group leaves a walkthrough, and opening a walkthrough lets the group go", async () => {
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
	mountStage();
	await settled();
	await act(async () => {
		fireEvent.click(walkthrough());
	});
	await settled();
	expect(slot("semantic-presentation")).not.toBeNull();

	await choose("fulfillment");
	expect(slot("semantic-presentation")).toBeNull();
	expect(chooser().value).toBe("fulfillment");

	await act(async () => {
		fireEvent.click(walkthrough());
	});
	await settled();
	expect(slot("semantic-presentation")).not.toBeNull();
	expect(chooser().value).toBe("");
	// The group is let go; what recedes now is whatever the step is not about.
	expect(slot("semantic-board-stage")?.hasAttribute("data-group")).toBe(false);
});

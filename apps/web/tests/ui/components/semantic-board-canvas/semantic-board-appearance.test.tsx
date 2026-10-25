import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import { HEAD_LENGTH } from "@archboard/renderer/picture";
import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import { pressKey } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import { sidebarSettled } from "#tests/ui/support/semantic-board-canvas/sidebar-probes.ts";
import {
	PANE_VAULT,
	drawing,
	mountStage,
	openSidebarTab,
	part,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";

/**
 * A picture whose node reports its independently applied visual channels.
 * @param color The body's color, from its group.
 * @returns A render answer at the same board version.
 */
function styledDrawing(color: string): Record<string, unknown> {
	const drawn = drawing(1);
	return {
		...drawn,
		svg: String(drawn["svg"]).replace(
			'data-semantic-kind="node" data-semantic-id="n1"',
			`data-semantic-kind="node" data-semantic-id="n1" data-depiction="card" data-type-name="API" data-type-color="violet" data-body-color="${color}" data-group="core"`,
		),
	};
}

/** A readable architecture whose applied appearance the legend explains. */
const BOARD = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "b1",
	name: "pipeline",
	level: "service",
	version: 1,
	createdAt: "2026-09-13T00:00:00.000Z",
	updatedAt: "2026-09-13T00:00:00.000Z",
	views: [],
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "host", name: "Kubernetes", kind: "cluster" },
					{ id: "n1", name: "API", kind: "api", parent: "host" },
				],
				edges: [],
			},
		},
	],
};

test("the legend explains the picture and survives a policy-only restyle", async () => {
	server.reply = { status: 200, body: styledDrawing("green") };
	server.documents["pipeline"] = BOARD;
	mountStage("n1");
	await settle();
	await settle();
	openSidebarTab("board");
	expect(part("semantic-legend").textContent).toContain("API");
	pressKey("ArrowLeft");
	act(() => {
		fireEvent.click(part("semantic-sidebar-toggle"));
	});
	await sidebarSettled();
	const camera = surface().style.transform;
	expect(document.querySelector('[data-slot="semantic-legend"]')).toBeNull();

	server.reply = { status: 200, body: styledDrawing("blue") };
	act(() => announceSemanticBoardChange(PANE_VAULT, "pipeline", 2));
	await settle();
	expect(surface().style.transform).toBe(camera);
	expect(
		surface().querySelector('[data-semantic-id="n1"]')?.classList.contains("is-selected"),
	).toBe(true);
	// The person hid the sidebar; a restyle does not show it again.
	expect(document.querySelector('[data-slot="semantic-legend"]')).toBeNull();
	act(() => {
		fireEvent.click(part("semantic-sidebar-toggle"));
	});
	expect(part("semantic-legend").textContent).toContain("API");
});

test("traffic changes are explained without animation numbers", async () => {
	const nodes = [
		{ id: "n1", name: "API", kind: "api" },
		{ id: "n2", name: "Queue", kind: "queue" },
	];
	const edge = { id: "e1", from: "n1", to: "n2", kind: "event", traffic: { speed: 47, volume: 3 } };
	server.documents["pipeline"] = {
		...BOARD,
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes, edges: [edge] } },
			{
				id: "v2",
				name: "more traffic",
				lifecycle: "draft",
				parent: "v1",
				content: { nodes, edges: [{ ...edge, traffic: { speed: 83, volume: 7 } }] },
			},
		],
	};
	const drawn = drawing(1);
	server.reply = {
		status: 200,
		body: { ...drawn, variant: { id: "v2", name: "more traffic", lifecycle: "draft" } },
	};
	mountStage("e1", { variant: "v2" });
	await settle();
	await settle();
	const text = part("semantic-inspector").textContent;
	expect(text).toContain("Illustrated traffic changed");
	expect(text).not.toContain("47");
	expect(text).not.toContain("83");
});

/**
 * A picture of four cards of three kinds and two relationships of two kinds,
 * one with a filled head and one with an open head.
 * @returns A render answer at the same board version.
 */
function keyedDrawing(): Record<string, unknown> {
	const nodes = [
		{ id: "n1", kind: "public-api", color: "violet" },
		{ id: "n2", kind: "private-api", color: "blue" },
		{ id: "n3", kind: "public-api", color: "violet" },
		{ id: "n4", kind: "another-api", color: "violet" },
	]
		.map(
			(node) =>
				`<g data-semantic-id="${node.id}" data-type-kind="${node.kind}" data-type-name="API" data-depiction="card" data-type-color="${node.color}"/>`,
		)
		.join("");
	const edges = [
		{ id: "e1", kind: "request", dash: "solid", head: "filled" },
		{ id: "e2", kind: "response", dash: "dashed", head: "open" },
	]
		.map(
			(edge) =>
				`<g data-semantic-id="${edge.id}" data-type-kind="${edge.kind}" data-type-name="Message" data-line-dash="${edge.dash}" data-arrowhead="${edge.head}"/>`,
		)
		.join("");
	return { ...drawing(1), svg: `<svg xmlns="http://www.w3.org/2000/svg">${nodes}${edges}</svg>` };
}

test("legend preserves kinds with shared display names and consolidates repeated samples", async () => {
	server.reply = { status: 200, body: keyedDrawing() };
	mountStage();
	await settle();
	const labels = [...part("semantic-legend").querySelectorAll("li")].map(
		(item) => item.textContent,
	);
	expect(labels.filter((label) => label === "API")).toHaveLength(3);
	expect(labels.filter((label) => label === "Message")).toHaveLength(2);
});

test("the legend draws each arrowhead as large as the picture draws the head of a plain line", async () => {
	server.reply = { status: 200, body: keyedDrawing() };
	mountStage();
	await settle();
	// A line sample draws its head as a square of its own inside the sample.
	const heads = [...part("semantic-legend").querySelectorAll("svg > svg")];
	expect(heads).toHaveLength(2);
	for (const head of heads) {
		expect(Number(head.getAttribute("width"))).toBe(HEAD_LENGTH);
		expect(Number(head.getAttribute("height"))).toBe(HEAD_LENGTH);
	}
});

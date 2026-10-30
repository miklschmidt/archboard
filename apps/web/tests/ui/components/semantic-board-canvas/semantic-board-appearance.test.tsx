import { act, fireEvent } from "@testing-library/react";
import { expect, test } from "bun:test";

import type { AppliedAppearance } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
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
 * How a picture drew one subject, as the renderer core answers it.
 * @param id The subject.
 * @param typeKind Its kind's key.
 * @param typeName What its kind is called.
 * @param look How it was drawn: a part's depiction and colour, or a line's colour, dash and head.
 * @returns The appearance.
 */
function applied(
	id: string,
	typeKind: string,
	typeName: string,
	look: Partial<AppliedAppearance>,
): AppliedAppearance {
	return {
		id,
		typeKind,
		typeName,
		iconSvg: "",
		depiction: "",
		typeColor: "",
		lineColor: "",
		dash: "",
		arrowhead: "",
		...look,
	};
}

/**
 * A render answer whose picture draws subjects with these appearances, and
 * whose key lists these samples.
 * @param appearances What the picture draws, in drawing order.
 * @param key The kinds and relationship kinds its key lists.
 * @param key.kinds The part kinds.
 * @param key.relationships The relationship kinds.
 * @returns A render answer at the same board version.
 */
function keyed(
	appearances: AppliedAppearance[],
	key: { kinds: AppliedAppearance[]; relationships: AppliedAppearance[] },
): Record<string, unknown> {
	return { ...drawing(1), appearances, key };
}

/**
 * A picture whose node is drawn as an API card.
 * @param color The kind's colour.
 * @returns A render answer at the same board version.
 */
function styledDrawing(color: string): Record<string, unknown> {
	const api = applied("n1", "api", "API", { depiction: "card", typeColor: color });
	return keyed([api], { kinds: [api], relationships: [] });
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
 * A picture whose key lists three part kinds that share one name and two
 * relationship kinds that share another, one line with a filled head and one
 * with an open head.
 * @returns A render answer at the same board version.
 */
function keyedDrawing(): Record<string, unknown> {
	const kinds = [
		applied("n1", "public-api", "API", { depiction: "card", typeColor: "violet" }),
		applied("n2", "private-api", "API", { depiction: "card", typeColor: "blue" }),
		applied("n4", "another-api", "API", { depiction: "card", typeColor: "violet" }),
	];
	const relationships = [
		applied("e1", "request", "Message", { dash: "solid", arrowhead: "filled" }),
		applied("e2", "response", "Message", { dash: "dashed", arrowhead: "open" }),
	];
	return keyed([...kinds, ...relationships], { kinds, relationships });
}

test("the legend lists each sample the key lists, kinds that share a name apart", async () => {
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

// Presenting a step about part of a flow. A flow's subjects are whole columns
// and rows: a fit to some of its columns cut the others through their words,
// and a fit to whole columns shrank a tall flow past reading. So the camera
// shows the step's rows from the top of the room across the flow's whole width
// when that costs little, and the flow's head of cards moves down over them.

import { expect, test } from "bun:test";

import { FIT_MARGIN } from "@archboard/renderer/shell-geometry";
import {
	drawing,
	mountStage,
	server,
	settle,
	surface,
} from "#tests/ui/support/semantic-board-canvas/stage-harness.tsx";
import { cameraNow } from "#tests/ui/support/semantic-board-canvas/camera-probes.ts";
import {
	goTo,
	presenting,
	press,
} from "#tests/ui/support/semantic-board-canvas/presentation-probes.ts";

/** The flow's four participants. */
const PARTICIPANTS = ["p1", "p2", "p3", "p4"];

/** Where the picture draws each message, as tall as the flow is. */
interface Rows {
	/** Each message's row. */
	readonly steps: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
	/** How tall each participant's column is, card and lifeline. */
	readonly column: number;
}

/** A short flow: one message under the head. */
const SHORT: Rows = { steps: { s1: { x: 50, y: 120, width: 100, height: 24 } }, column: 260 };

/** A short flow: the step's message last of three. */
const SHORT_OF_THREE: Rows = {
	steps: {
		s1: { x: 50, y: 120, width: 100, height: 24 },
		s2: { x: 250, y: 180, width: 100, height: 24 },
		s3: { x: 50, y: 240, width: 300, height: 24 },
	},
	column: 300,
};

/** A tall flow: the step's message far down, the row just before it, and a first and a last one. */
const TALL: Rows = {
	steps: {
		s1: { x: 50, y: 120, width: 100, height: 24 },
		s4: { x: 150, y: 840, width: 100, height: 24 },
		s2: { x: 250, y: 900, width: 100, height: 24 },
		s3: { x: 50, y: 1400, width: 300, height: 24 },
	},
	column: 1500,
};

/**
 * The board: one flow of four participants, and a walkthrough about one of
 * its messages and then about the whole flow.
 * @param message The message the first step names.
 * @returns The board document, as its route answers with it.
 */
function board(message: string): Record<string, unknown> {
	const content = {
		nodes: PARTICIPANTS.map((id) => ({ id, name: id, kind: "service" })),
		edges: [],
		flows: [
			{
				id: "f1",
				name: "Reserve",
				participants: PARTICIPANTS,
				steps: [
					{ id: "s1", from: "p1", to: "p2", label: "reserve the items", kind: "sync" },
					{ id: "s2", from: "p3", to: "p4", label: "charge the card", kind: "sync" },
					{ id: "s3", from: "p1", to: "p4", label: "send the receipt", kind: "async" },
					{ id: "s4", from: "p2", to: "p3", label: "hold the stock", kind: "sync" },
				],
			},
		],
		walkthroughs: [
			{
				id: "w1",
				name: "One exchange",
				beats: [
					{ id: "b1", heading: "The call", body: "What it asks.", subjects: [message] },
					{ id: "b2", heading: "The exchange", body: "All of it.", subjects: ["f1"] },
				],
			},
		],
	};
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "bd",
		name: "pipeline",
		level: "system",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [{ id: "v1", name: "as it is", lifecycle: "current", content }],
	};
}

/**
 * The flow drawn with its frame as wide as asked: each participant a column
 * under a card in the flow's head, and each message a row.
 * @param frameWidth How wide the frame is drawn.
 * @param rows Where the messages are, and how tall the columns.
 * @returns The render answer.
 */
function picture(frameWidth: number, rows: Rows): Record<string, unknown> {
	const cards = PARTICIPANTS.map(
		(id) => `<g data-semantic-kind="node" data-semantic-id="${id}"></g>`,
	);
	const groups = [
		`<g data-flow-head="f1">${cards.join("")}</g>`,
		...Object.keys(rows.steps).map(
			(id) => `<g data-semantic-kind="step" data-semantic-id="${id}"></g>`,
		),
		'<g data-semantic-kind="flow" data-semantic-id="f1"></g>',
	];
	return {
		...drawing(1),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${groups.join("")}</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		appearances: [],
		key: null,
		atlas: {
			nodes: Object.fromEntries(
				PARTICIPANTS.map((id, index) => [
					id,
					{ x: 10 + index * 100, y: 30, width: 80, height: rows.column },
				]),
			),
			edges: rows.steps,
			regions: { f1: { x: 0, y: 0, width: frameWidth, height: rows.column + 60 } },
		},
	};
}

/**
 * Present the first step over a flow drawn this wide.
 * @param frameWidth How wide the frame is drawn.
 * @param rows Where the messages are.
 * @param message The message the first step names.
 */
async function presentingFlow(frameWidth: number, rows: Rows, message: string): Promise<void> {
	server.documents["pipeline"] = board(message);
	server.reply = { status: 200, body: picture(frameWidth, rows) };
	mountStage(null, { reducedMotion: true });
	await presenting();
}

/**
 * The flow's head of cards, as the page has it.
 * @returns Its group.
 */
function head(): SVGElement {
	return surface().querySelector<SVGElement>("[data-flow-head='f1']")!;
}

test("a step about part of a flow shows the flow's whole width when that costs little", async () => {
	// Four columns in a frame that fits nearly as large as the two the message joins.
	await presentingFlow(400, SHORT, "s1");
	const camera = cameraNow();
	// The middle of the pane is the middle of the frame, not of the two columns.
	expect((400 - camera.x) / camera.scale).toBeCloseTo(200, 3);
});

test("a step about part of a flow far wider than the pane frames its own subjects", async () => {
	await presentingFlow(1200, SHORT, "s1");
	const message = cameraNow();
	goTo(1);
	await settle();
	expect(message.scale).toBeGreaterThan(cameraNow().scale);
});

test("a step about the last message of a short flow brings it up under the flow's head too", async () => {
	// The whole flow would fit, but the rows above the one before the message are
	// room it could be read in.
	await presentingFlow(400, SHORT_OF_THREE, "s3");
	const camera = cameraNow();
	const drop = 180 - 120;
	expect(head().style.transform).toBe(`translate(0px, ${drop}px)`);
	expect(camera.y + (30 + drop) * camera.scale).toBeCloseTo(FIT_MARGIN, 3);
});

test("a step about a message far down a tall flow reads it from the top of the room, under the flow's head", async () => {
	await presentingFlow(400, TALL, "s2");
	const camera = cameraNow();
	// The head moves down as far as the row before the message is below the
	// flow's first one, and stands at the top of the room, over that row and the
	// message at the size they read.
	const drop = 840 - 120;
	expect(head().style.transform).toBe(`translate(0px, ${drop}px)`);
	expect(head().classList.contains("is-stuck")).toBe(true);
	expect(camera.y + (30 + drop) * camera.scale).toBeCloseTo(FIT_MARGIN, 3);
	expect(camera.scale).toBeGreaterThanOrEqual(1);
	// Leaving gives the head back where the picture drew it.
	press("Escape");
	await settle();
	expect(head().style.transform).toBe("");
	expect(head().classList.contains("is-stuck")).toBe(false);
});

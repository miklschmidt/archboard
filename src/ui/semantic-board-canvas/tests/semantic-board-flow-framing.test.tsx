// Presenting a step about part of a flow. A flow's subjects are whole columns
// and rows, so a fit to some of them cut the columns either side through their
// words; the camera shows the whole flow instead when that costs little.

import { expect, test } from "bun:test";

import {
	drawing,
	mountStage,
	server,
	settle,
} from "@/ui/semantic-board-canvas/tests/stage-harness";
import { cameraNow, type ReadCamera } from "@/ui/semantic-board-canvas/tests/camera-probes";
import { goTo, presenting } from "@/ui/semantic-board-canvas/tests/presentation-probes";

/** The flow's four participants. */
const PARTICIPANTS = ["p1", "p2", "p3", "p4"];

/** A flow with one message between its first two participants, and a walkthrough about it. */
const CONTENT = {
	nodes: PARTICIPANTS.map((id) => ({ id, name: id, kind: "service" })),
	edges: [],
	flows: [
		{
			id: "f1",
			name: "Reserve",
			participants: PARTICIPANTS,
			steps: [{ id: "s1", from: "p1", to: "p2", label: "reserve the items", kind: "sync" }],
		},
	],
	walkthroughs: [
		{
			id: "w1",
			name: "One exchange",
			beats: [
				{ id: "b1", heading: "The call", body: "What it asks.", subjects: ["s1"] },
				{ id: "b2", heading: "The exchange", body: "All of it.", subjects: ["f1"] },
			],
		},
	],
};

/** The board document, as its route answers with it. */
const BOARD = {
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
	variants: [{ id: "v1", name: "as it is", lifecycle: "current", content: CONTENT }],
};

/**
 * The flow drawn with its frame as wide as asked: each participant a column,
 * the message a row between the first two.
 * @param frameWidth How wide the frame is drawn.
 * @returns The render answer.
 */
function picture(frameWidth: number): Record<string, unknown> {
	const groups = [
		...PARTICIPANTS.map((id) => `<g data-semantic-kind="node" data-semantic-id="${id}"></g>`),
		'<g data-semantic-kind="step" data-semantic-id="s1"></g>',
		'<g data-semantic-kind="flow" data-semantic-id="f1"></g>',
	];
	return {
		...drawing(1),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${groups.join("")}</svg>`,
		atlas: {
			nodes: Object.fromEntries(
				PARTICIPANTS.map((id, index) => [
					id,
					{ x: 10 + index * 100, y: 30, width: 80, height: 260 },
				]),
			),
			edges: { s1: { x: 50, y: 120, width: 100, height: 24 } },
			regions: { f1: { x: 0, y: 0, width: frameWidth, height: 300 } },
		},
	};
}

/**
 * Present the walkthrough over a flow drawn this wide, and read where the
 * camera goes for the message and then for the whole flow.
 * @param frameWidth How wide the frame is drawn.
 * @returns The two cameras.
 */
async function cameras(frameWidth: number): Promise<[ReadCamera, ReadCamera]> {
	server.documents["pipeline"] = BOARD;
	server.reply = { status: 200, body: picture(frameWidth) };
	mountStage(null, { reducedMotion: true });
	await presenting();
	const message = cameraNow();
	goTo(1);
	await settle();
	return [message, cameraNow()];
}

test("a step about part of a flow shows the whole flow when that costs little", async () => {
	// Four columns in a frame that fits nearly as large as the two the message joins.
	const [message, flow] = await cameras(400);
	expect(message.x).toBeCloseTo(flow.x, 3);
	expect(message.y).toBeCloseTo(flow.y, 3);
	expect(message.scale).toBeCloseTo(flow.scale, 5);
});

test("a step about part of a flow far wider than the pane frames its own subjects", async () => {
	const [message, flow] = await cameras(1200);
	expect(message.scale).toBeGreaterThan(flow.scale);
});

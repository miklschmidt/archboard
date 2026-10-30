// What the fake server answers a stage's requests with: one drawn board, the
// three ways a board can be there without a picture, and a board document that
// explains itself twice. The stage harness serves them.

/**
 * One drawn board, with a card and an edge the atlas knows about and one group
 * it does not, so that "the atlas decides what is a subject" is observable.
 * Every subject carries the ring the renderer draws outside it — invisible
 * until a viewer lights it — because lighting it is how the pane says what is
 * selected, what a beat is about, and what is in dispute.
 * @param version The board version this drawing is of.
 * @param board Which board it is of; the pane's own by default.
 * @returns The render route's success body.
 */
function drawing(version: number, board = "pipeline"): Record<string, unknown> {
	return {
		success: true,
		board,
		version,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 400,
		height: 300,
		svg:
			`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">` +
			`<g data-semantic-kind="node" data-semantic-id="n1">` +
			`<path class="ab-halo" id="card-halo"></path><rect id="card" width="80" height="40"></rect></g>` +
			`<g data-semantic-kind="edge" data-semantic-id="e1">` +
			`<path class="ab-halo" id="wire-halo"></path><path id="wire" d="M0 0 L10 10"></path></g>` +
			`<g data-semantic-kind="node" data-semantic-id="ghost"><rect id="stray"></rect></g>` +
			`</svg>`,
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
		appearances: [],
		key: null,
		atlas: {
			nodes: { n1: { x: 0, y: 0, width: 80, height: 40 } },
			edges: { e1: { x: 80, y: 20, width: 40, height: 2 } },
			regions: {},
		},
	};
}

/** A board that is there with nothing on it. */
const NOTHING_DRAWN = {
	status: 200,
	body: {
		success: true,
		board: "pipeline",
		version: 3,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		empty: "NOTHING_TO_RENDER",
	},
} as const;

/** The vault has no such board. */
const NO_SUCH_BOARD = {
	status: 404,
	body: {
		success: false,
		code: "BOARD_MISSING",
		error: 'there is no semantic board called "pipeline"',
	},
} as const;

/** The board was there and has stopped being readable. */
const UNREADABLE = {
	status: 422,
	body: { success: false, code: "BOARD_UNREADABLE", error: "the board file is not valid JSON" },
} as const;

/**
 * A walkthrough of one step. Ids are one to eight characters, and a step's is its walkthrough's with a digit.
 * @param id Its id.
 * @param name Its name.
 * @returns The walkthrough.
 */
function walkthrough(id: string, name: string): Record<string, unknown> {
	return {
		id,
		name,
		beats: [{ id: `${id}1`, heading: "First", body: "The first step.", subjects: [] }],
	};
}

/** A board that explains itself twice. */
const EXPLAINED_BOARD = {
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
	variants: [
		{
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [{ id: "n1", name: "API", kind: "module" }],
				edges: [],
				walkthroughs: [walkthrough("tour", "The tour"), walkthrough("deploy", "Deploying")],
			},
		},
	],
};

export { EXPLAINED_BOARD, NOTHING_DRAWN, NO_SUCH_BOARD, UNREADABLE, drawing };

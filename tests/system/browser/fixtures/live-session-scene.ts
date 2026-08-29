import type { LegacyElementIngress } from "../../../../src/shared/board-elements/index.ts";

export const LIVE_SESSION_BOARD = "session";
export const LIVE_SESSION_CYCLES = 42;

export const LIVE_SESSION_SEED = [
	{
		id: "auth",
		type: "rectangle",
		x: 100,
		y: 100,
		width: 220,
		height: 90,
		label: { text: "AuthService" },
	},
	{
		id: "queue",
		type: "rectangle",
		x: 500,
		y: 100,
		width: 200,
		height: 90,
		label: { text: "Queue" },
	},
	{
		id: "store",
		type: "ellipse",
		x: 300,
		y: 320,
		width: 200,
		height: 100,
		label: { text: "Postgres" },
	},
	{
		id: "e1",
		type: "arrow",
		x: 320,
		y: 145,
		points: [
			[0, 0],
			[180, 0],
		],
		start: { id: "auth" },
		end: { id: "queue" },
	},
	{
		id: "note",
		type: "text",
		x: 100,
		y: 480,
		text: "drawn by the agent",
	},
] as const satisfies readonly LegacyElementIngress[];

export const LIVE_AGENT_MOVES = [
	"create-labelled",
	"create-arrow",
	"move",
	"recolour",
	"relabel",
] as const;

export const LIVE_HUMAN_MOVES = ["move", "resize", "retype", "delete"] as const;

export const LIVE_SUBJECTS = ["auth", "queue", "store"] as const;

export const LIVE_PALETTE = [
	"#ffec99",
	"#b2f2bb",
	"#a5d8ff",
	"#ffc9c9",
	"#d0bfff",
	"#ffd8a8",
] as const;

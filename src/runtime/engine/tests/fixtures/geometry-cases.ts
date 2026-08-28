import type { Bindable, Point } from "../../arrow-binding.ts";
import type { Measurable } from "../../geometry.ts";
import type { ServerElement } from "../../types.ts";

export const directionalArrows = {
	"right and down": {
		type: "arrow",
		x: 200,
		y: 300,
		points: [
			[0, 0],
			[300, 200],
		],
	},
	"left and down": {
		type: "arrow",
		x: 500,
		y: 300,
		points: [
			[0, 0],
			[-300, 200],
		],
	},
	"right and up": {
		type: "arrow",
		x: 200,
		y: 500,
		points: [
			[0, 0],
			[300, -200],
		],
	},
	"left and up": {
		type: "arrow",
		x: 500,
		y: 500,
		points: [
			[0, 0],
			[-300, -200],
		],
	},
} satisfies Record<string, Measurable & { type: "arrow" }>;

export const capturedFocusedNode = {
	type: "rectangle",
	x: 1066.8104451025551,
	y: 1060.7409025475235,
	width: 200,
	height: 100,
	angle: 0,
	roundness: { type: 3 },
} satisfies Bindable;

export const capturedArrowStart = { x: 1400, y: 1120 } satisfies Point;
export const capturedBrowserEndpoint = {
	x: 1279.2940245092134,
	y: 1150.128871410794,
} satisfies Point;
export const pinnedSolverEndpoint = {
	x: 1279.2940245092384,
	y: 1150.1288714106531,
} satisfies Point;

export const geometryConsumerScene: ServerElement[] = [
	{
		id: "hub",
		type: "rectangle",
		x: 2400,
		y: 1800,
		width: 200,
		height: 100,
		customData: { archboard: { kind: "service", name: "Hub", node: "hub" } },
	},
	{
		id: "west",
		type: "rectangle",
		x: 200,
		y: 1200,
		width: 200,
		height: 100,
		customData: { archboard: { kind: "service", name: "West", node: "west" } },
	},
	{
		id: "north",
		type: "rectangle",
		x: 1600,
		y: 200,
		width: 200,
		height: 100,
		customData: { archboard: { kind: "service", name: "North", node: "north" } },
	},
	{
		id: "northwest",
		type: "rectangle",
		x: 200,
		y: 200,
		width: 200,
		height: 100,
		customData: { archboard: { kind: "service", name: "Northwest", node: "northwest" } },
	},
	{
		id: "to-west",
		type: "arrow",
		x: 2396.531632624848,
		y: 1820.3814881231724,
		width: 900,
		height: 400,
		points: [
			[0, 0],
			[-900, -400],
		],
	},
	{
		id: "to-north",
		type: "arrow",
		x: 2473.172956748984,
		y: 1798.1567389174115,
		width: 773.172956748984,
		height: 1496.3134778348233,
		points: [
			[0, 0],
			[-773.172956748984, -1496.3134778348233],
		],
	},
	{
		id: "to-northwest",
		type: "arrow",
		x: 2428.7607866469266,
		y: 1798.1567389174115,
		width: 2056.180221131303,
		height: 1496.3134778348233,
		points: [
			[0, 0],
			[-2056.180221131303, -1496.3134778348233],
		],
	},
	{
		id: "stray",
		type: "arrow",
		x: 200,
		y: 200,
		width: 400,
		height: 300,
		points: [
			[0, 0],
			[-400, -300],
		],
	},
];

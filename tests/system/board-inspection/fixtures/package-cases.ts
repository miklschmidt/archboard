export type PackageElement = Record<string, unknown>;

export const connector = (overrides: PackageElement = {}): PackageElement => ({
	id: "edge",
	type: "arrow",
	x: 0,
	y: 0,
	width: 100,
	height: 0,
	angle: 0,
	points: [
		[0, 0],
		[100, 0],
	],
	...overrides,
});

const labelContainer = (overrides: PackageElement = {}): PackageElement => ({
	id: "svc",
	type: "rectangle",
	x: 0,
	y: 0,
	width: 200,
	height: 80,
	angle: 0,
	boundElements: [{ id: "svc-label", type: "text" }],
	...overrides,
});

const boundLabel = (overrides: PackageElement = {}): PackageElement => ({
	id: "svc-label",
	type: "text",
	containerId: "svc",
	x: 50,
	y: 27,
	width: 100,
	height: 26,
	fontFamily: 5,
	text: "AuthService",
	...overrides,
});

export const cleanScene = (): PackageElement[] => [
	{ id: "clean", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
];
export const warningScene = (): PackageElement[] => [
	{
		id: "font",
		type: "text",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		fontFamily: 1,
		text: "warning",
	},
];
export const errorScene = (): PackageElement[] => [
	connector({
		width: 11,
		points: [
			[0, 0],
			[10, 0],
		],
	}),
];
export const indeterminateScene = (): PackageElement[] => [connector({ angle: 1 })];
export const malformedScene = (): PackageElement[] => [
	{ type: "arrow", x: 0, y: 0, width: null, height: 0, points: null },
];

export const duplicateLabelScene = (): PackageElement[] => [
	labelContainer({ id: "owner", boundElements: [] }),
	boundLabel({
		id: "new",
		containerId: "owner",
		createdAt: "2026-08-27T02:00:00Z",
	}),
	boundLabel({
		id: "old",
		containerId: "owner",
		createdAt: "2026-08-27T01:00:00Z",
	}),
];

export const unmarkedBridgeScene = (): PackageElement[] => [
	connector({ id: "over", type: "line", y: 50, index: "a0" }),
	connector({
		id: "under",
		x: 50,
		width: 0,
		height: 100,
		points: [
			[0, 0],
			[0, 100],
		],
		index: "a1",
	}),
];

export const groupApplicabilityScene = (mode: "identity" | "coverage"): PackageElement[] => [
	{
		...(mode === "coverage" ? { id: "group-coverage" } : {}),
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: mode === "coverage" ? 0.5 : 0,
		groupIds: Array.from({ length: 1_000 }, (_, index) => (index === 0 ? "g" : null)),
	},
];

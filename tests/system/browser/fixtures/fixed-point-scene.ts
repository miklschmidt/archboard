import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

type RequiredPosition = "type" | "x" | "y";
type PartialVendorElement = ExcalidrawElement extends infer Element
	? Element extends ExcalidrawElement
		? Pick<Element, RequiredPosition> & Partial<Omit<Element, RequiredPosition>>
		: never
	: never;
type AuthoredVendorElement = PartialVendorElement extends infer Element
	? Element extends PartialVendorElement
		? Omit<Element, "startBinding" | "endBinding" | "fileId">
		: never
	: never;
type AuthoredBinding = {
	elementId: string;
	focus: number;
	gap: number;
	fixedPoint?: readonly [number, number] | null;
};

/** Archboard's input-only spellings, consumed at the write boundary. */
export type AuthoredElementInput = AuthoredVendorElement & {
	label?: { text: string };
	start?: { id: string };
	end?: { id: string };
	startBinding?: AuthoredBinding | null;
	endBinding?: AuthoredBinding | null;
	fileId?: BinaryFileData["id"];
};

export const fixedPointElements = [
	{
		id: "rect1",
		type: "rectangle",
		x: 100,
		y: 100,
		width: 220,
		height: 90,
		label: { text: "AuthService" },
	},
	{
		id: "ell1",
		type: "ellipse",
		x: 420,
		y: 100,
		width: 160,
		height: 90,
		label: { text: "Queue" },
	},
	{
		id: "dia1",
		type: "diamond",
		x: 680,
		y: 100,
		width: 160,
		height: 90,
		label: { text: "Gate" },
	},
	{ id: "human-node", type: "rectangle", x: 1000, y: 1000, width: 200, height: 100 },
	{
		id: "text1",
		type: "text",
		x: 100,
		y: 260,
		width: 240,
		height: 25,
		text: "a standalone caption",
	},
	{
		id: "line1",
		type: "line",
		x: 100,
		y: 340,
		points: [
			[0, 0],
			[200, 0],
			[200, 80],
		],
	},
	{
		id: "draw1",
		type: "freedraw",
		x: 420,
		y: 340,
		points: [
			[0, 0],
			[40, 30],
			[90, 10],
			[120, 60],
		],
	},
	{
		id: "arr1",
		type: "arrow",
		x: 330,
		y: 145,
		points: [
			[0, 0],
			[84, 0],
		],
		start: { id: "rect1" },
		end: { id: "ell1" },
	},
	{
		id: "arr2",
		type: "arrow",
		x: 590,
		y: 145,
		points: [
			[0, 0],
			[84, 0],
		],
		start: { id: "ell1" },
		end: { id: "dia1" },
		label: { text: "gRPC" },
	},
	{
		id: "negative-path",
		type: "arrow",
		x: 900,
		y: 420,
		points: [
			[0, 0],
			[-120, -90],
		],
	},
	{
		id: "bridge-under",
		type: "line",
		x: 200,
		y: 300,
		points: [
			[0, 0],
			[0, 80],
		],
	},
] as const satisfies readonly AuthoredElementInput[];

export const humanArrowInput = {
	id: "human-arrow",
	type: "arrow",
	x: 1400,
	y: 1120,
	width: 179,
	height: 50,
	points: [
		[0, 0],
		[-179, -50],
	],
	startBinding: null,
	endBinding: { elementId: "human-node", focus: 0.9, gap: 15, fixedPoint: null },
} as const satisfies AuthoredElementInput;

export const legacyTextInput = {
	id: "helv",
	type: "text",
	x: 120,
	y: 140,
	width: 180,
	height: 25,
	text: "legacy Helvetica",
	fontFamily: 2,
	autoResize: true,
} as const satisfies AuthoredElementInput;

export const findingElements = [
	{
		id: "fover",
		type: "line",
		x: 100,
		y: 100,
		points: [
			[0, 0],
			[200, 0],
		],
	},
	{
		id: "funder",
		type: "line",
		x: 200,
		y: 40,
		points: [
			[0, 0],
			[0, 120],
		],
	},
	{
		id: "unmark",
		type: "line",
		x: 250,
		y: 40,
		points: [
			[0, 0],
			[0, 120],
		],
	},
	{
		id: "farimg",
		type: "image",
		x: 800,
		y: 800,
		width: 64,
		height: 64,
		fileId: "finding-pixel" as BinaryFileData["id"],
	},
	{
		id: "nearimg",
		type: "image",
		x: 236,
		y: 86,
		width: 6,
		height: 6,
		fileId: "finding-pixel" as BinaryFileData["id"],
	},
	{
		id: "redback",
		type: "rectangle",
		x: 238,
		y: 102,
		width: 16,
		height: 10,
		strokeColor: "#ff0000",
		backgroundColor: "#ff0000",
		fillStyle: "solid",
		roughness: 0,
	},
	{
		id: "greentop",
		type: "rectangle",
		x: 246,
		y: 102,
		width: 8,
		height: 8,
		strokeColor: "#00ff00",
		backgroundColor: "#00ff00",
		fillStyle: "solid",
		roughness: 0,
	},
	{
		id: "clipout",
		type: "rectangle",
		x: 267,
		y: 108,
		width: 8,
		height: 8,
		strokeColor: "#ff00ff",
		backgroundColor: "#ff00ff",
		fillStyle: "solid",
		roughness: 0,
	},
] as const satisfies readonly AuthoredElementInput[];

export const findingFile = {
	id: "finding-pixel" as BinaryFileData["id"],
	mimeType: "image/svg+xml",
	dataURL: `data:image/svg+xml;base64,${Buffer.from(
		'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#0000ff"/></svg>',
	).toString("base64")}` as BinaryFileData["dataURL"],
} satisfies Pick<BinaryFileData, "id" | "mimeType" | "dataURL">;

export const activityLines = [
	"marking the unverified regional database boundary",
	"shortening labels and removing arrow crossings",
	"fitting dense labels inside their boxes",
	"replacing the four stale bound labels with current names",
	"recentering the shortened bound labels",
] as const;

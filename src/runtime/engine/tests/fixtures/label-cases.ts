import { z } from "zod";

import type { LabelledElement } from "../../labels.ts";
import type { LegacyElementIngress } from "../../../../shared/board-elements/index.ts";

export const ExpandedElementSchema = z.looseObject({
	id: z.string(),
	type: z.enum(["rectangle", "ellipse", "diamond", "arrow", "text", "line", "freedraw", "image"]),
	x: z.number(),
	y: z.number(),
	width: z.number().optional(),
	height: z.number().optional(),
	text: z.string().optional(),
	fontFamily: z.number().optional(),
	fontSize: z.number().optional(),
	textAlign: z.string().optional(),
	verticalAlign: z.string().optional(),
	strokeWidth: z.number().optional(),
	strokeColor: z.string().optional(),
	roundness: z.object({ type: z.number() }).nullable().optional(),
	elbowed: z.boolean().optional(),
	lastCommittedPoint: z.unknown().optional(),
	pressures: z.array(z.number()).optional(),
	simulatePressure: z.boolean().optional(),
	points: z.array(z.tuple([z.number(), z.number()])).optional(),
	index: z.string().nullable().optional(),
	containerId: z.string().nullable().optional(),
});

export type ExpandedElement = z.infer<typeof ExpandedElementSchema>;

export type LabelElement = LabelledElement & Record<string, unknown>;
export type PlacedLabelElement = LabelElement & {
	x: number;
	y: number;
	width: number;
	height: number;
};

export const CYCLE_COUNT = 25;

export function drawnLabels(): LegacyElementIngress[] {
	return [
		{
			id: "svc",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 200,
			height: 80,
			label: { text: "AuthService" },
		},
		{
			id: "gw",
			type: "rectangle",
			x: 400,
			y: 0,
			width: 200,
			height: 80,
			label: { text: "Gateway" },
		},
		{
			id: "wire",
			type: "arrow",
			x: 200,
			y: 40,
			width: 200,
			height: 0,
			points: [
				[0, 0],
				[200, 0],
			],
			start: { id: "svc" },
			end: { id: "gw" },
			label: { text: "HTTP" },
		},
	];
}

export function placedLabels(): PlacedLabelElement[] {
	return [
		{ id: "svc", type: "rectangle", x: 0, y: 0, width: 200, height: 80 },
		{
			id: "svc-label",
			type: "text",
			containerId: "svc",
			x: 50,
			y: 27,
			width: 100,
			height: 26,
			text: "AuthService",
		},
		{
			id: "wire",
			type: "arrow",
			x: 200,
			y: 40,
			width: 200,
			height: 0,
			points: [
				[0, 0],
				[200, 0],
			],
		},
		{
			id: "wire-label",
			type: "text",
			containerId: "wire",
			x: 275,
			y: 27,
			width: 50,
			height: 26,
			text: "HTTP",
		},
	];
}

export function pollutedLabels(): LegacyElementIngress[] {
	const containers = [
		{ id: "svc", text: "AuthService", x: 0 },
		{ id: "gw", text: "Gateway", x: 400 },
		{ id: "wire", text: "HTTP", x: 200 },
	] as const;
	return containers.flatMap(({ id, text, x }) => [
		{
			id,
			type: id === "wire" ? ("arrow" as const) : ("rectangle" as const),
			x,
			y: 0,
			width: 200,
			height: 80,
			...(id === "wire" ? { points: [[0, 0] as const, [200, 0] as const] } : {}),
			boundElements: [
				{ id: `${id}-label`, type: "text" as const },
				{ id: `${id}-copy`, type: "text" as const },
			],
		},
		{
			id: `${id}-label`,
			type: "text" as const,
			x,
			y: 20,
			width: text.length * 10,
			height: 25,
			containerId: id,
			text,
		},
		{
			id: `${id}-copy`,
			type: "text" as const,
			x,
			y: 20,
			width: text.length * 10,
			height: 25,
			containerId: id,
			text,
		},
	]);
}

import { z } from "zod";

import { validatePersistedBoardElement } from "../../../../src/runtime/engine/native-element.ts";

const PointSchema = z.tuple([z.number(), z.number()]);
const CoordinateSchema = z.strictObject({ x: z.number(), y: z.number() });
const LabelSchema = z.strictObject({ text: z.string() });
const BindingSchema = z
	.strictObject({
		elementId: z.string(),
		focus: z.number(),
		gap: z.number(),
		fixedPoint: PointSchema.optional(),
	})
	.nullable();
const MetadataSchema = z.strictObject({
	archboard: z.strictObject({ node: z.string(), kind: z.string(), name: z.string() }),
});

export const RectangleRouteRequestSchema = z.strictObject({
	id: z.string().optional(),
	type: z.literal("rectangle"),
	x: z.number(),
	y: z.number(),
	width: z.number(),
	height: z.number(),
	angle: z.number().optional(),
	roundness: z.strictObject({ type: z.number() }).optional(),
	label: LabelSchema.optional(),
	customData: MetadataSchema.optional(),
});
export const ArrowRouteRequestSchema = z.strictObject({
	id: z.string(),
	type: z.literal("arrow"),
	x: z.number(),
	y: z.number(),
	width: z.number().optional(),
	height: z.number().optional(),
	points: z.array(PointSchema).optional(),
	start: z.strictObject({ id: z.string() }).optional(),
	end: z.strictObject({ id: z.string() }).optional(),
	label: LabelSchema.optional(),
	startBinding: BindingSchema.optional(),
	endBinding: BindingSchema.optional(),
});
export const TextRouteRequestSchema = z.strictObject({
	id: z.string(),
	type: z.literal("text"),
	x: z.number(),
	y: z.number(),
	text: z.string(),
	fontFamily: z.number().optional(),
});
export const RouteElementRequestSchema = z.discriminatedUnion("type", [
	RectangleRouteRequestSchema,
	ArrowRouteRequestSchema,
	TextRouteRequestSchema,
]);
export type RouteElementRequest = z.infer<typeof RouteElementRequestSchema>;

const ElementTypeSchema = z.enum([
	"rectangle",
	"ellipse",
	"diamond",
	"arrow",
	"text",
	"line",
	"freedraw",
	"image",
]);
const ServerElementRouteSchema = z
	.looseObject({
		id: z.string(),
		type: ElementTypeSchema,
		x: z.number(),
		y: z.number(),
		width: z.number().optional(),
		height: z.number().optional(),
		text: z.string().optional(),
		label: LabelSchema.optional(),
		points: z.array(z.array(z.number())).nullable().optional(),
		containerId: z.string().nullable().optional(),
		boundElements: z
			.array(z.object({ id: z.string(), type: z.enum(["text", "arrow"]) }))
			.nullable()
			.optional(),
		start: z.object({ id: z.string() }).nullable().optional(),
		end: z.object({ id: z.string() }).nullable().optional(),
		startBinding: BindingSchema.optional(),
		endBinding: BindingSchema.optional(),
	})
	.transform((element) => validatePersistedBoardElement(element, "label-geometry response"));

export const ElementsRouteResponseSchema = z.looseObject({
	elements: z.array(ServerElementRouteSchema),
	fingerprint: z.looseObject({ version: z.number().int().nonnegative().nullable() }).optional(),
});
export const AcknowledgementRouteResponseSchema = z.looseObject({ success: z.literal(true) });
export const SuccessfulRouteResponseSchema = z.looseObject({
	success: z.boolean(),
	error: z.string().optional(),
});
export const BoardInfoRouteResponseSchema = z.looseObject({ file: z.string() });
export const RefusalRouteResponseSchema = z.looseObject({
	success: z.literal(false),
	error: z.string(),
});

const RequestsSchema = z.array(RouteElementRequestSchema);

export const labelRouteElements = (): RouteElementRequest[] =>
	RequestsSchema.parse([
		{
			id: "svc",
			type: "rectangle",
			x: 100,
			y: 100,
			width: 200,
			height: 100,
			label: { text: "AuthService" },
		},
		{
			id: "gw",
			type: "rectangle",
			x: 600,
			y: 100,
			width: 200,
			height: 100,
			label: { text: "Gateway" },
		},
		{
			id: "pg",
			type: "rectangle",
			x: 600,
			y: 700,
			width: 200,
			height: 100,
			label: { text: "Postgres" },
		},
		{
			id: "wire",
			type: "arrow",
			x: 300,
			y: 150,
			width: 300,
			height: 0,
			start: { id: "svc" },
			end: { id: "gw" },
			label: { text: "HTTP" },
		},
	]);

export const geometryBoardElements = (): RouteElementRequest[] =>
	RequestsSchema.parse([
		{
			id: "hub",
			type: "rectangle",
			x: 1600,
			y: 1200,
			width: 200,
			height: 100,
			label: { text: "Hub" },
			customData: { archboard: { node: "hub", kind: "service", name: "Hub" } },
		},
		{
			id: "west",
			type: "rectangle",
			x: 200,
			y: 1200,
			width: 200,
			height: 100,
			label: { text: "West" },
			customData: { archboard: { node: "west", kind: "service", name: "West" } },
		},
		{
			id: "north",
			type: "rectangle",
			x: 1600,
			y: 200,
			width: 200,
			height: 100,
			label: { text: "North" },
			customData: { archboard: { node: "north", kind: "service", name: "North" } },
		},
		{
			id: "northwest",
			type: "rectangle",
			x: 200,
			y: 200,
			width: 200,
			height: 100,
			label: { text: "Northwest" },
			customData: { archboard: { node: "northwest", kind: "service", name: "Northwest" } },
		},
		{
			id: "to-west",
			type: "arrow",
			x: 1600,
			y: 1250,
			width: 10,
			height: 10,
			start: { id: "hub" },
			end: { id: "west" },
		},
		{
			id: "to-north",
			type: "arrow",
			x: 1700,
			y: 1200,
			width: 10,
			height: 10,
			start: { id: "hub" },
			end: { id: "north" },
		},
		{
			id: "to-northwest",
			type: "arrow",
			x: 1600,
			y: 1200,
			width: 10,
			height: 10,
			start: { id: "hub" },
			end: { id: "northwest" },
		},
		{
			id: "stray",
			type: "arrow",
			x: 200,
			y: 200,
			points: [
				[0, 0],
				[-400, -300],
			],
		},
	]);

export const geometryRegionElements = (): RouteElementRequest[] =>
	RequestsSchema.parse([
		{
			id: "crosser",
			type: "arrow",
			x: 4000,
			y: 4000,
			points: [
				[0, 0],
				[-2000, 0],
			],
		},
		{
			id: "starter",
			type: "arrow",
			x: 2500,
			y: 4000,
			points: [
				[0, 0],
				[1500, 600],
			],
		},
		{ id: "wide-box", type: "rectangle", x: 2000, y: 3800, width: 1000, height: 500 },
		{ id: "elsewhere", type: "rectangle", x: 9000, y: 9000, width: 100, height: 100 },
	]);

export const geometryWireElements = (): RouteElementRequest[] =>
	RequestsSchema.parse([
		{ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60, label: { text: "A" } },
		{ id: "b", type: "rectangle", x: 400, y: 0, width: 100, height: 60, label: { text: "B" } },
		{ id: "c", type: "rectangle", x: 0, y: 300, width: 100, height: 60, label: { text: "C" } },
		{
			id: "arr",
			type: "arrow",
			x: 100,
			y: 30,
			points: [
				[0, 0],
				[300, 0],
			],
			start: { id: "a" },
			end: { id: "b" },
		},
		{
			id: "bent",
			type: "arrow",
			x: 100,
			y: 30,
			points: [
				[0, 0],
				[250, -220],
				[300, 0],
			],
			start: { id: "a" },
			end: { id: "b" },
		},
	]);

export const capturedFocusedNode = RectangleRouteRequestSchema.parse({
	type: "rectangle",
	x: 1066.8104451025551,
	y: 1060.7409025475235,
	width: 200,
	height: 100,
	angle: 0,
	roundness: { type: 3 },
});
export const capturedArrowStart = CoordinateSchema.parse({ x: 1400, y: 1120 });
export const capturedBrowserEndpoint = CoordinateSchema.parse({
	x: 1279.2940245092134,
	y: 1150.128871410794,
});

export const malformedGeometryElements = (): RouteElementRequest[] =>
	RequestsSchema.parse([
		{ id: "would-land", type: "rectangle", x: 200, y: 0, width: 120, height: 60 },
		{ id: "helvetica", type: "text", x: 20, y: 120, text: "unmeasurable", fontFamily: 2 },
	]);

export const malformedGeometryError = z
	.string()
	.parse("write ingress element helvetica: invalid element helvetica (text) at element.width");

export const capturedUserArrow = (): RouteElementRequest =>
	ArrowRouteRequestSchema.parse({
		id: "user-arrow",
		type: "arrow",
		x: capturedArrowStart.x,
		y: capturedArrowStart.y,
		width: 179,
		height: 50,
		points: [
			[0, 0],
			[
				capturedBrowserEndpoint.x - capturedArrowStart.x,
				capturedBrowserEndpoint.y - capturedArrowStart.y,
			],
		],
		startBinding: null,
		endBinding: { elementId: "d", focus: 0.9, gap: 15 },
	});

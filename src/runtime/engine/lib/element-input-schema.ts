import { z } from "zod";

import { EXCALIDRAW_ELEMENT_TYPES } from "../types.js";
import type { ExcalidrawElementType } from "../types.js";

export const PointSchema = z.union([
	z.tuple([z.number(), z.number()]),
	z.object({ x: z.number(), y: z.number() }),
]);

const BindingSchema = z
	.object({
		elementId: z.string(),
		focus: z.number().optional(),
		gap: z.number().optional(),
		fixedPoint: z.tuple([z.number(), z.number()]).nullable().optional(),
		mode: z.string().optional(),
	})
	.nullable();

const ElementFields = {
	type: z.enum(
		Object.values(EXCALIDRAW_ELEMENT_TYPES) as [ExcalidrawElementType, ...ExcalidrawElementType[]],
	),
	x: z.number(),
	y: z.number(),
	width: z.number().optional(),
	height: z.number().optional(),
	backgroundColor: z.string().optional(),
	strokeColor: z.string().optional(),
	strokeWidth: z.number().optional(),
	strokeStyle: z.string().optional(),
	roughness: z.number().optional(),
	opacity: z.number().optional(),
	text: z.string().optional(),
	originalText: z.string().optional(),
	label: z.object({ text: z.string() }).optional(),
	fontSize: z.number().optional(),
	fontFamily: z.union([z.string(), z.number()]).optional(),
	containerId: z.string().nullable().optional(),
	index: z.string().nullable().optional(),
	seed: z.number().optional(),
	versionNonce: z.number().optional(),
	updated: z.number().optional(),
	groupIds: z.array(z.string()).optional(),
	locked: z.boolean().optional(),
	roundness: z.object({ type: z.number(), value: z.number().optional() }).nullable().optional(),
	fillStyle: z.string().optional(),
	points: z.array(PointSchema).optional(),
	start: z.object({ id: z.string() }).nullable().optional(),
	end: z.object({ id: z.string() }).nullable().optional(),
	startElementId: z.string().optional(),
	endElementId: z.string().optional(),
	startArrowhead: z.string().nullable().optional(),
	endArrowhead: z.string().nullable().optional(),
	elbowed: z.boolean().optional(),
	startBinding: BindingSchema.optional(),
	endBinding: BindingSchema.optional(),
	boundElements: z
		.array(z.object({ id: z.string(), type: z.enum(["arrow", "text"]) }))
		.nullable()
		.optional(),
	fileId: z.string().nullable().optional(),
	status: z.enum(["pending", "saved", "error"]).optional(),
	scale: z
		.tuple([z.union([z.literal(-1), z.literal(1)]), z.union([z.literal(-1), z.literal(1)])])
		.optional(),
	crop: z
		.strictObject({
			x: z.number().finite(),
			y: z.number().finite(),
			width: z.number().finite().nonnegative(),
			height: z.number().finite().nonnegative(),
			naturalWidth: z.number().finite().nonnegative(),
			naturalHeight: z.number().finite().nonnegative(),
		})
		.nullable()
		.optional(),
};

export const CreateElementSchema = z.looseObject({ id: z.string().optional(), ...ElementFields });
export const UpdateElementSchema = z.looseObject({
	id: z.string(),
	...Object.fromEntries(
		Object.entries(ElementFields).map(([name, schema]) => [name, schema.optional()]),
	),
});

export type AgentCreateElementInput = z.input<typeof CreateElementSchema>;
export type AgentUpdateElementInput = z.input<typeof UpdateElementSchema>;

export const CREATE_ELEMENT_JSON_SCHEMA = z.toJSONSchema(CreateElementSchema);
export const UPDATE_ELEMENT_JSON_SCHEMA = z.toJSONSchema(UpdateElementSchema);

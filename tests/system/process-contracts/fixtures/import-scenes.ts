import { z } from "zod";

const replaceScene = {
	type: "excalidraw",
	version: 2,
	elements: [
		{
			id: "replacement-container-id-too-long",
			type: "rectangle",
			x: 200,
			y: 300,
			width: 180,
			height: 90,
			index: "same-index",
			label: { text: "Imported service" },
			customData: {
				archboard: {
					node: "replacement-node",
					kind: "service",
					binding: { repository: "archboard", path: "src/runtime/engine/scene-document.ts" },
				},
			},
		},
		{
			id: "replacement-image-id-too-long",
			type: "image",
			x: 450,
			y: 300,
			width: 64,
			height: 64,
			index: "same-index",
			fileId: "reused-file",
		},
		{
			id: "replacement-arrow-id-too-long",
			type: "arrow",
			x: 380,
			y: 345,
			width: 70,
			height: 0,
			points: [
				[0, 0],
				[70, 0],
			],
			start: { id: "replacement-container-id-too-long" },
			end: { id: "replacement-image-id-too-long" },
		},
		{ type: "ellipse", x: 560, y: 300, width: 50, height: 50, index: "same-index" },
	],
	files: {
		"reused-file": {
			id: "reused-file",
			dataURL: "data:image/png;base64,bmV3",
			mimeType: "image/png",
			created: 2,
		},
		"orphan-file": {
			id: "orphan-file",
			dataURL: "data:image/png;base64,b3JwaGFu",
			mimeType: "image/png",
			created: 3,
		},
	},
};

const mergeScene = {
	type: "excalidraw",
	version: 2,
	elements: [{ id: "merge-addition", type: "ellipse", x: 700, y: 300, width: 60, height: 60 }],
};

const heldReplaceScene = {
	...replaceScene,
	elements: [
		{ id: "held-new", type: "diamond", x: 90, y: 90, width: 70, height: 70 },
		{
			id: "held-new-image",
			type: "image",
			x: 180,
			y: 90,
			width: 40,
			height: 40,
			fileId: "reused-file",
		},
	],
};

const ConflictSchema = z
	.object({
		board: z.string(),
		file: z.string(),
		reason: z.enum(["changed", "unseen"]),
		expectedHash: z.string().optional(),
		actualHash: z.string(),
		lastReadAt: z.string().optional(),
		fileModifiedAt: z.string().optional(),
		versionMove: z.enum(["unchanged", "behind", "ahead", "unknown"]),
		expectedVersion: z.number().optional(),
		actualVersion: z.number().optional(),
		outcomes: z.object({ reload: z.string(), overwrite: z.string(), saveAs: z.string() }).strict(),
		message: z.string(),
	})
	.strict();
const HeldSchema = z
	.object({
		board: z.string(),
		since: z.string(),
		writes: z.number().int().nonnegative(),
		fromScreen: z.boolean(),
		conflict: ConflictSchema,
		message: z.string(),
	})
	.strict();
const MergeReceiptSchema = z
	.object({
		success: z.literal(true),
		imported: z.number().int().nonnegative(),
		files: z.number().int().nonnegative(),
		mode: z.literal("merge"),
	})
	.strict();
const HeldReplaceReceiptSchema = z
	.object({
		success: z.literal(true),
		imported: z.number().int().nonnegative(),
		files: z.number().int().nonnegative(),
		mode: z.literal("replace"),
		held: HeldSchema,
	})
	.strict();

export { HeldReplaceReceiptSchema, MergeReceiptSchema, heldReplaceScene, mergeScene, replaceScene };

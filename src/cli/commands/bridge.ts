import { z } from "zod";

import { BridgeMetadataSchema } from "../../runtime/board-inspection/bridge.js";
import { createBridge, removeBridge } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "../command-contract/contract.js";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "../command-contract/schemas.js";
import { boardWriteRefusals } from "../command-contract/common.js";

const opaqueBackground = z
	.string()
	.trim()
	.transform((value) => value.toLowerCase())
	.pipe(z.string().regex(/^#[0-9a-f]{6}$/, "--background must be opaque #RRGGBB"));

const atPoint = z.string().transform((value, context) => {
	const pieces = value.split(",");
	const x = Number(pieces[0]);
	const y = Number(pieces[1]);
	if (pieces.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) {
		context.addIssue({ code: "custom", message: "--at must be finite x,y coordinates" });
		return z.NEVER;
	}
	return { x, y };
});

const bridgeRefusal = {
	code: "BRIDGE_REFUSED",
	exit: 1,
	stream: "stderr" as const,
	description:
		"The named sources, crossing, style, span, or provenance cannot form the requested bridge.",
};

const bridgePart = (role: "mask" | "redraw") =>
	ServerElementSchema.extend({
		type: z.literal("line"),
		groupIds: z.tuple([]),
		startBinding: z.null(),
		endBinding: z.null(),
		customData: z.strictObject({
			archboard: z.strictObject({ bridge: BridgeMetadataSchema.extend({ role: z.literal(role) }) }),
		}),
	});

export const BridgeInputSchema = z.object({
	over: z.string().min(1, "--over is required"),
	under: z.string().min(1, "--under is required"),
	background: opaqueBackground,
	at: atPoint.optional(),
});
export const BridgeResultSchema = z.strictObject({
	success: z.literal(true),
	board: z.string().min(1),
	bridgeId: z.string().min(1),
	overConnectorId: z.string().min(1),
	underConnectorId: z.string().min(1),
	overSegmentIndex: z.number().int().nonnegative(),
	underSegmentIndex: z.number().int().nonnegative(),
	crossing: z.strictObject({ x: z.number().finite(), y: z.number().finite() }),
	elements: z.tuple([bridgePart("mask"), bridgePart("redraw")]),
	fingerprint: BoardFingerprintSchema,
	held: HoldReportSchema.optional(),
});

export const bridgeContract = defineCommand({
	path: ["bridge"],
	summary: "Mark one unavoidable connector crossing",
	usage: "bridge --over <id> --under <id> --background <#RRGGBB> [--at <x,y>]",
	description: "Creates one verified two-part bridge without changing either source connector.",
	examples: [
		'archboard bridge --board system --doing "marking crossing" --over API --under DB --background "#ffffff"',
	],
	parameters: [
		{
			kind: "option",
			key: "over",
			spellings: ["--over"],
			value: "required",
			description: "Connector drawn over the crossing",
		},
		{
			kind: "option",
			key: "under",
			spellings: ["--under"],
			value: "required",
			description: "Connector drawn under the crossing",
		},
		{
			kind: "option",
			key: "background",
			spellings: ["--background"],
			value: "required",
			description: "Explicit opaque board background",
		},
		{
			kind: "option",
			key: "at",
			spellings: ["--at"],
			value: "required",
			description: "Select one crossing by x,y",
		},
	],
	input: { ingress: BridgeInputSchema },
	result: BridgeResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Created bridge",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: [...boardWriteRefusals, bridgeRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/bridges",
			cardinality: "one",
			description: "Plan and create both bridge parts in one mutation",
		},
	],
	async handler(input, context) {
		await context.require("server", "bridge");
		return { result: context.parse(BridgeResultSchema, await createBridge(input)) };
	},
});

export const BridgeRemoveInputSchema = z.object({ bridgeId: z.string().min(1) });
export const BridgeRemoveResultSchema = z.strictObject({
	success: z.literal(true),
	board: z.string().min(1),
	bridgeId: z.string().min(1),
	deleted: z.tuple([z.string().min(1), z.string().min(1)]),
	elements: z.array(ServerElementSchema).length(0),
	fingerprint: BoardFingerprintSchema,
	held: HoldReportSchema.optional(),
});

export const bridgeRemoveContract = defineCommand({
	path: ["bridge", "remove"],
	summary: "Remove one connector bridge by provenance",
	usage: "bridge remove <bridge-id>",
	description:
		"Deletes exactly one strict mask/redraw pair without requiring its source connectors.",
	examples: ['archboard bridge remove Ab12Cd34 --board system --doing "removing crossing marker"'],
	parameters: [
		{
			kind: "positional",
			key: "bridgeId",
			name: "bridge-id",
			description: "Bridge ID (the mask element ID)",
		},
	],
	input: { ingress: BridgeRemoveInputSchema },
	result: BridgeRemoveResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Removed bridge",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: [...boardWriteRefusals, bridgeRefusal],
	relationships: [
		{
			method: "DELETE",
			path: "/api/bridges/:id",
			cardinality: "one",
			description: "Resolve provenance and delete both parts in one mutation",
		},
	],
	async handler(input, context) {
		await context.require("server", "bridge remove");
		return {
			result: context.parse(BridgeRemoveResultSchema, await removeBridge(input.bridgeId)),
		};
	},
});

import { z } from "zod";

import { BridgeMetadataSchema } from "@/runtime/board-inspection/bridge";
import type { BridgeMetadata } from "@/runtime/board-inspection/bridge";
import { createBridge, removeBridge } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "@/cli/command-contract/schemas";
import { boardWriteRefusals } from "@/cli/command-contract/common";

const opaqueBackground = z
	.string()
	.trim()
	.transform((value) => value.toLowerCase())
	.pipe(z.string().regex(/^#[0-9a-f]{6}$/u, "--background must be opaque #RRGGBB"));

/**
 * Reads one coordinate token of `--at`, accepting only a non-blank finite number.
 * @param token - The token on one side of the comma, if present.
 * @returns The coordinate, or undefined when the token is missing, blank or not finite.
 */
function finiteCoordinate(token: string | undefined): number | undefined {
	const trimmed = token?.trim() ?? "";
	if (trimmed.length === 0) {
		return undefined;
	}
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : undefined;
}

const atPoint = z.string().transform((value, context) => {
	const pieces = value.split(",");
	const x = finiteCoordinate(pieces[0]);
	const y = finiteCoordinate(pieces[1]);
	if (pieces.length !== 2 || x === undefined || y === undefined) {
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

/**
 * Describes one of the two bridge parts: an unbound, ungrouped line whose
 * metadata records the bridge facts and which role the line plays.
 * @param role - Whether the part masks the under connector or redraws the over one.
 * @returns The strict element schema of that part.
 */
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

/**
 * Strips the per-part fields from bridge metadata so both parts can be
 * compared against the receipt's shared facts.
 * @param metadata - One part's bridge metadata.
 * @param metadata.role - Which part this is; dropped.
 * @param metadata.background - The part's own background; dropped.
 * @returns The facts both parts must agree on.
 */
const bridgeFactsWithoutRole = ({
	role: _role,
	background: _background,
	...facts
}: BridgeMetadata) => facts;

type BridgeReceiptFacts = {
	bridgeId: string;
	overConnectorId: string;
	underConnectorId: string;
	overSegmentIndex: number;
	underSegmentIndex: number;
	crossing: { x: number; y: number };
};
type BridgePartElement = z.infer<ReturnType<typeof bridgePart>>;

/**
 * Checks that the receipt's ids are consistent: two distinct sources, the
 * mask carrying the bridge id, and neither part reusing a source id.
 * @param facts - The receipt's shared facts.
 * @param mask - The mask part.
 * @param redraw - The redraw part.
 * @returns Whether the ids agree.
 */
function bridgeIdsAgree(
	facts: BridgeReceiptFacts,
	mask: BridgePartElement,
	redraw: BridgePartElement,
): boolean {
	const sourceIds = new Set([facts.overConnectorId, facts.underConnectorId]);
	return (
		facts.overConnectorId !== facts.underConnectorId &&
		mask.id === facts.bridgeId &&
		redraw.id !== facts.bridgeId &&
		!sourceIds.has(mask.id) &&
		!sourceIds.has(redraw.id)
	);
}

/**
 * Checks that both parts carry the receipt's facts and the same background.
 * @param facts - The receipt's shared facts.
 * @param mask - The mask part.
 * @param redraw - The redraw part.
 * @returns Whether the metadata agrees.
 */
function bridgeMetadataAgrees(
	facts: BridgeReceiptFacts,
	mask: BridgePartElement,
	redraw: BridgePartElement,
): boolean {
	const expected = JSON.stringify(facts);
	const maskMetadata = mask.customData.archboard.bridge;
	const redrawMetadata = redraw.customData.archboard.bridge;
	return (
		JSON.stringify(bridgeFactsWithoutRole(maskMetadata)) === expected &&
		JSON.stringify(bridgeFactsWithoutRole(redrawMetadata)) === expected &&
		maskMetadata.background === redrawMetadata.background
	);
}

const BridgeInputSchema = z.object({
	over: z.string().min(1, "--over is required"),
	under: z.string().min(1, "--under is required"),
	background: opaqueBackground,
	at: atPoint.optional(),
});
const BridgeResultSchema = z
	.strictObject({
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
	})
	.superRefine((result, context) => {
		const [mask, redraw] = result.elements;
		const facts: BridgeReceiptFacts = {
			bridgeId: result.bridgeId,
			overConnectorId: result.overConnectorId,
			underConnectorId: result.underConnectorId,
			overSegmentIndex: result.overSegmentIndex,
			underSegmentIndex: result.underSegmentIndex,
			crossing: result.crossing,
		};
		if (!bridgeIdsAgree(facts, mask, redraw) || !bridgeMetadataAgrees(facts, mask, redraw)) {
			context.addIssue({ code: "custom", message: "Bridge receipt facts do not agree." });
		}
	});

const bridgeContract = defineCommand({
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
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
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
	/**
	 * Creates both bridge parts in one server mutation and validates the receipt
	 * before it is shown, so an inconsistent bridge is refused rather than reported.
	 * @param input - The parsed bridge options.
	 * @param context - The command context.
	 * @returns The validated bridge receipt.
	 */
	async handler(input, context) {
		await context.require("server", "bridge");
		const { at, ...required } = input;
		return {
			result: context.parse(
				BridgeResultSchema,
				await createBridge({ ...required, ...(at === undefined ? {} : { at }) }),
			),
		};
	},
});

const BridgeRemoveInputSchema = z.object({ bridgeId: z.string().min(1) });
const BridgeRemoveResultSchema = z
	.strictObject({
		success: z.literal(true),
		board: z.string().min(1),
		bridgeId: z.string().min(1),
		deleted: z.tuple([z.string().min(1), z.string().min(1)]),
		elements: z.array(ServerElementSchema).length(0),
		fingerprint: BoardFingerprintSchema,
		held: HoldReportSchema.optional(),
	})
	.superRefine((result, context) => {
		if (result.deleted[0] !== result.bridgeId || result.deleted[1] === result.bridgeId) {
			context.addIssue({ code: "custom", message: "Bridge removal receipt IDs do not agree." });
		}
	});

const bridgeRemoveContract = defineCommand({
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
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
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
	/**
	 * Deletes one bridge's mask and redraw pair by the mask's id.
	 * @param input - The parsed removal options.
	 * @param context - The command context.
	 * @returns The validated removal receipt.
	 */
	async handler(input, context) {
		await context.require("server", "bridge remove");
		return {
			result: context.parse(BridgeRemoveResultSchema, await removeBridge(input.bridgeId)),
		};
	},
});

export {
	BridgeInputSchema,
	BridgeResultSchema,
	bridgeContract,
	BridgeRemoveInputSchema,
	BridgeRemoveResultSchema,
	bridgeRemoveContract,
};

import { z } from "zod";
import {
	getBoardInfo,
	getSnapshot,
	listSnapshots,
	replaceSceneOnCanvas,
	saveSnapshot,
} from "@/runtime/engine/canvas-client";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import type { OptionParameter } from "@/cli/command-contract/contract";
import { HoldReportSchema, ServerElementSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals, commonRefusals } from "@/cli/command-contract/common";
import type { FlagSpecs } from "@/cli/command-contract/route-options";

const SNAPSHOT_FLAG_SPEC = { force: { takesValue: false } } as const satisfies FlagSpecs;
/**
 * Spells the shared snapshot flag spec as option parameters, so every snapshot subcommand
 * advertises the same flags the namespace router discovers. Every snapshot flag is a bare switch.
 * @returns One option parameter per flag in the spec.
 */
const snapshotFlagParameters = (): OptionParameter[] =>
	Object.keys(SNAPSHOT_FLAG_SPEC).map((name) => ({
		kind: "option",
		key: name,
		spellings: [`--${name}`],
		value: "none",
		description: `${name} option`,
	}));
const tail = z.array(z.string()).default([]);

const SnapshotNamespaceInputSchema = z.object({
	force: z.boolean().default(false),
	action: z.string().optional(),
	name: z.string().optional(),
	tail,
});
type SnapshotNamespaceInput = z.infer<typeof SnapshotNamespaceInputSchema>;
const SnapshotNamespaceResultSchema = z.never();
type SnapshotNamespaceResult = z.infer<typeof SnapshotNamespaceResultSchema>;
const snapshotContract = defineCommand({
	path: ["snapshot"],
	summary: "Save / list / restore named canvas snapshots",
	usage: "snapshot save|list|restore [name] [--force]",
	description: "Routes snapshot lifecycle commands.",
	examples: ["archboard snapshot list --board payments"],
	parameters: [
		...snapshotFlagParameters(),
		{ kind: "positional", key: "action", name: "subcommand", description: "Snapshot subcommand" },
		{ kind: "positional", key: "name", name: "name", description: "Snapshot name" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: SnapshotNamespaceInputSchema },
	result: SnapshotNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		/**
		 * The namespace has one (refusal) output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * The bare namespace never runs; reaching it means no subcommand was named.
	 */
	async handler() {
		throw new CliUsageError("Usage: snapshot save|list|restore [name]");
	},
});

const SnapshotSaveInputSchema = z.object({
	force: z.boolean().default(false),
	name: z.string().optional(),
	tail,
});
type SnapshotSaveInput = z.infer<typeof SnapshotSaveInputSchema>;
const SnapshotSaveStageSchema = z.object({
	name: z.string({ error: "Usage: snapshot save <name>" }).min(1),
});
type SnapshotSaveStage = z.infer<typeof SnapshotSaveStageSchema>;
const SnapshotSaveResultSchema = z.object({
	success: z.literal(true),
	name: z.string(),
	elements: z.number().int().nonnegative(),
	createdAt: z.string(),
	held: HoldReportSchema.optional(),
});
type SnapshotSaveResult = z.infer<typeof SnapshotSaveResultSchema>;
const snapshotSaveContract = defineCommand({
	path: ["snapshot", "save"],
	summary: "Save a named snapshot of one board",
	usage: "snapshot save <name>",
	description: "Captures the named board as an immutable snapshot.",
	examples: ['archboard snapshot save before --board payments --doing "saving checkpoint"'],
	parameters: [
		...snapshotFlagParameters(),
		{ kind: "positional", key: "name", name: "name", description: "Snapshot name" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: {
		ingress: SnapshotSaveInputSchema,
		stages: [
			{
				name: "snapshot-name",
				when: "after-server",
				description: "Required snapshot name after the canvas contact",
				rules: ["Require one non-empty snapshot name"],
				schema: SnapshotSaveStageSchema,
			},
		],
	},
	result: SnapshotSaveResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Saved snapshot",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * Save has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["server-state-write"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/snapshots",
			cardinality: "one",
			description: "Save the snapshot",
		},
	],
	/**
	 * Saves the requested board under the given snapshot name.
	 * @param input - The parsed save input.
	 * @param context - The command execution context.
	 * @returns The saved snapshot's name, element count and creation time.
	 */
	async handler(input, context) {
		await context.require("server", "snapshot save");
		const request = context.parse(SnapshotSaveStageSchema, input);
		const result = await saveSnapshot(request.name);
		return {
			result: {
				success: true as const,
				name: request.name,
				elements: result.elementCount,
				createdAt: result.createdAt,
			},
		};
	},
});

const SnapshotListInputSchema = z.object({ force: z.boolean().default(false), tail });
type SnapshotListInput = z.infer<typeof SnapshotListInputSchema>;
const SnapshotListItemSchema = z.looseObject({
	name: z.string(),
	createdAt: z.string(),
	elementCount: z.number().int().nonnegative().optional(),
});
type SnapshotListItem = z.infer<typeof SnapshotListItemSchema>;
const SnapshotListResultSchema = z.array(SnapshotListItemSchema);
type SnapshotListResult = z.infer<typeof SnapshotListResultSchema>;
const snapshotListContract = defineCommand({
	path: ["snapshot", "list"],
	summary: "List snapshots for one board",
	usage: "snapshot list",
	description: "Lists snapshots associated with the named board.",
	examples: ["archboard snapshot list --board payments"],
	parameters: [
		...snapshotFlagParameters(),
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: SnapshotListInputSchema },
	result: SnapshotListResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "stderr-note",
				description: "Snapshot listing",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * List has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{ method: "GET", path: "/api/snapshots", cardinality: "one", description: "List snapshots" },
	],
	/**
	 * Lists the snapshots the canvas holds for the requested board.
	 * @param _input - The parsed list input (unused: the board comes from the request context).
	 * @param context - The command execution context.
	 * @returns The validated snapshot listing.
	 */
	async handler(_input, context) {
		await context.require("server", "snapshot list");
		const result = await listSnapshots();
		return { result: SnapshotListResultSchema.parse(result.snapshots) };
	},
});

const SnapshotRestoreInputSchema = z.object({
	force: z.boolean().default(false),
	name: z.string().optional(),
	tail,
});
type SnapshotRestoreInput = z.infer<typeof SnapshotRestoreInputSchema>;
const SnapshotRestoreRequestStageSchema = z.object({
	name: z.string({ error: "Usage: snapshot restore <name>" }).min(1),
	force: z.boolean(),
});
type SnapshotRestoreRequestStage = z.infer<typeof SnapshotRestoreRequestStageSchema>;
const SnapshotRestoreResultSchema = z.object({
	success: z.literal(true),
	name: z.string(),
	board: z.string(),
	restored: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
type SnapshotRestoreResult = z.infer<typeof SnapshotRestoreResultSchema>;
const SnapshotRestoreDocumentSchema = z.array(ServerElementSchema);
type SnapshotRestoreDocument = z.infer<typeof SnapshotRestoreDocumentSchema>;
const snapshotRestoreContract = defineCommand({
	path: ["snapshot", "restore"],
	summary: "Restore a named board snapshot",
	usage: "snapshot restore <name> [--force]",
	description: "Reads the snapshot and target before replacing the board in one write.",
	examples: ['archboard snapshot restore before --board payments --doing "restoring checkpoint"'],
	parameters: [
		...snapshotFlagParameters(),
		{ kind: "positional", key: "name", name: "name", description: "Snapshot name" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: {
		ingress: SnapshotRestoreInputSchema,
		stages: [
			{
				name: "snapshot-request",
				when: "after-server",
				description: "Required snapshot name and force decision after the canvas contact",
				rules: ["Require one non-empty snapshot name", "Preserve explicit force"],
				schema: SnapshotRestoreRequestStageSchema,
			},
			{
				name: "snapshot-document",
				when: "after-read",
				description: "Server snapshot elements restored as one scene replacement",
				schema: SnapshotRestoreDocumentSchema,
			},
		],
	},
	result: SnapshotRestoreResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Restored snapshot",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * Restore has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/snapshots/:name",
			cardinality: "one",
			description: "Read the snapshot",
		},
		{
			method: "GET",
			path: "/api/boards/info",
			cardinality: "one",
			description: "Read the target board",
		},
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Replace the target with the element-only snapshot",
		},
	],
	/**
	 * Reads the snapshot and the target board, refuses a cross-board restore without --force, then
	 * replaces the board with the snapshot's elements in one write.
	 * @param input - The parsed restore input.
	 * @param context - The command execution context.
	 * @returns The restored snapshot name, target board and element count.
	 */
	async handler(input, context) {
		await context.require("server", "snapshot restore");
		const request = context.parse(SnapshotRestoreRequestStageSchema, input);
		let snap;
		try {
			snap = await getSnapshot(request.name);
		} catch {
			throw new Error(`Snapshot "${request.name}" not found`);
		}
		const current = await getBoardInfo();
		if (snap.board && snap.board !== current.board && !request.force) {
			throw new Error(
				`Snapshot "${request.name}" was taken on board "${snap.board}", but you named "${current.board}". Restoring would replace "${current.board}" with it. Pass --board ${snap.board} to put it back where it came from, or --force to overwrite this one.`,
			);
		}
		await replaceSceneOnCanvas(snap.elements, []);
		return {
			result: {
				success: true as const,
				name: request.name,
				board: current.board,
				restored: snap.elements.length,
			},
		};
	},
});

export {
	SNAPSHOT_FLAG_SPEC,
	SnapshotNamespaceInputSchema,
	type SnapshotNamespaceInput,
	SnapshotNamespaceResultSchema,
	type SnapshotNamespaceResult,
	snapshotContract,
	SnapshotSaveInputSchema,
	type SnapshotSaveInput,
	SnapshotSaveStageSchema,
	type SnapshotSaveStage,
	SnapshotSaveResultSchema,
	type SnapshotSaveResult,
	snapshotSaveContract,
	SnapshotListInputSchema,
	type SnapshotListInput,
	SnapshotListItemSchema,
	type SnapshotListItem,
	SnapshotListResultSchema,
	type SnapshotListResult,
	snapshotListContract,
	SnapshotRestoreInputSchema,
	type SnapshotRestoreInput,
	SnapshotRestoreRequestStageSchema,
	type SnapshotRestoreRequestStage,
	SnapshotRestoreResultSchema,
	type SnapshotRestoreResult,
	SnapshotRestoreDocumentSchema,
	type SnapshotRestoreDocument,
	snapshotRestoreContract,
};

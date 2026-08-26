import { z } from "zod";
import {
	batchCreateElementsStrict,
	clearCanvas,
	getBoardInfo,
	getSnapshot,
	listSnapshots,
	saveSnapshot,
} from "../../runtime/engine/canvas-client.js";
import {
	CliUsageError,
	defineCommand,
	type OptionParameter,
} from "../command-contract/contract.js";
import { HoldReportSchema, ServerElementSchema } from "../command-contract/schemas.js";
import type { FlagSpecs } from "../command-contract/route-options.js";

export const SNAPSHOT_FLAG_SPEC = { force: { takesValue: false } } as const satisfies FlagSpecs;
const snapshotFlagParameters = (): OptionParameter[] =>
	Object.entries(SNAPSHOT_FLAG_SPEC).map(([name, spec]) => ({
		kind: "option",
		key: name,
		spellings: [`--${name}`],
		value: spec.takesValue ? "required" : "none",
		description: `${name} option`,
	}));
const tail = z.array(z.string()).default([]);
const refusals = [
	{
		code: "BOARD_REQUIRED",
		exit: 2,
		stream: "stderr" as const,
		description: "No board was named.",
	},
	{
		code: "CANVAS_UNREACHABLE",
		exit: 3,
		stream: "stderr" as const,
		description: "The canvas could not be reached.",
	},
	{
		code: "BOARD_CONFLICT",
		exit: 5,
		stream: "stderr" as const,
		description: "The board write was refused.",
	},
];

export const SnapshotNamespaceInputSchema = z.object({
	force: z.boolean().default(false),
	action: z.string().optional(),
	name: z.string().optional(),
	tail,
});
export type SnapshotNamespaceInput = z.infer<typeof SnapshotNamespaceInputSchema>;
export const SnapshotNamespaceResultSchema = z.never();
export type SnapshotNamespaceResult = z.infer<typeof SnapshotNamespaceResultSchema>;
export const snapshotContract = defineCommand({
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
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler() {
		throw new CliUsageError("Usage: snapshot save|list|restore [name]");
	},
});

export const SnapshotSaveInputSchema = z.object({
	force: z.boolean().default(false),
	name: z.string().optional(),
	tail,
});
export type SnapshotSaveInput = z.infer<typeof SnapshotSaveInputSchema>;
export const SnapshotSaveResultSchema = z.object({
	success: z.literal(true),
	name: z.string(),
	elements: z.number().int().nonnegative(),
	createdAt: z.string(),
	held: HoldReportSchema.optional(),
});
export type SnapshotSaveResult = z.infer<typeof SnapshotSaveResultSchema>;
export const snapshotSaveContract = defineCommand({
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
	input: { ingress: SnapshotSaveInputSchema },
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals,
	relationships: [
		{
			method: "POST",
			path: "/api/snapshots",
			cardinality: "one",
			description: "Save the snapshot",
		},
	],
	async handler(input, context) {
		await context.require("server", "snapshot save");
		if (!input.name) throw new CliUsageError("Usage: snapshot save <name>");
		const result = await saveSnapshot(input.name);
		return {
			result: {
				success: true as const,
				name: input.name,
				elements: result.elementCount,
				createdAt: result.createdAt,
			},
		};
	},
});

export const SnapshotListInputSchema = z.object({ force: z.boolean().default(false), tail });
export type SnapshotListInput = z.infer<typeof SnapshotListInputSchema>;
export const SnapshotListItemSchema = z.looseObject({
	name: z.string(),
	createdAt: z.string(),
	elementCount: z.number().int().nonnegative().optional(),
});
export type SnapshotListItem = z.infer<typeof SnapshotListItemSchema>;
export const SnapshotListResultSchema = z.array(SnapshotListItemSchema);
export type SnapshotListResult = z.infer<typeof SnapshotListResultSchema>;
export const snapshotListContract = defineCommand({
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
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: refusals.slice(0, 2),
	relationships: [
		{ method: "GET", path: "/api/snapshots", cardinality: "one", description: "List snapshots" },
	],
	async handler(_input, context) {
		await context.require("server", "snapshot list");
		const result = await listSnapshots();
		return { result: (result.snapshots ?? []) as SnapshotListResult };
	},
});

export const SnapshotRestoreInputSchema = z.object({
	force: z.boolean().default(false),
	name: z.string().optional(),
	tail,
});
export type SnapshotRestoreInput = z.infer<typeof SnapshotRestoreInputSchema>;
export const SnapshotRestoreResultSchema = z.object({
	success: z.literal(true),
	name: z.string(),
	board: z.string(),
	restored: z.number().int().nonnegative(),
	held: HoldReportSchema.optional(),
});
export type SnapshotRestoreResult = z.infer<typeof SnapshotRestoreResultSchema>;
export const SnapshotRestoreDocumentSchema = z.array(ServerElementSchema);
export type SnapshotRestoreDocument = z.infer<typeof SnapshotRestoreDocumentSchema>;
export const snapshotRestoreContract = defineCommand({
	path: ["snapshot", "restore"],
	summary: "Restore a named board snapshot",
	usage: "snapshot restore <name> [--force]",
	description: "Reads the snapshot and target before clearing and restoring the board.",
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
				name: "snapshot-document",
				when: "after-read",
				description: "Server snapshot elements restored as one batch after clear",
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals,
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
			method: "DELETE",
			path: "/api/elements/clear",
			cardinality: "one",
			description: "Clear the target",
		},
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Restore elements",
		},
	],
	async handler(input, context) {
		await context.require("server", "snapshot restore");
		if (!input.name) throw new CliUsageError("Usage: snapshot restore <name>");
		let snap;
		try {
			snap = await getSnapshot(input.name);
		} catch {
			throw new Error(`Snapshot "${input.name}" not found`);
		}
		const current = await getBoardInfo();
		if (snap.board && snap.board !== current.board && !input.force)
			throw new Error(
				`Snapshot "${input.name}" was taken on board "${snap.board}", but you named "${current.board}". Restoring would replace "${current.board}" with it. Pass --board ${snap.board} to put it back where it came from, or --force to overwrite this one.`,
			);
		await clearCanvas();
		await batchCreateElementsStrict(snap.elements);
		return {
			result: {
				success: true as const,
				name: input.name,
				board: current.board,
				restored: snap.elements.length,
			},
		};
	},
});

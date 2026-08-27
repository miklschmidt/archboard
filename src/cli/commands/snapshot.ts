import { z } from "zod";
import {
	getBoardInfo,
	getSnapshot,
	listSnapshots,
	replaceSceneOnCanvas,
	saveSnapshot,
} from "../../runtime/engine/canvas-client.js";
import {
	CliUsageError,
	defineCommand,
	type OptionParameter,
} from "../command-contract/contract.js";
import { HoldReportSchema, ServerElementSchema } from "../command-contract/schemas.js";
import { boardWriteRefusals, commonRefusals } from "../command-contract/common.js";
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
export const SnapshotSaveStageSchema = z.object({
	name: z.string({ error: "Usage: snapshot save <name>" }).min(1),
});
export type SnapshotSaveStage = z.infer<typeof SnapshotSaveStageSchema>;
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
	refusals: commonRefusals,
	relationships: [
		{ method: "GET", path: "/api/snapshots", cardinality: "one", description: "List snapshots" },
	],
	async handler(_input, context) {
		await context.require("server", "snapshot list");
		const result = await listSnapshots();
		return { result: SnapshotListResultSchema.parse(result.snapshots ?? []) };
	},
});

export const SnapshotRestoreInputSchema = z.object({
	force: z.boolean().default(false),
	name: z.string().optional(),
	tail,
});
export type SnapshotRestoreInput = z.infer<typeof SnapshotRestoreInputSchema>;
export const SnapshotRestoreRequestStageSchema = z.object({
	name: z.string({ error: "Usage: snapshot restore <name>" }).min(1),
	force: z.boolean(),
});
export type SnapshotRestoreRequestStage = z.infer<typeof SnapshotRestoreRequestStageSchema>;
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
		if (snap.board && snap.board !== current.board && !request.force)
			throw new Error(
				`Snapshot "${request.name}" was taken on board "${snap.board}", but you named "${current.board}". Restoring would replace "${current.board}" with it. Pass --board ${snap.board} to put it back where it came from, or --force to overwrite this one.`,
			);
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

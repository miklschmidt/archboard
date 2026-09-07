import { z } from "zod";
import {
	applyElementChanges,
	batchCreateElementsStrict,
	getElementStrict,
	getElements,
} from "@/runtime/engine/canvas-client";
import type { ElementInput } from "@/runtime/engine/canvas-client";
import type { ServerElement } from "@/runtime/engine/types";
import { defineCommand } from "@/cli/command-contract/contract";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "@/cli/command-contract/schemas";
import { boardWriteRefusals, commonRefusals } from "@/cli/command-contract/common";
import {
	AddPayloadStageSchema,
	ApplyPayloadStageSchema,
	InlineElementStageSchema,
	readJsonText,
} from "@/cli/commands/lib/element-payloads";
import type {
	AddPayloadStage,
	ApplyPayloadStage,
	InlineElementStage,
} from "@/cli/commands/lib/element-payloads";

const tail = z.array(z.string()).default([]);
const documentOption = {
	kind: "option" as const,
	key: "document",
	spellings: ["--document"] as const,
	value: "none" as const,
	description: "Include the complete board document",
};
const fileParameter = {
	kind: "positional" as const,
	key: "file",
	name: "file",
	route: "stdin-or-file" as const,
	description: "JSON file, or -/omitted for stdin",
};
const ignoredTail = {
	kind: "positional" as const,
	key: "tail",
	name: "ignored",
	repeatable: true,
	route: "pass-through" as const,
	description: "Legacy ignored positional content",
};

/**
 * Turns the `--document` flag into the request field the server reads, and
 * nothing at all when the flag is absent so the request stays minimal.
 * @param document - Whether the caller asked for the complete board document.
 * @returns The request field to spread into the server call.
 */
const documentAsked = (document: boolean): { document?: boolean } =>
	document ? { document: true } : {};

/**
 * Checks every updated and deleted id against the board before anything is
 * written, and shapes the updates as upserts keyed by id.
 * @param patch - The normalised patch.
 * @returns The upserts for the update entries; empty when the patch only creates.
 */
async function resolvedUpdates(
	patch: ApplyPayloadStage,
): Promise<(Partial<ServerElement> & { id: string })[]> {
	if (patch.updates.length === 0 && patch.deletes.length === 0) {
		return [];
	}
	const onBoard = new Set((await getElements()).map((element) => element.id));
	const missing = [...patch.updates.map((update) => update.id), ...patch.deletes].find(
		(id) => !onBoard.has(id),
	);
	if (missing !== undefined) {
		throw new Error(`Element ${missing} not found`);
	}
	return patch.updates.map((normalized) => ({ ...normalized.updates, id: normalized.id }));
}

const ApplyInputSchema = z.object({
	file: z.string().optional(),
	document: z.boolean().default(false),
	tail,
});
type ApplyInput = z.infer<typeof ApplyInputSchema>;
const ApplyResultSchema = z.looseObject({
	success: z.literal(true),
	created: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	deleted: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
type ApplyResult = z.infer<typeof ApplyResultSchema>;

const applyContract = defineCommand({
	path: ["apply"],
	summary: "Apply a {create,update,delete} patch as a single write",
	usage: "apply [patch.json|-] [--document]",
	description: "Validates a complete element patch before applying it as one board write.",
	examples: ['archboard apply patch.json --board system --doing "updating services"'],
	parameters: [documentOption, fileParameter, ignoredTail],
	input: {
		ingress: ApplyInputSchema,
		stages: [
			{
				name: "patch-payload",
				when: "before-server",
				description: "Non-empty JSON patch with normalized create, update, and delete operations",
				schema: ApplyPayloadStageSchema,
			},
		],
	},
	result: ApplyResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Patch receipt",
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
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "conditional",
			description: "Resolve updated and deleted ids",
		},
		{
			method: "POST",
			path: "/api/elements/changes",
			cardinality: "one",
			description: "Apply the complete patch",
		},
	],
	/**
	 * Applies one validated patch as one board write; the payload is parsed
	 * before the server is required so a bad patch never needs a server.
	 * @param input - The parsed apply options.
	 * @param context - The command context.
	 * @returns The patch receipt with counts and the touched elements.
	 */
	async handler(input, context) {
		const patch = context.parse(ApplyPayloadStageSchema, await readJsonText(context, input.file));
		await context.require("server", "apply");
		const updates = await resolvedUpdates(patch);
		const result = await applyElementChanges({
			upserts: [...patch.create, ...updates],
			deletes: patch.deletes,
			...documentAsked(input.document),
		});
		return {
			result: ApplyResultSchema.parse({
				success: true as const,
				created: result.created,
				updated: updates.length,
				deleted: result.deleted,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			}),
		};
	},
});

const AddInputSchema = z.object({
	file: z.string().optional(),
	one: z.string().optional(),
	document: z.boolean().default(false),
	tail,
});
type AddInput = z.infer<typeof AddInputSchema>;
const AddResultSchema = z.looseObject({
	success: z.literal(true),
	count: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
type AddResult = z.infer<typeof AddResultSchema>;

const addContract = defineCommand({
	path: ["add"],
	summary: "Create elements from a JSON array",
	usage: 'add [elements.json] (or stdin) [--document]\nadd --one \'{"type":"rectangle",...}\'',
	description: "Creates one or more elements in one batch.",
	examples: ['archboard add elements.json --board system --doing "adding services"'],
	parameters: [
		{
			kind: "option",
			key: "one",
			spellings: ["--one"],
			value: "required",
			description: "One inline JSON element",
		},
		documentOption,
		fileParameter,
		ignoredTail,
	],
	input: {
		ingress: AddInputSchema,
		stages: [
			{
				name: "element-payload",
				when: "before-server",
				description: "Inline or file/stdin JSON normalized to an element array",
				schema: z.union([InlineElementStageSchema, AddPayloadStageSchema]),
			},
		],
	},
	result: AddResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Creation receipt",
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
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Create the batch",
		},
	],
	/**
	 * Creates the elements given inline with `--one` or as a JSON array from a
	 * file or stdin, in one batch write.
	 * @param input - The parsed add options.
	 * @param context - The command context.
	 * @returns The creation receipt with the created elements.
	 */
	async handler(input, context) {
		let elements: ElementInput[];
		if (input.one !== undefined) {
			elements = context.parse(InlineElementStageSchema, input.one);
		} else {
			elements = context.parse(AddPayloadStageSchema, await readJsonText(context, input.file));
		}
		await context.require("server", "add");
		const result = await batchCreateElementsStrict(elements, documentAsked(input.document));
		return {
			result: AddResultSchema.parse({
				success: true as const,
				count: result.elements.length,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			}),
		};
	},
});

const DeleteInputSchema = z.object({
	ids: z.array(z.string()).min(1, "Usage: delete <id> [<id> ...]"),
	document: z.boolean().default(false),
});
type DeleteInput = z.infer<typeof DeleteInputSchema>;
const DeleteResultSchema = z.looseObject({
	success: z.literal(true),
	deleted: z.number().int().nonnegative(),
	count: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
type DeleteResult = z.infer<typeof DeleteResultSchema>;

const deleteContract = defineCommand({
	path: ["delete"],
	summary: "Delete elements by id",
	usage: "delete <id> [<id> ...] [--document]",
	description: "Resolves every id before deleting them in one write.",
	examples: ['archboard delete box-a box-b --board system --doing "removing boxes"'],
	parameters: [
		documentOption,
		{ kind: "positional", key: "ids", name: "id", repeatable: true, description: "Element ids" },
	],
	input: { ingress: DeleteInputSchema },
	result: DeleteResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Deletion receipt",
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
	refusals: boardWriteRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "one",
			description: "Resolve all ids before writing",
		},
		{
			method: "POST",
			path: "/api/elements/changes",
			cardinality: "one",
			description: "Delete all ids",
		},
	],
	/**
	 * Deletes the named elements in one write, refusing when any id is not on
	 * the board so a typo never deletes half a list.
	 * @param input - The parsed delete options.
	 * @param context - The command context.
	 * @returns The deletion receipt.
	 */
	async handler(input, context) {
		await context.require("server", "delete");
		const onBoard = new Set((await getElements()).map((element) => element.id));
		const missing = input.ids.filter((id) => !onBoard.has(id));
		if (missing.length > 0) {
			throw new Error(`Element ${missing.join(", ")} not found`);
		}
		const result = await applyElementChanges({
			deletes: input.ids,
			...documentAsked(input.document),
		});
		return {
			result: DeleteResultSchema.parse({
				success: true as const,
				deleted: result.deleted,
				count: result.deleted,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			}),
		};
	},
});

const GetInputSchema = z.object({
	id: z.string({ error: "Usage: get <id>" }).min(1, "Usage: get <id>"),
	tail,
});
type GetInput = z.infer<typeof GetInputSchema>;
const GetResultSchema = ServerElementSchema;
type GetResult = z.infer<typeof GetResultSchema>;

const getContract = defineCommand({
	path: ["get"],
	summary: "Get one element by id",
	usage: "get <id>",
	description: "Returns one server-owned element payload.",
	examples: ["archboard get box-a --board system"],
	parameters: [
		{ kind: "positional", key: "id", name: "id", description: "Element id" },
		ignoredTail,
	],
	input: { ingress: GetInputSchema },
	result: GetResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Element payload",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements/:id",
			cardinality: "one",
			description: "Read the element",
		},
	],
	/**
	 * Reads one element by id.
	 * @param input - The parsed get options.
	 * @param context - The command context.
	 * @returns The server-owned element.
	 */
	async handler(input, context) {
		await context.require("server", "get");
		return { result: GetResultSchema.parse(await getElementStrict(input.id)) };
	},
});

export {
	ApplyPayloadStageSchema,
	type ApplyPayloadStage,
	AddPayloadStageSchema,
	type AddPayloadStage,
	InlineElementStageSchema,
	type InlineElementStage,
	ApplyInputSchema,
	type ApplyInput,
	ApplyResultSchema,
	type ApplyResult,
	applyContract,
	AddInputSchema,
	type AddInput,
	AddResultSchema,
	type AddResult,
	addContract,
	DeleteInputSchema,
	type DeleteInput,
	DeleteResultSchema,
	type DeleteResult,
	deleteContract,
	GetInputSchema,
	type GetInput,
	GetResultSchema,
	type GetResult,
	getContract,
};

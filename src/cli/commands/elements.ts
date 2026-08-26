import { z } from "zod";
import {
	applyElementChanges,
	batchCreateElementsStrict,
	getElementStrict,
	getElements,
	type ElementInput,
} from "../../runtime/engine/canvas-client.js";
import type { ServerElement } from "../../runtime/engine/types.js";
import { CliUsageError, defineCommand, type CommandContext } from "../command-contract/contract.js";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "../command-contract/schemas.js";

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
const writeRefusals = [
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

async function readJsonInput(
	context: CommandContext,
	file: string | undefined,
	what: string,
): Promise<unknown> {
	const raw =
		file !== undefined && file !== "-"
			? context.readTextFile(context.resolvePath(file))
			: await context.readStdin();
	if (!raw.trim())
		throw new CliUsageError(`No ${what} provided (pass a file argument or pipe JSON to stdin)`);
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new CliUsageError(`Invalid JSON ${what}: ${(error as Error).message}`);
	}
}

function normalizePatchUpdate(value: unknown): { id: string; updates: Record<string, unknown> } {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new CliUsageError('Every update entry must be an object with an "id"');
	const record = value as Record<string, unknown>;
	if (typeof record.id !== "string" || !record.id)
		throw new CliUsageError('Every update entry needs an "id"');
	const { set, id, ...rest } = record;
	if (set === undefined) return { id, updates: rest };
	if (!set || typeof set !== "object" || Array.isArray(set))
		throw new CliUsageError('Update entry "set" must be an object');
	if (Object.keys(rest).length > 0)
		throw new CliUsageError('Use either direct update fields or "set", not both');
	return { id, updates: set as Record<string, unknown> };
}

const documentAsked = (document: boolean): { document?: boolean } =>
	document ? { document: true } : {};

export const ApplyInputSchema = z.object({
	file: z.string().optional(),
	document: z.boolean().default(false),
	tail,
});
export type ApplyInput = z.infer<typeof ApplyInputSchema>;
export const ApplyResultSchema = z.looseObject({
	success: z.literal(true),
	created: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	deleted: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
export type ApplyResult = z.infer<typeof ApplyResultSchema>;

export const applyContract = defineCommand({
	path: ["apply"],
	summary: "Apply a {create,update,delete} patch as a single write",
	usage: "apply [patch.json|-] [--document]",
	description: "Validates a complete element patch before applying it as one board write.",
	examples: ['archboard apply patch.json --board system --doing "updating services"'],
	parameters: [documentOption, fileParameter, ignoredTail],
	input: { ingress: ApplyInputSchema },
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: writeRefusals,
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
	async handler(input, context) {
		const raw = await readJsonInput(context, input.file, "patch");
		const patch: { create?: ElementInput[]; update?: unknown[]; delete?: string[] } = Array.isArray(
			raw,
		)
			? {
					create: raw.filter((value): value is ElementInput =>
						Boolean(value && typeof value === "object"),
					),
				}
			: raw && typeof raw === "object"
				? (raw as { create?: ElementInput[]; update?: unknown[]; delete?: string[] })
				: {};
		if (!patch.create?.length && !patch.update?.length && !patch.delete?.length)
			throw new CliUsageError("Patch has no create/update/delete operations");
		await context.require("server", "apply");
		const updates: (Partial<ServerElement> & { id: string })[] = [];
		const deletes = patch.delete ?? [];
		if (patch.update?.length || deletes.length) {
			const onBoard = new Set((await getElements()).map((element) => element.id));
			for (const entry of patch.update ?? []) {
				const normalized = normalizePatchUpdate(entry);
				if (!onBoard.has(normalized.id)) throw new Error(`Element ${normalized.id} not found`);
				updates.push({ ...normalized.updates, id: normalized.id });
			}
			for (const id of deletes) if (!onBoard.has(id)) throw new Error(`Element ${id} not found`);
		}
		const result = await applyElementChanges({
			upserts: [...(patch.create ?? []), ...updates],
			deletes,
			...documentAsked(input.document),
		});
		return {
			result: {
				success: true as const,
				created: result.created,
				updated: updates.length,
				deleted: result.deleted,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			} as ApplyResult,
		};
	},
});

export const AddInputSchema = z.object({
	file: z.string().optional(),
	one: z.string().optional(),
	document: z.boolean().default(false),
	tail,
});
export type AddInput = z.infer<typeof AddInputSchema>;
export const AddResultSchema = z.looseObject({
	success: z.literal(true),
	count: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
export type AddResult = z.infer<typeof AddResultSchema>;

export const addContract = defineCommand({
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
	input: { ingress: AddInputSchema },
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: writeRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Create the batch",
		},
	],
	async handler(input, context) {
		let elements: ElementInput[];
		if (input.one !== undefined) {
			try {
				elements = [JSON.parse(input.one)];
			} catch (error) {
				throw new CliUsageError(`Invalid JSON in --one: ${(error as Error).message}`);
			}
		} else {
			const raw = await readJsonInput(context, input.file, "elements");
			elements = (Array.isArray(raw) ? raw : [raw]).filter((value): value is ElementInput =>
				Boolean(value && typeof value === "object"),
			);
		}
		await context.require("server", "add");
		const result = await batchCreateElementsStrict(elements, documentAsked(input.document));
		return {
			result: {
				success: true as const,
				count: result.elements.length,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			} as AddResult,
		};
	},
});

export const DeleteInputSchema = z.object({
	ids: z.array(z.string()).min(1, "Usage: delete <id> [<id> ...]"),
	document: z.boolean().default(false),
});
export type DeleteInput = z.infer<typeof DeleteInputSchema>;
export const DeleteResultSchema = z.looseObject({
	success: z.literal(true),
	deleted: z.number().int().nonnegative(),
	count: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
export type DeleteResult = z.infer<typeof DeleteResultSchema>;

export const deleteContract = defineCommand({
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["write"],
	refusals: writeRefusals,
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
	async handler(input, context) {
		await context.require("server", "delete");
		const onBoard = new Set((await getElements()).map((element) => element.id));
		const missing = input.ids.filter((id) => !onBoard.has(id));
		if (missing.length) throw new Error(`Element ${missing.join(", ")} not found`);
		const result = await applyElementChanges({
			deletes: input.ids,
			...documentAsked(input.document),
		});
		return {
			result: {
				success: true as const,
				deleted: result.deleted,
				count: result.deleted,
				elements: result.elements,
				fingerprint: result.fingerprint,
				...(result.document ? { document: result.document } : {}),
			} as DeleteResult,
		};
	},
});

export const GetInputSchema = z.object({
	id: z.string({ error: "Usage: get <id>" }).min(1, "Usage: get <id>"),
	tail,
});
export type GetInput = z.infer<typeof GetInputSchema>;
export const GetResultSchema = ServerElementSchema;
export type GetResult = z.infer<typeof GetResultSchema>;

export const getContract = defineCommand({
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
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: writeRefusals.slice(0, 2),
	relationships: [
		{
			method: "GET",
			path: "/api/elements/:id",
			cardinality: "one",
			description: "Read the element",
		},
	],
	async handler(input, context) {
		await context.require("server", "get");
		return { result: (await getElementStrict(input.id)) as GetResult };
	},
});

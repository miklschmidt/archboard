import { z } from "zod";
import {
	applyElementChanges,
	batchCreateElementsStrict,
	getElementStrict,
	getElements,
	type ElementInput,
} from "../../runtime/engine/canvas-client.js";
import type { ServerElement } from "../../runtime/engine/types.js";
import { defineCommand, type CommandContext } from "../command-contract/contract.js";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "../command-contract/schemas.js";
import { boardWriteRefusals, commonRefusals } from "../command-contract/common.js";

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

async function readJsonText(context: CommandContext, file: string | undefined): Promise<string> {
	return file !== undefined && file !== "-"
		? context.readTextFile(context.resolvePath(file))
		: await context.readStdin();
}

const jsonText = (emptyMessage: string, invalidPrefix: string) =>
	z.string().transform((raw, context) => {
		if (!raw.trim()) {
			context.addIssue({ code: "custom", message: emptyMessage });
			return z.NEVER;
		}
		try {
			return JSON.parse(raw) as unknown;
		} catch (error) {
			context.addIssue({
				code: "custom",
				message: `${invalidPrefix}: ${(error as Error).message}`,
			});
			return z.NEVER;
		}
	});

export const ApplyPayloadStageSchema = jsonText(
	"No patch provided (pass a file argument or pipe JSON to stdin)",
	"Invalid JSON patch",
).transform((raw, context) => {
	const record =
		raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const create = (
		Array.isArray(raw) ? raw : Array.isArray(record.create) ? record.create : []
	).filter((value): value is ElementInput => Boolean(value && typeof value === "object"));
	const rawUpdates = Array.isArray(record.update) ? record.update : [];
	const deletes = Array.isArray(record.delete)
		? record.delete.filter((value): value is string => typeof value === "string")
		: [];
	if (!create.length && !rawUpdates.length && !deletes.length) {
		context.addIssue({ code: "custom", message: "Patch has no create/update/delete operations" });
		return z.NEVER;
	}
	const updates: Array<{ id: string; updates: Record<string, unknown> }> = [];
	for (const value of rawUpdates) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			context.addIssue({
				code: "custom",
				message: 'Every update entry must be an object with an "id"',
			});
			return z.NEVER;
		}
		const update = value as Record<string, unknown>;
		if (typeof update.id !== "string" || !update.id) {
			context.addIssue({ code: "custom", message: 'Every update entry needs an "id"' });
			return z.NEVER;
		}
		const { set, id, ...rest } = update;
		if (set === undefined) {
			updates.push({ id, updates: rest });
			continue;
		}
		if (!set || typeof set !== "object" || Array.isArray(set)) {
			context.addIssue({ code: "custom", message: 'Update entry "set" must be an object' });
			return z.NEVER;
		}
		if (Object.keys(rest).length > 0) {
			context.addIssue({
				code: "custom",
				message: 'Use either direct update fields or "set", not both',
			});
			return z.NEVER;
		}
		updates.push({ id, updates: set as Record<string, unknown> });
	}
	return { create, updates, deletes };
});
export type ApplyPayloadStage = z.infer<typeof ApplyPayloadStageSchema>;

export const AddPayloadStageSchema = jsonText(
	"No elements provided (pass a file argument or pipe JSON to stdin)",
	"Invalid JSON elements",
).transform((raw) =>
	(Array.isArray(raw) ? raw : [raw]).filter((value): value is ElementInput =>
		Boolean(value && typeof value === "object"),
	),
);
export type AddPayloadStage = z.infer<typeof AddPayloadStageSchema>;
export const InlineElementStageSchema = z.string().transform((raw, context) => {
	try {
		return [JSON.parse(raw) as ElementInput];
	} catch (error) {
		context.addIssue({
			code: "custom",
			message: `Invalid JSON in --one: ${(error as Error).message}`,
		});
		return z.NEVER;
	}
});
export type InlineElementStage = z.infer<typeof InlineElementStageSchema>;

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
	async handler(input, context) {
		const patch = context.parse(ApplyPayloadStageSchema, await readJsonText(context, input.file));
		await context.require("server", "apply");
		const updates: (Partial<ServerElement> & { id: string })[] = [];
		if (patch.updates.length || patch.deletes.length) {
			const onBoard = new Set((await getElements()).map((element) => element.id));
			for (const normalized of patch.updates) {
				if (!onBoard.has(normalized.id)) throw new Error(`Element ${normalized.id} not found`);
				updates.push({ ...normalized.updates, id: normalized.id });
			}
			for (const id of patch.deletes)
				if (!onBoard.has(id)) throw new Error(`Element ${id} not found`);
		}
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
	refusals: commonRefusals,
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
		return { result: GetResultSchema.parse(await getElementStrict(input.id)) };
	},
});

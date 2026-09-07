// The JSON payload grammar of `apply` and `add`: what arrives on stdin, in a
// file or inline is normalised here into element inputs before any server contact.
import { z } from "zod";
import type { ElementInput } from "@/runtime/engine/canvas-client";
import type { CommandContext } from "@/cli/command-contract/contract";
import { errorMessage } from "@/cli/commands/lib/thrown-message";

type UpdateEntry = { id: string; updates: Record<string, unknown> };

/**
 * Narrows to a plain object: not null and not an array.
 * @param value - Any decoded JSON value.
 * @returns Whether the value is a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows to anything the server accepts as an element input: any non-null
 * object, arrays included, exactly as the payload grammar always allowed.
 * @param value - Any decoded JSON value.
 * @returns Whether the value can be sent as an element input.
 */
function isElementInput(value: unknown): value is ElementInput {
	return typeof value === "object" && value !== null;
}

/**
 * Reads the JSON text of a payload from a named file, or from stdin when the
 * argument is omitted or `-`.
 * @param context - The command context that owns file and stdin access.
 * @param file - The file argument, if one was given.
 * @returns The raw JSON text.
 */
async function readJsonText(context: CommandContext, file: string | undefined): Promise<string> {
	return file !== undefined && file !== "-"
		? context.readTextFile(context.resolvePath(file))
		: await context.readStdin();
}

/**
 * Builds a schema that decodes JSON text, refusing blank input and invalid
 * JSON with the command's own wording.
 * @param emptyMessage - The issue reported for blank input.
 * @param invalidPrefix - The prefix of the issue reported for invalid JSON.
 * @returns A schema producing the decoded value.
 */
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
				message: `${invalidPrefix}: ${errorMessage(error)}`,
			});
			return z.NEVER;
		}
	});

/**
 * Reads an array-valued field of the patch, treating anything else as empty.
 * @param record - The patch object.
 * @param key - The field name.
 * @returns The field's items, or nothing.
 */
function listAt(record: Record<string, unknown>, key: string): unknown[] {
	const value = record[key];
	return Array.isArray(value) ? value : [];
}

/**
 * Collects the elements to create: the whole payload when it is an array,
 * otherwise the patch's `create` list.
 * @param raw - The decoded payload.
 * @param record - The payload as a patch object, or empty when it was not one.
 * @returns The element inputs to create.
 */
function createEntries(raw: unknown, record: Record<string, unknown>): ElementInput[] {
	const candidates: unknown[] = Array.isArray(raw) ? raw : listAt(record, "create");
	return candidates.filter(isElementInput);
}

/**
 * Resolves the fields of one update entry from either its direct fields or
 * its `set` object, refusing a mix of both.
 * @param id - The element id the entry names.
 * @param set - The entry's `set` field, if present.
 * @param rest - The entry's remaining direct fields.
 * @returns The normalised update, or the issue message that refuses it.
 */
function updateFields(
	id: string,
	set: unknown,
	rest: Record<string, unknown>,
): UpdateEntry | string {
	if (set === undefined) {
		return { id, updates: rest };
	}
	if (!isRecord(set)) {
		return 'Update entry "set" must be an object';
	}
	if (Object.keys(rest).length > 0) {
		return 'Use either direct update fields or "set", not both';
	}
	return { id, updates: set };
}

/**
 * Normalises one entry of the patch's `update` list.
 * @param value - The raw entry.
 * @returns The normalised update, or the issue message that refuses it.
 */
function normalizedUpdate(value: unknown): UpdateEntry | string {
	if (!isRecord(value)) {
		return 'Every update entry must be an object with an "id"';
	}
	const { set, id, ...rest } = value;
	if (typeof id !== "string" || !id) {
		return 'Every update entry needs an "id"';
	}
	return updateFields(id, set, rest);
}

/**
 * Normalises the patch's `update` list, stopping at the first entry that is
 * refused.
 * @param rawUpdates - The raw update entries.
 * @returns The normalised updates, or the issue message of the first refused entry.
 */
function normalizedUpdates(rawUpdates: unknown[]): UpdateEntry[] | string {
	const updates: UpdateEntry[] = [];
	for (const value of rawUpdates) {
		const update = normalizedUpdate(value);
		if (typeof update === "string") {
			return update;
		}
		updates.push(update);
	}
	return updates;
}

const ApplyPayloadStageSchema = jsonText(
	"No patch provided (pass a file argument or pipe JSON to stdin)",
	"Invalid JSON patch",
).transform((raw, context) => {
	const record = isRecord(raw) ? raw : {};
	const create = createEntries(raw, record);
	const rawUpdates = listAt(record, "update");
	const deletes = listAt(record, "delete").filter(
		(value): value is string => typeof value === "string",
	);
	if (create.length === 0 && rawUpdates.length === 0 && deletes.length === 0) {
		context.addIssue({ code: "custom", message: "Patch has no create/update/delete operations" });
		return z.NEVER;
	}
	const updates = normalizedUpdates(rawUpdates);
	if (typeof updates === "string") {
		context.addIssue({ code: "custom", message: updates });
		return z.NEVER;
	}
	return { create, updates, deletes };
});
type ApplyPayloadStage = z.infer<typeof ApplyPayloadStageSchema>;

const AddPayloadStageSchema = jsonText(
	"No elements provided (pass a file argument or pipe JSON to stdin)",
	"Invalid JSON elements",
).transform((raw) => {
	const candidates: unknown[] = Array.isArray(raw) ? raw : [raw];
	return candidates.filter(isElementInput);
});
type AddPayloadStage = z.infer<typeof AddPayloadStageSchema>;
const InlineElementStageSchema = z.string().transform((raw, context) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		context.addIssue({
			code: "custom",
			message: `Invalid JSON in --one: ${errorMessage(error)}`,
		});
		return z.NEVER;
	}
	if (!isElementInput(parsed)) {
		context.addIssue({
			code: "custom",
			message: "Invalid JSON in --one: expected one element object",
		});
		return z.NEVER;
	}
	return [parsed];
});
type InlineElementStage = z.infer<typeof InlineElementStageSchema>;

export {
	readJsonText,
	ApplyPayloadStageSchema,
	type ApplyPayloadStage,
	AddPayloadStageSchema,
	type AddPayloadStage,
	InlineElementStageSchema,
	type InlineElementStage,
};

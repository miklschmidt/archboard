import { parseArgs, CliUsageError } from "./args.js";
import { printJson, readJsonInput } from "./util.js";
import {
	applyElementChanges,
	batchCreateElementsStrict,
	getElementStrict,
	getElements,
	type ElementInput,
} from "../../runtime/engine/canvas-client.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { type ServerElement } from "../../runtime/engine/types.js";

// apply: primary mutation command — {create:[], update:[], delete:[]} in one
// invocation; a bare JSON array is shorthand for {create: [...]}.
function normalizePatchUpdate(value: unknown): { id: string; updates: Record<string, unknown> } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new CliUsageError('Every update entry must be an object with an "id"');
	}
	const record = value as Record<string, unknown>;
	if (typeof record.id !== "string" || !record.id)
		throw new CliUsageError('Every update entry needs an "id"');

	const id = record.id;
	const set = record.set;
	const { set: _set, id: _id, ...rest } = record;
	if (set === undefined) {
		return { id, updates: rest };
	}
	if (!set || typeof set !== "object" || Array.isArray(set)) {
		throw new CliUsageError('Update entry "set" must be an object');
	}
	if (Object.keys(rest).length > 0) {
		throw new CliUsageError('Use either direct update fields or "set", not both');
	}
	return { id, updates: set as Record<string, unknown> };
}

/**
 * `--document` on a write, and the one reason to think before using it.
 *
 * A write already answers with everything it touched and a fingerprint of the
 * board, which is what an agent needs: what the server made of what it sent,
 * and one comparison that says whether anything else has moved. The whole
 * board is 60,000 tokens at 300 elements, so a loop that asks for it pulls the
 * board through a context once per box.
 */
const DOCUMENT_FLAG = { document: { takesValue: false } } as const;
const documentAsked = (flags: Record<string, unknown>): { document?: boolean } =>
	flags.document ? { document: true } : {};

export async function apply(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, DOCUMENT_FLAG);
	const input = await readJsonInput(positionals[0], "patch");

	const patch: { create?: ElementInput[]; update?: unknown[]; delete?: string[] } = Array.isArray(
		input,
	)
		? {
				create: input.filter((value): value is ElementInput =>
					Boolean(value && typeof value === "object"),
				),
			}
		: input && typeof input === "object"
			? (input as { create?: ElementInput[]; update?: unknown[]; delete?: string[] })
			: {};

	if (!patch.create?.length && !patch.update?.length && !patch.delete?.length) {
		throw new CliUsageError("Patch has no create/update/delete operations");
	}

	await ensureCanvasRunning();

	// Everything the patch names is resolved against the board before anything
	// is written, so an id that is not there is refused with nothing applied.
	// It used to be refused halfway through, with the updates before it already
	// on the board.
	const updates: (Partial<ServerElement> & { id: string })[] = [];
	const deletes = patch.delete ?? [];
	if (patch.update?.length || deletes.length) {
		const onBoard = new Set((await getElements()).map((element) => element.id));
		for (const patchEntry of patch.update ?? []) {
			const { id, updates: fields } = normalizePatchUpdate(patchEntry);
			if (!onBoard.has(id)) throw new Error(`Element ${id} not found`);
			updates.push({ ...fields, id });
		}
		for (const id of deletes) {
			if (!onBoard.has(id)) throw new Error(`Element ${id} not found`);
		}
	}

	// One patch, one write: creates, updates and deletes all land in the same
	// pass over the board, so nothing else can get in between them.
	const creates = patch.create ?? [];
	const result = await applyElementChanges({
		upserts: [...creates, ...updates],
		deletes,
		...documentAsked(flags),
	});

	printJson({
		success: true,
		created: result.created,
		// What the patch asked for, not every element the board changed as a
		// result: the server also re-routes arrows and re-places labels behind a
		// move, and counting those here would answer a question nobody asked.
		updated: updates.length,
		deleted: result.deleted,
		// `elements`, on the other hand, IS that resulting record, including the
		// label the server expanded and the arrows it re-routed, which is the half
		// a caller cannot work out for itself.
		elements: result.elements,
		fingerprint: result.fingerprint,
		...(result.document ? { document: result.document } : {}),
	});
}

// add: batch create (alias for apply with a bare array); --one '<json>' for a
// single element without wrapping it in [].
export async function add(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, { one: { takesValue: true }, ...DOCUMENT_FLAG });

	let elements: ElementInput[];
	if (typeof flags.one === "string") {
		try {
			elements = [JSON.parse(flags.one)];
		} catch (error) {
			throw new CliUsageError(`Invalid JSON in --one: ${(error as Error).message}`);
		}
	} else {
		const input = await readJsonInput(positionals[0], "elements");
		elements = (Array.isArray(input) ? input : [input]).filter((value): value is ElementInput =>
			Boolean(value && typeof value === "object"),
		);
	}

	await ensureCanvasRunning();
	const result = await batchCreateElementsStrict(elements, documentAsked(flags));
	printJson({
		success: true,
		count: result.elements.length,
		elements: result.elements,
		fingerprint: result.fingerprint,
		...(result.document ? { document: result.document } : {}),
	});
}

export async function del(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, DOCUMENT_FLAG);
	if (positionals.length === 0) throw new CliUsageError("Usage: delete <id> [<id> ...]");

	await ensureCanvasRunning();

	// One delete, however many ids: every id is resolved against one read of the
	// board and then all of them go in a single write, the shape `apply` has.
	// It used to be a DELETE per id, so an id the board did not hold was refused
	// with the ones before it already gone (ADR 0015).
	const onBoard = new Set((await getElements()).map((element) => element.id));
	const missing = positionals.filter((id) => !onBoard.has(id));
	if (missing.length > 0) throw new Error(`Element ${missing.join(", ")} not found`);
	const result = await applyElementChanges({ deletes: positionals, ...documentAsked(flags) });

	printJson({
		success: true,
		// What the board actually lost, which is not always what was named: a
		// label goes with the box it names (TASK-074).
		deleted: result.deleted,
		count: result.deleted,
		// What is left over changed: arrows unbound from what has gone.
		elements: result.elements,
		fingerprint: result.fingerprint,
		...(result.document ? { document: result.document } : {}),
	});
}

export async function get(argv: string[]): Promise<void> {
	const { positionals } = parseArgs(argv, {});
	const id = positionals[0];
	if (!id) throw new CliUsageError("Usage: get <id>");

	await ensureCanvasRunning();
	printJson(await getElementStrict(id));
}

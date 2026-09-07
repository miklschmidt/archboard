// What one element's metadata says about it, as a description reads it.

import { z } from "zod";
import type { ArchboardBlock } from "@/runtime/engine/metadata";

const UnknownRecordSchema = z.record(z.string(), z.unknown());

const KIND_ORDER = ["gateway", "service", "queue", "datastore", "external"];

const UNTYPED = "untyped";

interface Meta {
	readonly isNode: boolean;
	// Stable node identity, distinct from the element id.
	readonly node?: string;
	// The raw path inside the binding, for link de-duping.
	readonly bindingPath?: string;
	readonly kind?: string;
	readonly binding?: string;
	readonly variant?: string;
	readonly level?: string;
	readonly name?: string;
	// Other keys inside the archboard block.
	readonly extra: Readonly<Record<string, unknown>>;
	// customData that is not owned by Archboard.
	readonly foreign: Readonly<Record<string, unknown>>;
}

/**
 * One metadata value as the shortest text that still says what it is.
 * @param v The value.
 * @returns Its text, or a description of it when it has no JSON form.
 */
function scalarText(v: unknown): string {
	if (typeof v === "string") {
		return v;
	}
	if (v === null || v === undefined) {
		return "";
	}
	// A function or a symbol has no JSON form; the object tag at least says
	// what kind of thing it was, and so does a value JSON cannot serialise.
	if (NO_JSON_FORM.has(typeof v)) {
		return Object.prototype.toString.call(v);
	}
	try {
		return JSON.stringify(v);
	} catch {
		return Object.prototype.toString.call(v);
	}
}

/** The value kinds `JSON.stringify` answers nothing for. */
const NO_JSON_FORM = new Set(["function", "symbol"]);

/**
 * A record as `key=value` pairs, cut short so a description stays readable.
 * @param o The record.
 * @param max How long the text may run.
 * @returns The pairs, with an ellipsis where they were cut.
 */
function pairs(o: Record<string, unknown>, max = 160): string {
	const s = Object.entries(o)
		.map(([k, v]) => `${k}=${scalarText(v)}`)
		.join(", ");
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * What a node binds to, as one short string a person can read out.
 *
 * A binding may be a bare path or a logical address — repo, path, branch and
 * commit — and both render the same way.
 * @param v The binding as stored.
 * @returns The text, or undefined when the node binds to nothing readable.
 */
function formatBinding(v: unknown): string | undefined {
	if (typeof v === "string") {
		return nonEmpty(v.trim());
	}
	const parsed = UnknownRecordSchema.safeParse(v);
	if (!parsed.success) {
		return undefined;
	}
	const b = parsed.data;
	const path = nonEmpty(textAt(b, "path") ?? "");
	if (path === undefined && b["repo"] === undefined) {
		// Something else's shape: say what it holds rather than nothing.
		return nonEmpty(pairs(b));
	}
	return formatAddress(b, path);
}

/**
 * A logical address as one line: the repository, the path, the branch and the
 * short commit, each where the binding names it.
 * @param b The binding.
 * @param path The path it names, when it names one.
 * @returns The address.
 */
function formatAddress(b: Record<string, unknown>, path: string | undefined): string {
	const repo = textAt(b, "repo");
	const branch = textAt(b, "branch");
	const commit = textAt(b, "commit");
	return [
		repo === undefined ? "" : `${repo}:`,
		path ?? "?",
		branch === undefined ? "" : `@${branch}`,
		commit === undefined ? "" : ` (${commit.slice(0, 7)})`,
	].join("");
}

/**
 * One field of a record, when it is text.
 * @param record The record.
 * @param key The field.
 * @returns The text, or undefined.
 */
function textAt(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

/**
 * Text, unless there is none of it.
 * @param text The text.
 * @returns The text, or undefined when it is empty.
 */
function nonEmpty(text: string): string | undefined {
	return text.length === 0 ? undefined : text;
}

/**
 * The path inside a binding, which is the half a person names a file by.
 * @param v The binding as stored.
 * @returns The path, or undefined when the binding names none.
 */
function bindingPathOf(v: unknown): string | undefined {
	if (typeof v === "string") {
		const trimmed = v.trim();
		return trimmed.length === 0 ? undefined : trimmed;
	}
	const parsed = UnknownRecordSchema.safeParse(v);
	return parsed.success && typeof parsed.data["path"] === "string"
		? parsed.data["path"]
		: undefined;
}

/**
 * What an element's metadata says about it, as a description reads it: whether
 * it is a node, what it calls itself, and what else it carries.
 * @param block Archboard's own metadata channel, when the element has one.
 * @param foreign The `customData` keys archboard does not own.
 * @returns The metadata.
 */
function formatMeta(block: ArchboardBlock | undefined, foreign: Record<string, unknown>): Meta {
	if (!block) {
		return { isNode: false, extra: {}, foreign };
	}
	const named = readNamedFields(block);
	return {
		isNode: true,
		...named.fields,
		extra: named.extra,
		foreign,
	};
}

/** The metadata fields a description names, and everything else it carries. */
interface NamedMeta {
	fields: Partial<Meta>;
	extra: Record<string, unknown>;
}

// The fields a description states in its own words. Everything else in the
// block is carried through as `extra`, unread.
const NAMED_META_KEYS = ["node", "kind", "variant", "level", "name"] as const;

/**
 * Read one metadata block: the fields a description names in its own words,
 * the binding it may state under either of two keys, and everything else.
 * @param block Archboard's own metadata channel.
 * @returns The named fields and the rest.
 */
function readNamedFields(block: ArchboardBlock): NamedMeta {
	const fields: Record<string, string> = {};
	const extra: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(block)) {
		if (isNamedKey(key)) {
			const text = nonEmpty(scalarText(value));
			if (text !== undefined) {
				fields[key] = text;
			}
		} else if (key !== "binding" && key !== "path") {
			extra[key] = value;
		}
	}
	return { fields: { ...fields, ...readBinding(block) }, extra };
}

/**
 * Whether a metadata key is one a description states in its own words.
 * @param key The key.
 * @returns True when it is one.
 */
function isNamedKey(key: string): key is (typeof NAMED_META_KEYS)[number] {
	return NAMED_META_KEYS.some((named) => named === key);
}

/**
 * What a block binds to. `binding` is the channel; `path` is the older
 * spelling, read only where `binding` says nothing.
 * @param block Archboard's own metadata channel.
 * @returns The binding fields, or none when it binds to nothing.
 */
function readBinding(block: ArchboardBlock): Partial<Meta> {
	const stated = nonEmpty(formatBinding(block["binding"]) ?? "");
	const source = stated === undefined ? block["path"] : block["binding"];
	const binding = formatBinding(source);
	const bindingPath = bindingPathOf(source);
	return {
		...(binding === undefined ? {} : { binding }),
		...(bindingPath === undefined ? {} : { bindingPath }),
	};
}

export {
	KIND_ORDER,
	UNTYPED,
	type Meta,
	bindingPathOf,
	formatBinding,
	formatMeta,
	pairs,
	scalarText,
};

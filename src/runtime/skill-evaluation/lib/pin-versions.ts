// Rewriting the executable version pins from what is on PATH. The author's
// Codex version lives in pins.json, inside every batch's input digest, so
// changing it starts a new baseline; the graders' versions live in
// graders.json, outside it. The command says which is which and changes
// nothing else in either file.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { sequentially } from "@/runtime/skill-evaluation/lib/process";
import { GRADER_NAMES } from "@/runtime/skill-evaluation/lib/suite";

/** One version pin: where it lives and what it was and is. */
interface PinChange {
	readonly file: string;
	readonly key: string;
	readonly executable: string;
	readonly from: string;
	readonly to: string;
	/** Whether a change here changes every batch's input digest. */
	readonly startsNewBaseline: boolean;
}

/** How to find and ask an executable. */
interface PinTools {
	/** The executable on PATH, or null when there is none. */
	readonly locate: (name: string) => string | null;
	/** What it reports as its version. */
	readonly versionOf: (executable: string) => Promise<string>;
}

/** One pin to rewrite. */
interface PinEntry {
	readonly file: string;
	readonly keys: readonly string[];
	readonly executable: string;
	readonly startsNewBaseline: boolean;
}

/**
 * Whether a value is a JSON object, kept by reference so it can be edited in place.
 * @param value The value.
 * @returns True for a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The object holding the last key of a path, walked strictly, by reference.
 * @param file The file, for the message.
 * @param document The parsed document.
 * @param keys The path.
 * @returns The holder of the last key.
 */
function holderOf(
	file: string,
	document: Record<string, unknown>,
	keys: readonly string[],
): Record<string, unknown> {
	return keys.slice(0, -1).reduce((cursor, key) => {
		const next = cursor[key];
		if (!isRecord(next)) throw new Error(`${file}: no ${keys.join(".")}`);
		return next;
	}, document);
}

/**
 * One JSON file rewritten in place with one nested string replaced, its
 * tab indentation kept; untouched when the value is already there.
 * @param file The file.
 * @param keys The path to the string.
 * @param value The new value.
 * @returns The old value.
 */
function rewritePin(file: string, keys: readonly string[], value: string): string {
	const document: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
	if (!isRecord(document)) throw new Error(`${file}: not a JSON object`);
	const holder = holderOf(file, document, keys);
	const last = keys.at(-1) ?? "";
	const previous = z.string().safeParse(holder[last]);
	if (!previous.success) throw new Error(`${file}: ${keys.join(".")} is not a string`);
	if (previous.data !== value) {
		holder[last] = value;
		fs.writeFileSync(file, `${JSON.stringify(document, null, "\t")}\n`);
	}
	return previous.data;
}

/**
 * Rewrites one pin from the executable on PATH.
 * @param directory The evals directory.
 * @param tools How to find and ask executables.
 * @param entry The pin.
 * @returns What it was and is.
 */
async function pinOne(directory: string, tools: PinTools, entry: PinEntry): Promise<PinChange> {
	const located = tools.locate(entry.executable);
	if (located === null) throw new Error(`no ${entry.executable} on PATH`);
	const to = await tools.versionOf(located);
	if (!/^\d+\.\d+\.\d+$/u.test(to))
		throw new Error(`${entry.executable} at ${located} reports no version: ${to}`);
	const from = rewritePin(path.join(directory, entry.file), entry.keys, to);
	return {
		file: entry.file,
		key: entry.keys.join("."),
		executable: entry.executable,
		from,
		to,
		startsNewBaseline: entry.startsNewBaseline,
	};
}

/**
 * Rewrites every executable version pin from the executables on PATH.
 * @param directory The evals directory.
 * @param tools How to find and ask executables.
 * @returns Every pin, changed or not.
 */
async function pinVersions(directory: string, tools: PinTools): Promise<PinChange[]> {
	const entries: PinEntry[] = [
		{ file: "pins.json", keys: ["codex", "version"], executable: "codex", startsNewBaseline: true },
		...GRADER_NAMES.map((name) => ({
			file: "graders.json",
			keys: [name, "version"],
			executable: name,
			startsNewBaseline: false,
		})),
	];
	return sequentially(entries, (entry) => pinOne(directory, tools, entry));
}

export { pinVersions, type PinChange, type PinTools };

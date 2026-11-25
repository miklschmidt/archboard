// Math that callers repeat on an export (TASK-646.06): `EXPOSED_VALUE_COMPUTED`,
// a warning when two or more modules write the same math on one exported
// value or getter. That math is logic the exporter owns, as a function.
//
// Each file that reads the export names the math it writes around each use
// (`SyntaxFacts.computations`). In each shape, the spelling the file gives
// the export becomes the export's own name, and what the file adds to it
// stays: `CODEX.restartBase * 2 ** …` and `PROCESS_MS.restartBase * 2 ** …`
// are the same math on `PROCESS_MS`. A shape that the files of two readers
// write is a repeat, and every line that writes it is evidence. Shapes that
// only share their form match too, as a deadline and a jitter can: one
// function on the exporter clears both.

import type { ExposedName } from "#runtime/code-facts/modules/operations/module-exposure.ts";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";
import {
	type DepthFinding,
	type DepthReading,
	type DepthUse,
	quoted,
	readersOf,
} from "#runtime/module-depth/operations/depth-reading.ts";
import type { CodeEvidence } from "#shared/protocol/code-check.ts";

/** One line that writes math on the export, and the use it reads. */
interface Written {
	readonly computation: Computation;
	readonly use: DepthUse;
}

/**
 * The shortest spelling that reaches the export and that a computation's
 * chain of names starts with.
 * @param symbol The chain.
 * @param uses The uses of the export in the computation's file.
 * @returns The use, or undefined when the chain reads no use of it.
 */
function spelledBy(symbol: string, uses: readonly DepthUse[]): DepthUse | undefined {
	const starts = uses.filter((use) => symbol === use.symbol || symbol.startsWith(`${use.symbol}.`));
	return starts.toSorted((left, right) => left.symbol.length - right.symbol.length)[0];
}

/**
 * The math one file writes on an export, by shape, with the file's own
 * spelling of the export replaced by its name.
 * @param computations The math the file writes on the names it imports.
 * @param name The export.
 * @param uses The file's uses of the export at run time.
 * @returns Each shape and the line that writes it.
 */
function fileShapes(
	computations: readonly Computation[],
	name: ExposedName,
	uses: readonly DepthUse[],
): (readonly [string, Written])[] {
	return computations.flatMap((computation) => {
		const use = spelledBy(computation.symbol, uses);
		if (use === undefined) return [];
		const exported = `${name.name}${computation.symbol.slice(use.symbol.length)}`;
		return [[computation.shape.replace("@", exported), { computation, use }] as const];
	});
}

/**
 * The math one file writes on the names it imports.
 * @param reading The module.
 * @param file The file.
 * @returns The computations, none where no adapter names them.
 */
async function computationsIn(
	reading: DepthReading,
	file: string,
): Promise<readonly Computation[]> {
	const read = await reading.facts.read(reading.checkout, file);
	return read === undefined || read.adapter === "text" ? [] : (read.computations ?? []);
}

/**
 * The math each file that reads an export writes on it, by shape.
 * @param reading The module.
 * @param name The export.
 * @param reads The uses of the export at run time.
 * @returns The lines that write each shape.
 */
async function shapesOf(
	reading: DepthReading,
	name: ExposedName,
	reads: readonly DepthUse[],
): Promise<Map<string, Written[]>> {
	const shapes = new Map<string, Written[]>();
	for (const file of new Set(reads.map((use) => use.file))) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time; the pass caches each one
		const computations = await computationsIn(reading, file);
		const uses = reads.filter((use) => use.file === file);
		for (const [shape, written] of fileShapes(computations, name, uses)) {
			shapes.set(shape, [...(shapes.get(shape) ?? []), written]);
		}
	}
	return shapes;
}

/**
 * One piece of evidence for each line that writes repeated math.
 * @param reading The module.
 * @param written The lines.
 * @returns The evidence, in file and line order.
 */
function linesOf(reading: DepthReading, written: readonly Written[]): CodeEvidence[] {
	const lines = new Map<string, Written>();
	for (const each of written) lines.set(`${each.use.file}:${each.computation.line}`, each);
	return [...lines.values()]
		.toSorted(
			(left, right) =>
				left.use.file.localeCompare(right.use.file) ||
				left.computation.line - right.computation.line,
		)
		.map(({ computation, use }) => ({
			kind: "call",
			resolution: "resolved",
			...(use.reader.id === undefined ? {} : { from: use.reader.id }),
			repo: reading.checkout.repo,
			path: use.file,
			line: computation.line,
			symbol: computation.symbol,
		}));
}

/**
 * The finding on an exported value or getter on which two or more modules
 * write the same math.
 * @param reading The module.
 * @param name The value or getter.
 * @param reads The uses of it at run time by files outside the module.
 * @returns The finding, or undefined when no math repeats.
 */
async function computedValue(
	reading: DepthReading,
	name: ExposedName,
	reads: readonly DepthUse[],
): Promise<DepthFinding | undefined> {
	const shapes = await shapesOf(reading, name, reads);
	const repeated = [...shapes].filter(
		([, written]) => readersOf(written.map(({ use }) => use)).length > 1,
	);
	if (repeated.length === 0) return undefined;
	const written = repeated.flatMap(([, each]) => each);
	const readers = readersOf(written.map(({ use }) => use));
	const math = repeated.map(([shape]) => `\`${shape}\``).join(", ");
	return {
		severity: "warning",
		code: "EXPOSED_VALUE_COMPUTED",
		export: name.name,
		message:
			`${reading.label} exports ${name.name}, and ${readers.length} modules write the same math on it: ` +
			`${math}, in ${quoted(readers)}. That math belongs to ${reading.label}: give it a function ` +
			`that does the math, and let the callers call that function in place of reading ${name.name}.`,
		evidence: linesOf(reading, written),
	};
}

export { computedValue };

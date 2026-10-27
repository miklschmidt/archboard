// The grading council's verdict on a change (docs/design/grading-council.md):
// unblinds every grader's scores with the key of council-pairs.ts, applies the
// rulings on reported defects, and decides each pair by the median of the
// graders' weighted margins.
//
//   bun scripts/council-tally.ts <out> <grading>
//
// <out> is the directory council-pairs.ts wrote, with key.json. <grading> is
// the graders' copy of the pairs, with verdicts/<grader>.json from each grader
// and rulings.json from the person who ran the council. Until every defect a
// grader reported has a ruling, the command lists the unruled ones and stops.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

/** The agreed criteria and their weights (docs/design/grading-council/criteria.md). */
const WEIGHTS = { K: 30, R: 25, T: 18, L: 10, O: 10, W: 7 } as const;

/** The weighted margin on the 1 to 10 scale below which a pair is the same. */
const SAME_WITHIN = 0.4;

const Side = z.enum(["A", "B"]);
type Side = z.infer<typeof Side>;

const Score = z.number().int().min(1).max(10);
const Scores = z.strictObject({ K: Score, R: Score, T: Score, L: Score, O: Score, W: Score });
type Scores = z.infer<typeof Scores>;

/** One grader's file: its scores of both sides of each pair, and the defects it saw. */
const Graded = z.record(
	z.string(),
	z.object({
		A: Scores,
		B: Scores,
		defects: z.array(
			z.object({ side: Side, type: z.number().int().min(1).max(9), where: z.string() }),
		),
	}),
);
type Graded = z.infer<typeof Graded>;

/** Whether each side of a pair has a real defect, as the council's runner ruled. */
const Rulings = z.record(
	z.string(),
	z.object({ A: z.boolean().optional(), B: z.boolean().optional() }),
);
type Rulings = z.infer<typeof Rulings>;

/** The part of council-pairs.ts's key that unblinds a pair. */
const Key = z.object({
	pairs: z.array(z.object({ pair: z.string(), before: Side, key: z.string() })),
});

/** What the council decided for one pair, read for the change. */
type Verdict = "better" | "worse" | "same" | "both fail";

/**
 * Stop the command over its input.
 * @param message What is wrong and what to give instead.
 * @returns Never.
 */
function refuse(message: string): never {
	console.error(message);
	return process.exit(2);
}

/**
 * A JSON file read to its schema, or the command stops.
 * @param path The file.
 * @param schema What it must hold.
 * @returns What it holds.
 */
function readJson<Schema extends z.ZodType>(path: string, schema: Schema): z.infer<Schema> {
	if (!existsSync(path)) return refuse(`${path} is missing.`);
	const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
	return parsed.success ? parsed.data : refuse(`${path}: ${z.prettifyError(parsed.error)}`);
}

/**
 * A side's weighted score on the 1 to 10 scale.
 * @param scores The side's scores.
 * @returns The weighted mean.
 */
function weighted(scores: Scores): number {
	const { K, R, T, L, O, W } = WEIGHTS;
	return (
		(K * scores.K + R * scores.R + T * scores.T + L * scores.L + O * scores.O + W * scores.W) / 100
	);
}

/**
 * The median, the mean of the middle two for an even count.
 * @param values At least one number.
 * @returns The median.
 */
function median(values: readonly number[]): number {
	const sorted = values.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Every grader's scores, by grader.
 * @param grading The graders' copy, with verdicts/.
 * @returns The scores.
 */
function gradersOf(grading: string): Map<string, Graded> {
	const dir = join(grading, "verdicts");
	if (!existsSync(dir))
		return refuse(`${dir} is missing; each grader writes verdicts/<grader>.json.`);
	const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
	if (files.length === 0) return refuse(`${dir} holds no grader's verdicts.`);
	return new Map(
		files
			.toSorted()
			.map((file) => [file.slice(0, -".json".length), readJson(join(dir, file), Graded)]),
	);
}

/**
 * The reported defects that no ruling covers yet.
 * @param graders Every grader's scores.
 * @param rulings The rulings so far.
 * @returns One line for each.
 */
function unruledOf(graders: Map<string, Graded>, rulings: Rulings): string[] {
	return [...graders].flatMap(([grader, pairs]) =>
		Object.entries(pairs).flatMap(([pair, graded]) =>
			graded.defects
				.filter((defect) => rulings[pair]?.[defect.side] === undefined)
				.map(
					(defect) =>
						`${pair} ${defect.side}: ${grader} reports defect ${defect.type} at ${defect.where}`,
				),
		),
	);
}

/** Whether each picture of a pair has a real defect. */
interface Defective {
	readonly before: boolean;
	readonly after: boolean;
}

/** The council's reading of one pair. */
interface Tallied {
	readonly pair: string;
	readonly verdict: Verdict;
	/** Each grader's margin of the after picture over the before picture. */
	readonly margins: readonly number[];
	readonly defective: Defective;
}

/**
 * The rulings on reported defects, or the command stops while a reported defect has none.
 * @param grading The graders' copy, with rulings.json.
 * @param graders Every grader's scores.
 * @returns The rulings.
 */
function rulingsOf(grading: string, graders: Map<string, Graded>): Rulings {
	const path = join(grading, "rulings.json");
	const rulings = existsSync(path) ? readJson(path, Rulings) : {};
	const unruled = unruledOf(graders, rulings);
	if (unruled.length === 0) return rulings;
	console.error(unruled.join("\n"));
	return refuse(`Look at each reported defect at full size and rule it in ${path}.`);
}

/**
 * The pair's verdict for the change.
 * @param defective Which pictures have a real defect.
 * @param margin The median of the graders' margins of after over before.
 * @returns The verdict.
 */
function decide(defective: Defective, margin: number): Verdict {
	if (defective.before !== defective.after) return defective.after ? "worse" : "better";
	if (defective.after) return "both fail";
	if (Math.abs(margin) < SAME_WITHIN) return "same";
	return margin > 0 ? "better" : "worse";
}

/**
 * One pair, unblinded and decided.
 * @param pair The pair's number.
 * @param before The side that holds the before picture.
 * @param graders Every grader's scores.
 * @param rulings The rulings on reported defects.
 * @returns The verdict, the margins and the defects.
 */
function tally(
	pair: string,
	before: Side,
	graders: Map<string, Graded>,
	rulings: Rulings,
): Tallied {
	const after: Side = before === "A" ? "B" : "A";
	const margins = [...graders.values()].flatMap((pairs) => {
		const graded = pairs[pair];
		return graded ? [weighted(graded[after]) - weighted(graded[before])] : [];
	});
	if (margins.length === 0) refuse(`No grader scored pair ${pair}.`);
	const ruling = { A: false, B: false, ...rulings[pair] };
	const defective = { before: ruling[before], after: ruling[after] };
	return { pair, verdict: decide(defective, median(margins)), margins, defective };
}

/**
 * Print the council's verdict on the change, and fail the command when the change fails.
 * @param tallied Every pair, decided.
 */
function report(tallied: readonly Tallied[]): void {
	/**
	 * How many pairs got a verdict.
	 * @param verdict The verdict.
	 * @returns The number of pairs.
	 */
	const count = (verdict: Verdict) => tallied.filter((one) => one.verdict === verdict).length;
	const newDefects = tallied.filter(({ defective }) => defective.after && !defective.before);
	const passes = count("worse") === 0 && newDefects.length === 0;
	console.log(
		`${count("better")} better, ${count("same")} same, ${count("worse")} worse, ${count("both fail")} both fail; ` +
			`after pictures with a new defect: ${newDefects.map(({ pair }) => pair).join(", ") || "none"}. ` +
			`The change ${passes ? "passes" : "fails"}.`,
	);
	process.exitCode = passes ? 0 : 1;
}

/** Tally the council's verdict on a change. */
function main(): void {
	const [out, grading] = process.argv.slice(2).map((path) => resolve(path));
	if (!out || !grading) refuse("Usage: council-tally.ts <out> <grading>");
	const key = readJson(join(out, "key.json"), Key);
	const graders = gradersOf(grading);
	const rulings = rulingsOf(grading, graders);
	console.log(`pair verdict    after − before, by grader: ${[...graders.keys()].join(" ")}`);
	const tallied = key.pairs.map(({ pair, before, key: drawing }) => {
		const one = tally(pair, before, graders, rulings);
		const shown = one.margins.map((margin) => margin.toFixed(2)).join(" ");
		console.log(`${pair}  ${one.verdict.padEnd(9)}  ${shown}  ${drawing}`);
		return one;
	});
	report(tallied);
}

main();

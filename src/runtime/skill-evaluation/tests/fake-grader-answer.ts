// What both fake graders answer, read from the prompt the harness sent: the
// pictures it lists and the runs it asks for. FAKE_GRADER_MODE, or
// FAKE_GRADER_RUN_MODES (`run=mode,...`) for the runs it names, says whether
// an answer meets what the harness holds a run to:
// - `grade`: the one feature every fixture answers, and an observation of
//   every listed capture (the default);
// - `mend`: every feature FAKE_GRADER_FEATURES declares, by its name, and an
//   observation of every listed capture;
// - `invent-extra`: `mend`'s answer plus one name of its own;
// - `lapse-once`: a run's first answer invents a feature name and observes no
//   capture; every later answer for it is `mend`'s;
// - `half-mend`: like `lapse-once`, but later answers observe nothing;
// - `lapse-then-silent`: like `lapse-once`, but later the call answers nothing;
// - `lapse-always`: every answer is the lapsing one.
// FAKE_GRADER_STATE is a file counting the answers given per run, so a lapse
// is decided by what the fake answered before, never by the prompt's wording;
// outside `grade` the summary says which answer it was.

import fs from "node:fs";

/** A picture the prompt lists. */
interface ListedImage {
	readonly run: string;
	readonly capture: string;
	readonly file: string;
}

/**
 * The pictures a prompt lists, in order.
 * @param prompt The prompt.
 * @returns The pictures.
 */
function listedImages(prompt: string): ListedImage[] {
	return [...prompt.matchAll(/^Image \d+: (run-[0-9a-f]{10}), capture ([^,]+), (\S+) \(/gmu)].map(
		(match) => ({ run: match[1] ?? "", capture: match[2] ?? "", file: match[3] ?? "" }),
	);
}

/**
 * The runs a prompt asks for.
 * @param prompt The prompt.
 * @returns The anonymous ids.
 */
function askedRuns(prompt: string): string[] {
	return /Grade these runs now: ([^.]+)\./u.exec(prompt)?.[1]?.split(", ") ?? [];
}

/**
 * How many answers the fake gave each run before this one; this one is counted for the next.
 * @param runs The runs answered now.
 * @returns The earlier counts.
 */
function earlierAnswers(runs: readonly string[]): Record<string, number> {
	const file = process.env["FAKE_GRADER_STATE"];
	if (file === undefined) return {};
	const counts = fs.existsSync(file)
		? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, number>)
		: {};
	const before = { ...counts };
	for (const run of runs) counts[run] = (counts[run] ?? 0) + 1;
	fs.writeFileSync(file, JSON.stringify(counts));
	return before;
}

/**
 * One feature verdict that passes.
 * @param feature Its name.
 * @returns The verdict.
 */
function passing(feature: string) {
	return { feature, verdict: "pass", evidence: "boards/", reason: "present", finding: null };
}

/**
 * The mode one run is answered in.
 * @param run The run.
 * @returns The mode.
 */
function modeOf(run: string): string {
	const overrides = new Map(
		(process.env["FAKE_GRADER_RUN_MODES"] ?? "")
			.split(",")
			.filter(Boolean)
			.map((entry) => entry.split("=") as [string, string]),
	);
	return overrides.get(run) ?? process.env["FAKE_GRADER_MODE"] ?? "grade";
}

/**
 * The features and observations one answer gives, by its mode and how many
 * answers came before it.
 * @param mode The run's mode.
 * @param earlier The answers the fake gave the run before.
 * @param declared The declared feature names.
 * @returns The feature names and whether it observes its captures; null for no answer.
 */
function answerShape(
	mode: string,
	earlier: number,
	declared: readonly string[],
): { readonly features: readonly string[]; readonly observes: boolean } | null {
	if (mode === "grade") return { features: ["board.create"], observes: true };
	if (mode === "invent-extra") return { features: [...declared, "invented.extra"], observes: true };
	if (mode === "lapse-always" || (earlier === 0 && mode !== "mend"))
		return { features: ["invented.by-the-grader"], observes: false };
	if (mode === "lapse-then-silent") return null;
	return { features: declared, observes: mode !== "half-mend" };
}

/**
 * The structured answer for every run the prompt asks for.
 * @param prompt The prompt.
 * @param seen The pictures the fake opened or was given.
 * @returns The answer's runs, or null when the fake gives no answer.
 */
function fakeVerdicts(prompt: string, seen: readonly ListedImage[]): unknown[] | null {
	const declared = (process.env["FAKE_GRADER_FEATURES"] ?? "").split(",").filter(Boolean);
	const runs = askedRuns(prompt);
	const before = earlierAnswers(runs);
	const answers = runs.map((run) => {
		const mode = modeOf(run);
		const shape = answerShape(mode, before[run] ?? 0, declared);
		if (shape === null) return null;
		const captures = [
			...new Set(seen.filter((image) => image.run === run).map((image) => image.capture)),
		];
		return {
			run,
			features: shape.features.map((feature) => passing(feature)),
			semanticCorrectness: 8,
			architecturalTruth: 7,
			readability: 9,
			unprompted: [
				{ feature: "traffic", verdict: "missed", evidence: "boards/", reason: "runtime path bare" },
			],
			behaviouralCompleteness: 6,
			summary:
				mode === "grade" ? `graded ${run}` : `graded ${run} (answer ${(before[run] ?? 0) + 1})`,
			concerns: [],
			visual: {
				inspectedCaptures: captures,
				verdict: "pass",
				observations: shape.observes
					? captures.map((capture) => ({ capture, observation: "legible" }))
					: [],
			},
		};
	});
	return answers.includes(null) ? null : answers;
}

export { fakeVerdicts, listedImages, type ListedImage };

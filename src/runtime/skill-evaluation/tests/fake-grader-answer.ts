// What both fake graders answer, read from the prompt the harness sent: the
// pictures it lists and the runs it asks for. FAKE_GRADER_MODE says whether an
// answer meets what the harness holds a run to:
// - `grade`: the one feature every fixture answers, and an observation of
//   every listed capture (the default);
// - `mend`: every feature FAKE_GRADER_FEATURES declares, by its name, and an
//   observation of every listed capture;
// - `lapse-once`: a run's first answer invents a feature name and observes no
//   capture; every later answer for it is `mend`'s;
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
 * The structured answer for every run the prompt asks for.
 * @param prompt The prompt.
 * @param seen The pictures the fake opened or was given.
 * @returns The answer's runs.
 */
function fakeVerdicts(prompt: string, seen: readonly ListedImage[]): unknown[] {
	const mode = process.env["FAKE_GRADER_MODE"] ?? "grade";
	const declared = (process.env["FAKE_GRADER_FEATURES"] ?? "").split(",").filter(Boolean);
	const runs = askedRuns(prompt);
	const before = earlierAnswers(runs);
	return runs.map((run) => {
		const captures = [
			...new Set(seen.filter((image) => image.run === run).map((image) => image.capture)),
		];
		const lapse = mode === "lapse-always" || (mode === "lapse-once" && (before[run] ?? 0) === 0);
		const features =
			mode === "grade" ? ["board.create"] : lapse ? ["invented.by-the-grader"] : declared;
		return {
			run,
			features: features.map((feature) => passing(feature)),
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
				observations: lapse ? [] : captures.map((capture) => ({ capture, observation: "legible" })),
			},
		};
	});
}

export { fakeVerdicts, listedImages, type ListedImage };

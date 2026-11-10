// What `model locality` and `model footprint` say on standard error, so the reader of a long
// answer learns what it found and what it could not read before opening the JSON.

import type { z } from "zod";
import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";

type Answer = Extract<z.output<typeof ArchitectureHistoryResultSchema>, { success: true }>;
type Locality = Extract<Answer, { analysis: "locality" }>;
type Footprint = Extract<Answer, { analysis: "footprint" }>;

/** How many hotspots and coupled pairs a summary lists. */
const LISTED = 5;

/**
 * The count of each distinct word.
 * @param words The words.
 * @returns "a 2, b 1", most frequent first.
 */
function tally(words: readonly string[]): string {
	const counts = new Map<string, number>();
	for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
	return [...counts]
		.toSorted((a, b) => b[1] - a[1])
		.map(([word, count]) => `${word} ${count}`)
		.join(", ");
}

/**
 * What the reading was of.
 * @param answer The answer.
 * @returns The state's name, or the model's.
 */
function readingOf(answer: Answer): string {
	return `"${answer.state?.name ?? answer.model}"`;
}

/**
 * The lines about the parts a lens could not read.
 * @param skipped The skipped parts.
 * @returns One line, or none when nothing was skipped.
 */
function skippedLines(skipped: readonly { reason: string }[]): string[] {
	if (skipped.length === 0) return [];
	return [`Not read: ${skipped.length} parts (${tally(skipped.map(({ reason }) => reason))}).`];
}

/**
 * The summary of a locality reading: how many parts changed, which changed most, which changed together.
 * @param answer The locality answer.
 * @returns The lines.
 */
function localityLines(answer: Locality): string[] {
	const changed = answer.hotspots.filter(({ count }) => count > 0);
	return [
		`Locality of ${readingOf(answer)}: ${answer.hotspots.length} parts read, ${changed.length} changed in ${answer.commits.length} commits, ${answer.coupling.length} coupled pairs.`,
		...answer.periods.map(
			({ repo, since, until }) =>
				`Period in ${repo}: ${since.slice(0, 10)} to ${until.slice(0, 10)}.`,
		),
		...changed
			.slice(0, LISTED)
			.map(({ subject, count }) => `Hotspot: ${subject.name}, ${count} commits.`),
		...answer.coupling
			.slice(0, LISTED)
			.map(
				({ subjects, shared, degree }) =>
					`Coupled: ${subjects[0].name} and ${subjects[1].name}, ${shared} shared commits, ${degree}%.`,
			),
		...skippedLines(answer.skipped),
	];
}

/**
 * The line about the changed files that no binding holds, because no part shows their change.
 * @param files The files.
 * @returns One line, or none when a binding holds every changed file.
 */
function unboundLines(files: readonly { path: string }[]): string[] {
	if (files.length === 0) return [];
	const named = files.slice(0, LISTED).map(({ path }) => path);
	const more = files.length > LISTED ? `, and ${files.length - LISTED} more` : "";
	return [
		`Not bound: ${files.length} changed ${files.length === 1 ? "file" : "files"} that no module is bound to: ${named.join(", ")}${more}.`,
	];
}

/**
 * The summary of a footprint: how many parts the commits changed, and how that sits beside a plan.
 * @param answer The footprint answer.
 * @returns The lines.
 */
function footprintLines(answer: Footprint): string[] {
	const read = answer.repositories.filter(({ status }) => status === "read");
	const lists =
		answer.proposal === null
			? [`${answer.changed.length} parts changed`]
			: [
					`${answer.namedAndChanged.length} planned and changed`,
					`${answer.changedNotNamed.filter((part) => part.holds.length === 0).length} changed outside the plan`,
					`${answer.namedNotChanged.length} planned and unchanged`,
				];
	return [
		`Footprint of ${readingOf(answer)} from ${answer.base}: ${answer.commits.length} commits in ${read.length} of ${answer.repositories.length} repositories; ${lists.join(", ")}.`,
		...skippedLines(answer.skipped),
		...unboundLines(answer.unboundFiles),
	];
}

/**
 * The repositories that could not be read for the range asked, each with why.
 * @param answer The answer.
 * @returns One line for each, or none for a locality or a range read everywhere.
 */
function unreadLines(answer: Answer): string[] {
	if (answer.analysis !== "footprint") return [];
	return answer.repositories.flatMap((repository) =>
		repository.status === "unread"
			? [`Could not read ${repository.repo}: ${repository.detail}`]
			: [],
	);
}

/**
 * The summary of an analysis.
 * @param answer The answer.
 * @returns The lines for standard error.
 */
function historyLines(answer: Answer): string[] {
	return [
		...unreadLines(answer),
		...(answer.analysis === "locality" ? localityLines(answer) : footprintLines(answer)),
	];
}

export { historyLines, unreadLines, type Answer };

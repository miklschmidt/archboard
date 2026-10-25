// The words a picture's key says beside the kinds it lists (TASK-383): the
// two things a line says beside its kind, and the marks a comparison puts on
// what it changed, with how many subjects carry each. The kinds themselves
// the core reads off its own scene and answers with the picture
// (`key` and `appearances` of a render's answer).

import type { SubjectStanding } from "#shared/protocol/render-request.ts";

/**
 * The two things a line says beside its kind, which a key lists under the
 * relationship kinds whenever the picture draws a line: how heavily it is
 * drawn, and the pulses that ride it.
 */
const LINE_MARKS = [
	{ mark: "emphasis", word: "More emphasis" },
	{ mark: "traffic", word: "Illustrated traffic" },
] as const;

/** One of the two things a line says beside its kind. */
type LineMark = (typeof LINE_MARKS)[number]["mark"];

/** The standings a comparison marks, in the order a reader is told them. */
const MARKED = [
	{ standing: "added", word: "Added" },
	{ standing: "changed", word: "Changed" },
	{ standing: "removed", word: "Removed" },
] as const satisfies readonly { readonly standing: SubjectStanding; readonly word: string }[];

/** One marked standing and how many subjects stand so. */
type MarkCount = (typeof MARKED)[number] & { readonly count: number };

/**
 * How many subjects stand each marked way, leaving out the standings nothing has.
 * @param standing How every subject of the comparison stands.
 * @returns The counts, in the order a reader is told them.
 */
function markCounts(standing: Readonly<Record<string, SubjectStanding>>): readonly MarkCount[] {
	const values = Object.values(standing);
	return MARKED.map((marked) => ({
		...marked,
		count: values.filter((one) => one === marked.standing).length,
	})).filter((marked) => marked.count > 0);
}

export { LINE_MARKS, markCounts, type LineMark, type MarkCount };

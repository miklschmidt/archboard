// What a walkthrough's beats refer to, and what one beat must refer to alone.
//
// A check reads the beats two ways. Pooled: between them, do the beats point
// at subjects of the kinds and with the names the scenario asked for, and does
// every subject still exist? And one at a time: does some single beat name
// enough of an ordering to explain it? The second reading is the one that
// tells "the context is pushed before dispatch, and here is where" apart from
// two beats that each describe one side and never say what ordered them.

import type { VariantContent } from "@/shared/semantic-board/index";
import { namedSubject, namesMatch } from "@/runtime/skill-evaluation/lib/naming";
import type { OutcomeCheck } from "@/runtime/skill-evaluation/lib/suite";

/** One beat, as the walkthrough carries it. */
type Beat = VariantContent["walkthroughs"][number]["beats"][number];

/** The least number of subjects of each kind one beat must refer to alone. */
type BeatRule = NonNullable<OutcomeCheck["beatSubjectKinds"]>;

/** What the beats a check looks at refer to between them. */
interface BeatReferences {
	readonly beats: number;
	readonly kinds: Set<string>;
	readonly names: Set<string>;
}

/**
 * The kind of every subject id on a variant.
 * @param content The content.
 * @returns Subject kind by id.
 */
function subjectKinds(content: VariantContent): Map<string, string> {
	const kinds = new Map<string, string>();
	for (const node of content.nodes) kinds.set(node.id, "node");
	for (const edge of content.edges) kinds.set(edge.id, "edge");
	for (const flow of content.flows) {
		kinds.set(flow.id, "flow");
		for (const step of flow.steps) kinds.set(step.id, "step");
	}
	return kinds;
}

/**
 * The walkthrough a check names, among the ones a variant carries.
 * @param walkthroughs The walkthroughs.
 * @param asked The walkthrough's name.
 * @returns The walkthrough, or undefined.
 */
function walkthroughNamed(
	walkthroughs: VariantContent["walkthroughs"],
	asked: string | undefined,
): VariantContent["walkthroughs"][number] | undefined {
	return namedSubject(walkthroughs, (walkthrough) => walkthrough.name, asked);
}

/**
 * The beats a check looks at: those of the walkthrough it names, or of every
 * walkthrough when it names none.
 * @param content The content.
 * @param walkthrough The walkthrough's name, or every walkthrough when absent.
 * @returns The beats, in the walkthroughs' order.
 */
function beatsOf(content: VariantContent, walkthrough: string | undefined): Beat[] {
	return content.walkthroughs
		.filter((candidate) => walkthrough === undefined || namesMatch(candidate.name, walkthrough))
		.flatMap((candidate) => candidate.beats);
}

/**
 * What the beats a check looks at refer to between them.
 * @param content The content.
 * @param beats The beats.
 * @returns The references.
 */
function beatReferences(content: VariantContent, beats: readonly Beat[]): BeatReferences {
	const kinds = subjectKinds(content);
	const subjects = beats.flatMap((beat) => beat.subjects);
	return {
		beats: beats.length,
		kinds: new Set(subjects.map((id) => kinds.get(id) ?? "dangling")),
		names: new Set(subjects.map((id) => content.nodes.find((node) => node.id === id)?.name ?? "")),
	};
}

/**
 * The kinds and names a check wants referenced that the beats do not reference.
 * @param references What the beats reference.
 * @param check The check.
 * @returns The missing kinds and names.
 */
function missingReferences(references: BeatReferences, check: OutcomeCheck): string[] {
	const named = [...references.names];
	return [
		...(check.subjectKinds ?? []).filter((kind) => !references.kinds.has(kind)),
		...(check.subjectNames ?? []).filter(
			(name) => namedSubject(named, (candidate) => candidate, name) === undefined,
		),
	];
}

/**
 * One line saying what the beats refer to, what the check wanted and did not
 * find, and how the single-beat rule stood.
 * @param references What the beats refer to between them.
 * @param missing The kinds and names nothing referenced.
 * @param single What the single-beat rule concluded, empty when none was stated.
 * @returns The line.
 */
function referencesDetail(
	references: BeatReferences,
	missing: readonly string[],
	single: string,
): string {
	const kinds = [...references.kinds].join(", ") || "nothing";
	const absent = missing.length === 0 ? "" : `; missing ${missing.join(", ")}`;
	return `${references.beats} beats referencing ${kinds}${absent}${single}`;
}

/**
 * How many subjects of each kind one beat refers to.
 * @param beat The beat.
 * @param kinds What each subject id is.
 * @returns The count by kind.
 */
function kindsOnBeat(beat: Beat, kinds: ReadonlyMap<string, string>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const id of beat.subjects) {
		const kind = kinds.get(id) ?? "dangling";
		counts.set(kind, (counts.get(kind) ?? 0) + 1);
	}
	return counts;
}

/**
 * Whether one beat holds, on its own, at least the stated number of subjects
 * of each kind.
 * @param beat The beat.
 * @param kinds What each subject id is.
 * @param wanted The least count per kind.
 * @returns True when that beat answers the whole rule.
 */
function beatHolds(beat: Beat, kinds: ReadonlyMap<string, string>, wanted: BeatRule): boolean {
	const counts = kindsOnBeat(beat, kinds);
	return Object.entries(wanted).every(([kind, least]) => (counts.get(kind) ?? 0) >= least);
}

/**
 * How the beats stand against a rule one of them must answer alone.
 * @param content The content.
 * @param beats The beats the check looks at.
 * @param wanted The least count per kind, or undefined when the check states none.
 * @returns Whether one beat answered, and a line saying so.
 */
function singleBeatStanding(
	content: VariantContent,
	beats: readonly Beat[],
	wanted: BeatRule | undefined,
): { readonly held: boolean; readonly detail: string } {
	if (wanted === undefined) return { held: true, detail: "" };
	const kinds = subjectKinds(content);
	const held = beats.some((beat) => beatHolds(beat, kinds, wanted));
	const asked = Object.entries(wanted)
		.map(([kind, least]) => `${least} ${kind}`)
		.join(" and ");
	return { held, detail: `; ${held ? "one beat refers to" : "no single beat refers to"} ${asked}` };
}

export {
	beatReferences,
	beatsOf,
	missingReferences,
	referencesDetail,
	singleBeatStanding,
	walkthroughNamed,
	type Beat,
	type BeatReferences,
};

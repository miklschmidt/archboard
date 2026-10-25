// What a narrated step highlights, as the voice is told it (TASK-309).
//
// A beat names its subjects by id; the voice hears them by name: a part or a sequence by its
// name, a relationship or a step by its two ends and its label. On a variant read against another
// — the board's current one, or on a board with none the one it came from, or for a recording
// made with `--against` the variant it names (TASK-478.01) — each also says how it stands
// against that one, as the picture marks it, and a changed one says what moved, so the voice can
// explain the difference the viewer is looking at.

import type { StepSubject } from "#runtime/rules/realtime/presentation-mode.ts";
import {
	changeOf,
	compareVariants,
	type FieldChange,
	comparedWith,
} from "@archboard/board/comparison";
import { everyStep, isMessage, stepWords } from "@archboard/board/flow";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import type { VariantContent } from "@archboard/board/content";
import type { WalkthroughBeatSchema } from "@archboard/board/content";
import type { z } from "zod";

type VariantComparison = ReturnType<typeof compareVariants>;
type WalkthroughBeat = z.infer<typeof WalkthroughBeatSchema>;

/** A value a moved field had that is longer than this is said to have changed, not what it was. */
const MOVED_VALUE_MAX_CHARS = 120;

/**
 * What every nameable subject of a variant is called, by id.
 * @param content The variant's content.
 * @returns The names: a part's or a sequence's own, a relationship's or a step's ends and label.
 */
function namesOf(content: VariantContent): ReadonlyMap<string, string> {
	const parts = new Map(content.nodes.map((node) => [node.id, node.name]));
	/**
	 * A relationship or a step, by its ends and label.
	 * @param link Its ends and label.
	 * @param link.from Where it starts.
	 * @param link.to Where it ends.
	 * @param link.label What crosses, when it says.
	 * @returns Its name.
	 */
	const between = (link: { from: string; to: string; label?: string | undefined }): string => {
		const ends = `${parts.get(link.from) ?? link.from} → ${parts.get(link.to) ?? link.to}`;
		return link.label === undefined ? ends : `${ends} "${link.label}"`;
	};
	return new Map([
		...parts,
		...content.edges.map((edge) => [edge.id, between(edge)] as const),
		...content.flows.map((flow) => [flow.id, `the sequence ${flow.name}`] as const),
		...content.flows.flatMap((flow) =>
			everyStep(flow.steps).map(
				(step) => [step.id, isMessage(step) ? between(step) : stepWords(step)] as const,
			),
		),
	]);
}

/** What a variant is compared against, for its subjects' standing. */
interface Against {
	readonly comparison: VariantComparison;
	/** What the other side is called. */
	readonly name: string;
	/** What the other side's subjects are called. */
	readonly names: ReadonlyMap<string, string>;
}

/**
 * One field that moved, in words that hold whichever way the two variants lie in time: what the
 * other side says, named by that side. On history read against now, the other side's value is
 * the later one, so "was" would be the wrong word.
 * @param moved The field and what it moved between.
 * @param against The variant it is compared against: its name, and what its subjects are called.
 * @returns What the other side says of it.
 */
function movedOf(moved: FieldChange, against: Against): string {
	const theirs = moved.before;
	if (theirs === undefined) {
		return `${moved.field} is not stated on ${against.name}`;
	}
	if (typeof theirs !== "string" || theirs.length > MOVED_VALUE_MAX_CHARS) {
		return `${moved.field} differs on ${against.name}`;
	}
	const named = against.names.get(theirs);
	const value = named ?? `"${theirs}"`;
	return `${moved.field} is ${value} on ${against.name}`;
}

/**
 * How one subject stands, as the voice is told it.
 * @param id The subject.
 * @param against What the variant is compared against, or null when there is nothing to read it against.
 * @returns Its standing and, when it changed, what moved.
 */
function standingSpoken(id: string, against: Against | null): Omit<StepSubject, "name"> {
	if (against === null) {
		return { standing: null, moved: [] };
	}
	const change = changeOf(against.comparison, id);
	if (change === undefined) {
		return { standing: "unchanged", moved: [] };
	}
	const moved = change.kind === "changed" ? change.fields.map((f) => movedOf(f, against)) : [];
	return { standing: change.kind, moved };
}

/**
 * What one step highlights, as the voice is told it.
 * @param board The board.
 * @param variant The variant the walkthrough belongs to.
 * @param beat The step.
 * @param named The id of the variant a recording's frames are drawn against, or null for the
 * usual comparison. A variant the board no longer has leaves nothing to read against.
 * @returns Each subject the step names, in its order, with how it stands against the variant this
 * one is read against when there is one.
 */
function narratedSubjects(
	board: SemanticBoard,
	variant: SemanticVariant,
	beat: WalkthroughBeat,
	named: string | null = null,
): StepSubject[] {
	const names = namesOf(variant.content);
	const base =
		named === null ? comparedWith(board, variant) : board.variants.find((one) => one.id === named);
	const against =
		base === undefined
			? null
			: {
					comparison: compareVariants(base.content, variant.content),
					name: base.name,
					names: namesOf(base.content),
				};
	return beat.subjects.flatMap((id) => {
		const name = names.get(id);
		return name === undefined ? [] : [{ name, ...standingSpoken(id, against) }];
	});
}

export { narratedSubjects };

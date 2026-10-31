import { useCallback, useContext, useMemo, useState } from "react";
import type { Model } from "@archboard/board/content";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import {
	changedCount,
	changeList,
	placeIn,
	type Change,
	type ChangeList,
	type ChangeTarget,
} from "#ui/rules/architecture-model/change-list.ts";
import {
	ModelPaneContext,
	ModelWalkthroughContext,
} from "#ui/state/architecture-model/presentation.ts";

/** What a walk reads and moves. */
interface ChangeWalkInputs {
	readonly model: Model;
	/** The base of the comparison, once it is read. */
	readonly reference: Model | undefined;
	readonly location: ReturnType<typeof useModelLocation>;
	/** The module the reading opens. */
	readonly opened: string | null;
	/** Bring the list into the column. */
	readonly onList: () => void;
	/** Bring the picture back, for a reader on About. */
	readonly onDiagram: () => void;
}

/** Where a reader stands in the list. */
interface WalkPlace {
	readonly id: string;
	/** Whether the reader stood on this subject, not on one that left the list before it. */
	readonly landed: boolean;
}

/** One list, and the place in it. */
interface Walked {
	readonly list: ChangeList | null;
	/** The reading the list belongs to. A place means nothing in another. */
	readonly state: string | undefined;
	readonly place: WalkPlace | null;
}

/**
 * The place in a list that changed. It stays on its subject. If the subject left, it stands on
 * the next that stayed, which the reader has not seen yet.
 * @param walked The list the reader walked.
 * @param list The list now.
 * @param state The reading the list belongs to.
 * @returns The place.
 */
function heldPlace(walked: Walked, list: ChangeList, state: string | undefined): WalkPlace | null {
	const { place } = walked;
	if (place === null || walked.list === null || walked.state !== state) return null;
	const id = placeIn(walked.list, list, place.id);
	if (id === null) return null;
	return id === place.id ? place : { id, landed: false };
}

/**
 * The list of a reading, and where a reader stands in it. While its base is read again, the last
 * list of the reading stays, because a healthy refresh shows nothing.
 * @param model The reading.
 * @param reference The base of its comparison.
 * @returns The list, and the place that a walk leaves.
 */
function useChangePlace(model: Model, reference: Model | undefined) {
	const state = model.selectedState?.id;
	const read = useMemo(
		() => (reference === undefined ? null : changeList(model, reference)),
		[model, reference],
	);
	const [walked, setWalked] = useState<Walked>({ list: read, state, place: null });
	if (read !== null && walked.list !== read)
		setWalked({ list: read, state, place: heldPlace(walked, read, state) });
	const list = read ?? (walked.state === state ? walked.list : null);
	const leave = useCallback((id: string): void => {
		setWalked((now) => ({ ...now, place: { id, landed: true } }));
	}, []);
	return { list, place: walked.list === list ? walked.place : null, leave };
}

/**
 * Where a change opens.
 * @param inputs The reading and how it moves.
 * @returns Go to a target.
 */
function useChangeTargets(inputs: ChangeWalkInputs): (target: ChangeTarget) => void {
	const { location, opened, model } = inputs;
	const { grammar, flow, focus, open, openFlow, selectGrammar } = location;
	const { id: modelId } = model.manifest;
	const pane = useContext(ModelPaneContext);
	if (pane === null) throw new Error("A change walk requires its pane presentation.");
	// The relationship itself, not the line that joins it with others.
	const { select } = pane.selection;
	const playback = useContext(ModelWalkthroughContext);
	const leave = playback?.leave;
	const present = playback?.select;
	const structural = grammar === "architecture";
	return useCallback(
		(target: ChangeTarget): void => {
			if (target.kind === "walkthrough") {
				select(null);
				present?.(target.walkthrough, target.beat);
				return;
			}
			leave?.();
			if (target.kind === "flow" && (structural || flow !== target.flow)) openFlow(target.flow);
			if (target.kind === "subject" && !structural) selectGrammar("architecture");
			if (target.kind === "scope" && (!structural || opened !== target.scope || focus !== null))
				open(modelId, target.scope);
			select(target.subject);
		},
		[present, leave, structural, flow, openFlow, selectGrammar, opened, focus, open, modelId, select],
	);
}

/**
 * The one subject that a selection names.
 * @param ids The selected identities.
 * @returns The subject, or undefined.
 */
function soleOf(ids: ReadonlySet<string>): string | undefined {
	const [only, other] = ids;
	return other === undefined ? only : undefined;
}

/**
 * Where a reader stands: on the change they selected by any route, or else where the walk left them.
 * @param list The list.
 * @param place Where the walk left them.
 * @param ids The selected identities.
 * @returns The place.
 */
function standing(
	list: ChangeList | null,
	place: WalkPlace | null,
	ids: ReadonlySet<string>,
): WalkPlace | null {
	const sole = soleOf(ids);
	return sole !== undefined && list?.positions.has(sole) === true
		? { id: sole, landed: true }
		: place;
}

/**
 * The change one step from a place.
 * @param list The list.
 * @param place The place.
 * @param step One step on, or one step back.
 * @returns The change, or undefined at an end of the list.
 */
function changeAfter(
	list: ChangeList | null,
	place: WalkPlace | null,
	step: 1 | -1,
): Change | undefined {
	if (list === null) return undefined;
	if (place === null) return step === 1 ? list.changes[0] : undefined;
	const at = list.positions.get(place.id) ?? -1;
	// A reader on a subject that they have not seen starts with that subject.
	const steps = place.landed || step === -1 ? step : 0;
	return list.changes[at + steps];
}

/**
 * Whether a reading has changes to walk: a proposal, read against a base.
 * @param model The reading.
 * @returns True for a draft with a comparison, which After turns off.
 */
function reviewsChanges(model: Model): boolean {
	const { comparison, selectedState, migrationPreview } = model;
	return (
		selectedState?.lifecycle === "draft" &&
		comparison !== undefined &&
		migrationPreview === undefined
	);
}

/**
 * Walk what a proposal changes, across every grammar. A place follows the subject, so it holds
 * through a change of the list, and a selection of a change by any route moves it.
 * @param inputs The reading and how it moves.
 * @returns The list, the place in it, and the moves.
 */
function useChangeWalk(inputs: ChangeWalkInputs) {
	const { model, reference, onList, onDiagram } = inputs;
	const { comparison } = model;
	const reviewing = reviewsChanges(model);
	const { list, place, leave } = useChangePlace(model, reviewing ? reference : undefined);
	const go = useChangeTargets(inputs);
	const pane = useContext(ModelPaneContext);
	const now = standing(list, place, pane?.selection.ids ?? new Set());
	const show = useCallback(
		(change: Change): void => {
			leave(change.id);
			onDiagram();
			go(change.target);
		},
		[leave, onDiagram, go],
	);
	const previous = changeAfter(list, now, -1);
	const next = changeAfter(list, now, 1);
	const step = useCallback(
		(direction: 1 | -1): boolean => {
			const change = direction === 1 ? next : previous;
			if (change === undefined) return false;
			onList();
			show(change);
			return true;
		},
		[next, previous, onList, show],
	);
	return {
		reviewing,
		list: reviewing ? list : null,
		count: comparison === undefined ? 0 : changedCount(comparison),
		place: now?.id ?? null,
		position: now === null ? null : (list?.positions.get(now.id) ?? -1) + 1,
		hasPrevious: previous !== undefined,
		hasNext: next !== undefined,
		show,
		step,
	};
}

type ChangeWalk = ReturnType<typeof useChangeWalk>;

export { reviewsChanges, useChangeWalk, type ChangeWalk };

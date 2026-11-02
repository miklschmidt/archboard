import { useCallback, useContext, useMemo, useState } from "react";
import type { Model } from "@archboard/model/content";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import {
	NO_CHANGES,
	changeAfter,
	changeList,
	changedCount,
	movesReading,
	placeIn,
	positionOf,
	reviewsChanges,
	standingPlace,
	type Change,
	type ChangeHere,
	type ChangeList,
	type ChangeTarget,
	type WalkPlace,
} from "#ui/rules/architecture-model/change-list.ts";
import type { ChangeStep } from "#ui/rules/architecture-model/reader-keys.ts";
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
	/** The selected identities. */
	readonly selected: ReadonlySet<string>;
	/** Bring the list into the column. */
	readonly onList: () => void;
	/** Bring the picture back, for a reader on About. */
	readonly onDiagram: () => void;
}

/** One list, and the place in it. */
interface Walked {
	readonly list: ChangeList;
	/** The reading the list belongs to. A place means nothing in another. */
	readonly state: string | undefined;
	readonly place: WalkPlace | null;
}

/**
 * The place in a list that replaces the one a reader walked.
 * @param walked The list the reader walked.
 * @param list The list now.
 * @param state The reading the list belongs to.
 * @returns The place.
 */
function heldPlace(walked: Walked, list: ChangeList, state: string | undefined): WalkPlace | null {
	const { place } = walked;
	if (place === null || walked.state !== state) return null;
	return placeIn(place, walked.list, list);
}

/**
 * The list of a reading, and where a walk left a reader in it. While the base is read again, the
 * last list of the reading stays, because a healthy refresh shows nothing.
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
	const [walked, setWalked] = useState<Walked>({ list: NO_CHANGES, state, place: null });
	if (read !== null && walked.list !== read)
		setWalked({ list: read, state, place: heldPlace(walked, read, state) });
	const leave = useCallback((id: string): void => {
		setWalked((now) => ({ ...now, place: { id, landed: true } }));
	}, []);
	return { list: read ?? walked.list, loaded: read !== null, place: walked.place, leave };
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
	const here = useMemo<ChangeHere>(
		() => ({ structural: grammar === "architecture", flow, opened, focused: focus !== null }),
		[grammar, flow, opened, focus],
	);
	const move = useCallback(
		(target: Exclude<ChangeTarget, { kind: "walkthrough" }>): void => {
			if (target.kind === "flow") openFlow(target.flow);
			else if (target.kind === "scope") open(modelId, target.scope);
			else selectGrammar("architecture");
		},
		[openFlow, open, modelId, selectGrammar],
	);
	return useCallback(
		(target: ChangeTarget): void => {
			if (target.kind === "walkthrough") {
				select(null);
				present?.(target.walkthrough, target.beat);
				return;
			}
			leave?.();
			if (movesReading(target, here)) move(target);
			select(target.subject);
		},
		[present, leave, here, move, select],
	);
}

/**
 * Walk what a proposal changes, across every grammar. A place follows the subject, so it holds
 * through a change of the list, and a selection of a change by any route moves it.
 * @param inputs The reading and how it moves.
 * @returns The list, the place in it, and the moves.
 */
function useChangeWalk(inputs: ChangeWalkInputs) {
	const { model, reference, selected, onList, onDiagram } = inputs;
	const reviewing = reviewsChanges(model);
	const { list, loaded, place, leave } = useChangePlace(model, reviewing ? reference : undefined);
	const go = useChangeTargets(inputs);
	const now = useMemo(() => standingPlace(list, place, selected), [list, place, selected]);
	const show = useCallback(
		(change: Change): void => {
			leave(change.id);
			onDiagram();
			go(change.target);
		},
		[leave, onDiagram, go],
	);
	const step = useCallback(
		(direction: ChangeStep): boolean => {
			const change = changeAfter(list, now, direction);
			if (change === undefined) return false;
			onList();
			show(change);
			return true;
		},
		[list, now, onList, show],
	);
	return {
		reviewing,
		list: loaded ? list : null,
		count: changedCount(model.comparison),
		place: now?.id ?? null,
		position: positionOf(list, now),
		hasPrevious: changeAfter(list, now, -1) !== undefined,
		hasNext: changeAfter(list, now, 1) !== undefined,
		show,
		step,
	};
}

type ChangeWalk = ReturnType<typeof useChangeWalk>;

export { useChangeWalk, type ChangeWalk };

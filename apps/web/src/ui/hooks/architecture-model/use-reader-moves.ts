import { useCallback, useMemo } from "react";
import { EXPLORING_MS } from "@archboard/timing";
import type { ModelFlow } from "@archboard/model/content";
import type { PictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { cardBeside } from "#ui/rules/architecture-model/expansion.ts";
import {
	endWithin,
	siblingOf,
	upFrom,
	type ModuleTree,
} from "#ui/rules/architecture-model/module-tree.ts";
import type { ReaderMove } from "#ui/rules/architecture-model/reader-keys.ts";
import type { AcceptedScene } from "#ui/rules/architecture-model/scene.ts";

/** What the moves act on. */
interface ReaderMoveInputs {
	readonly location: ReturnType<typeof useModelLocation>;
	readonly tree: ModuleTree;
	/** The module the reading opens. */
	readonly opened: string | null;
	/** The flows a reader walks: the list of the left column. */
	readonly flows: readonly ModelFlow[];
	readonly selection: Pick<ModelSelection, "ids" | "select">;
	readonly scene: AcceptedScene | null;
	readonly camera: PictureCamera;
	readonly reducedMotion: boolean;
	readonly onOpen: (next: string | null) => void;
	/** Expand a door or collapse a frame, and say whether the subject has a control. */
	readonly onToggle: (id: string) => boolean;
}

/**
 * Every move of the reader that a key can make, so that no move needs a tree or a pointer.
 * `[` and `]` walk a selected card through the picture, or else the open module, Enter opens the
 * selected card, or else selects the first card of the open module, and `E` works the control
 * of the selected card.
 * @param inputs The reading and how it moves.
 * @returns Make a move, and say whether there was one to make.
 */
function useReaderMoves(inputs: ReaderMoveInputs): (move: ReaderMove) => boolean {
	const { location, tree, opened, flows, selection, scene, camera, reducedMotion } = inputs;
	const { onOpen, onToggle } = inputs;
	const { grammar, flow, focus, setFocus, selectFlow, selectGrammar } = location;
	const { ids, select } = selection;
	const structural = grammar === "architecture";
	const picture = scene?.picture;
	const projection = scene?.projection;
	const [only, other] = ids;
	const card = only !== undefined && other === undefined && tree.owner.has(only) ? only : null;
	const up = useCallback((): boolean => {
		if (!structural) selectGrammar("architecture");
		else if (opened === null) return false;
		else onOpen(upFrom(tree, opened));
		return true;
	}, [structural, opened, tree, onOpen, selectGrammar]);
	const walkFlows = useCallback(
		(step: number): boolean => {
			const next = flows[flows.findIndex((entry) => entry.id === flow) + step];
			if (next !== undefined) selectFlow(next.id);
			return next !== undefined;
		},
		[flows, flow, selectFlow],
	);
	const walkOpen = useCallback(
		(from: string, step: number): boolean => {
			const next = siblingOf(tree, from, step);
			if (next !== null) onOpen(next.end);
			return next !== null;
		},
		[tree, onOpen],
	);
	const walkCards = useCallback(
		(step: number): boolean => {
			const next =
				card === null || projection === undefined
					? (endWithin(tree, null, step)?.id ?? null)
					: cardBeside(tree, projection, card, step);
			if (next !== null) select(next);
			return next !== null;
		},
		[tree, projection, card, select],
	);
	const walk = useCallback(
		(step: number): boolean => {
			if (!structural) return walkFlows(step);
			return card === null && opened !== null ? walkOpen(opened, step) : walkCards(step);
		},
		[structural, card, opened, walkFlows, walkOpen, walkCards],
	);
	const open = useCallback((): boolean => {
		if (!structural) return false;
		if (card !== null) {
			onOpen(card);
			return true;
		}
		const first = endWithin(tree, opened, 1);
		if (first !== null) select(first.id);
		return first !== null;
	}, [structural, card, tree, opened, onOpen, select]);
	const toggle = useCallback(
		(): boolean => structural && card !== null && onToggle(card),
		[structural, card, onToggle],
	);
	const focused = useCallback((): boolean => {
		if (!structural) return false;
		if (focus !== null) setFocus(null);
		else if (ids.size > 0) setFocus([...ids]);
		else return false;
		return true;
	}, [structural, ids, focus, setFocus]);
	const fit = useCallback((): boolean => {
		if (picture === undefined) return false;
		const duration = reducedMotion ? 0 : EXPLORING_MS.cameraFit;
		camera.glide({ kind: "whole", content: picture }, duration);
		return true;
	}, [picture, camera, reducedMotion]);
	const previous = useCallback((): boolean => walk(-1), [walk]);
	const next = useCallback((): boolean => walk(1), [walk]);
	return useMemo(() => {
		const moves = { up, previous, next, open, toggle, focus: focused, fit };
		return (move) => moves[move]();
	}, [up, previous, next, open, toggle, focused, fit]);
}

export { useReaderMoves };

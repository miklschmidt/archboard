import { memo, useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";

import { Button } from "@archboard/ui-kit/components";
import { StandingSample } from "#ui/components/semantic-board-canvas/SemanticTypeSamples.tsx";
import { Tree } from "#ui/components/shell/Tree.tsx";
import type { ChangeWalk } from "#ui/hooks/architecture-model/use-change-walk.ts";
import type { Change, ChangeList } from "#ui/rules/architecture-model/change-list.ts";
import { ROW_HEIGHT } from "#ui/rules/shell/tree-grid.ts";

/** One row of the tree of changes. */
interface ChangeTreeRow {
	readonly id: string;
	readonly parent: null;
	readonly branch: false;
	readonly open: false;
	readonly change: Change;
}

/** Inputs for the list. */
interface ChangesListProps {
	readonly list: ChangeList;
	/** The change the reader stands on. */
	readonly place: string | null;
	readonly onShow: (change: Change) => void;
}

/**
 * Keep the row of a reader's place in view, clear of the owner's name that sticks above it.
 * @param place The change the reader stands on.
 * @returns The ref for the element around the list.
 */
function useKeptInView(place: string | null) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (place === null) return;
		const row = box.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(place)}"]`);
		if (row === undefined || row === null) return;
		row.style.scrollMarginTop = `${ROW_HEIGHT}px`;
		row.scrollIntoView({ block: "nearest" });
	}, [place]);
	return box;
}

/**
 * Every change of a proposal under its owner, as rows on the grid of the left column.
 * @param props The list, the reader's place and what a row does.
 * @returns The list.
 */
function ChangesList(props: ChangesListProps): JSX.Element {
	const { list, place, onShow } = props;
	const box = useKeptInView(place);
	const rows = useMemo(
		() =>
			list.changes.map(
				(change): ChangeTreeRow => ({
					id: change.id,
					parent: null,
					branch: false,
					open: false,
					change,
				}),
			),
		[list],
	);
	const open = useCallback((row: ChangeTreeRow): void => onShow(row.change), [onShow]);
	return (
		<div ref={box} data-slot="model-changes" className="min-h-0 flex-1">
			<Tree label="Changes" rows={rows} home={place} onOpen={open}>
				{list.groups.map((group) => (
					<Tree.Section key={group.id} label={group.name} depth={0}>
						{group.changes.map((change) => (
							<ChangeRow
								key={change.id}
								change={change}
								lit={change.id === place}
								onShow={onShow}
							/>
						))}
					</Tree.Section>
				))}
			</Tree>
		</div>
	);
}

/**
 * One change: the mark the picture puts on it, and what changed.
 * @param props The change, whether the reader stands on it, and what a click does.
 * @param props.change The change.
 * @param props.lit Whether the reader stands on it.
 * @param props.onShow Go to it.
 * @returns The row.
 */
function ChangeRowOf(props: {
	readonly change: Change;
	readonly lit: boolean;
	readonly onShow: (change: Change) => void;
}): JSX.Element {
	const { change, lit, onShow } = props;
	const open = useCallback((): void => onShow(change), [onShow, change]);
	const dataset = useMemo(
		() => ({ "data-change-id": change.id, "data-standing": change.standing }),
		[change.id, change.standing],
	);
	return (
		<Tree.Row id={change.id} depth={0} selected={lit} current={lit} dataset={dataset} onOpen={open}>
			<Tree.Marker title={change.standing}>
				<StandingSample standing={change.standing} />
			</Tree.Marker>
			<Tree.Name text={change.words} />
		</Tree.Row>
	);
}

/** The rows change one at a time, and a long list holds thousands. */
const ChangeRow = memo(ChangeRowOf);

/** A key that a control answers to, in the look of the one that brings up Find. */
function KeyCap(props: { readonly letter: string }): JSX.Element {
	return (
		<kbd className="text-technical border-current/30 rounded-control border px-1 font-mono leading-4">
			{props.letter}
		</kbd>
	);
}

/**
 * The controls of the walk, which name the keys that do the same.
 * @param props The walk.
 * @param props.walk The walk.
 * @returns The controls.
 */
function ChangesWalker(props: { readonly walk: ChangeWalk }): JSX.Element {
	const { hasPrevious, hasNext, step } = props.walk;
	const previous = useCallback((): void => void step(-1), [step]);
	const next = useCallback((): void => void step(1), [step]);
	return (
		<div data-slot="model-change-walk" className="flex items-center gap-1">
			<Button
				variant="outline"
				size="sm"
				data-slot="model-change-previous"
				aria-label="Previous change"
				aria-keyshortcuts="P"
				title="Previous change"
				disabled={!hasPrevious}
				onClick={previous}
				className="px-1.5"
			>
				<RiArrowLeftSLine aria-hidden="true" className="size-4" />
				<KeyCap letter="P" />
			</Button>
			<Button
				size="sm"
				data-slot="model-change-next"
				aria-label="Next change"
				aria-keyshortcuts="N"
				title="Next change"
				disabled={!hasNext}
				onClick={next}
				className="px-1.5"
			>
				Next
				<KeyCap letter="N" />
				<RiArrowRightSLine aria-hidden="true" className="size-4" />
			</Button>
		</div>
	);
}

/** The parts a proposal puts in the left column. */
const ModelChanges = { List: ChangesList, Walker: ChangesWalker };

export { ModelChanges };

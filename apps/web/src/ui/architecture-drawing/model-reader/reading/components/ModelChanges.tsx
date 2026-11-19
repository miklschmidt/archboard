import { memo, useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";

import { Button } from "@archboard/ui-kit/components";
import { StandingSample } from "#ui/architecture-drawing/canvas/presentation/components/SemanticTypeSamples.tsx";
import { OWNER_ICONS } from "#ui/architecture-drawing/model-reader/reading/constants/section-icons.ts";
import { ModelInterfaceChanges } from "#ui/architecture-drawing/model-reader/reading/components/ModelInterfaceChanges.tsx";
import { Tree } from "#ui/shell/components/Tree.tsx";
import { useFolds } from "#ui/architecture-drawing/model-reader/reading/hooks/use-folds.ts";
import type { ChangeWalk } from "#ui/architecture-drawing/model-reader/hooks/use-change-walk.ts";
import type {
	Change,
	ChangeGroup,
	ChangeList,
} from "#ui/architecture-drawing/model-reader/rules/change-list.ts";
import { GROUP_LINE } from "#ui/shell/rules/row-tone.ts";

type Standing = Change["standing"];

/** An owner of changes, as a row at the top of the tree. */
interface OwnerRow {
	readonly id: string;
	readonly parent: null;
	/** Whether it holds changes other than its own. */
	readonly branch: boolean;
	readonly open: boolean;
	readonly holdsPlace: boolean;
	readonly group: ChangeGroup;
	/** The owner's own change, which its row stands for, when it changed itself. */
	readonly own: Change | undefined;
}

/** A change that an owner holds, one step under it. */
interface HeldRow {
	readonly id: string;
	readonly parent: string;
	readonly branch: false;
	readonly open: false;
	readonly change: Change;
}

type ChangeRow = OwnerRow | HeldRow;

/** Inputs for the list. */
interface ChangesListProps {
	readonly list: ChangeList;
	/** The change the reader stands on. */
	readonly place: string | null;
	readonly onShow: (change: Change) => void;
}

/** The standings in the order a reader counts them: what came, what moved, what went. */
const STANDINGS: readonly Standing[] = ["added", "changed", "removed"];

/** An owner's row, and the rows drawn under it while it is open. */
interface OwnerBranch {
	readonly owner: OwnerRow;
	readonly held: readonly HeldRow[];
}

/**
 * The tree: each owner, and under an open owner the changes it holds besides its own. An owner
 * holds the reader's place open, so a walk never lands on a row that is folded away.
 * @param list The list.
 * @param folded The owners the reader folded.
 * @param place The change the reader stands on.
 * @returns Each owner with what it shows, in the order of the walk.
 */
function ownerBranches(
	list: ChangeList,
	folded: ReadonlySet<string>,
	place: string | null,
): readonly OwnerBranch[] {
	return list.groups.map((group) => {
		const own = group.changes.find((change) => change.id === group.id);
		const changes = group.changes.filter((change) => change !== own);
		const holdsPlace = changes.some((change) => change.id === place);
		const open = changes.length > 0 && (!folded.has(group.id) || holdsPlace);
		const owner: OwnerRow = {
			id: group.id,
			parent: null,
			branch: changes.length > 0,
			open,
			holdsPlace,
			group,
			own,
		};
		const held = open
			? changes.map((change): HeldRow => ({
					id: change.id,
					parent: group.id,
					branch: false,
					open: false,
					change,
				}))
			: [];
		return { owner, held };
	});
}

/**
 * Keep the row of a reader's place in view, clear of the section's head, its strip and the owner
 * row that stick above it.
 * @param place The change the reader stands on.
 * @returns The ref for the element around the list.
 */
function useKeptInView(place: string | null) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (place === null) return;
		const row = box.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(place)}"]`);
		if (row === undefined || row === null) return;
		// An open owner may be stuck at the foot of its box. Scroll to its place in the list.
		const position = row.style.position;
		if (row.getAttribute("aria-expanded") === "true") row.style.position = "static";
		row.scrollIntoView({ block: "nearest", behavior: "instant" });
		row.style.position = position;
	}, [place]);
	return box;
}

/**
 * Every change of a proposal under its owner, as a tree on the grid of the left column. An owner
 * that changed itself is that change's row, and the changes it holds stand one step under it, under
 * the rail of an open row, as the parts of an open module do.
 * @param props The list, the reader's place and what a row does.
 * @returns The list.
 */
function ChangesList(props: ChangesListProps): JSX.Element {
	const { list, place, onShow } = props;
	const box = useKeptInView(place);
	const { folded, fold } = useFolds<string>();
	const branches = useMemo(() => ownerBranches(list, folded, place), [list, folded, place]);
	const rows = useMemo(
		() => branches.flatMap(({ owner, held }): ChangeRow[] => [owner, ...held]),
		[branches],
	);
	const open = useCallback(
		(row: ChangeRow): void => {
			if ("change" in row) onShow(row.change);
			else if (row.own !== undefined) onShow(row.own);
			else if (row.branch && !row.holdsPlace) fold(row.id);
		},
		[onShow, fold],
	);
	const toggle = useCallback(
		(row: ChangeRow): void => {
			if (row.branch && !row.holdsPlace) fold(row.id);
		},
		[fold],
	);
	if (list.changes.length === 0)
		return (
			<p className="text-body text-muted-foreground px-4 py-3">Nothing differs from the base.</p>
		);
	return (
		<div ref={box} data-slot="model-changes" className="min-h-0 flex-1">
			<Tree label="Changes" rows={rows} home={place} onOpen={open} onToggle={toggle}>
				{branches.map(({ owner, held }) => (
					// An owner and its rows share a box, so an open owner that sticks lets go once its rows
					// have passed and never stands over the next owner.
					<div key={owner.id} role="presentation">
						<OwnerChanges
							row={owner}
							lit={owner.own !== undefined && owner.own.id === place}
							onShow={onShow}
							onFold={fold}
						/>
						{held.length > 0 && (
							<Tree.Group depth={0} label={owner.group.name}>
								{held.map((row) => (
									<HeldChange
										key={row.id}
										change={row.change}
										lit={row.id === place}
										onShow={onShow}
									/>
								))}
							</Tree.Group>
						)}
					</div>
				))}
			</Tree>
		</div>
	);
}

/**
 * An owner's row. It holds the rail of the changes under it, which run in a group under the row,
 * so the tree draws them where it draws the rows of an open module.
 * @param props The owner's row, whether the reader stands on it, and what the row does.
 * @param props.row The owner's row.
 * @param props.lit Whether the reader stands on the owner's own change.
 * @param props.onShow Go to a change.
 * @param props.onFold Fold the owner.
 * @returns The row.
 */
function OwnerChangesOf(props: {
	readonly row: OwnerRow;
	readonly lit: boolean;
	readonly onShow: (change: Change) => void;
	readonly onFold: (id: string) => void;
}): JSX.Element {
	const { row, lit, onShow, onFold } = props;
	const { group, own } = row;
	const toggle = useCallback((): void => {
		if (!row.holdsPlace) onFold(group.id);
	}, [onFold, group.id, row.holdsPlace]);
	const open = useCallback((): void => {
		if (own !== undefined) onShow(own);
		else toggle();
	}, [own, onShow, toggle]);
	const dataset = useMemo(
		(): Record<string, string> =>
			own === undefined
				? { "data-change-owner": group.kind }
				: {
						"data-change-owner": group.kind,
						"data-change-id": own.id,
						"data-standing": own.standing,
					},
		[group.kind, own],
	);
	return (
		<Tree.Row
			id={row.id}
			depth={0}
			selected={lit}
			current={lit}
			label={own === undefined ? undefined : `${group.name}, ${own.standing}: ${own.words}`}
			expanded={row.branch ? row.open : undefined}
			dataset={dataset}
			onOpen={open}
			onToggle={toggle}
		>
			<Tree.Marker icon={OWNER_ICONS[group.kind]} title={group.kind} />
			<Tree.Name text={group.name} className={GROUP_LINE} />
			{own !== undefined && <OwnChange change={own} />}
		</Tree.Row>
	);
}

/** An owner's row changes only when its group or the place on it does. */
const OwnerChanges = memo(OwnerChangesOf);

/**
 * What an owner's own change says, at the end of its row: the mark the picture puts on it, and
 * what changed.
 * @param props The change.
 * @param props.change The owner's own change.
 * @returns The words.
 */
function OwnChange(props: { readonly change: Change }): JSX.Element {
	const { change } = props;
	return (
		<span
			title={change.words}
			className="text-body text-muted-foreground ml-2 flex max-w-[45%] min-w-0 shrink items-center gap-1.5"
		>
			<StandingSample standing={change.standing} />
			<span className="truncate">{change.words}</span>
		</span>
	);
}

/**
 * One change that an owner holds: the mark the picture puts on it, and what changed.
 * @param props The change, whether the reader stands on it, and what a click does.
 * @param props.change The change.
 * @param props.lit Whether the reader stands on it.
 * @param props.onShow Go to it.
 * @returns The row.
 */
function HeldChangeOf(props: {
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
		<Tree.Row
			id={change.id}
			depth={1}
			leaf
			selected={lit}
			current={lit}
			dataset={dataset}
			onOpen={open}
		>
			<Tree.Marker title={change.standing}>
				<StandingSample standing={change.standing} />
			</Tree.Marker>
			<Tree.Name text={change.words} />
		</Tree.Row>
	);
}

/** The rows change one at a time, and a long list holds thousands. */
const HeldChange = memo(HeldChangeOf);

/**
 * How many changes came, moved and went, after the count of the section: the mark that the picture
 * and the list put on each, and how many wear it.
 * @param props The list.
 * @param props.list The list.
 * @returns The counts, or nothing for a list with no change.
 */
function ChangesSummary(props: { readonly list: ChangeList | null }): JSX.Element | null {
	const { list } = props;
	const counts = useMemo(
		() =>
			STANDINGS.map((standing) => ({
				standing,
				count: list?.changes.filter((change) => change.standing === standing).length ?? 0,
			})).filter(({ count }) => count > 0),
		[list],
	);
	if (counts.length === 0) return null;
	return (
		<span
			data-slot="model-change-summary"
			className="text-technical text-muted-foreground flex items-center gap-2 font-mono font-normal"
		>
			{counts.map(({ standing, count }) => (
				<span key={standing} title={`${count} ${standing}`} className="flex items-center gap-1">
					<StandingSample standing={standing} />
					{count}
				</span>
			))}
		</span>
	);
}

/**
 * A key that a control answers to, as the tip of a key that brings up Find draws its key: a chip
 * filled with a tint of the button's own ink, with no edge, centred on the button's line.
 * @param props The key.
 * @param props.letter The key.
 * @returns The cap.
 */
function KeyCap(props: { readonly letter: string }): JSX.Element {
	return (
		<kbd
			aria-hidden="true"
			className="text-technical rounded-chip inline-flex h-4 min-w-4 items-center justify-center bg-current/12 px-1 font-mono leading-none"
		>
			<span className="opacity-80">{props.letter}</span>
		</kbd>
	);
}

/**
 * The walk of the changes, on the strip under the head of the section that lists them: the way
 * back at the start, where the reader stands in the middle, and the way on, the one primary action
 * of a review, at the end. Each names the key that does the same from anywhere in the pane.
 * @param props The walk.
 * @param props.walk The walk.
 * @returns The controls.
 */
function ChangesWalker(props: { readonly walk: ChangeWalk }): JSX.Element {
	const { hasPrevious, hasNext, step, position, count } = props.walk;
	const previous = useCallback((): void => void step(-1), [step]);
	const next = useCallback((): void => void step(1), [step]);
	return (
		<div data-slot="model-change-walk" className="flex w-full items-center gap-2">
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
			<span
				data-slot="model-change-place"
				className="text-control text-muted-foreground min-w-0 flex-1 truncate text-center whitespace-nowrap tabular-nums"
			>
				{position === undefined ? (
					`${count} to review`
				) : (
					<>
						<span className="text-foreground">{position + 1}</span> of {count}
					</>
				)}
			</span>
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
const ModelChanges = {
	Interfaces: ModelInterfaceChanges,
	List: ChangesList,
	Summary: ChangesSummary,
	Walker: ChangesWalker,
};

export { ModelChanges };

import { memo, useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";

import { Button } from "@archboard/ui-kit/components";
import { StandingSample } from "#ui/architecture-drawing/canvas/presentation/components/SemanticTypeSamples.tsx";
import { Tree } from "#ui/shell/components/Tree.tsx";
import type { ChangeWalk } from "#ui/architecture-drawing/model-reader/hooks/use-change-walk.ts";
import type {
	Change,
	ChangeList,
} from "#ui/architecture-drawing/model-reader/rules/change-list.ts";
import {
	interfaceRowWords,
	type InterfaceFact,
	type InterfaceRow,
} from "#ui/architecture-drawing/model-reader/rules/interface-changes.ts";
import { NAME_GAP, ROW_HEIGHT } from "#ui/shell/rules/tree-grid.ts";

/** One row of a flat tree, and what it stands for. */
interface FlatRow<Item> {
	readonly id: string;
	readonly parent: null;
	readonly branch: false;
	readonly open: false;
	readonly item: Item;
}

/** Inputs for the list. */
interface ChangesListProps {
	readonly list: ChangeList;
	/** The change the reader stands on. */
	readonly place: string | null;
	readonly onShow: (change: Change) => void;
}

/** Inputs for the interface changes. */
interface InterfaceChangesProps {
	readonly rows: readonly InterfaceRow[];
	/** The one selected subject. */
	readonly selected: string | null;
	readonly onShow: (row: InterfaceRow) => void;
}

/** How many parts a fact names before it says how many more, as a list of the panel does. */
const NAMES_SHOWN = 4;

/** What a row says of its module starts where its name does. */
const ROW_DETAILS_STYLE = { marginLeft: NAME_GAP } as const;

/**
 * What a list says to the keys of a tree: rows with nothing under them.
 * @param items What it lists.
 * @returns The rows.
 */
function flatRows<Item extends { readonly id: string }>(
	items: readonly Item[],
): readonly FlatRow<Item>[] {
	return items.map((item) => ({ id: item.id, parent: null, branch: false, open: false, item }));
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
	const rows = useMemo(() => flatRows(list.changes), [list]);
	const open = useCallback((row: FlatRow<Change>): void => onShow(row.item), [onShow]);
	if (list.changes.length === 0)
		return (
			<p className="text-body text-muted-foreground px-4 py-3">Nothing differs from the base.</p>
		);
	return (
		<div ref={box} data-slot="model-changes" className="min-h-0 flex-1">
			<Tree label="Changes" rows={rows} home={place} onOpen={open}>
				{list.groups.map((group) => (
					<Tree.Section key={group.id} label={group.name}>
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
		<Tree.Row
			id={change.id}
			depth={0}
			flat
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
const ChangeRow = memo(ChangeRowOf);

/**
 * What a proposal changes about interfaces, which stands above every other change because an
 * interface change costs every caller (ADR 0044). A proposal with none says so, so that a reader
 * learns that it costs no caller a change.
 * @param props The modules, the selection and what a row does.
 * @returns The section.
 */
function InterfaceChanges(props: InterfaceChangesProps): JSX.Element {
	const { rows, selected, onShow } = props;
	const tree = useMemo(() => flatRows(rows), [rows]);
	const open = useCallback((row: FlatRow<InterfaceRow>): void => onShow(row.item), [onShow]);
	if (rows.length === 0)
		return (
			<p
				data-slot="model-interface-unchanged"
				className="text-body text-muted-foreground border-border border-b px-4 py-3"
			>
				No interface changes, so no caller has to change.
			</p>
		);
	return (
		<div data-slot="model-interface-changes" className="border-border border-b">
			<Tree label="Interface changes" rows={tree} home={selected} onOpen={open}>
				<Tree.Section label="Interface changes">
					{rows.map((row) => (
						<InterfaceChangeRow key={row.id} row={row} lit={row.id === selected} onShow={onShow} />
					))}
				</Tree.Section>
			</Tree>
		</div>
	);
}

/**
 * One module, once: its name, what moved and the counts that differ.
 * @param props The module, whether it is selected, and what a click does.
 * @param props.row The module.
 * @param props.lit Whether it is selected.
 * @param props.onShow Select it on the picture.
 * @returns The row.
 */
function InterfaceChangeRow(props: {
	readonly row: InterfaceRow;
	readonly lit: boolean;
	readonly onShow: (row: InterfaceRow) => void;
}): JSX.Element {
	const { row, lit, onShow } = props;
	const open = useCallback((): void => onShow(row), [onShow, row]);
	const dataset = useMemo(() => ({ "data-interface-change": row.id }), [row.id]);
	return (
		<Tree.Row
			id={row.id}
			depth={0}
			flat
			selected={lit}
			current={lit}
			label={interfaceRowWords(row)}
			dataset={dataset}
			onOpen={open}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<Tree.Name text={row.name} />
				<span style={ROW_DETAILS_STYLE} className="flex flex-col gap-0.5">
					{row.facts.map((fact) => (
						<InterfaceFactLine key={fact.key} fact={fact} />
					))}
					<InterfaceCounts row={row} />
				</span>
			</span>
		</Tree.Row>
	);
}

/**
 * One fact: what moved, then the parts it names, with the whole list on hover.
 * @param props The fact.
 * @param props.fact The fact.
 * @returns The line.
 */
function InterfaceFactLine(props: { readonly fact: InterfaceFact }): JSX.Element {
	const { key, label, names } = props.fact;
	const more = names.length - NAMES_SHOWN;
	const shown = names.slice(0, NAMES_SHOWN).join(", ");
	return (
		<span
			data-fact={key}
			title={names.join(", ")}
			className="text-body text-muted-foreground break-words"
		>
			{label} <span className="text-foreground">{more > 0 ? `${shown} +${more}` : shown}</span>
		</span>
	);
}

/**
 * The counts that differ, each kept whole, so that a narrow column breaks between them.
 * @param props The module.
 * @param props.row The module.
 * @returns The counts, or nothing for a module with no count to set side by side.
 */
function InterfaceCounts(props: { readonly row: InterfaceRow }): JSX.Element | null {
	const { measures } = props.row;
	if (measures.length === 0) return null;
	return (
		<span className="text-body text-muted-foreground flex flex-wrap gap-x-2">
			{measures.map(({ key, label, before, after }) => (
				<span key={key} className="whitespace-nowrap">
					{label}{" "}
					<span className="text-technical font-mono">
						{before} → {after}
					</span>
				</span>
			))}
		</span>
	);
}

/**
 * A key that a control answers to, in the look of the one that brings up Find.
 * @param props The key.
 * @param props.letter The key.
 * @returns The cap.
 */
function KeyCap(props: { readonly letter: string }): JSX.Element {
	return (
		<kbd className="text-technical rounded-control border border-current/30 px-1 font-mono leading-4">
			{props.letter}
		</kbd>
	);
}

/**
 * The controls of the walk, which say where the reader stands and name the keys that do the same.
 * @param props The walk.
 * @param props.walk The walk.
 * @returns The controls.
 */
function ChangesWalker(props: { readonly walk: ChangeWalk }): JSX.Element {
	const { hasPrevious, hasNext, step, position, count } = props.walk;
	const previous = useCallback((): void => void step(-1), [step]);
	const next = useCallback((): void => void step(1), [step]);
	return (
		<div data-slot="model-change-walk" className="flex shrink-0 items-center gap-1">
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
			{position !== undefined && (
				<span
					data-slot="model-change-place"
					className="text-control px-1 whitespace-nowrap tabular-nums"
				>
					{position + 1} of {count}
				</span>
			)}
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
const ModelChanges = { Interfaces: InterfaceChanges, List: ChangesList, Walker: ChangesWalker };

export { ModelChanges };

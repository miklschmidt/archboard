import { useCallback, useMemo, type JSX } from "react";

import {
	OWNER_ICONS,
	SECTION_ICONS,
} from "#ui/architecture-drawing/model-reader/reading/constants/section-icons.ts";
import { useFolds } from "#ui/architecture-drawing/model-reader/reading/hooks/use-folds.ts";
import {
	interfaceRowWords,
	type InterfaceFact,
	type InterfaceRow,
} from "#ui/architecture-drawing/model-reader/rules/interface-changes.ts";
import { Tree } from "#ui/shell/components/Tree.tsx";
import { GROUP_LINE } from "#ui/shell/rules/row-tone.ts";
import { NAME_GAP } from "#ui/shell/rules/tree-grid.ts";

/** A row of the interface changes: their head, or one module under it. */
interface InterfaceTreeRow {
	readonly id: string;
	readonly parent: string | null;
	readonly branch: boolean;
	readonly open: boolean;
	/** The module, or nothing for the head. */
	readonly item: InterfaceRow | undefined;
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

/** What a row says under its name starts where its name does. */
const ROW_DETAILS_STYLE = { marginLeft: NAME_GAP } as const;

/** The row that heads the interface changes. */
const INTERFACE_HEAD = "interface-changes";

/**
 * What a proposal changes about interfaces, which stands above every other change because an
 * interface change costs every caller (ADR 0044). A proposal with none says so, so that a reader
 * learns that it costs no caller a change. The changes stand under a row of their own, as the
 * changes of an owner stand under its row, and fold with it. These rows select their module and
 * are no step of the walk, which the head says on hover.
 * @param props The modules, the selection and what a row does.
 * @returns The block.
 */
function ModelInterfaceChanges(props: InterfaceChangesProps): JSX.Element {
	const { rows, selected, onShow } = props;
	const { folded, fold } = useFolds<string>();
	const open = !folded.has(INTERFACE_HEAD);
	const tree = useMemo(
		(): readonly InterfaceTreeRow[] => [
			{ id: INTERFACE_HEAD, parent: null, branch: true, open, item: undefined },
			...(open
				? rows.map((item): InterfaceTreeRow => ({
						id: item.id,
						parent: INTERFACE_HEAD,
						branch: false,
						open: false,
						item,
					}))
				: []),
		],
		[rows, open],
	);
	const toggle = useCallback((): void => fold(INTERFACE_HEAD), [fold]);
	const openRow = useCallback(
		(row: InterfaceTreeRow): void => {
			if (row.item === undefined) toggle();
			else onShow(row.item);
		},
		[onShow, toggle],
	);
	if (rows.length === 0)
		return (
			<p
				data-slot="model-interface-unchanged"
				className="text-body text-muted-foreground flex items-center gap-1.5 px-2 py-1.5"
			>
				<SECTION_ICONS.interfaceChanges aria-hidden="true" className="size-4 shrink-0" />
				No interface changes, so no caller has to change.
			</p>
		);
	return (
		<div data-slot="model-interface-changes">
			<Tree
				label="Interface changes"
				rows={tree}
				home={selected}
				onOpen={openRow}
				onToggle={toggle}
			>
				<Tree.Row
					id={INTERFACE_HEAD}
					depth={0}
					selected={false}
					expanded={open}
					onOpen={toggle}
					onToggle={toggle}
				>
					<Tree.Marker icon={SECTION_ICONS.interfaceChanges} />
					<Tree.Name
						text="Interface changes"
						title="Each row selects its module. N and P walk the changes under these."
						className={GROUP_LINE}
					/>
					<Tree.Facts>{rows.length}</Tree.Facts>
				</Tree.Row>
				{open && (
					<Tree.Group depth={0} label="Interface changes">
						{rows.map((row) => (
							<InterfaceChangeRow
								key={row.id}
								row={row}
								lit={row.id === selected}
								onShow={onShow}
							/>
						))}
					</Tree.Group>
				)}
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
			depth={1}
			leaf
			selected={lit}
			current={lit}
			label={interfaceRowWords(row)}
			dataset={dataset}
			onOpen={open}
		>
			<span className="flex min-w-0 flex-1 items-start py-0.5">
				<Tree.Marker icon={OWNER_ICONS.module} title="module" />
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<Tree.Name text={row.name} />
					<span style={ROW_DETAILS_STYLE} className="flex flex-col gap-0.5">
						{row.facts.map((fact) => (
							<InterfaceFactLine key={fact.key} fact={fact} />
						))}
						<InterfaceCounts row={row} />
					</span>
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
		<span className="text-body text-muted-foreground flex flex-wrap gap-x-3">
			{measures.map(({ key, label, before, after }) => (
				<span key={key} className="whitespace-nowrap">
					{label}{" "}
					<span className="text-technical text-foreground font-mono">
						{before} → {after}
					</span>
				</span>
			))}
		</span>
	);
}

export { ModelInterfaceChanges };

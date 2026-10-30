import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";

import { Tree } from "#ui/components/shell/Tree.tsx";
import { ROW_GUTTER } from "#ui/rules/shell/tree-grid.ts";

/** One thing a list offers. */
interface Choice {
	readonly id: string;
	readonly name: string;
}

/** Inputs for a list of choices. */
interface ModelChoiceListProps<Entry extends Choice> {
	readonly label: string;
	/** What concerns the open scope. */
	readonly near: readonly Entry[];
	/** Everything else, behind one row. */
	readonly rest: readonly Entry[];
	/** What the row that holds the rest says, before its count. */
	readonly restLabel: string;
	/** The entry on screen. */
	readonly lit: string | null;
	/** The data attribute that names an entry. */
	readonly attribute: string;
	readonly onChoose: (entry: Entry, beside: boolean) => void;
	/** What a row says at its end. */
	readonly facts?: ((entry: Entry) => ReactNode) | undefined;
	/** What stands under the lit row. */
	readonly under?: ReactNode;
}

/** The id of the row that holds the rest. */
const REST = "rest";

/** The space a control under a row keeps from the column's edge. */
const UNDER_STYLE = { paddingLeft: 24 - ROW_GUTTER } as const;

/**
 * A list that stays open while the reader walks it: what concerns the open scope, then one
 * row that holds the rest. A scope with nothing of its own offers that row alone.
 * @param props The entries and what choosing one does.
 * @returns The list.
 */
function ModelChoiceList<Entry extends Choice>(props: ModelChoiceListProps<Entry>): JSX.Element {
	const { near, rest, lit, onChoose } = props;
	const [opened, setOpened] = useState(false);
	const toggle = useCallback((): void => setOpened((current) => !current), []);
	const shown = opened || rest.some((entry) => entry.id === lit);
	const rows = useMemo(
		() => [
			...near.map((entry) => ({ id: entry.id, parent: null, branch: false, open: false, entry })),
			...(rest.length === 0
				? []
				: [{ id: REST, parent: null, branch: true, open: shown, entry: null }]),
			...(shown
				? rest.map((entry) => ({ id: entry.id, parent: REST, branch: false, open: false, entry }))
				: []),
		],
		[near, rest, shown],
	);
	const open = useCallback(
		(row: (typeof rows)[number], beside: boolean): void => {
			if (row.entry === null) toggle();
			else onChoose(row.entry, beside);
		},
		[onChoose, toggle],
	);
	return (
		<Tree label={props.label} rows={rows} home={lit} onOpen={open} onToggle={toggle}>
			{near.map((entry) => (
				<ChoiceRow key={entry.id} {...props} entry={entry} depth={0} />
			))}
			{rest.length > 0 && (
				<Tree.Row
					id={REST}
					depth={0}
					selected={false}
					expanded={shown}
					onOpen={toggle}
					onToggle={toggle}
				>
					<Tree.Name
						text={`${props.restLabel} (${near.length + rest.length})`}
						className="text-muted-foreground"
					/>
				</Tree.Row>
			)}
			{shown && rest.length > 0 && (
				<Tree.Group depth={0}>
					{rest.map((entry) => (
						<ChoiceRow key={entry.id} {...props} entry={entry} depth={1} />
					))}
				</Tree.Group>
			)}
		</Tree>
	);
}

/**
 * One entry, and what stands under it while it is lit.
 * @param props The entry and its list.
 * @returns The row.
 */
function ChoiceRow<Entry extends Choice>(
	props: ModelChoiceListProps<Entry> & {
		readonly entry: Entry;
		readonly depth: number;
	},
): JSX.Element {
	const { entry, onChoose } = props;
	const selected = entry.id === props.lit;
	const open = useCallback((beside: boolean) => onChoose(entry, beside), [onChoose, entry]);
	const dataset = useMemo(() => ({ [props.attribute]: entry.id }), [props.attribute, entry.id]);
	return (
		<>
			<Tree.Row
				id={entry.id}
				depth={props.depth}
				selected={selected}
				current={selected}
				dataset={dataset}
				onOpen={open}
			>
				<Tree.Name text={entry.name} />
				{props.facts !== undefined && <Tree.Facts>{props.facts(entry)}</Tree.Facts>}
			</Tree.Row>
			{selected && props.under !== undefined && (
				<div style={UNDER_STYLE} className="py-1">
					{props.under}
				</div>
			)}
		</>
	);
}

export { ModelChoiceList };

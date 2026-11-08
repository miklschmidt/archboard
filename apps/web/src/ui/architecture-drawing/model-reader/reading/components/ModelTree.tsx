import { useCallback, useMemo, useRef, type JSX } from "react";

import { Tree } from "#ui/shell/components/Tree.tsx";
import { useRevealedRow } from "#ui/architecture-drawing/model-reader/reading/hooks/use-revealed-row.ts";
import {
	treeRows,
	type ModuleBranch,
	type ModuleRow,
	type ModuleTree,
} from "#ui/architecture-drawing/model-reader/rules/module-tree.ts";

/** Inputs for the tree. */
interface ModelTreeProps {
	readonly tree: ModuleTree;
	readonly open: ReadonlySet<string>;
	/** The module the pane has open. */
	readonly scope: string | null;
	/** The module that is selected on the picture, or null. */
	readonly selected: string | null;
	readonly onToggle: (id: string) => void;
	readonly onOpen: (id: string, beside: boolean) => void;
	/** A printable key typed in the tree, handed to Find. */
	readonly onTypeAhead: (text: string) => void;
	/**
	 * Whether the column keeps the lit row in view. A proposal's column follows its changes
	 * instead, because the walk opens the module of each change.
	 */
	readonly follows: boolean;
}

/**
 * The row that shows a module, which a fold can share with others.
 * @param tree The tree.
 * @param id The module, or null.
 * @returns The row's id, or null.
 */
function rowOf(tree: ModuleTree, id: string | null): string | null {
	return id === null ? null : (tree.owner.get(id)?.id ?? null);
}

/**
 * The row that is lit: the selected module's while it is drawn, or else the open scope's.
 * @param rows The drawn rows.
 * @param picked The selected module's row.
 * @param opened The open scope's row.
 * @returns The row's id and how many rows stick above it.
 */
function litRow(rows: readonly ModuleRow[], picked: string | null, opened: string | null) {
	const row = rows.find((one) => one.id === picked) ?? rows.find((one) => one.id === opened);
	return { lit: row?.id ?? opened, depth: row?.depth ?? 0 };
}

/**
 * The Modules tree.
 * @param props The tree and what the reader does in it.
 * @returns The tree.
 */
function ModelTree(props: ModelTreeProps): JSX.Element {
	const { tree, open, scope, selected, onToggle, onOpen, onTypeAhead, follows } = props;
	const list = useRef<HTMLDivElement>(null);
	const rows = useMemo(() => treeRows(tree, open), [tree, open]);
	const opened = rowOf(tree, scope);
	const { lit, depth } = litRow(rows, rowOf(tree, selected), opened);
	useRevealedRow(list, follows ? lit : null, depth);
	const toggle = useCallback((row: ModuleRow): void => onToggle(row.id), [onToggle]);
	const openRow = useCallback(
		(row: ModuleRow, beside: boolean): void => onOpen(row.module.end, beside),
		[onOpen],
	);
	return (
		<div ref={list} data-slot="model-tree" className="min-h-0 flex-1">
			<Tree
				label="Modules"
				rows={rows}
				home={lit}
				onOpen={openRow}
				onToggle={toggle}
				onTypeAhead={onTypeAhead}
			>
				{tree.roots.map((branch) => (
					<BranchRow
						key={branch.id}
						{...props}
						branch={branch}
						depth={0}
						lit={lit}
						opened={opened}
					/>
				))}
			</Tree>
		</div>
	);
}

/**
 * One branch and, while it is open, what it holds.
 * @param props The branch and the tree's state.
 * @returns The row and its group.
 */
function BranchRow(
	props: ModelTreeProps & {
		readonly branch: ModuleBranch;
		readonly depth: number;
		readonly lit: string | null;
		readonly opened: string | null;
	},
): JSX.Element {
	const { branch, depth, onOpen, onToggle } = props;
	const open = useCallback((beside: boolean) => onOpen(branch.end, beside), [onOpen, branch.end]);
	const fold = useCallback(() => onToggle(branch.id), [onToggle, branch.id]);
	const holds = branch.children.length > 0;
	const expanded = holds ? props.open.has(branch.id) : undefined;
	const dataset = useMemo(() => ({ "data-module-row": branch.end }), [branch.end]);
	return (
		<>
			<Tree.Row
				id={branch.id}
				depth={depth}
				selected={branch.id === props.lit}
				current={branch.id === props.opened}
				expanded={expanded}
				dataset={dataset}
				onOpen={open}
				onToggle={fold}
			>
				<Tree.Name
					text={branch.name}
					title={branch.path === undefined ? branch.name : `${branch.name}\n${branch.path}`}
				/>
			</Tree.Row>
			{expanded === true && (
				<Tree.Group depth={depth}>
					{branch.children.map((child) => (
						<BranchRow key={child.id} {...props} branch={child} depth={depth + 1} />
					))}
				</Tree.Group>
			)}
		</>
	);
}

export { ModelTree };

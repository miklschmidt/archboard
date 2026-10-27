// The rows the navigator draws and what they are derived from: a repository,
// a folder, a board, one variant of a board, and the Earlier row that gathers a
// board's historical and shelved variants. Every row carries its depth and the
// repository it is in, and nothing else places it.

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { OutlineNode } from "#ui/rules/board-catalog/outline.ts";
import type { TextRange } from "#ui/rules/shell/text-match.ts";
import type { ShellRepository } from "#ui/rules/shell/contracts.ts";
import type {
	AgentActivityEntry,
	CatalogBoard,
	ListedVariant,
} from "#ui/rules/pane-session/session-types.ts";

/** What every row carries. */
interface RowBase {
	/** Stable across renders and unique in the list. */
	readonly id: string;
	/** How deep the row sits: 0 at the top. Its indent follows from this alone. */
	readonly depth: number;
	/** The row it sits under, or null at the top. */
	readonly parentId: string | null;
	/** Shown only to place a match: the row itself did not match the filter. */
	readonly dimmed: boolean;
	/** Where the filter matched the row's name, or null. */
	readonly match: TextRange | null;
	/** Its place among its siblings, from 1, for assistive technology. */
	readonly position: number;
	/** How many siblings it has, itself included. */
	readonly siblings: number;
	/** The repository the row is in, by name (ADR 0050). */
	readonly repository: string;
	/** The vault of that repository's chosen checkout, or null while it has none. */
	readonly vault: string | null;
}

/**
 * A repository at the top of the tree, with the boards of its chosen checkout
 * under it and a menu of its checkouts (ADR 0050).
 */
interface RepositoryRow extends RowBase {
	readonly model?: ShellRepository["model"];
	readonly kind: "repository";
	readonly entry: RepositoryEntry;
	/** How many boards it holds. */
	readonly count: number;
	/** Whether it has rows to list: no disclosure while it holds nothing. */
	readonly expandable: boolean;
	readonly expanded: boolean;
	/** An agent works on a board inside it while it is closed. */
	readonly innerActivity: boolean;
	/** Why its boards could not be read, or null. */
	readonly error: string | null;
	/** Its vault has not answered yet. */
	readonly loading: boolean;
}

/** What a row a pane can show carries: the pane letters and the selection. */
interface ShownRow {
	/** The letters of the panes this row is the most specific row of, when there are two panes. */
	readonly onScreen: readonly string[];
	/** The tree's one selected row: the most specific row of the active pane. */
	readonly selected: boolean;
}

/** A folder in the boards' names. */
interface FolderRow extends RowBase {
	readonly kind: "folder";
	readonly name: string;
	/** How many boards it holds at any depth. */
	readonly count: number;
	readonly expanded: boolean;
	/** An agent works on a board inside it while it is closed. */
	readonly innerActivity: boolean;
}

/** A board. */
interface BoardRow extends RowBase, ShownRow {
	readonly kind: "board";
	readonly board: CatalogBoard;
	/** The name without its folders. */
	readonly label: string;
	/** Something can be listed under it: the boards it drills down to, or its variants. */
	readonly expandable: boolean;
	/** What is under it is listed. */
	readonly expanded: boolean;
	/** How many of its variants are drafts. */
	readonly drafts: number;
	/** The active pane shows this board, in one variant or another. */
	readonly reading: boolean;
	/** What an agent is doing to it, or null. */
	readonly activity: AgentActivityEntry | null;
	/** An agent works on a board under it while it is closed. */
	readonly innerActivity: boolean;
	/** It has variants and none is current (ADR 0031). */
	readonly unbuilt: boolean;
}

/** One variant of a board: a reading a pane can open. */
interface VariantRow extends RowBase, ShownRow {
	readonly kind: "variant";
	readonly board: CatalogBoard;
	readonly variant: ListedVariant;
}

/** The historical and shelved variants of a board, gathered behind one row. */
interface EarlierRow extends RowBase {
	readonly kind: "earlier";
	readonly board: CatalogBoard;
	/** How many variants it gathers. */
	readonly count: number;
	readonly expanded: boolean;
}

/** One row the navigator draws. */
type NavigatorRow = RepositoryRow | FolderRow | BoardRow | VariantRow | EarlierRow;

/** One pane as the rows read it. */
interface PaneMark {
	readonly letter: string;
	/** The repository the server says the pane is in, by name, or null when it named none. */
	readonly repository: string | null;
	/** The board's name the pane shows, or null. */
	readonly board: string | null;
	/** The listed key of the variant it shows, or null. */
	readonly key: string | null;
	/** It is the active pane. */
	readonly active: boolean;
}

/** Everything the rows are derived from. */
interface NavigatorInputs {
	/** Every repository, with its boards and what agents do in it. */
	readonly repositories: readonly ShellRepository[];
	/** Whether a row is open, by its id, when no filter is on. */
	readonly expanded: (id: string) => boolean;
	/** The filter, folded; empty when none. */
	readonly query: string;
	/** Every pane, lettered; letters are drawn only when there are two. */
	readonly panes: readonly PaneMark[];
}

/** What the rows of one repository are derived from, with ids as its outline spells them. */
interface NavigatorRowInputs {
	readonly outline: readonly OutlineNode<CatalogBoard>[];
	/** Whether a folder, board or Earlier row is open, when no filter is on. */
	readonly expanded: (id: string) => boolean;
	/** The filter, folded; empty when none. */
	readonly query: string;
	/** Every pane, lettered; letters are drawn only when there are two. */
	readonly panes: readonly PaneMark[];
	/** What agents are doing, by board key (ADR 0022). */
	readonly activity: Readonly<Record<string, AgentActivityEntry>>;
}

/** A row before its place among its siblings and the panes is known. */
type Unplaced<Row extends NavigatorRow> = Row extends NavigatorRow
	? Omit<Row, "position" | "siblings" | keyof ShownRow>
	: never;

/** A row of one repository's outline, before it is placed in that repository. */
type Unscoped<Row extends NavigatorRow> = Row extends NavigatorRow
	? Omit<Unplaced<Row>, "repository" | "vault">
	: never;

/** Where a row goes: its depth and the row it sits under. */
interface RowPlace {
	readonly depth: number;
	readonly parentId: string | null;
}

export type {
	BoardRow,
	EarlierRow,
	FolderRow,
	NavigatorInputs,
	NavigatorRow,
	NavigatorRowInputs,
	PaneMark,
	RepositoryRow,
	RowPlace,
	ShownRow,
	Unplaced,
	Unscoped,
	VariantRow,
};

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import type { TextRange } from "#ui/rules/shell/text-match.ts";
import type { ShellRepository } from "#ui/rules/shell/contracts.ts";

/** One repository and the canonical model that its chosen checkout supplies. */
interface RepositoryRow {
	readonly id: string;
	readonly kind: "repository";
	readonly repository: string;
	readonly entry: RepositoryEntry;
	readonly model: ShellRepository["model"];
	readonly migrationRequired: ShellRepository["migrationRequired"];
	readonly match: TextRange | null;
	readonly position: number;
	readonly siblings: number;
	readonly innerActivity: boolean;
	readonly error: string | null;
	readonly loading: boolean;
	readonly onScreen: readonly string[];
	readonly selected: boolean;
}

type NavigatorRow = RepositoryRow;

/** The server's repository identity determines which row represents each pane. */
interface PaneMark {
	readonly letter: string;
	readonly repository: string | null;
	readonly active: boolean;
}

/** The canonical repository catalogue, filter, and current pane locations. */
interface NavigatorInputs {
	readonly repositories: readonly ShellRepository[];
	readonly query: string;
	readonly panes: readonly PaneMark[];
}

export type { RepositoryRow, NavigatorRow, PaneMark, NavigatorInputs };

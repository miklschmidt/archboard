// Assembling the shell's view from what the application holds: the pane list,
// the pane records, the mounted panes, the listing and the notices. Pure, so
// the assembly can be checked without a browser.

import type { ReactNode } from "react";

import type { AgentActivityByVault } from "#ui/hooks/application/use-agent-activity.ts";
import { NO_AGENT_ACTIVITY } from "#ui/rules/application/agent-activity.ts";
import type { PaneList } from "#ui/rules/application/pane-list.ts";
import { recordFor, type PaneRecords } from "#ui/rules/application/pane-records.ts";
import {
	boardsIn,
	type BoardCatalog,
	type RepositoryBoards,
} from "#ui/hooks/board-catalog/use-board-catalog.ts";
import { listedBoard } from "#ui/rules/board-catalog/listing.ts";
import { outlineOf } from "#ui/rules/board-catalog/vault-boards.ts";
import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import type {
	ShellNotice,
	ShellPane,
	ShellPresentation,
	ShellRepository,
	ShellView,
	ThemeChoice,
} from "#ui/rules/shell/contracts.ts";

/** What the view is assembled from. */
interface ShellViewInputs {
	readonly theme: ThemeChoice;
	readonly list: PaneList;
	readonly records: PaneRecords;
	/** The mounted pane per pane id. */
	readonly panes: Readonly<Record<string, ReactNode>>;
	readonly catalog: Pick<BoardCatalog, "repositories" | "error" | "loading">;
	readonly presentation: ShellPresentation | null;
	readonly notices: readonly ShellNotice[];
	readonly agentActivity: AgentActivityByVault;
}

/**
 * One repository as the shell lists it.
 * @param entry The repository and its boards.
 * @param activity What agents are doing, by vault.
 * @returns The shell's repository.
 */
function shellRepository(entry: RepositoryBoards, activity: AgentActivityByVault): ShellRepository {
	const { vault } = entry.repository;
	const current = vault === null ? undefined : activity[vault];
	return {
		repository: entry.repository,
		model: entry.model,
		boards: entry.listing,
		outline: outlineOf(entry.listing),
		error: entry.error,
		loading: entry.loading,
		activity: current ?? NO_AGENT_ACTIVITY,
	};
}

/** The repositories last made for one catalog answer, and what they were made from. */
interface MadeRepositories {
	readonly activity: AgentActivityByVault;
	readonly repositories: readonly ShellRepository[];
}

/**
 * The repositories last made for each catalog answer. Pane news (a claim, what
 * an agent says it is doing, a pane status) assembles the view again and
 * changes none of them, so the navigator keeps the same list and makes no row
 * again for it (TASK-385.04).
 */
const madeRepositories = new WeakMap<readonly RepositoryBoards[], MadeRepositories>();

/**
 * Every repository as the shell lists it, the same list while nothing it is
 * made from has changed.
 * @param inputs The view's inputs.
 * @returns The repositories.
 */
function shellRepositories(inputs: ShellViewInputs): readonly ShellRepository[] {
	const { catalog, agentActivity: activity } = inputs;
	const kept = madeRepositories.get(catalog.repositories);
	if (kept?.activity === activity) {
		return kept.repositories;
	}
	const repositories = catalog.repositories.map((entry) => shellRepository(entry, activity));
	madeRepositories.set(catalog.repositories, { activity, repositories });
	return repositories;
}

/**
 * The name a pane's board is listed under in the pane's own repository.
 * @param inputs The view's inputs.
 * @param vault The pane's vault.
 * @param boardKey The pane's board key.
 * @returns The listed name, or null when it is not listed.
 */
function listedName(
	inputs: ShellViewInputs,
	vault: string | null,
	boardKey: string | null,
): string | null {
	const board = boardAddressOf(boardKey)?.board;
	if (board === undefined) return null;
	return listedBoard(boardsIn(inputs.catalog, vault), board)?.name ?? null;
}

/**
 * Each pane as the shell draws it.
 * @param inputs The view's inputs.
 * @returns The panes, in reading order.
 */
function shellPanes(inputs: ShellViewInputs): ShellPane[] {
	return inputs.list.panes.map((entry) => {
		const record = recordFor(inputs.records, entry.paneId);
		return {
			status: record.status,
			stage: inputs.panes[entry.paneId] ?? null,
			holder: record.holder,
			takeBack: record.takeBack,
			boardName: listedName(inputs, record.status.vault, record.status.boardKey),
		};
	});
}

/**
 * The shell's view.
 * @param inputs What it is assembled from.
 * @returns The view.
 */
function assembleShellView(inputs: ShellViewInputs): ShellView {
	const active = recordFor(inputs.records, inputs.list.activePaneId);
	return {
		theme: inputs.theme,
		repositories: shellRepositories(inputs),
		boardsError: inputs.catalog.error,
		boardsLoading: inputs.catalog.loading,
		selectedBoardKey: active.status.boardKey,
		panes: shellPanes(inputs),
		activePaneId: inputs.list.activePaneId,
		presentation: inputs.presentation,
		notices: inputs.notices,
	};
}

export { assembleShellView, type ShellViewInputs };

// Assembling the shell's view from what the application holds: the pane list,
// the pane records, the mounted panes, the listing and the notices. Pure, so
// the assembly can be checked without a browser.

import type { ReactNode } from "react";

import type { AgentActivityByVault } from "@/ui/application/hooks/use-agent-activity";
import { NO_AGENT_ACTIVITY } from "@/ui/application/agent-activity";
import type { PaneList } from "@/ui/application/pane-list";
import { recordFor, type PaneRecords } from "@/ui/application/pane-records";
import {
	boardsIn,
	listedBoard,
	outlineOf,
	type BoardCatalog,
	type RepositoryBoards,
} from "@/ui/board-catalog";
import { boardAddressOf } from "@/ui/semantic-board-canvas";
import type {
	ShellNotice,
	ShellPane,
	ShellPresentation,
	ShellRepository,
	ShellView,
	ThemeChoice,
} from "@/ui/shell";

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
 * @param heard The vaults a pane of this tab is in.
 * @returns The shell's repository.
 */
function shellRepository(
	entry: RepositoryBoards,
	activity: AgentActivityByVault,
	heard: ReadonlySet<string | null>,
): ShellRepository {
	const { vault } = entry.repository;
	// The server tells a vault's activity only to the panes in that vault (ADR
	// 0022), so what the tab last heard of a vault that none of its panes is in
	// now is old news.
	const current = vault !== null && heard.has(vault) ? activity[vault] : undefined;
	return {
		repository: entry.repository,
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
	/** The vaults the panes were in, spelled as one key. */
	readonly heard: string;
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
	const vaults = new Set(
		inputs.list.panes.map((entry) => recordFor(inputs.records, entry.paneId).status.vault),
	);
	const heard = JSON.stringify([...vaults].toSorted((a, b) => (a ?? "").localeCompare(b ?? "")));
	const kept = madeRepositories.get(catalog.repositories);
	if (kept?.activity === activity && kept.heard === heard) {
		return kept.repositories;
	}
	const repositories = catalog.repositories.map((entry) =>
		shellRepository(entry, activity, vaults),
	);
	madeRepositories.set(catalog.repositories, { activity, heard, repositories });
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

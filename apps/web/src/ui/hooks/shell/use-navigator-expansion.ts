// Which rows of the navigator are open: what the person chose, remembered in
// this browser, except on the way to what the panes show. Every pane's
// repository, its board, the folders and boards above it, and the Earlier row
// holding its variant when that variant is historical or shelved, are open
// until the person closes part of them, and open again when a pane moves, so
// the tree always shows which board and variant each pane shows. A repository
// is open until the person closes it.

import { useCallback, useMemo, useState } from "react";

import { pathIds } from "#ui/rules/board-catalog/outline.ts";
import { useKept } from "#ui/hooks/shell/use-kept.ts";
import { useOutlineExpansion } from "#ui/hooks/shell/use-outline-expansion.ts";
import { repositoryRowId, scopedRowId } from "#ui/rules/shell/row-ids.ts";
import { readingRowIds } from "#ui/rules/shell/variant-rows.ts";
import type { ShellRepository } from "#ui/rules/shell/contracts.ts";
import type { PaneMark } from "#ui/rules/shell/navigator-row-types.ts";

const NO_IDS: ReadonlySet<string> = new Set();

/** The rows closed on the way to what the panes show, while they show it. */
interface PathCollapses {
	/** What the panes showed when these were closed. */
	readonly shown: string;
	readonly ids: ReadonlySet<string>;
}

/** Whether each row is open, and how to open or close one. */
interface NavigatorExpansion {
	readonly expanded: (id: string) => boolean;
	readonly setExpanded: (id: string, open: boolean) => void;
}

/**
 * The rows on the way to what each pane shows, in that pane's repository.
 * @param repositories The repositories.
 * @param panes The panes.
 * @returns Their ids.
 */
function shownPathIds(
	repositories: readonly ShellRepository[],
	panes: readonly PaneMark[],
): Set<string> {
	return new Set(
		panes.flatMap((pane) => {
			const shell = repositories.find((each) => each.repository.name === pane.repository);
			if (shell === undefined || pane.board === null) return [];
			const name = shell.repository.name;
			const inner = [...pathIds(shell.outline, pane.board), ...readingRowIds(shell.boards, pane)];
			return [repositoryRowId(name), ...inner.map((id) => scopedRowId(name, id))];
		}),
	);
}

/**
 * Which rows are open by default: every repository, and in each the boards at
 * the top of its outline that have boards under them.
 * @param repositories The repositories.
 * @returns Their ids.
 */
function defaultOpenIds(repositories: readonly ShellRepository[]): Set<string> {
	return new Set(
		repositories.flatMap((shell) => {
			const name = shell.repository.name;
			const tops = shell.outline
				.filter((node) => node.kind === "board" && node.children.length > 0)
				.map((node) => scopedRowId(name, node.id));
			return [repositoryRowId(name), ...tops];
		}),
	);
}

/**
 * Whether two lists of repositories place the same rows: the same names, the
 * same outlines and the same listings, in the same order.
 * @param one A list.
 * @param other Another.
 * @returns True when every row they place is the same.
 */
function sameOutlines(one: readonly ShellRepository[], other: readonly ShellRepository[]): boolean {
	return (
		one.length === other.length &&
		one.every((shell, index) => {
			const against = other[index];
			return (
				against?.repository.name === shell.repository.name &&
				against.outline === shell.outline &&
				against.boards === shell.boards
			);
		})
	);
}

/**
 * Which rows are open.
 * @param repositories The repositories and their outlines.
 * @param panes The panes, marked.
 * @returns The expansion.
 */
function useNavigatorExpansion(
	repositories: readonly ShellRepository[],
	panes: readonly PaneMark[],
): NavigatorExpansion {
	// What agents do changes a repository and not its outline: kept while every
	// outline is the one it was, so the rows' handlers keep their identity.
	const outlines = useKept(repositories, sameOutlines);
	const defaults = useMemo(() => defaultOpenIds(outlines), [outlines]);
	const openByDefault = useCallback((id: string): boolean => defaults.has(id), [defaults]);
	const chosen = useOutlineExpansion(openByDefault);
	const shown = panes.map((pane) => `${pane.repository ?? ""}|${pane.key ?? ""}`).join("\n");
	const path = useMemo(() => shownPathIds(outlines, panes), [outlines, panes]);
	const [collapses, setCollapses] = useState<PathCollapses>({ shown, ids: NO_IDS });
	const closedOnPath = collapses.shown === shown ? collapses.ids : NO_IDS;
	const expanded = useCallback(
		(id: string): boolean => (path.has(id) ? !closedOnPath.has(id) : chosen.expanded(id)),
		[path, closedOnPath, chosen],
	);
	const setExpanded = useCallback(
		(id: string, open: boolean): void => {
			if (!path.has(id)) {
				chosen.setExpanded(id, open);
				return;
			}
			const ids = new Set(closedOnPath);
			if (open) ids.delete(id);
			else ids.add(id);
			setCollapses({ shown, ids });
		},
		[path, closedOnPath, shown, chosen],
	);
	return useMemo(() => ({ expanded, setExpanded }), [expanded, setExpanded]);
}

export { useNavigatorExpansion, type NavigatorExpansion };

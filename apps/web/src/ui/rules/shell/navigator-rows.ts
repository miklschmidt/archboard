import { shownRepository } from "@archboard/ui-kit/components";
import { matchIn, type TextRange } from "#ui/rules/shell/text-match.ts";
import type { ShellRepository } from "#ui/rules/shell/contracts.ts";
import type { NavigatorInputs, NavigatorRow } from "#ui/rules/shell/navigator-row-types.ts";

/**
 * Match the complete repository identity while highlighting its visible name.
 * @param name The registered identity.
 * @param query The folded filter.
 * @returns The visible match, or absence when the identity does not match.
 */
function repositoryMatch(name: string, query: string): TextRange | null {
	const match = matchIn(name, query);
	if (match === null) return null;
	return matchIn(shownRepository(name).name, query) ?? { start: 0, end: 0 };
}

/**
 * List one row per repository, independent of architecture decomposition and history.
 * @param inputs The catalogue and current pane locations.
 * @returns Filtered rows with their active selection and pane letters.
 */
function navigatorRows(inputs: NavigatorInputs): NavigatorRow[] {
	const matched = inputs.repositories.flatMap((shell) => {
		const match =
			inputs.query.length === 0 ? null : repositoryMatch(shell.repository.name, inputs.query);
		return inputs.query.length > 0 && match === null ? [] : [{ shell, match }];
	});
	return matched.map(({ shell, match }, index) => {
		const repository = shell.repository.name;
		const panes = inputs.panes.filter((pane) => pane.repository === repository);
		return {
			kind: "repository",
			id: `repository:${repository}`,
			repository,
			entry: shell.repository,
			model: shell.model,
			migrationRequired: shell.migrationRequired,
			match,
			position: index + 1,
			siblings: matched.length,
			activity: activityOf(shell),
			error: shell.error,
			loading: shell.loading,
			selected: panes.some((pane) => pane.active),
			onScreen: inputs.panes.length > 1 ? panes.map((pane) => pane.letter) : [],
		};
	});
}

/**
 * A repository lamp aggregates subject claims without naming an exclusive owner.
 * @param shell The repository and its model activity.
 * @returns Active claims, a recent write, or no activity.
 */
function activityOf(shell: ShellRepository): NavigatorRow["activity"] {
	const entries = Object.values(shell.activity);
	if (entries.length === 0) return null;
	return entries.some((entry) => entry.claims.length > 0) ? "claimed" : "wrote";
}

export { navigatorRows };

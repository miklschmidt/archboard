// What the repository chooser lists: each repository, and under it the checkouts of this
// machine. A repository can hold hundreds of them, so they stay folded until a person opens
// one, and what is typed reaches both, so a checkout is one word away.

import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { shownRepository } from "@archboard/ui-kit/components";
import { matchIn, type TextRange } from "#ui/rules/shell/text-match.ts";
import type { ShellRepository } from "#ui/rules/shell/contracts.ts";

type Checkout = RepositoryEntry["checkouts"][number];

/** A pane, by its letter and the repository it reads. */
interface PaneMark {
	readonly letter: string;
	readonly repository: string | null;
	readonly active: boolean;
}

/** One repository row. */
interface RepositoryChoice {
	readonly kind: "repository";
	readonly id: string;
	readonly parent: null;
	readonly branch: boolean;
	readonly open: boolean;
	readonly shell: ShellRepository;
	readonly match: TextRange | null;
	/** The letters of the panes that read it, while two panes are open. */
	readonly letters: readonly string[];
	/** Whether the focused pane reads it. */
	readonly selected: boolean;
}

/** One checkout row. */
interface CheckoutChoice {
	readonly kind: "checkout";
	readonly id: string;
	readonly parent: string;
	readonly branch: false;
	readonly open: false;
	readonly repository: string;
	readonly checkout: Checkout;
	readonly match: TextRange | null;
}

type RepositoryRow = RepositoryChoice | CheckoutChoice;

/** What the chooser is made from. */
interface ChoiceInputs {
	readonly repositories: readonly ShellRepository[];
	readonly query: string;
	readonly panes: readonly PaneMark[];
	/** The repositories whose checkouts the person opened. */
	readonly opened: ReadonlySet<string>;
}

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
 * The checkouts a repository lists now: all of them while it is open, otherwise those
 * that the filter found. A filter that names the repository alone lists none of them.
 * @param entry The repository.
 * @param inputs The chooser's inputs.
 * @returns The checkouts, with what was found in each.
 */
function shownCheckouts(entry: RepositoryEntry, inputs: ChoiceInputs): CheckoutChoice[] {
	const opened = inputs.opened.has(entry.name);
	return entry.checkouts.flatMap((checkout) => {
		const match = inputs.query === "" ? null : matchIn(checkout.root, inputs.query);
		if (!opened && match === null) return [];
		return {
			kind: "checkout" as const,
			id: `checkout:${checkout.root}`,
			parent: `repository:${entry.name}`,
			branch: false as const,
			open: false as const,
			repository: entry.name,
			checkout,
			match,
		};
	});
}

/**
 * The rows of the chooser.
 * @param inputs The repositories, the filter, the panes and what the person opened.
 * @returns The rows, in order.
 */
function repositoryRows(inputs: ChoiceInputs): RepositoryRow[] {
	return inputs.repositories.flatMap((shell) => {
		const name = shell.repository.name;
		const checkouts = shownCheckouts(shell.repository, inputs);
		const match = inputs.query === "" ? null : repositoryMatch(name, inputs.query);
		if (inputs.query !== "" && match === null && checkouts.length === 0) return [];
		const panes = inputs.panes.filter((pane) => pane.repository === name);
		const row: RepositoryChoice = {
			kind: "repository",
			id: `repository:${name}`,
			parent: null,
			branch: shell.repository.checkouts.length > 1,
			open: checkouts.length > 0,
			shell,
			match,
			letters: inputs.panes.length > 1 ? panes.map((pane) => pane.letter) : [],
			selected: panes.some((pane) => pane.active),
		};
		return [row, ...checkouts];
	});
}

export {
	repositoryRows,
	type CheckoutChoice,
	type PaneMark,
	type RepositoryChoice,
	type RepositoryRow,
};

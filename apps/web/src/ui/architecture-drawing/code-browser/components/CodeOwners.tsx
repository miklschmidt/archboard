// The modules that own the open file (TASK-648), over its lines: after the words "Owned by", each
// one a key that shows it in the picture, with what it binds here. A key never stays pressed:
// opening the file selects its owners, so every key would be, and the picture shows the selection.
// It A module whose symbol the code facts cannot find stays here
// and says so, because its binding still names this file.

import { useId, type JSX } from "react";
import type { CodeFile } from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import { cn } from "@archboard/ui-kit/components";
import type { SubjectActions } from "#ui/architecture-drawing/code-browser/components/CodeSource.tsx";
import { useSubjectKey } from "#ui/architecture-drawing/code-browser/hooks/use-subject-key.ts";

/** One owner, as the head names it. */
interface OwnerRow {
	readonly subject: string;
	/** What the module binds of this file, in the mono face. */
	readonly binds: string;
	/** Whether what it binds is missing from the code. */
	readonly missing: boolean;
}

/**
 * The owners of a file, each once, in the order the server names them.
 * @param owners The file's owners.
 * @param path The file.
 * @param boundPathOf The path a module's binding names.
 * @returns One row for each.
 */
function ownerRows(
	owners: CodeFile["owners"],
	path: string,
	boundPathOf: (subject: string) => string | undefined,
): readonly OwnerRow[] {
	const whole = owners.file.map((subject) => {
		const bound = boundPathOf(subject)?.replace(/\/+$/u, "");
		return { subject, binds: bound === path ? "whole file" : `${bound ?? ""}/`, missing: false };
	});
	const symbols = owners.symbols.map(({ subject, symbol, definition }) => ({
		subject,
		binds: definition === null ? `${symbol} not found` : symbol,
		missing: definition === null,
	}));
	return [...whole, ...symbols];
}

/**
 * The modules that own a file.
 * @param props The owners and what a key does.
 * @param props.owners The file's owners.
 * @param props.path The file.
 * @returns The keys after their words, or the words for a file no module binds.
 */
function CodeOwners(
	props: SubjectActions & {
		readonly owners: CodeFile["owners"];
		readonly path: string;
	},
): JSX.Element {
	const label = useId();
	const rows = ownerRows(props.owners, props.path, props.boundPathOf);
	if (rows.length === 0)
		return <p className="text-body text-muted-foreground">No module binds this file.</p>;
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span id={label} className="text-body text-muted-foreground shrink-0">
				Owned by
			</span>
			<ul aria-labelledby={label} className="flex min-w-0 flex-wrap gap-1.5">
				{rows.map((row) => (
					<li key={`${row.subject}:${row.binds}`} className="min-w-0">
						<OwnerKey row={row} actions={props} />
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * One owner: a key that shows it in the picture, and lights it there while the pointer rests on it.
 * @param props The owner.
 * @param props.row The owner.
 * @param props.actions What the key does.
 * @returns The key.
 */
function OwnerKey(props: {
	readonly row: OwnerRow;
	readonly actions: SubjectActions;
}): JSX.Element {
	const { row, actions } = props;
	const handlers = useSubjectKey(row.subject, actions);
	return (
		<button
			type="button"
			data-slot="code-owner"
			{...handlers}
			className="quiet-key text-body rounded-control inline-flex h-7 max-w-full items-center gap-2 px-2.5"
		>
			<span className="truncate font-medium">{actions.nameOf(row.subject)}</span>
			<span
				className={cn(
					"text-technical truncate font-mono",
					row.missing ? "text-standing-changed" : "text-muted-foreground",
				)}
			>
				{row.binds}
			</span>
		</button>
	);
}

export { CodeOwners };

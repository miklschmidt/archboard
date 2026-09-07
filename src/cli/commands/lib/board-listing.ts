// The human-readable side of `board list`: the repository filter taken from
// the working directory, the text rendering, and the casing-collision notes.
import type { BoardListResponse } from "@/runtime/engine/canvas-client";
import { inspectCheckout } from "@/runtime/engine/git";
import { CliUsageError } from "@/cli/command-contract/contract";

type BoardListEntry = BoardListResponse["boards"][number];
type BoundNode = NonNullable<BoardListEntry["nodes"]>[number];

/**
 * Derives the repository identity of the checkout the process runs in, so
 * `--here` can stand in for an explicit `--repo` filter.
 * @param signal - Aborts the git inspection.
 * @returns The repository identity of the surrounding checkout.
 */
async function repoIdentityHere(signal: AbortSignal): Promise<string> {
	const checkout = await inspectCheckout(process.cwd(), { signal });
	if (!checkout) {
		throw new CliUsageError(
			`${process.cwd()} is not inside a git repository, so there is no repository to look for. Name one with --repo <host/owner/name>, or drop the filter to list every board.`,
		);
	}
	return checkout.identity;
}

/**
 * Renders one node bound to the filtered repository as an indented line.
 * @param node - A bound node reported with its board entry.
 * @returns The line naming the node, its kind and its bound path.
 */
function boundNodeLine(node: BoundNode): string {
	const kind = node.kind ? ` [${node.kind}]` : "";
	return `    ${node.name ?? node.node}${kind} -> ${node.path}`;
}

/**
 * Renders one board entry of a repository-filtered listing with its bound nodes.
 * @param entry - A board that has at least one node bound to the repository.
 * @returns The board line followed by one line per bound node.
 */
function boardEntryLines(entry: BoardListEntry): string[] {
	const level = entry.identity.level ? `, ${entry.identity.level}` : "";
	const lines = [`  ${entry.key} (${entry.identity.variant}${level})`];
	for (const node of entry.nodes ?? []) {
		lines.push(boundNodeLine(node));
	}
	return lines;
}

/**
 * Renders the listing when a repository filter applied.
 * @param result - The server's filtered listing.
 * @returns Text naming every board describing the repository, or why none does.
 */
function repoBoardListText(result: BoardListResponse): string {
	if (result.boards.length === 0) {
		return `No board in ${result.vault} has a node bound to ${result.repo} (${result.scanned ?? 0} board(s) read).`;
	}
	const lines = [`Boards describing ${result.repo}:`];
	for (const entry of result.boards) {
		lines.push(...boardEntryLines(entry));
	}
	lines.push(`Show one with \`browser show ${result.boards[0]!.key} --pane <spec>\`.`);
	return lines.join("\n");
}

/**
 * Renders a board listing for a person rather than a program.
 * @param result - The server's listing, filtered or not.
 * @returns The text shown for `board list --text`.
 */
function boardListText(result: BoardListResponse): string {
	if (result.repo) {
		return repoBoardListText(result);
	}
	if (result.boards.length === 0) {
		return `No boards in ${result.vault} yet.`;
	}
	return [`Boards in ${result.vault}:`, ...result.boards.map((entry) => `  ${entry.key}`)].join(
		"\n",
	);
}

/**
 * Explains one board address that several notes share up to casing or accents.
 * @param key - The shared board address.
 * @param file - The note that is actually reachable at that address.
 * @param collisions - The other notes that collapse onto the same address.
 * @returns The diagnostic asking the person to rename or delete the extras.
 */
function collisionDiagnostic(key: string, file: string | undefined, collisions: string[]): string {
	return `"${key}" is the address of ${collisions.length + 1} notes that differ only in casing or accents: ${[file, ...collisions].join(", ")}. Board names are case-insensitive, so only ${file} is reachable. Rename or delete the others.`;
}

/**
 * Collects one diagnostic per board address that collides with other notes,
 * reporting each address once even when the server lists it several times.
 * @param result - The server's listing.
 * @returns The collision diagnostics in listing order.
 */
function collisionDiagnostics(result: BoardListResponse): string[] {
	const diagnostics: string[] = [];
	const reported = new Set<string>();
	for (const entry of result.boards) {
		const collisions = entry.collidesWith ?? [];
		if (collisions.length === 0 || reported.has(entry.key)) {
			continue;
		}
		reported.add(entry.key);
		diagnostics.push(collisionDiagnostic(entry.key, entry.file, collisions));
	}
	return diagnostics;
}

export { boardListText, collisionDiagnostics, repoIdentityHere };

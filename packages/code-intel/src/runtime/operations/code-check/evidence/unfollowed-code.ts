// The parts whose code holds a Nix expression that the static reading cannot follow (TASK-367.22).
// The evidence notes them so that a relationship to an output of that flake is not judged unsupported.

import { ownersAtLine, type Owners } from "#runtime/operations/code-check/evidence/ownership.ts";
import type { ReadPart } from "#runtime/operations/code-check/part-code.ts";
import type { SyntaxFacts, Unparsed } from "#runtime/operations/code-facts/facts.ts";

/**
 * The pathful site of a static expression the reading cannot follow.
 * @param origin Its source path and lines.
 * @param origin.path Its path.
 * @param origin.start Its first line.
 * @param origin.end Its last line.
 * @returns The site as file:lines.
 */
function unfollowedSite(origin: NonNullable<Unparsed["source"]>): string {
	return `${origin.path}:${origin.start === origin.end ? origin.start : `${origin.start}-${origin.end}`}`;
}

/**
 * Note the parts that own a line of a part of a Nix file that the static
 * reading cannot follow, or that did not parse: what that code is built from
 * is unknown there, and a piece of evidence at any of its lines would be
 * theirs.
 * @param owners The repository's parts.
 * @param unfollowed The parts that own such code, which this adds to.
 * @param root The checkout's root.
 * @param facts The file's facts.
 */
function noteUnfollowed(
	owners: Owners,
	unfollowed: Map<string, Map<string, string>>,
	root: string,
	facts: SyntaxFacts,
): void {
	if (facts.adapter !== "nix") return;
	for (const { start, end, source } of facts.unparsed) {
		const at = unfollowedSite(source ?? { path: facts.path, start, end });
		const file = `${root}\0${facts.path}`;
		for (const owner of ownersOfLines(owners, facts.path, start, end)) {
			const files = unfollowed.get(owner.node.id) ?? new Map<string, string>();
			unfollowed.set(owner.node.id, new Map([[file, at], ...files]));
		}
	}
}

/**
 * The parts that own some line of a file.
 * @param owners The repository's parts.
 * @param file The file.
 * @param start The first line.
 * @param end The last line.
 * @returns Each part that owns one of the lines, once.
 */
function ownersOfLines(owners: Owners, file: string, start: number, end: number): Set<ReadPart> {
	const found = new Set<ReadPart>();
	for (let line = start; line <= end; line += 1) {
		for (const owner of ownersAtLine(owners, file, line)) found.add(owner);
	}
	return found;
}

export { noteUnfollowed };

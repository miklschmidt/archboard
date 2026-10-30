// The parts of a draft as they are read (TASK-493).
//
// In a stack of pull requests a draft describes the code of its own branch,
// which holds the code of the layers below it. A part it inherited may still
// pin an older layer's branch. The code check and the footprint read every
// part of the draft, in each repository, at the draft's own ref, so one code
// holds all of them; a part that pins a ref the draft's ref does not hold,
// such as a later layer's branch, keeps its own.

import { holdsRef } from "#runtime/clients/history-lens/source-history.ts";
import type { GitRunOptions } from "#runtime/clients/history-lens/git.ts";
import {
	nodesPinnedTo,
	ownRefs,
	refOfBinding,
	type OwnRef,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { SemanticNode } from "@archboard/board/content";

/**
 * What a ref pinned in a repository is keyed by.
 * @param repo The repository.
 * @param ref The ref.
 * @returns The key.
 */
function keyOf(repo: string, ref: string): string {
	return `${repo}\0${ref}`;
}

/** A ref a part pins that is not the draft's own, and the ref the draft is read at. */
interface Pin {
	readonly repo: string;
	readonly root: string;
	readonly ref: string;
	readonly ownRef: string;
}

/**
 * The ref a part pins away from its draft's own, when this machine has the
 * checkout to read.
 * @param node The part.
 * @param own The binding that names the draft's ref, by repository.
 * @param rootOf The checkout of a repository, when there is one to read.
 * @returns The pin, or undefined when the part pins none or the draft's own.
 */
function pinAway(
	node: SemanticNode,
	own: ReadonlyMap<string, OwnRef>,
	rootOf: (repo: string) => string | undefined,
): Pin | undefined {
	const { binding } = node;
	if (binding === undefined) return undefined;
	const at = own.get(binding.repo);
	const root = rootOf(binding.repo);
	const ref = refOfBinding(binding);
	if (at === undefined || root === undefined || ref === undefined || ref === at.ref) {
		return undefined;
	}
	return { repo: binding.repo, root, ref, ownRef: at.ref };
}

/**
 * The parts of a variant as they are read: in a draft, every bound part of a
 * repository at the one ref the draft is read against there, unless it pins a
 * ref that ref does not hold.
 * @param board The board.
 * @param variant The variant.
 * @param rootOf The checkout of a repository, when this machine has one to read.
 * @param options The caller's signal.
 * @returns The variant's parts.
 */
async function nodesAtOwnRef(
	board: Pick<SemanticBoard, "variants">,
	variant: SemanticVariant,
	rootOf: (repo: string) => string | undefined,
	options: GitRunOptions,
): Promise<SemanticNode[]> {
	const own = ownRefs(board, variant);
	const { nodes } = variant.content;
	if (own.size === 0) return nodes;
	const pins = new Map<string, Pin>();
	for (const node of nodes) {
		const pin = pinAway(node, own, rootOf);
		if (pin !== undefined) pins.set(keyOf(pin.repo, pin.ref), pin);
	}
	const held = new Set<string>();
	await Promise.all(
		[...pins].map(async ([key, pin]) => {
			if (await holdsRef(pin.root, pin.ref, pin.ownRef, options)) held.add(key);
		}),
	);
	return nodesPinnedTo(nodes, own, (repo, ref) => held.has(keyOf(repo, ref)));
}

export { nodesAtOwnRef };

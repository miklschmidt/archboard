// Which parts of a variant the lens reads, and why it skips the others
// (ADR 0045).
//
// It reads a part bound into a repository this machine has registered, at the
// HEAD of that checkout. It skips a part with no binding, and a part that
// carries a drill-down: the board it opens carries its history, and a card
// that binds a whole directory otherwise adds hundreds of commits. It skips a
// repository this machine has not registered, which stays silent, and a part
// pinned to a branch or a commit that its checkout does not have out: the
// commits on another ref say nothing about it. A part is either read or
// skipped with its reason, so a part that was not read never looks like a part
// that no commit changed.

import {
	resolveLocalCodeTarget,
	type CheckoutSnapshot,
	type LocalCodeTargetResult,
} from "@/runtime/code-target/index";
import { normalizeBoundPath } from "@/runtime/history-lens/lib/commits";
import type { BehindSkip } from "@/shared/code-check/index";
import { bindingPathOf, type CodeBinding } from "@/shared/code-target/index";
import type { SemanticNode, VariantContent } from "@/shared/semantic-board/index";

/** A part the lens reads: where its checkout is, and the path it binds there. */
interface ReadPart {
	readonly node: SemanticNode;
	readonly repo: string;
	readonly root: string;
	/** The bound path, normalized: the empty string is the whole repository. */
	readonly path: string;
}

/** Every part of one variant, read or skipped. */
interface PartReading {
	readonly read: readonly ReadPart[];
	readonly skipped: readonly BehindSkip[];
}

/**
 * The checkout and the ref of a binding, whatever its path. A binding whose
 * path is not there any more is still read, because Git keeps the history of
 * a deleted file, so its ref is resolved against the checkout root, which a
 * snapshot always holds: the ref rule does not depend on the path.
 * @param binding The binding.
 * @param snapshot The registered checkouts.
 * @returns Where it resolves, or why it does not.
 */
function checkoutOf(binding: CodeBinding, snapshot: CheckoutSnapshot): LocalCodeTargetResult {
	const resolved = resolveLocalCodeTarget(binding, snapshot);
	if (resolved.ok || resolved.code !== "TARGET_UNAVAILABLE") return resolved;
	return resolveLocalCodeTarget({ ...binding, path: "." }, snapshot);
}

/**
 * Read or skip one bound part.
 * @param node The part.
 * @param binding Its binding.
 * @param snapshot The registered checkouts.
 * @returns The part to read, or why it is skipped.
 */
function readOrSkip(
	node: SemanticNode,
	binding: CodeBinding,
	snapshot: CheckoutSnapshot,
): ReadPart | BehindSkip {
	const subject = { kind: "node" as const, id: node.id, name: node.name };
	const repo = binding.repo;
	if (snapshot.inspection(repo) === undefined) {
		return { subject, reason: "repository-unregistered", repo };
	}
	const resolved = checkoutOf(binding, snapshot);
	const path = normalizeBoundPath(binding.path);
	if (!resolved.ok || path === undefined) {
		const detail = resolved.ok ? "The bound path leaves its checkout." : resolved.error;
		return { subject, reason: "checkout-unavailable", repo, detail };
	}
	if (resolved.otherRef !== undefined) {
		return { subject, reason: "ref-not-checked-out", repo, ref: resolved.otherRef };
	}
	return { node, repo, root: resolved.root, path: bindingPathOf(path) };
}

/**
 * Sort the parts of one variant into those the lens reads and those it skips.
 * @param content The variant's content.
 * @param snapshot The registered checkouts and what each has out.
 * @returns Every part, read or skipped with its reason, in the variant's order.
 */
function partReading(
	content: Pick<VariantContent, "nodes">,
	snapshot: CheckoutSnapshot,
): PartReading {
	const read: ReadPart[] = [];
	const skipped: BehindSkip[] = [];
	for (const node of content.nodes) {
		const subject = { kind: "node" as const, id: node.id, name: node.name };
		if (node.binding === undefined) {
			skipped.push({ subject, reason: "unbound" });
		} else if (node.drillDown !== undefined) {
			skipped.push({ subject, reason: "drill-down", repo: node.binding.repo });
		} else {
			const part = readOrSkip(node, node.binding, snapshot);
			if ("reason" in part) skipped.push(part);
			else read.push(part);
		}
	}
	return { read, skipped };
}

export { type PartReading, type ReadPart, partReading };

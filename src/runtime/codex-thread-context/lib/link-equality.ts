import type {
	ThreadLink,
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "@/runtime/codex-thread-link";

/**
 * Compares two thread sources, which are either plain names or small records.
 * @param left - One link's source.
 * @param right - The other link's source.
 * @returns True when both describe the same source.
 */
function sameSource(left: ThreadLink["source"], right: ThreadLink["source"]): boolean {
	if (typeof left === "string" || typeof right === "string") {
		return left === right;
	}
	return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Compares what the app-server observed about two bound links.
 * @param left - One bound link.
 * @param right - The other bound link.
 * @returns True when thread, source, status, loaded state and direct-input capability agree.
 */
function sameObservation(left: ThreadLink, right: ThreadLink): boolean {
	return (
		left.threadId === right.threadId &&
		sameSource(left.source, right.source) &&
		left.status === right.status &&
		left.loaded === right.loaded &&
		left.canAcceptDirectInput === right.canAcceptDirectInput
	);
}

/**
 * Compares the state-specific evidence of two bound links that already agree
 * on state: the child generation for executable links, the refusal reason for
 * inspect-only links.
 * @param left - One bound link.
 * @param right - The other bound link.
 * @returns True when the state-specific evidence agrees.
 */
function sameStateEvidence(left: ThreadLink, right: ThreadLink): boolean {
	if (left.state === "executable" && right.state === "executable") {
		return left.childId === right.childId && left.epoch === right.epoch;
	}
	if (left.state === "inspect_only" && right.state === "inspect_only") {
		return left.reason === right.reason;
	}
	return false;
}

/**
 * Whether two link snapshots carry identical authority, so a re-read link can
 * be trusted to still describe the target captured earlier.
 * @param left - One link snapshot.
 * @param right - The other link snapshot.
 * @returns True when every authority-bearing field agrees.
 */
function sameLink(left: ThreadLinkSnapshot, right: ThreadLinkSnapshot): boolean {
	if (left.state !== right.state) {
		return false;
	}
	if (left.state === "unbound" || right.state === "unbound") {
		return true;
	}
	return sameObservation(left, right) && sameStateEvidence(left, right);
}

/**
 * Whether two pane bindings are the same revision of the same link.
 * @param left - One pane binding.
 * @param right - The other pane binding.
 * @returns True when pane, revision and link all agree.
 */
function sameBinding(left: ThreadLinkBindingSnapshot, right: ThreadLinkBindingSnapshot): boolean {
	return (
		left.paneId === right.paneId &&
		left.revision === right.revision &&
		sameLink(left.link, right.link)
	);
}

/**
 * Element-wise equality of two ordered string lists.
 * @param left - One list.
 * @param right - The other list.
 * @returns True when both have the same values in the same order.
 */
function sameStringValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export { sameBinding, sameLink, sameStringValues };

import {
	CodexThreadLinkError,
	type CodexThreadLinkPort,
	type ThreadLinkBindingSnapshot,
	type ThreadLinkCasToken,
} from "@/runtime/codex-thread-link";

/**
 * The one key a server keeps its thread link under. A server holds one
 * conversation whichever pane speaks, so every pane addresses this entry.
 */
const SERVER_LINK_KEY = "server";

/**
 * Refuse a missing or empty pane identity, as the store behind this would.
 * @param paneId The pane that asked.
 */
function requirePaneId(paneId: string): void {
	if (typeof paneId !== "string" || paneId.length === 0) {
		throw new CodexThreadLinkError(
			"invalid_input",
			"A thread-link binding requires one non-empty pane identity.",
		);
	}
}

/**
 * The server's thread link as the pane that asked is shown it. Its `paneId` and its CAS
 * token's `paneId` name the asking pane, so two reads for the same pane compare
 * equal and a token read for any pane swaps the one link.
 * @param binding The server binding.
 * @param paneId The pane that asked.
 * @returns The relabelled snapshot.
 */
function forPane(binding: ThreadLinkBindingSnapshot, paneId: string): ThreadLinkBindingSnapshot {
	return Object.freeze({
		...binding,
		paneId,
		cas: Object.freeze({ ...binding.cas, paneId }),
	});
}

/**
 * A caller's expectation, addressed to the server entry. A null expectation
 * still means the server's thread link must be untouched; anything malformed is left for
 * the store to refuse.
 * @param expected The token the caller read, or null.
 * @returns The token the store compares.
 */
function toServerLink(expected: ThreadLinkCasToken | null): ThreadLinkCasToken | null {
	if (expected === null || typeof expected !== "object") {
		return expected;
	}
	return { ...expected, paneId: SERVER_LINK_KEY };
}

/**
 * One thread link per server, whichever pane asks (TASK-302.06).
 *
 * Every pane reads, creates and clears the same entry, so a command
 * sent over any pane's transport targets the one conversation, and a change
 * made from one pane is the change every other pane sees. Each snapshot is
 * labelled with the pane that asked for it: `binding.paneId` means "the pane
 * this was read for", never "the pane that created the link".
 *
 * Everything the port proves still happens underneath: executable links only
 * through fresh classification and the live epoch proof, prior epochs
 * inspect-only, and every change behind one compare-and-swap.
 * @param port The per-key thread-link port.
 * @returns The server-scoped port.
 */
function createServerThreadLink(port: CodexThreadLinkPort): CodexThreadLinkPort {
	/**
	 * The server's thread link, labelled for one pane.
	 * @param paneId The pane that asked.
	 * @returns The snapshot.
	 */
	const read = (paneId: string): ThreadLinkBindingSnapshot => {
		requirePaneId(paneId);
		return forPane(port.read(SERVER_LINK_KEY), paneId);
	};
	return Object.freeze({
		classify: port.classify,
		snapshot: read,
		read,
		/**
		 * Swap the server's thread link for a non-executable one.
		 * @param input The asking pane, its expectation and the link.
		 * @returns The new snapshot, labelled for that pane.
		 */
		compareAndSwap: (input) => {
			requirePaneId(input.paneId);
			return forPane(
				port.compareAndSwap({
					...input,
					paneId: SERVER_LINK_KEY,
					expected: toServerLink(input.expected),
				}),
				input.paneId,
			);
		},
		/**
		 * Return the server to no link.
		 * @param paneId The pane that asked.
		 * @param expected Its expectation.
		 * @returns The new snapshot, labelled for that pane.
		 */
		clear: (paneId, expected) => {
			requirePaneId(paneId);
			return forPane(port.clear(SERVER_LINK_KEY, toServerLink(expected)), paneId);
		},
		/**
		 * Classify a target and adopt it as the server's thread link.
		 * @param paneId The pane that asked.
		 * @param expected Its expectation.
		 * @param target The thread.
		 * @returns The new snapshot, labelled for that pane.
		 */
		classifyAndBind: async (paneId, expected, target) => {
			requirePaneId(paneId);
			return forPane(
				await port.classifyAndBind(SERVER_LINK_KEY, toServerLink(expected), target),
				paneId,
			);
		},
	} satisfies CodexThreadLinkPort);
}

export { createServerThreadLink };

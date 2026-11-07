import { createCodexThreadLinkBindingController } from "#runtime/workhorses/thread-link/rules/binding.ts";
import { createCodexThreadLinkClassifier } from "#runtime/workhorses/thread-link/rules/classifier.ts";
import type {
	CodexThreadLinkClassifierOptions,
	CodexThreadLinkPort,
	ThreadLinkEpochAuthority,
} from "#runtime/workhorses/thread-link/rules/contract.ts";

export interface CodexThreadLinkOptions extends Omit<CodexThreadLinkClassifierOptions, "epoch"> {
	readonly epoch: ThreadLinkEpochAuthority;
}

/**
 * Combines deterministic classification with a proof-checked binding boundary, so a link
 * only ever adopts a link that was classified against the live authorities a moment earlier.
 * @param options The session, the durable epoch authority, and any live epoch source.
 * @returns The port links bind and classify through.
 */
export function createCodexThreadLink(options: CodexThreadLinkOptions): CodexThreadLinkPort {
	const classifier = createCodexThreadLinkClassifier(options);
	const binding = createCodexThreadLinkBindingController(options);

	/**
	 * Classifies twice through the live authorities, then adopts the second result by CAS.
	 * @param linkKey The link key.
	 * @param expected The link's CAS token, or null for a first binding.
	 * @param target The thread to classify.
	 * @returns The new binding snapshot.
	 */
	const classifyAndBind: CodexThreadLinkPort["classifyAndBind"] = async (
		linkKey,
		expected,
		target,
	) => {
		// The first pass may observe a list/epoch transition. The second pass is
		// the only result handed to the synchronous CAS boundary.
		await classifier.classify(target);
		const fresh = await classifier.classify(target);
		return binding.commitClassified(linkKey, expected, fresh);
	};
	return Object.freeze({
		classify: classifier.classify,
		snapshot: binding.snapshot,
		read: binding.read,
		compareAndSwap: binding.compareAndSwap,
		clear: binding.clear,
		classifyAndBind,
	});
}

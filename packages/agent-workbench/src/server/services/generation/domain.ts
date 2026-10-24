import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/lifecycle.ts";
import type { CodexWorkbenchGenerationInput } from "#server/services/owner/lifecycle.ts";
import { ownsProcessChild } from "#server/services/owner/owner-state.ts";
import {
	publishProjection,
	requireCreated,
	type GenerationOwners,
} from "#server/services/generation/owners.ts";

/**
 * Grant capabilities for this generation and defer session lookups until the graph is complete.
 * @param context The generation input and its owners.
 * @param context.input The generation's process and lifecycle input.
 * @param context.owners The record that tracks generation retirement.
 * @param created The components that the generation already built.
 * @returns The host domain capabilities for this generation.
 */
export function domainScope(
	context: { readonly input: CodexWorkbenchGenerationInput; readonly owners: GenerationOwners },
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): CodexWorkbenchDomainScope {
	return Object.freeze<CodexWorkbenchDomainScope>({
		identity: requireCreated(created, "identity"),
		epoch: requireCreated(created, "epoch"),
		transport: requireCreated(created, "transport"),
		session: requireCreated(created, "session"),
		threadLink: requireCreated(created, "threadLink"),
		approvals: requireCreated(created, "approvals"),
		sessions: {
			/**
			 * Open a tab session in this generation.
			 * @param id The tab session id.
			 * @returns The open session.
			 */
			open: (id) => requireCreated(created, "sessions").open(id),
			/**
			 * Read the live tab sessions in this generation.
			 * @returns The live sessions.
			 */
			list: () => requireCreated(created, "sessions").list(),
			/**
			 * Require an existing tab session in this generation.
			 * @param id The tab session id.
			 * @returns The live session.
			 */
			require: (id) => requireCreated(created, "sessions").require(id),
			/**
			 * Find the tab session that owns a thread.
			 * @param id The thread id.
			 * @returns The owning session, or null when none owns the thread.
			 */
			forThread: (id) => requireCreated(created, "sessions").forThread(id),
			/**
			 * Find the workhorse that owns a thread.
			 * @param id The thread id.
			 * @returns The owning workhorse, or null when none owns the thread.
			 */
			workhorseForThread: (id) => requireCreated(created, "sessions").workhorseForThread(id),
			/**
			 * End a tab session and release its generation resources.
			 * @param id The tab session id.
			 * @returns Resolves when the session ends.
			 */
			end: (id) => requireCreated(created, "sessions").end(id),
			/**
			 * Subscribe to changes in this generation's tab sessions.
			 * @param listener Receives session changes.
			 * @returns The subscription cleanup.
			 */
			onChange: (listener) => requireCreated(created, "sessions").onChange(listener),
		},
		/** Refuse a retired scope or a scope whose child, transport, or epoch is no longer live. */
		assertCurrent: () => {
			if (context.owners.retired || !ownsProcessChild(context.input.process, context.input.child)) {
				throw new Error("The Codex domain scope no longer owns the current process child.");
			}
			if (requireCreated(created, "transport").inspect().state !== "open") {
				throw new Error("The Codex domain scope transport is no longer open.");
			}
			const active = requireCreated(created, "epoch").snapshot().manifest.activeEpoch;
			const validator = requireCreated(created, "identity").identity.validator;
			if (active === null) {
				throw new Error("The Codex domain scope has no active child epoch.");
			}
			validator.assertCurrentEpoch(active.childId, active.epoch);
		},
		shutdown: context.input.shutdownOwner,
		/**
		 * Publish the current generation projection to its browser listeners.
		 * @returns Nothing after the listeners receive the projection.
		 */
		publish: () => publishProjection(context.owners),
	});
}

import { notifyExplanation } from "#server/services/explanations/dispatch.ts";
import type {
	CodexWorkbenchDomainTools,
	CodexWorkbenchDomain,
} from "#runtime/protocol/voice/extension.ts";
import { createCodexWaitGraph } from "@archboard/codex-realtime-voice/runtime";
import { createCodexDynamicTools } from "#runtime/operations/dynamic-tools/dispatch/dispatcher.ts";
import {
	ARCHBOARD_APP_NAMESPACE,
	ARCHBOARD_APP_MANIFEST_SHA256,
} from "#runtime/protocol/thread-tools/manifest.ts";
import { createServerDynamicOperationIdAdapter } from "#server/services/generation/operation-lifecycle.ts";
import {
	requireDynamicOwners,
	type ArchboardDomainOwners,
} from "#server/services/generation/dynamic-owners.ts";
import type { ArchboardWorkbenchServer } from "#server/protocol/generation/archboard-host.ts";

/**
 * Install Archboard domain authority on the core-owned Codex generation.
 * @param server The Archboard context and lifecycle integration.
 * @returns The domain tool registrations and their generation installer.
 */
export function createArchboardDomainTools(
	server: ArchboardWorkbenchServer,
): CodexWorkbenchDomainTools {
	return Object.freeze<CodexWorkbenchDomainTools>({
		registrations: [
			{ namespace: ARCHBOARD_APP_NAMESPACE.name, manifestHash: ARCHBOARD_APP_MANIFEST_SHA256 },
		],
		/**
		 * Build domain tools and their owners under the supplied generation capabilities.
		 * @param scope The core-owned capabilities for this generation.
		 * @returns The domain dispatcher, approvals, and lifecycle hooks.
		 */
		install: (scope) => {
			const waitGraph = createCodexWaitGraph();
			const owners: ArchboardDomainOwners = {
				authority: null,
				approval: null,
				lifecycle: null,
				dynamicProjectionUnsubscribe: null,
				publish: scope.publish,
			};
			const dynamic = requireDynamicOwners({ server, waitGraph, scope, owners }, scope);
			const tools = createCodexDynamicTools({
				session: scope.session,
				transport: scope.transport,
				threadLink: scope.threadLink,
				epoch: scope.epoch,
				waitGraph,
				approval: dynamic.approval.port,
				threadAuthority: dynamic.authority.thread,
				context: dynamic.authority.context,
				operationId: createServerDynamicOperationIdAdapter(scope.identity.operation),
				lifecycle: dynamic.lifecycle.port,
			});
			return Object.freeze<CodexWorkbenchDomain>({
				dispatch: tools.dispatch,
				approvals: {
					browser: dynamic.approval.browser,
					pending: dynamic.approval.projectPending,
					bindLease: dynamic.approval.bindLease,
				},
				/**
				 * Route server notifications to domain approval and lifecycle owners.
				 * @param event The correlated server notification.
				 */
				onNotification: (event) => {
					notifyExplanation(event);
					dynamic.approval.onNotification(event);
					dynamic.lifecycle.onNotification(event);
				},
				endSession: dynamic.approval.endSession,
				childExit: dynamic.lifecycle.childExit,
				/**
				 * Settle domain approvals and stop its dynamic operations.
				 * @param cause The reason that the generation stops.
				 */
				shutdown: async (cause) => {
					dynamic.approval.settleAll(cause);
					await dynamic.lifecycle.shutdown();
				},
				/** Release domain dispatch, authority, subscriptions, and approval resources. */
				dispose: () => {
					tools.dispose();
					dynamic.authority.dispose();
					owners.dynamicProjectionUnsubscribe?.();
					dynamic.approval.dispose();
				},
			});
		},
	});
}

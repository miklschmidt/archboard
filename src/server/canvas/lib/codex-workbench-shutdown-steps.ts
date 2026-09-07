import { CODEX_SESSION_CONTROL } from "@/runtime/codex-session";
import type {
	CodexWorkbenchStopReason,
	GenerationState,
} from "@/server/canvas/lib/codex-workbench-generation-lifecycle";

/**
 * Every teardown step one generation owes, in the order it owes them: the
 * child's own settlement first when the child is what went, then each owner,
 * then the transport, and last the child settlement a host shutdown waits for.
 * @param state The generation.
 * @param reason Why it is stopping.
 * @returns The steps, in order.
 */
function shutdownSteps(
	state: GenerationState,
	reason: CodexWorkbenchStopReason,
): (() => Promise<unknown> | void)[] {
	const { components, hooks } = state;
	const cause = reason === "shutdown" ? "host_shutdown" : "child_disconnected";
	const childSettlement = state.childSettlement;
	const settleChild =
		childSettlement === null
			? []
			: [
					/**
					 * Wait for the child's own settlement to finish.
					 * @returns That settlement.
					 */
					() => childSettlement,
				];
	return [
		...(reason === "child_exit" ? settleChild : []),
		/**
		 * Stop serving browsers.
		 * @returns Resolves once the gateway has closed.
		 */
		() => hooks.stopBrowser(components.gateway, reason),
		/**
		 * Stop the voice session.
		 * @returns Resolves once it has stopped.
		 */
		() => hooks.stopRealtime(components.realtime),
		/**
		 * Dispose the realtime adapter.
		 * @returns Resolves once it has.
		 */
		() => components.realtime.dispose(),
		/**
		 * Dispose the semantic publisher.
		 * @returns Resolves once it has.
		 */
		() => components.semanticPublisher.dispose(),
		/**
		 * Shut the workhorse queue down.
		 * @returns Resolves once it has.
		 */
		() => hooks.stopQueue(components.queue),
		/**
		 * Cancel every coordination approval and dynamic wait.
		 * @returns Resolves once they are cancelled.
		 */
		() => hooks.cancelDynamicApprovalsAndWaits(components, cause),
		/**
		 * Settle every ordinary approval request.
		 * @returns Resolves once they are settled.
		 */
		() => hooks.settleOrdinaryRequests(components.approvals, cause),
		/**
		 * Dispose the session.
		 * @returns Resolves once it has.
		 */
		() => components.session[CODEX_SESSION_CONTROL].dispose(),
		/**
		 * Dispose the coordinator callbacks.
		 * @returns Resolves once they have.
		 */
		() => components.callbacks.dispose(),
		/**
		 * Dispose the spoken approval gate.
		 * @returns Resolves once it has.
		 */
		() => components.spokenApproval.dispose(),
		/**
		 * Dispose the semantic delivery controller.
		 * @returns Resolves once it has.
		 */
		() => components.semanticDelivery.dispose(),
		/**
		 * Dispose the coordinator tool dispatcher.
		 * @returns Resolves once it has.
		 */
		() => components.coordinatorTools.dispose(),
		/**
		 * Dispose the dynamic tools.
		 * @returns Resolves once they have.
		 */
		() => components.dynamicTools.dispose(),
		...(reason === "shutdown"
			? [
					/**
					 * Shut the transport down, which a host shutdown owns and a child
					 * exit does not.
					 * @returns Resolves once it has.
					 */
					() => components.transport.shutdown(),
					...settleChild,
				]
			: []),
	];
}

export { shutdownSteps };

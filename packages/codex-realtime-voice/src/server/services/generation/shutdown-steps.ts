import { CODEX_SESSION_CONTROL } from "@archboard/codex-app-server/session";
import type {
	CodexWorkbenchStopReason,
	GenerationState,
} from "#server/services/generation/lifecycle.ts";

/**
 * Every teardown step one generation owes, in the order it owes them: the
 * child's own settlement first when the child is what went, then each owner,
 * then the transport, and last the child settlement a server shutdown waits for.
 * @param state The generation.
 * @param reason Why it is stopping.
 * @returns The steps, in order.
 */
function shutdownSteps(
	state: GenerationState,
	reason: CodexWorkbenchStopReason,
): (() => Promise<unknown> | void)[] {
	const { components, hooks } = state;
	const cause = reason === "shutdown" ? "server_shutdown" : "child_disconnected";
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
		 * Stop what every tab session runs: its voice, its board news, its queue.
		 * @returns Resolves once they have stopped.
		 */
		() => components.sessions.stop(),
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
		 * Dispose every tab session's callbacks, spoken approval gate, semantic
		 * delivery and coordinator tools.
		 * @returns Resolves once they have.
		 */
		() => components.sessions.dispose(),
		/**
		 * Dispose the dynamic tools.
		 * @returns Resolves once they have.
		 */
		() => components.dynamicTools?.dispose(),
		...(reason === "shutdown"
			? [
					/**
					 * Shut the transport down, which a server shutdown owns and a child
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

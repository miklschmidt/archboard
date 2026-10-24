import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserTextActions,
} from "#server/protocol/gateway/contract.ts";
import type { OperationId, ThreadId } from "@archboard/codex-app-server/identity";
import {
	createWorkbenchTurnStartParams,
	createWorkbenchTurnSteerParams,
} from "#runtime/rules/host/bodies.ts";
import type {
	WorkbenchExecutionContext,
	WorkbenchContextCodec,
} from "#runtime/protocol/host/context.ts";
import type { CodexWorkbenchComponents } from "#server/services/generation/workbench.ts";

/**
 * The thread a text command runs against, refused when the pane's lease names
 * no thread that can run turns.
 * @param context The pane and the link it named.
 * @returns The thread.
 */
function browserLeaseThreadId(context: BrowserActionContext): ThreadId {
	if (context.link.threadId === null) {
		throw new Error("A text command requires the exact executable lease thread.");
	}
	return context.link.threadId;
}

/** What the typed-message actions of one generation are closed over. */
interface ServerTextActionOptions {
	readonly contextCodec: WorkbenchContextCodec;
	readonly identity: CodexWorkbenchComponents["identity"];
	readonly session: Pick<
		CodexWorkbenchComponents["session"],
		"threadRead" | "turnStart" | "turnSteer" | "turnInterrupt"
	>;
	readonly contextForOperation: (
		context: BrowserActionContext,
		operation: {
			readonly id: string;
			readonly kind: "composer_message";
			readonly rpc: "turn/start" | "turn/steer";
		},
	) => WorkbenchExecutionContext;
}

/**
 * The typed-message half of a pane: starting a turn, steering the one running,
 * and interrupting it, each carrying the board's context with it.
 * @param options The identities, the session, and how one operation's context
 * is read.
 * @returns The actions.
 */
export function createServerCanonicalTextActions(
	options: ServerTextActionOptions,
): BrowserTextActions {
	/**
	 * A fresh operation identity, and how it is spelled in the wire field Codex
	 * carries it back in.
	 * @returns The operation and its wire spelling.
	 */
	const issue = (): { readonly operationId: OperationId; readonly wire: string } => {
		const operationId = options.identity.operation.issuer.mintOperationId();
		return {
			operationId,
			wire: options.identity.operation.decoder.serializeOperationId(operationId),
		};
	};
	return Object.freeze({
		/**
		 * Start a turn on an idle workhorse.
		 * @param command The prompt.
		 * @param context The pane and the link it named.
		 * @returns The browser outcome and the turn that started.
		 */
		start: async (command, context) => {
			const threadId = browserLeaseThreadId(context);
			// Starting requires authoritative idle metadata, not hydrated history:
			// the pinned server cannot list turns for a newly created thread.
			const { thread } = await options.session.threadRead({ threadId, includeTurns: false });
			if (thread.id !== threadId || thread.status.type !== "idle") {
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"Starting a turn requires an idle workhorse; steer the in-progress turn instead.",
					{ outcome: "not_delivered" },
				);
			}
			const { wire } = issue();
			const canonical = createWorkbenchTurnStartParams(
				{
					threadId,
					clientUserMessageId: wire,
					prompt: command.prompt,
					context: options.contextForOperation(context, {
						id: wire,
						kind: "composer_message",
						rpc: "turn/start",
					}),
				},
				options.contextCodec,
			);
			const response = await options.session.turnStart({ ...canonical, threadId });
			return { outcome: "delivered", turnId: response.turn.id };
		},
		/**
		 * Steer the turn that is running, rather than queueing behind it.
		 * @param command The prompt and the turn it steers.
		 * @param context The pane and the link it named.
		 * @returns The browser outcome.
		 */
		steer: async (command, context) => {
			const threadId = browserLeaseThreadId(context);
			const { thread } = await options.session.threadRead({ threadId, includeTurns: false });
			if (thread.id !== threadId || thread.status.type !== "active") {
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"Steering requires the exact active workhorse.",
					{ outcome: "not_delivered" },
				);
			}
			const { wire } = issue();
			const canonical = createWorkbenchTurnSteerParams(
				{
					threadId,
					expectedTurnId: command.turnId,
					clientUserMessageId: wire,
					prompt: command.prompt,
					context: options.contextForOperation(context, {
						id: wire,
						kind: "composer_message",
						rpc: "turn/steer",
					}),
				},
				options.contextCodec,
			);
			await options.session.turnSteer({
				...canonical,
				threadId,
				// Codex checks this required precondition atomically against its active
				// turn; a history pre-read cannot close that race and is unsupported.
				expectedTurnId: command.turnId,
			});
			return { outcome: "delivered" };
		},
		/**
		 * Stop the turn that is running on the workhorse of the pane's checkout. The gateway admits
		 * the command only when its thread is the link of that workhorse (ADR 0050).
		 * @param command The thread and the turn.
		 * @returns The browser outcome.
		 */
		interrupt: async (command) => {
			await options.session.turnInterrupt({
				threadId: command.threadId,
				turnId: command.turnId,
			});
			return { outcome: "delivered" };
		},
	} satisfies BrowserTextActions);
}

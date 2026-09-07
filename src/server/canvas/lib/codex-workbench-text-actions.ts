import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserTextActions,
} from "@/server/codex-workbench";
import type { OperationId, ThreadId } from "@/shared/codex-workbench-identity";
import {
	createTurnStartParams,
	createTurnSteerParams,
	type ArchboardContext,
} from "@/runtime/codex-instructions";
import type { CodexWorkbenchComponents } from "@/server/canvas/lib/codex-workbench";

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
interface CanvasTextActionOptions {
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
	) => ArchboardContext;
}

/**
 * The typed-message half of a pane: starting a turn, steering the one running,
 * and interrupting it, each carrying the board's context with it.
 * @param options The identities, the session, and how one operation's context
 * is read.
 * @returns The actions.
 */
export function createCanvasCanonicalTextActions(
	options: CanvasTextActionOptions,
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
			const canonical = createTurnStartParams({
				threadId,
				clientUserMessageId: wire,
				prompt: command.prompt,
				context: options.contextForOperation(context, {
					id: wire,
					kind: "composer_message",
					rpc: "turn/start",
				}),
			});
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
			const canonical = createTurnSteerParams({
				threadId,
				expectedTurnId: command.turnId,
				clientUserMessageId: wire,
				prompt: command.prompt,
				context: options.contextForOperation(context, {
					id: wire,
					kind: "composer_message",
					rpc: "turn/steer",
				}),
			});
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
		 * Stop the turn that is running.
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

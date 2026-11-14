import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserTextActions,
} from "#server/chat-conversations/gateway/protocol/contract.ts";
import type { OperationId, ThreadId } from "@archboard/codex-app-server/identity";
import {
	createWorkbenchTurnStartParams,
	createWorkbenchTurnSteerParams,
} from "#runtime/host/turn-input/rules/bodies.ts";
import type {
	WorkbenchExecutionContext,
	WorkbenchContextCodec,
} from "#runtime/host/protocol/context.ts";
import type { CodexWorkbenchComponents } from "#server/generation/services/workbench.ts";
import type { WorkhorseStop } from "#server/sessions/services/workhorses.ts";

/**
 * The thread a text command runs against, refused when the chat's lease names
 * no thread that can run turns.
 * @param context The chat and the link it named.
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
		"threadRead" | "turnStart" | "turnSteer"
	>;
	readonly contextForOperation: (
		context: BrowserActionContext,
		operation: {
			readonly id: string;
			readonly kind: "composer_message";
			readonly rpc: "turn/start" | "turn/steer";
		},
	) => WorkbenchExecutionContext;
	/**
	 * Send a typed message as work admitted to the chat's workhorse: refused while it stops or
	 * after a stop that did not end its work, and waited for by a stop that begins meanwhile.
	 */
	readonly admitNewWork: <Result>(
		context: BrowserActionContext,
		start: () => Promise<Result>,
	) => Promise<Result>;
	/** The thread the chat's workhorse is linked to now, or null while it has none. */
	readonly workhorseThread: (context: BrowserActionContext) => ThreadId | null;
	/** Stop the work tree of the workhorse of the chat's checkout, and say what the stop observed. */
	readonly stopWork: (context: BrowserActionContext) => Promise<readonly WorkhorseStop[]>;
}

/**
 * The typed-message half of a chat: starting a turn, steering the one running,
 * and interrupting it, each carrying the host's context with it.
 * @param options The identities, the session, and how one operation's context
 * is read.
 * @returns The actions.
 */
export function createServerCanonicalTextActions(
	options: ServerTextActionOptions,
): BrowserTextActions {
	/**
	 * Refuse a typed message whose thread the chat's workhorse left since the command named it, as
	 * New conversation does. It runs with no await before the request to Codex, so a link change
	 * that completed while the command read the thread is always seen.
	 * @param context The chat and the link it named.
	 * @param threadId The thread the command names.
	 */
	const assertLinkStands = (context: BrowserActionContext, threadId: ThreadId): void => {
		if (options.workhorseThread(context) !== threadId) {
			throw new CodexWorkbenchGatewayError(
				"link_changed",
				"The workhorse moved to another conversation while this message waited; read it again.",
				{ outcome: "not_delivered" },
			);
		}
	};
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
		 * @param context The chat and the link it named.
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
			const response = await options.admitNewWork(context, () => {
				assertLinkStands(context, threadId);
				return options.session.turnStart({ ...canonical, threadId });
			});
			return { outcome: "delivered", turnId: response.turn.id };
		},
		/**
		 * Steer the turn that is running, rather than queueing behind it.
		 * @param command The prompt and the turn it steers.
		 * @param context The chat and the link it named.
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
			await options.admitNewWork(context, () => {
				assertLinkStands(context, threadId);
				return options.session.turnSteer({
					...canonical,
					threadId,
					// Codex checks this required precondition atomically against its active
					// turn; a history pre-read cannot close that race and is unsupported.
					expectedTurnId: command.turnId,
				});
			});
			return { outcome: "delivered" };
		},
		/**
		 * The Stop control: stop the whole work tree of the workhorse of the chat's checkout, the
		 * same stop that a spoken stop runs. The gateway admits the command only when its thread is
		 * the link of that workhorse. A stop that did not show all work ended says so.
		 * @param _command The thread and the turn the control was offered for.
		 * @param context The chat and the link it named.
		 * @returns The browser outcome.
		 */
		interrupt: async (_command, context) => {
			const stops = await options.stopWork(context);
			if (stops.some(({ outcome }) => outcome === "partial" || outcome === "unconfirmed")) {
				throw new CodexWorkbenchGatewayError(
					"stop_unconfirmed",
					"The stop did not show that all work of the workhorse ended.",
					{ outcome: "delivered" },
				);
			}
			return { outcome: "delivered" };
		},
	} satisfies BrowserTextActions);
}

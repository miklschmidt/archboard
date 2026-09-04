import {
	CodexWorkbenchGatewayError,
	type BrowserActionContext,
	type BrowserTextActions,
} from "../../codex-workbench/index.js";
import type { OperationId, ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import {
	createTurnStartParams,
	createTurnSteerParams,
	type ArchboardContext,
} from "../../../runtime/codex-instructions/index.js";
import type { CodexWorkbenchComponents } from "./codex-workbench.js";

function browserLeaseThreadId(context: BrowserActionContext): ThreadId {
	if (context.link.threadId === null)
		throw new Error("A text command requires the exact executable lease thread.");
	return context.link.threadId;
}

/**
 * The authoritative in-progress turn read both text mutations are gated on.
 *
 * The host asks its own session rather than trusting the browser's projected
 * timeline, because that projection is bounded and a browser may have been
 * looking at a stale or truncated view of the thread.
 */
async function authoritativeActiveTurns(
	session: Pick<CodexWorkbenchComponents["session"], "threadRead">,
	threadId: ThreadId,
) {
	const thread = await session.threadRead({ threadId, includeTurns: true });
	return thread.thread.turns.filter((turn) => turn.status === "inProgress");
}

export function createCanvasCanonicalTextActions(options: {
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
}): BrowserTextActions {
	const issue = (): { readonly operationId: OperationId; readonly wire: string } => {
		const operationId = options.identity.operation.issuer.mintOperationId();
		return {
			operationId,
			wire: options.identity.operation.decoder.serializeOperationId(operationId),
		};
	};
	return Object.freeze({
		start: async (command, context) => {
			const threadId = browserLeaseThreadId(context);
			// A start while a turn runs is a steer the caller mistook for a start.
			// Codex would accept it and the person would get two turns racing on one
			// thread, so it is refused here for the same reason a steer naming the
			// wrong turn is: only the host's own thread read is authoritative.
			// `invalid_command` rather than a plain throw: a plain Error reaches the
			// browser as the opaque `command_failed`, while this is a definitive,
			// actionable refusal of a command that is invalid for the workbench's
			// current state. Naming the reason on the wire would need a new
			// BrowserGatewayErrorCode, which belongs to the closed browser contract.
			if ((await authoritativeActiveTurns(options.session, threadId)).length > 0)
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"Starting a turn requires an idle workhorse; steer the in-progress turn instead.",
					{ outcome: "not_delivered" },
				);
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
			await options.session.turnStart({ ...canonical, threadId });
			return { outcome: "delivered" };
		},
		steer: async (command, context) => {
			const threadId = browserLeaseThreadId(context);
			const activeTurns = await authoritativeActiveTurns(options.session, threadId);
			const activeTurn = activeTurns[0];
			if (activeTurns.length !== 1 || activeTurn === undefined || activeTurn.id !== command.turnId)
				throw new Error("Steering requires the exact current authoritative turn.");
			const { wire } = issue();
			const canonical = createTurnSteerParams({
				threadId,
				expectedTurnId: activeTurn.id,
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
				expectedTurnId: activeTurn.id,
			});
			return { outcome: "delivered" };
		},
		interrupt: async (command) => {
			await options.session.turnInterrupt({
				threadId: command.threadId,
				turnId: command.turnId,
			});
			return { outcome: "delivered" };
		},
	} satisfies BrowserTextActions);
}

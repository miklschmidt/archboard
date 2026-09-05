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
			// Starting requires authoritative idle metadata, not hydrated history:
			// the pinned server cannot list turns for a newly created thread.
			const { thread } = await options.session.threadRead({ threadId, includeTurns: false });
			if (thread.id !== threadId || thread.status.type !== "idle")
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
			const response = await options.session.turnStart({ ...canonical, threadId });
			return { outcome: "delivered", turnId: response.turn.id };
		},
		steer: async (command, context) => {
			const threadId = browserLeaseThreadId(context);
			const { thread } = await options.session.threadRead({ threadId, includeTurns: false });
			if (thread.id !== threadId || thread.status.type !== "active")
				throw new CodexWorkbenchGatewayError(
					"invalid_command",
					"Steering requires the exact active workhorse.",
					{ outcome: "not_delivered" },
				);
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
		interrupt: async (command) => {
			await options.session.turnInterrupt({
				threadId: command.threadId,
				turnId: command.turnId,
			});
			return { outcome: "delivered" };
		},
	} satisfies BrowserTextActions);
}

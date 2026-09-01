import type { BrowserActionContext, BrowserTextActions } from "../../codex-workbench/index.js";
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
			const thread = await options.session.threadRead({ threadId, includeTurns: true });
			const activeTurns = thread.thread.turns.filter((turn) => turn.status === "inProgress");
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

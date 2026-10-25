// The conversation controllers of one pane, made together over the pane's transport: the
// thread link and sign-in, the composer, the queue and the approvals.

import {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
} from "#ui/state/approvals/controller.ts";
import type { WorkbenchComposerController } from "#ui/state/composer/contract.ts";
import { createWorkbenchComposerController } from "#ui/state/composer/controller.ts";
import {
	createWorkbenchQueueController,
	type WorkbenchQueueController,
} from "#ui/state/queue/controller.ts";
import type { ThreadLinkController } from "#ui/state/thread-link/contracts.ts";
import { createThreadLinkController } from "#ui/state/thread-link/controller.ts";
import type { BrowserWorkbenchTransport } from "#ui/state/transport/contract.ts";

/** The controllers over one pane's transport. */
interface ConversationControllers {
	/** Creates and resumes the conversation and runs sign-in. */
	readonly threadLink: ThreadLinkController;
	/** Sends, steers and queues messages, holding a draft that did not land. */
	readonly composer: WorkbenchComposerController;
	/** Reorders, edits, cancels and starts queued messages. */
	readonly queue: WorkbenchQueueController;
	/** Answers ordinary and dynamic approvals against what the card showed. */
	readonly approvals: WorkbenchApprovalsController;
}

/** The pane the controllers act for. */
interface ConversationControllersOptions {
	/** The view in the host page that shows this conversation. */
	readonly paneId: string;
	/** The transport attached to that pane's socket. */
	readonly transport: BrowserWorkbenchTransport;
}

/**
 * Make the conversation controllers of one pane.
 * @param options The pane and its transport.
 * @returns The controllers.
 */
function createConversationControllers(
	options: ConversationControllersOptions,
): ConversationControllers {
	const { paneId, transport } = options;
	return Object.freeze({
		threadLink: createThreadLinkController({
			/**
			 * The pane an action is captured against.
			 * @returns The capture.
			 */
			capturePane: () => ({ paneId, transport }),
		}),
		composer: createWorkbenchComposerController({ transport }),
		queue: createWorkbenchQueueController(transport),
		approvals: createWorkbenchApprovalsController(transport),
	});
}

export {
	createConversationControllers,
	type ConversationControllers,
	type ConversationControllersOptions,
};

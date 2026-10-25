import type { WorkbenchContextPublisher } from "@archboard/codex-realtime-voice/runtime";
import type {
	SemanticContextPublisher,
	SemanticContextPublisherOptions,
} from "#runtime/schemas/semantic-context-types.ts";
import { createSemanticContextPublisher } from "#runtime/operations/semantic-context-publisher.ts";
import {
	archboardContextEvent,
	archboardContextMatchesEvent,
} from "#runtime/services/host/archboard-context-match.ts";
import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";
import type { ArchboardWorkbenchServer } from "#server/protocol/generation/archboard-host.ts";
import type { TabSessionId } from "@archboard/codex-realtime-voice/server";

/**
 * Expose domain context through the neutral event and brief contract.
 * @param publisher The Archboard semantic context publisher.
 * @param options The context source that the publisher reads.
 * @returns The publisher through the shared workbench interface.
 */
export function archboardPublisher(
	publisher: SemanticContextPublisher,
	options: SemanticContextPublisherOptions,
): WorkbenchContextPublisher {
	return Object.freeze<WorkbenchContextPublisher>({
		freshBrief: publisher.freshBrief,
		/**
		 * Read a fresh brief with the caller's current realtime session identity.
		 * @param sessionId The realtime session id.
		 * @returns The brief with its coordinator identity bound to that session.
		 */
		freshBriefForRealtime: (sessionId) => {
			const input = options.fresh.read();
			return publisher.freshBriefFor({
				...input,
				coordinator: {
					threadId: input.coordinator?.threadId ?? null,
					realtimeSessionId: sessionId,
				},
			}).brief;
		},
		subscribeSettledChange: publisher.subscribeSettledChange,
		dispose: publisher.dispose,
	});
}

/**
 * Build context delivery for one checkout's workhorse in this tab.
 * @param server The Archboard context integration.
 * @param id The tab session id.
 * @param checkout The workhorse's checkout directory.
 * @returns The publisher and context correlation functions for the workhorse.
 */
export function archboardWorkhorseContext(
	server: ArchboardWorkbenchServer,
	id: TabSessionId,
	checkout: string,
): ReturnType<ArchboardWorkbenchServer["host"]["workhorseContextFor"]> {
	const options = server.workhorsePublisherFor(id, checkout);
	const publisher = createSemanticContextPublisher(options);
	return {
		publisher: archboardPublisher(publisher, options),
		feedId: options.feedId,
		/**
		 * Convert a shared event into its canonical Archboard context.
		 * @param event The settled context event.
		 * @returns The canonical Archboard context for the event.
		 */
		contextForEvent: (event) => server.contextForEvent(archboardContextEvent(event)),
		/**
		 * Compare the event with parsed Archboard context under the host correlation rules.
		 * @param event The settled context event.
		 * @param context The context that the workhorse reports.
		 * @returns True when the context matches the event's authority.
		 */
		matchesHostContext: (event, context) =>
			archboardContextMatchesEvent(
				archboardContextEvent(event),
				ArchboardContextSchema.parse(context),
			),
	};
}

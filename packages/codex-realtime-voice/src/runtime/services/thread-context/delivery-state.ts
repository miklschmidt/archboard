import type { ThreadInjectItemsParams } from "#runtime/rules/host/bodies.ts";
import type { WorkbenchContextEvent } from "#runtime/protocol/host/context-source.ts";
import type { ThreadLinkBindingSnapshot } from "#runtime/rules/thread-link/contract.ts";
import type { ChildEpoch, ChildId, ThreadId } from "@archboard/codex-app-server/identity";
import type { CodexThreadContextEventId } from "#runtime/services/thread-context/contract.ts";

/** The exact thread, child generation and operation authority one delivery may use. */
interface DeliveryTarget {
	readonly threadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

/** Everything captured before the single `thread/inject_items` attempt. */
interface DeliveryState {
	readonly event: WorkbenchContextEvent;
	readonly id: CodexThreadContextEventId;
	readonly initialBinding: ThreadLinkBindingSnapshot;
	readonly payload: ThreadInjectItemsParams;
}

export { type DeliveryState, type DeliveryTarget };

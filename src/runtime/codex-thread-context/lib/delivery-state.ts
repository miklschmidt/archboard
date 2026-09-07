import type { ThreadInjectItemsParams } from "@/runtime/codex-instructions";
import type { SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import type { ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import type { ChildEpoch, ChildId, ThreadId } from "@/shared/codex-workbench-identity";
import type { CodexThreadContextEventId } from "@/runtime/codex-thread-context/lib/contract";

/** The exact thread, child generation and operation authority one delivery may use. */
interface DeliveryTarget {
	readonly threadId: ThreadId;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
}

/** Everything captured before the single `thread/inject_items` attempt. */
interface DeliveryState {
	readonly event: SettledSemanticChangeEvent;
	readonly id: CodexThreadContextEventId;
	readonly initialBinding: ThreadLinkBindingSnapshot;
	readonly payload: ThreadInjectItemsParams;
}

export { type DeliveryState, type DeliveryTarget };

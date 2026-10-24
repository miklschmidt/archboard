import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type { DeepReadonly } from "@archboard/agent-workbench/runtime";
import type { DynamicToolApprovalRequest } from "#runtime/protocol/dynamic-tools/contract.ts";

interface DynamicApprovalOwnerBinding {
	readonly commandId: BrowserCommandId;
	readonly paneId: string;
	readonly capturedLink: {
		readonly threadId: ThreadId;
		readonly childId: ChildId;
		readonly epoch: ChildEpoch;
	};
}

/** The dynamic owner exposes authoritative state; browser presentation is projected elsewhere. */
type DynamicApprovalOwnerRequest = DeepReadonly<DynamicToolApprovalRequest>;

interface DynamicApprovalOwnerView {
	readonly request: DynamicApprovalOwnerRequest;
	readonly binding: DynamicApprovalOwnerBinding;
}

export type { DynamicApprovalOwnerBinding, DynamicApprovalOwnerRequest, DynamicApprovalOwnerView };

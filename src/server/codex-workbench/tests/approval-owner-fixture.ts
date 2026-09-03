import type { ApprovalOwnerView } from "../../../runtime/codex-approvals/index.js";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	ItemId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";

export function commandApprovalOwnerFixture(input: {
	readonly identity: IdentityAuthority;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly itemId: ItemId;
	readonly approvalId: ApprovalId;
	readonly nowMs: number;
}): ApprovalOwnerView {
	const binding = {
		child: input.childId,
		epoch: input.epoch,
		link: "gateway-link",
		target: "gateway-thread",
		effect: "run bun test",
	} as const;
	const params = {
		threadId: input.threadId,
		turnId: input.turnId,
		itemId: input.itemId,
		kind: "command" as const,
		startedAtMs: input.nowMs,
		approvalId: input.approvalId,
		environmentId: null,
		reason: null,
		networkApprovalContext: null,
		command: "bun test",
		cwd: "/repo",
		commandActions: null,
		additionalPermissions: null,
		proposedExecpolicyAmendment: null,
		proposedNetworkPolicyAmendments: null,
		availableDecisions: ["accept" as const, "decline" as const],
	};
	const request = {
		child: input.childId,
		epoch: input.epoch,
		requestId: input.requestId,
		correlation: input.identity.decoder.createWireRequestCorrelation({
			requestId: input.requestId,
		}),
		method: "item/commandExecution/requestApproval" as const,
		params,
		owner: "codex-approvals" as const,
	};
	const approvalIdentity = {
		kind: "item" as const,
		threadId: input.threadId,
		turnId: input.turnId,
		itemId: input.itemId,
		approvalId: input.approvalId,
	};
	return {
		kind: "approval_owner",
		request: {
			family: "command_execution",
			method: request.method,
			request,
			params,
			child: input.childId,
			epoch: input.epoch,
			requestId: input.requestId,
			identity: approvalIdentity,
			binding,
			expiresAtMs: input.nowMs + 90_000,
			threadId: input.threadId,
			turnId: input.turnId,
			itemId: input.itemId,
			approvalId: input.approvalId,
		},
		snapshot: {
			kind: "approval",
			family: "command_execution",
			method: request.method,
			requestId: input.requestId,
			child: input.childId,
			epoch: input.epoch,
			threadId: input.threadId,
			turnId: input.turnId,
			itemId: input.itemId,
			approvalId: input.approvalId,
			identity: approvalIdentity,
			binding,
			expiresAtMs: input.nowMs + 90_000,
			state: "pending",
			outcome: null,
			decision: null,
			reason: null,
		},
		spoken: { eligible: true, reason: "eligible" },
	};
}

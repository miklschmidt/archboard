import type { CoordinatorToolCoordinatorAuthority } from "../index.js";
import type { WorkhorseOperationBinding } from "../../codex-workhorse-operations/index.js";
import type { IdentityAuthority, ThreadId } from "@archboard/codex-app-server/workbench-identity";

export function readyAuthority(
	identity: IdentityAuthority,
	coordinatorThreadId: ThreadId,
): CoordinatorToolCoordinatorAuthority {
	return Object.freeze({
		state: "ready",
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		threadId: coordinatorThreadId,
	});
}

export function bindingFor(
	identity: IdentityAuthority,
	coordinatorThreadId: ThreadId,
	workhorseThreadId: ThreadId,
): WorkhorseOperationBinding {
	const childId = identity.validator.childId;
	const epoch = identity.validator.epoch;
	return Object.freeze({
		childId,
		epoch,
		coordinator: Object.freeze({
			childId,
			epoch,
			threadId: coordinatorThreadId,
			operationId: "coordinator-link",
		}),
		workhorse: Object.freeze({
			childId,
			epoch,
			threadId: workhorseThreadId,
			operationId: "workhorse-link",
		}),
	});
}

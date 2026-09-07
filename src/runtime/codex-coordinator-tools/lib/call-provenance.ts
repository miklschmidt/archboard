import type {
	CodexCoordinatorToolsOptions,
	CoordinatorToolCoordinatorAuthority,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import { fail } from "@/runtime/codex-coordinator-tools/lib/call-identity";
import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type { WorkhorseOperationBinding } from "@/runtime/codex-workhorse-operations";

/** A host fact that claims a child and epoch. */
interface ChildEpochOwner {
	readonly childId: unknown;
	readonly epoch: unknown;
}

/**
 * Check that a host fact belongs to the identity authority's current child and epoch.
 * @param options - The dispatcher options carrying the identity authority.
 * @param owner - The child and epoch the fact claims.
 * @param subject - How the diagnostic names the fact.
 */
function assertCurrentChildEpoch(
	options: CodexCoordinatorToolsOptions,
	owner: ChildEpochOwner,
	subject: string,
): void {
	if (owner.childId !== options.identity.validator.childId) {
		fail("stale_child", `The ${subject} belongs to another Codex child.`);
	}
	if (owner.epoch !== options.identity.validator.epoch) {
		fail("prior_epoch", `The ${subject} belongs to a prior Codex child epoch.`);
	}
}

/**
 * Resolve the ready coordinator the call originated from.
 * @param options - The dispatcher options carrying the host authority.
 * @param call - The decoded logical call.
 * @returns The current coordinator facts.
 */
function currentCoordinator(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
): CoordinatorToolCoordinatorAuthority {
	const current = options.authority.currentCoordinator();
	if (current?.state !== "ready") {
		fail("not_ready", "The coordinator is not ready to execute dynamic tools.");
	}
	assertCurrentChildEpoch(options, current, "coordinator");
	if (current.threadId === null || current.threadId !== call.threadId) {
		fail("invalid_call", "The dynamic call did not originate from the current coordinator thread.");
	}
	return current;
}

/**
 * Check that the binding is attached to this coordinator: same coordinator thread, child and
 * epoch.
 * @param binding - The host's current workhorse binding.
 * @param call - The decoded logical call.
 * @param coordinator - The current coordinator facts.
 */
function assertAttachedToCoordinator(
	binding: WorkhorseOperationBinding,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
): void {
	if (
		binding.coordinator.threadId !== call.threadId ||
		binding.coordinator.childId !== coordinator.childId ||
		binding.coordinator.epoch !== coordinator.epoch
	) {
		fail("unknown_provenance", "The host workhorse binding is not attached to this coordinator.");
	}
}

/**
 * Check that the binding names a distinct workhorse in its own child and epoch, owned by the
 * host.
 * @param binding - The host's current workhorse binding.
 */
function assertOwnedWorkhorse(binding: WorkhorseOperationBinding): void {
	if (
		binding.workhorse.childId !== binding.childId ||
		binding.workhorse.epoch !== binding.epoch ||
		binding.workhorse.threadId === binding.coordinator.threadId
	) {
		fail(
			"unknown_provenance",
			"The workhorse target is missing or points back to the coordinator.",
		);
	}
	if (binding.workhorse.operationId.length === 0) {
		fail("unknown_provenance", "The workhorse binding has no host ownership proof.");
	}
}

/**
 * Resolve the host-bound workhorse a workhorse-namespace call operates on.
 * @param options - The dispatcher options carrying the host authority.
 * @param call - The decoded logical call.
 * @param coordinator - The current coordinator facts.
 * @returns The current workhorse binding.
 */
function workhorseBinding(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
): WorkhorseOperationBinding {
	const binding = options.authority.currentWorkhorseBinding();
	if (binding === null) {
		fail("not_ready", "The coordinator has no current host-bound workhorse.");
	}
	assertCurrentChildEpoch(options, binding, "bound workhorse");
	assertAttachedToCoordinator(binding, call, coordinator);
	assertOwnedWorkhorse(binding);
	return binding;
}

export { currentCoordinator, workhorseBinding };

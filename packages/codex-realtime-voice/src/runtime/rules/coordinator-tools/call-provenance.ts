import type {
	CodexCoordinatorToolsOptions,
	CoordinatorToolCoordinatorAuthority,
} from "#runtime/protocol/coordinator-tools/contract.ts";
import { fail } from "#runtime/rules/coordinator-tools/call-identity.ts";
import type { LogicalToolCallCorrelation } from "@archboard/codex-app-server/identity";
import type { WorkhorseOperationBinding } from "#runtime/protocol/workhorse-operations/contract.ts";

/** A server fact that claims a child and epoch. */
interface ChildEpochOwner {
	readonly childId: unknown;
	readonly epoch: unknown;
}

/**
 * Check that a server fact belongs to the identity authority's current child and epoch.
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
 * @param options - The dispatcher options carrying the server authority.
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
 * @param binding - The server's current workhorse binding.
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
		fail(
			"unknown_provenance",
			"The workhorse binding of this conversation is not attached to this coordinator.",
		);
	}
}

/**
 * Check that the binding names a distinct workhorse in its own child and epoch, owned by the
 * server.
 * @param binding - The server's current workhorse binding.
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
		fail("unknown_provenance", "The workhorse binding has no server ownership proof.");
	}
}

/** What a checkout is under the host's admission policy. */
const CHECKOUT_MEANING = "A checkout is a working directory that the host application permits.";

/**
 * Why a workhorse tool found no ready workhorse, and what the coordinator can do next. A
 * delegation has already tried to start the workhorse, so telling it to delegate would loop.
 * @param checkout - The checkout the call names.
 * @param delegation - Whether the call is delegate_to_workhorse.
 * @returns The message.
 */
function noWorkhorseMessage(checkout: string, delegation: boolean): string {
	return delegation
		? `No workhorse could start in ${checkout}. ${CHECKOUT_MEANING} If ${checkout} is one, starting its workhorse failed: tell the user.`
		: `This conversation has no ready workhorse in ${checkout}. Delegate work there to start one. ${CHECKOUT_MEANING}`;
}

/**
 * Resolve the server-bound workhorse of the checkout a workhorse-namespace call names.
 * @param options - The dispatcher options carrying the server authority.
 * @param call - The decoded logical call.
 * @param coordinator - The current coordinator facts.
 * @param target - The checkout the call names, and whether the call is a delegation.
 * @param target.checkout - The checkout.
 * @param target.delegation - Whether the call is delegate_to_workhorse.
 * @returns The current workhorse binding.
 */
function workhorseBinding(
	options: CodexCoordinatorToolsOptions,
	call: LogicalToolCallCorrelation,
	coordinator: CoordinatorToolCoordinatorAuthority,
	target: { readonly checkout: string; readonly delegation: boolean },
): WorkhorseOperationBinding {
	const binding = options.workhorseFor(target.checkout)?.binding() ?? null;
	if (binding === null) {
		fail("not_ready", noWorkhorseMessage(target.checkout, target.delegation));
	}
	assertCurrentChildEpoch(options, binding, "bound workhorse");
	assertAttachedToCoordinator(binding, call, coordinator);
	assertOwnedWorkhorse(binding);
	return binding;
}

export { currentCoordinator, workhorseBinding };

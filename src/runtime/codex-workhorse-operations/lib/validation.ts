import type { ThreadLinkClassification } from "@/runtime/codex-thread-link";
import {
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_NAMESPACE,
} from "@/runtime/codex-coordinator-tool-contract";
import {
	CodexWorkhorseOperationsError,
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
	type WorkhorseOperationName,
	type WorkhorseOperationOptions,
} from "@/runtime/codex-workhorse-operations/lib/contract";
import {
	sameBinding,
	sameCall,
	snapshotBinding,
	type WorkhorseValidation,
} from "@/runtime/codex-workhorse-operations/lib/internal";
import { assertExecutableClassification } from "@/runtime/codex-workhorse-operations/lib/link-provenance";
import { operationError } from "@/runtime/codex-workhorse-operations/lib/operation-errors";

/**
 * Check that both linked targets share the binding's child and epoch; a binding assembled
 * from links of different epochs is never trusted.
 * @param binding - The binding from the composition root.
 * @returns Whether both targets agree with the binding.
 */
function targetsShareEpoch(binding: WorkhorseOperationBinding): boolean {
	return (
		binding.coordinator.childId === binding.childId &&
		binding.coordinator.epoch === binding.epoch &&
		binding.workhorse.childId === binding.childId &&
		binding.workhorse.epoch === binding.epoch
	);
}

/**
 * Parse a coordinator call through the trusted decoder so an unparseable call is refused
 * with the operations error code rather than a decoder error.
 * @param options - The operation options holding the identity decoder.
 * @param call - The caller-supplied coordinator call.
 * @returns The parsed correlation.
 */
function parseCall(
	options: WorkhorseOperationOptions,
	call: WorkhorseCoordinatorCall,
): WorkhorseCoordinatorCall {
	try {
		return options.identity.decoder.parseLogicalToolCallCorrelation(call);
	} catch (error) {
		throw operationError("invalid_call", "The coordinator call identity is not trusted.", {
			cause: error,
		});
	}
}

/**
 * Check that a parsed call targets the named workhorse tool in the current manifest.
 * @param parsed - The parsed coordinator call.
 * @param tool - The operation the call must name.
 * @returns Whether namespace, tool and manifest hash all agree.
 */
function callNamesTool(parsed: WorkhorseCoordinatorCall, tool: WorkhorseOperationName): boolean {
	return (
		parsed.namespace === ARCHBOARD_WORKHORSE_NAMESPACE.name &&
		parsed.tool === tool &&
		parsed.manifestHash === ARCHBOARD_WORKHORSE_MANIFEST_SHA256
	);
}

/**
 * Check that a parsed call belongs to the captured child, epoch and coordinator thread.
 * @param parsed - The parsed coordinator call.
 * @param binding - The binding captured for the operation.
 * @returns Whether the call was issued from that binding's coordinator.
 */
function callBelongsToBinding(
	parsed: WorkhorseCoordinatorCall,
	binding: WorkhorseOperationBinding,
): boolean {
	return (
		parsed.child === binding.childId &&
		parsed.epoch === binding.epoch &&
		parsed.threadId === binding.coordinator.threadId
	);
}

/**
 * Read the coordinator call the host is executing right now.
 * @param options - The operation options holding the current-call source.
 * @returns The current call, or null when none is executing.
 */
function readCurrentCall(options: WorkhorseOperationOptions): WorkhorseCoordinatorCall | null {
	try {
		return options.currentCoordinatorCall();
	} catch (error) {
		throw operationError("invalid_call", "The current coordinator call could not be read.", {
			cause: error,
		});
	}
}

/**
 * Build the binding and call checks every operation runs before, during and after its effect.
 * @param options - The operation options.
 * @returns The validation port of the runtime.
 */
export function createWorkhorseValidation(options: WorkhorseOperationOptions): WorkhorseValidation {
	/**
	 * Capture the current binding as an immutable snapshot for one operation.
	 * @returns The frozen binding.
	 */
	const currentBinding = (): WorkhorseOperationBinding => {
		const binding = options.currentBinding();
		if (binding === null) {
			throw operationError(
				"not_ready",
				"The coordinator and workhorse must be linked before a workhorse operation.",
			);
		}
		if (!targetsShareEpoch(binding)) {
			throw operationError(
				"unknown_provenance",
				"The linked threads do not share the current child epoch.",
			);
		}
		return snapshotBinding(binding);
	};

	/**
	 * Refuse to continue when the live binding no longer equals the captured one.
	 * @param binding - The binding captured when the operation was accepted.
	 */
	const assertCurrentBinding = (binding: WorkhorseOperationBinding): void => {
		const current = options.currentBinding();
		if (current === null) {
			throw operationError("not_ready", "The workhorse link is no longer available.");
		}
		if (current.childId !== binding.childId) {
			throw operationError("stale_child", "The workhorse child was replaced during the operation.");
		}
		if (current.epoch !== binding.epoch) {
			throw operationError("prior_epoch", "The workhorse link belongs to a prior epoch.");
		}
		if (!sameBinding(current, binding)) {
			throw operationError(
				"stale_link",
				"The coordinator or workhorse link changed during the operation.",
			);
		}
	};

	/**
	 * Refuse a coordinator call that is not the trusted, current call for the named tool.
	 * @param call - The caller-supplied coordinator call.
	 * @param tool - The operation the call must name.
	 * @param binding - When given, the binding the call must have been issued from.
	 */
	const assertCall = (
		call: WorkhorseCoordinatorCall,
		tool: WorkhorseOperationName,
		binding?: WorkhorseOperationBinding,
	): void => {
		const parsed = parseCall(options, call);
		if (!callNamesTool(parsed, tool)) {
			throw operationError("invalid_call", `The coordinator call is not for ${tool}.`);
		}
		if (binding !== undefined && !callBelongsToBinding(parsed, binding)) {
			throw operationError(
				"invalid_call",
				"The coordinator call does not belong to the captured child, epoch, and coordinator thread.",
			);
		}
		const current = readCurrentCall(options);
		if (current === null || !sameCall(parsed, current)) {
			throw operationError(
				"invalid_call",
				"The coordinator call is no longer the current executing call.",
			);
		}
	};

	/**
	 * Classify both linked threads and require executable provenance, re-checking the binding
	 * and call around the classification reads because both can change while awaiting.
	 * @param binding - The captured binding.
	 * @param call - The coordinator call.
	 * @param tool - The operation being validated; inspection tolerates a non-executable workhorse.
	 * @returns The binding with both classifications.
	 */
	const classify = async (
		binding: WorkhorseOperationBinding,
		call: WorkhorseCoordinatorCall,
		tool: WorkhorseOperationName,
	): Promise<{
		readonly binding: WorkhorseOperationBinding;
		readonly coordinator: ThreadLinkClassification;
		readonly workhorse: ThreadLinkClassification;
	}> => {
		assertCurrentBinding(binding);
		assertCall(call, tool, binding);
		let coordinator: ThreadLinkClassification;
		let workhorse: ThreadLinkClassification;
		try {
			coordinator = await options.threadLink.classify(binding.coordinator);
			workhorse = await options.threadLink.classify(binding.workhorse);
		} catch (error) {
			if (error instanceof CodexWorkhorseOperationsError) {
				throw error;
			}
			throw operationError("transport_failure", "The linked thread classification failed.", {
				cause: error,
			});
		}
		assertCurrentBinding(binding);
		assertCall(call, tool, binding);
		assertExecutableClassification(coordinator, binding.coordinator, "The coordinator link");
		if (tool !== "inspect_workhorse") {
			assertExecutableClassification(workhorse, binding.workhorse, "The workhorse link");
		}
		assertCurrentBinding(binding);
		assertCall(call, tool, binding);
		return { binding, coordinator, workhorse };
	};

	return { currentBinding, assertCurrentBinding, assertCall, classify };
}

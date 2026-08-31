import type { ThreadLinkClassification } from "../../codex-thread-link/index.js";
import {
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_NAMESPACE,
} from "../../codex-coordinator-tool-contract/index.js";
import {
	CodexWorkhorseOperationsError,
	type WorkhorseCoordinatorCall,
	type WorkhorseOperationBinding,
	type WorkhorseOperationName,
	type WorkhorseOperationOptions,
} from "./contract.js";
import {
	assertExecutableClassification,
	operationError,
	sameBinding,
	sameCall,
	snapshotBinding,
	type WorkhorseValidation,
} from "./internal.js";

export function createWorkhorseValidation(options: WorkhorseOperationOptions): WorkhorseValidation {
	const currentBinding = (): WorkhorseOperationBinding => {
		const binding = options.currentBinding();
		if (binding === null)
			throw operationError(
				"not_ready",
				"The coordinator and workhorse must be linked before a workhorse operation.",
			);
		if (
			binding.coordinator.childId !== binding.childId ||
			binding.coordinator.epoch !== binding.epoch ||
			binding.workhorse.childId !== binding.childId ||
			binding.workhorse.epoch !== binding.epoch
		)
			throw operationError(
				"unknown_provenance",
				"The linked threads do not share the current child epoch.",
			);
		return snapshotBinding(binding);
	};

	const assertCurrentBinding = (binding: WorkhorseOperationBinding): void => {
		const current = options.currentBinding();
		if (current === null)
			throw operationError("not_ready", "The workhorse link is no longer available.");
		if (current.childId !== binding.childId)
			throw operationError("stale_child", "The workhorse child was replaced during the operation.");
		if (current.epoch !== binding.epoch)
			throw operationError("prior_epoch", "The workhorse link belongs to a prior epoch.");
		if (!sameBinding(current, binding))
			throw operationError(
				"stale_link",
				"The coordinator or workhorse link changed during the operation.",
			);
	};

	const assertCall = (call: WorkhorseCoordinatorCall, tool: WorkhorseOperationName): void => {
		let parsed: WorkhorseCoordinatorCall;
		try {
			parsed = options.identity.decoder.parseLogicalToolCallCorrelation(call);
		} catch (error) {
			throw operationError("invalid_call", "The coordinator call identity is not trusted.", {
				cause: error,
			});
		}
		if (
			parsed.namespace !== ARCHBOARD_WORKHORSE_NAMESPACE.name ||
			parsed.tool !== tool ||
			parsed.manifestHash !== ARCHBOARD_WORKHORSE_MANIFEST_SHA256
		)
			throw operationError("invalid_call", `The coordinator call is not for ${tool}.`);
		let current: WorkhorseCoordinatorCall | null;
		try {
			current = options.currentCoordinatorCall();
		} catch (error) {
			throw operationError("invalid_call", "The current coordinator call could not be read.", {
				cause: error,
			});
		}
		if (current === null || !sameCall(parsed, current))
			throw operationError(
				"invalid_call",
				"The coordinator call is no longer the current executing call.",
			);
	};

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
		assertCall(call, tool);
		let coordinator: ThreadLinkClassification;
		let workhorse: ThreadLinkClassification;
		try {
			coordinator = await options.threadLink.classify(binding.coordinator);
			workhorse = await options.threadLink.classify(binding.workhorse);
		} catch (error) {
			if (error instanceof CodexWorkhorseOperationsError) throw error;
			throw operationError("transport_failure", "The linked thread classification failed.", {
				cause: error,
			});
		}
		assertCurrentBinding(binding);
		assertExecutableClassification(coordinator, binding.coordinator, "The coordinator link");
		if (tool !== "inspect_workhorse")
			assertExecutableClassification(workhorse, binding.workhorse, "The workhorse link");
		return { binding, coordinator, workhorse };
	};

	return { currentBinding, assertCurrentBinding, assertCall, classify };
}

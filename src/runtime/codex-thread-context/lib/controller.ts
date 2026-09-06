import type { SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import type { ThreadLinkBindingSnapshot } from "@/runtime/codex-thread-link";
import type { ChildEpoch, ChildId } from "@/shared/codex-workbench-identity";
import {
	CodexThreadContextControllerError,
	type CodexThreadContextBinding,
	type CodexThreadContextBindingSnapshot,
	type CodexThreadContextBindingToken,
	type CodexThreadContextController,
	type CodexThreadContextControllerHooks,
	type CodexThreadContextControllerOptions,
	type CodexThreadContextDelivery,
	type CodexThreadContextDeliveryOutcome,
	type CodexThreadContextEventId,
} from "@/runtime/codex-thread-context/lib/contract";
import { createUnsubscribedCodexThreadContextDelivery } from "@/runtime/codex-thread-context/lib/delivery";

interface ActiveBinding {
	readonly revision: number;
	readonly binding: CodexThreadContextBinding;
	readonly delivery: CodexThreadContextDelivery;
}

/**
 *
 */
function eventId(event: SettledSemanticChangeEvent): CodexThreadContextEventId {
	return Object.freeze({ feedId: event.feedId, sequence: event.cursor?.sequence ?? -1 });
}

/**
 *
 */
function eventKey(event: CodexThreadContextEventId): string {
	return JSON.stringify([event.feedId, event.sequence]);
}

/**
 *
 */
function sameLink(left: ThreadLinkBindingSnapshot, right: ThreadLinkBindingSnapshot): boolean {
	return (
		left.paneId === right.paneId &&
		left.revision === right.revision &&
		left.cas.revision === right.cas.revision &&
		left.cas.paneId === right.cas.paneId &&
		left.cas.threadId === right.cas.threadId &&
		left.cas.childId === right.cas.childId &&
		left.cas.epoch === right.cas.epoch &&
		left.link.state === right.link.state &&
		left.link.threadId === right.link.threadId &&
		left.link.childId === right.link.childId &&
		left.link.epoch === right.link.epoch
	);
}

/**
 *
 */
function freezeBinding(binding: CodexThreadContextBinding): CodexThreadContextBinding {
	return Object.freeze({
		paneId: binding.paneId,
		target: Object.freeze({ ...binding.target }),
		link: Object.freeze({
			...binding.link,
			link: Object.freeze({ ...binding.link.link }),
			cas: Object.freeze({ ...binding.link.cas }),
		}),
	});
}

/**
 *
 */
function sameBinding(
	left: CodexThreadContextBinding | null,
	right: CodexThreadContextBinding | null,
): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return (
		left.paneId === right.paneId &&
		left.target.threadId === right.target.threadId &&
		left.target.childId === right.target.childId &&
		left.target.epoch === right.target.epoch &&
		left.target.operationId === right.target.operationId &&
		sameLink(left.link, right.link)
	);
}

/**
 *
 */
function unboundOutcome(
	event: SettledSemanticChangeEvent,
	reason: "unbound" | "disposed",
): CodexThreadContextDeliveryOutcome {
	return Object.freeze({
		kind: "thread_context_delivery",
		event: eventId(event),
		paneId: null,
		targetThreadId: null,
		targetChildId: null,
		targetEpoch: null,
		targetOperationId: null,
		attempted: false,
		outcome: "not_delivered",
		reason,
		payload: null,
	});
}

/**
 *
 */
function validateCapturedLink(binding: CodexThreadContextBinding): void {
	const { link, paneId, target } = binding;
	if (paneId.length === 0 || link.paneId !== paneId) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The thread-context binding does not name its captured pane.",
		);
	}
	if (
		link.link.state !== "executable" ||
		link.link.threadId !== target.threadId ||
		link.link.childId !== target.childId ||
		link.link.epoch !== target.epoch ||
		link.cas.paneId !== paneId ||
		link.cas.threadId !== target.threadId ||
		link.cas.childId !== target.childId ||
		link.cas.epoch !== target.epoch
	) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The captured thread-link CAS proof does not match the exact delivery target.",
		);
	}
	if (typeof target.operationId !== "string" || target.operationId.length === 0) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The thread-context target has no durable operation authority.",
		);
	}
}

/**
 *
 */
export function createCodexThreadContextController(
	options: CodexThreadContextControllerOptions,
): CodexThreadContextController {
	let revision = 0;
	let active: ActiveBinding | null = null;
	let hooks: CodexThreadContextControllerHooks = options.hooks;
	let executionAvailable = true;
	let disposed = false;
	const pending = new Map<string, Promise<CodexThreadContextDeliveryOutcome>>();
	const settled = new Map<string, CodexThreadContextDeliveryOutcome>();
	const order: string[] = [];

	/**
	 *
	 */
	const token = (): CodexThreadContextBindingToken => Object.freeze({ revision });
	/**
	 *
	 */
	const snapshot = (): CodexThreadContextBindingSnapshot =>
		Object.freeze({ token: token(), binding: active?.binding ?? null });

	/**
	 *
	 */
	const deliver = (
		event: SettledSemanticChangeEvent,
	): Promise<CodexThreadContextDeliveryOutcome> => {
		const id = eventId(event);
		const key = eventKey(id);
		const inFlight = pending.get(key);
		if (inFlight !== undefined) {
			return inFlight;
		}
		const previous = settled.get(key);
		if (previous !== undefined) {
			return Promise.resolve(previous);
		}
		order.push(key);
		const captured = active;
		const operation =
			disposed || captured === null
				? Promise.resolve(unboundOutcome(event, disposed ? "disposed" : "unbound"))
				: captured.delivery.deliver(event);
		const result = operation.then((outcome) => {
			pending.delete(key);
			settled.set(key, outcome);
			return outcome;
		});
		pending.set(key, result);
		return result;
	};

	const unsubscribe = options.publisher.subscribeSettledChange((event) => {
		void deliver(event);
	});

	/**
	 *
	 */
	const compareAndSwap: CodexThreadContextController["compareAndSwap"] = ({ expected, next }) => {
		if (disposed) {
			throw new CodexThreadContextControllerError(
				"disposed",
				"The thread-context controller is disposed.",
			);
		}
		if (!Number.isSafeInteger(expected.revision) || expected.revision !== revision) {
			throw new CodexThreadContextControllerError(
				"stale_binding",
				`Thread-context binding revision ${expected.revision} is stale; current revision is ${revision}.`,
			);
		}
		if (sameBinding(active?.binding ?? null, next)) {
			throw new CodexThreadContextControllerError(
				"duplicate_binding",
				"The thread-context binding transition does not change authority.",
			);
		}
		if (next !== null) {
			validateCapturedLink(next);
			try {
				options.identity.validator.assertCurrentEpoch(next.target.childId, next.target.epoch);
				options.epoch.assertCurrent({
					childId: next.target.childId,
					epoch: next.target.epoch,
					operationId: next.target.operationId,
					threadId: next.target.threadId,
				});
				const currentLink = options.threadLink.read(next.paneId);
				if (!sameLink(currentLink, next.link)) {
					throw new Error("The captured thread-link CAS proof is stale.");
				}
			} catch (error) {
				throw new CodexThreadContextControllerError(
					"invalid_binding",
					"The thread-context binding is not current durable authority.",
					error,
				);
			}
		}

		active?.delivery.dispose();
		revision += 1;
		executionAvailable = true;
		if (next === null) {
			active = null;
			return snapshot();
		}
		const bindingRevision = revision;
		const capturedBinding = freezeBinding(next);
		const delivery = createUnsubscribedCodexThreadContextDelivery({
			...options,
			paneId: capturedBinding.paneId,
			target: capturedBinding.target,
			/**
			 *
			 */
			currentExecution: () =>
				executionAvailable && active?.revision === bindingRevision
					? options.currentExecution()
					: null,
			/**
			 *
			 */
			contextForEvent: (event) => hooks.contextForEvent(event, capturedBinding),
		});
		active = Object.freeze({ revision: bindingRevision, binding: capturedBinding, delivery });
		return snapshot();
	};

	/**
	 *
	 */
	const dispose = (): void => {
		if (disposed) {
			return;
		}
		disposed = true;
		executionAvailable = false;
		const retiring = active;
		active = null;
		revision += 1;
		retiring?.delivery.dispose();
		unsubscribe();
	};

	return Object.freeze({
		deliver,
		/**
		 *
		 */
		inspect: () =>
			Object.freeze(
				order.flatMap((key) => {
					const outcome = settled.get(key);
					return outcome === undefined ? [] : [outcome];
				}),
			),
		/**
		 *
		 */
		get: (event: CodexThreadContextEventId) => settled.get(eventKey(event)),
		snapshot,
		compareAndSwap,
		/**
		 *
		 */
		replaceHooks(next: CodexThreadContextControllerHooks) {
			if (disposed) {
				throw new CodexThreadContextControllerError(
					"disposed",
					"The thread-context controller is disposed.",
				);
			}
			hooks = next;
		},
		/**
		 *
		 */
		async childExit(child: ChildId, epoch: ChildEpoch) {
			if (
				active === null ||
				active.binding.target.childId !== child ||
				active.binding.target.epoch !== epoch
			) {
				return;
			}
			executionAvailable = false;
			const current = token();
			compareAndSwap({ expected: current, next: null });
			try {
				await options.retireEpoch(child, epoch);
			} finally {
				dispose();
			}
		},
		dispose,
	});
}

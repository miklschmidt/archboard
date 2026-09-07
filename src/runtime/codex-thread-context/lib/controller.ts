import type { SettledSemanticChangeEvent } from "@/runtime/codex-semantic-context";
import type { ThreadLinkBindingSnapshot, ThreadLinkSnapshot } from "@/runtime/codex-thread-link";
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
	type CodexThreadContextTarget,
} from "@/runtime/codex-thread-context/lib/contract";
import { createUnsubscribedCodexThreadContextDelivery } from "@/runtime/codex-thread-context/lib/delivery";
import { eventId, eventKey } from "@/runtime/codex-thread-context/lib/event-identity";

interface ActiveBinding {
	readonly revision: number;
	readonly binding: CodexThreadContextBinding;
	readonly delivery: CodexThreadContextDelivery;
}

/**
 * Whether two CAS tokens prove the same pane, thread and child generation.
 * @param left - One CAS token.
 * @param right - The other CAS token.
 * @returns True when every proven field agrees.
 */
function sameCas(
	left: ThreadLinkBindingSnapshot["cas"],
	right: ThreadLinkBindingSnapshot["cas"],
): boolean {
	return (
		left.revision === right.revision &&
		left.paneId === right.paneId &&
		left.threadId === right.threadId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

/**
 * Whether two link snapshots name the same state, thread and child generation.
 * @param left - One link snapshot.
 * @param right - The other link snapshot.
 * @returns True when the identity fields agree.
 */
function sameLinkIdentity(left: ThreadLinkSnapshot, right: ThreadLinkSnapshot): boolean {
	return (
		left.state === right.state &&
		left.threadId === right.threadId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

/**
 * Whether two pane bindings are the same revision with the same CAS proof and
 * link identity, which is what makes captured CAS evidence still current.
 * @param left - One pane binding.
 * @param right - The other pane binding.
 * @returns True when the bindings are interchangeable as authority.
 */
function sameLink(left: ThreadLinkBindingSnapshot, right: ThreadLinkBindingSnapshot): boolean {
	return (
		left.paneId === right.paneId &&
		left.revision === right.revision &&
		sameCas(left.cas, right.cas) &&
		sameLinkIdentity(left.link, right.link)
	);
}

/**
 * Deep-freezes a binding so a later caller cannot mutate captured authority.
 * @param binding - The binding supplied by the target-selection action.
 * @returns A frozen copy.
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
 * Whether two delivery targets name the same thread, generation and operation.
 * @param left - One target.
 * @param right - The other target.
 * @returns True when all four identities agree.
 */
function sameTarget(left: CodexThreadContextTarget, right: CodexThreadContextTarget): boolean {
	return (
		left.threadId === right.threadId &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.operationId === right.operationId
	);
}

/**
 * Whether a binding transition changes nothing, which the controller refuses
 * as a duplicate rather than silently re-creating a delivery port.
 * @param left - The current binding, if any.
 * @param right - The proposed binding, if any.
 * @returns True when both are absent or both carry the same authority.
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
		sameTarget(left.target, right.target) &&
		sameLink(left.link, right.link)
	);
}

/**
 * The outcome for an event seen while no binding was active.
 * @param event - The settled semantic change.
 * @param reason - Whether there was no binding or the controller was disposed.
 * @returns The frozen `not_delivered` outcome with no target.
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
 * Whether a captured link is executable for exactly the given target.
 * @param link - The captured link snapshot.
 * @param target - The delivery target.
 * @returns True when the link's thread and generation are the target's.
 */
function linkNamesTarget(link: ThreadLinkSnapshot, target: CodexThreadContextTarget): boolean {
	return (
		link.state === "executable" &&
		link.threadId === target.threadId &&
		link.childId === target.childId &&
		link.epoch === target.epoch
	);
}

/**
 * Whether a captured CAS token proves the given pane and target.
 * @param cas - The captured CAS token.
 * @param paneId - The pane the binding names.
 * @param target - The delivery target.
 * @returns True when the token names the pane, thread and generation.
 */
function casNamesTarget(
	cas: ThreadLinkBindingSnapshot["cas"],
	paneId: string,
	target: CodexThreadContextTarget,
): boolean {
	return (
		cas.paneId === paneId &&
		cas.threadId === target.threadId &&
		cas.childId === target.childId &&
		cas.epoch === target.epoch
	);
}

/**
 * Refuses a binding whose captured pane, link and CAS proof do not all name
 * the exact delivery target with durable operation authority.
 * @param binding - The proposed binding.
 */
function validateCapturedLink(binding: CodexThreadContextBinding): void {
	const { link, paneId, target } = binding;
	if (paneId.length === 0 || link.paneId !== paneId) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The thread-context binding does not name its captured pane.",
		);
	}
	if (!linkNamesTarget(link.link, target) || !casNamesTarget(link.cas, paneId, target)) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The captured thread-link CAS proof does not match the exact delivery target.",
		);
	}
	if (!hasOperationAuthority(target)) {
		throw new CodexThreadContextControllerError(
			"invalid_binding",
			"The thread-context target has no durable operation authority.",
		);
	}
}

/**
 * Whether a target carries a non-empty operation id; the target arrives from
 * an action boundary, so the runtime shape is checked and not only the type.
 * @param target - The delivery target.
 * @returns True when the operation id is a non-empty string.
 */
function hasOperationAuthority(target: CodexThreadContextTarget): boolean {
	return typeof target.operationId === "string" && target.operationId.length > 0;
}

/**
 * Checks a proposed binding against live authority: the identity validator,
 * the durable epoch store and the pane's current link.
 * @param options - The controller options carrying those authorities.
 * @param next - The proposed binding.
 */
function assertCurrentAuthority(
	options: CodexThreadContextControllerOptions,
	next: CodexThreadContextBinding,
): void {
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

/**
 * One process-lifetime subscription and event ledger over replaceable exact
 * bindings: events always settle here, through the active binding's own
 * unsubscribed delivery port when one exists.
 * @param options - The controller options.
 * @returns The controller.
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
	 * The current binding revision as an opaque token.
	 * @returns The frozen token.
	 */
	const token = (): CodexThreadContextBindingToken => Object.freeze({ revision });
	/**
	 * The current token and binding.
	 * @returns The frozen snapshot.
	 */
	const snapshot = (): CodexThreadContextBindingSnapshot =>
		Object.freeze({ token: token(), binding: active?.binding ?? null });

	/**
	 * Delivers an event once through whichever binding is active at that moment.
	 * @param event - The settled semantic change.
	 * @returns The outcome promise shared by every caller for this identity.
	 */
	const deliver = (
		event: SettledSemanticChangeEvent,
	): Promise<CodexThreadContextDeliveryOutcome> => {
		const key = eventKey(eventId(event));
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
	 * Refuses a transition the ledger cannot accept: a disposed controller, a
	 * stale token, or a transition that changes no authority.
	 * @param expected - The token the caller believes is current.
	 * @param next - The proposed binding.
	 */
	const assertTransitionAllowed = (
		expected: CodexThreadContextBindingToken,
		next: CodexThreadContextBinding | null,
	): void => {
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
		if (sameBinding(snapshot().binding, next)) {
			throw new CodexThreadContextControllerError(
				"duplicate_binding",
				"The thread-context binding transition does not change authority.",
			);
		}
	};

	/**
	 * Creates the delivery port for a newly activated binding; its child
	 * capability is only readable while that binding revision stays active.
	 * @param binding - The frozen binding being activated.
	 * @param bindingRevision - The revision assigned to it.
	 * @returns The unsubscribed delivery port.
	 */
	const deliveryFor = (
		binding: CodexThreadContextBinding,
		bindingRevision: number,
	): CodexThreadContextDelivery =>
		createUnsubscribedCodexThreadContextDelivery({
			...options,
			paneId: binding.paneId,
			target: binding.target,
			/**
			 * The child capability, or null once execution was withdrawn or the
			 * binding was replaced.
			 * @returns The current execution, or null.
			 */
			currentExecution: () =>
				executionAvailable && active?.revision === bindingRevision
					? options.currentExecution()
					: null,
			/**
			 * Builds the canonical context through the currently installed hooks.
			 * @param event - The settled semantic change.
			 * @returns The context for this binding.
			 */
			contextForEvent: (event) => hooks.contextForEvent(event, binding),
		});

	/**
	 * Replaces the active binding under an exact token, validating any new
	 * binding against live authority before it can receive events.
	 * @param transition - The expected token and the next binding.
	 * @param transition.expected - The token the caller believes is current.
	 * @param transition.next - The next binding, or null to clear.
	 * @returns The snapshot after the transition.
	 */
	const compareAndSwap: CodexThreadContextController["compareAndSwap"] = ({ expected, next }) => {
		assertTransitionAllowed(expected, next);
		if (next !== null) {
			assertCurrentAuthority(options, next);
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
		const delivery = deliveryFor(capturedBinding, bindingRevision);
		active = Object.freeze({ revision: bindingRevision, binding: capturedBinding, delivery });
		return snapshot();
	};

	/**
	 * Retires the controller: no further transitions, and later events settle
	 * as `disposed`.
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
		 * Settled outcomes in first-seen order.
		 * @returns The frozen list of outcomes.
		 */
		inspect: () =>
			Object.freeze(
				order.flatMap((key) => {
					const outcome = settled.get(key);
					return outcome === undefined ? [] : [outcome];
				}),
			),
		/**
		 * Looks up the settled outcome for one event identity.
		 * @param event - The event identity.
		 * @returns The outcome, or undefined while pending or never seen.
		 */
		get: (event: CodexThreadContextEventId) => settled.get(eventKey(event)),
		snapshot,
		compareAndSwap,
		/**
		 * Installs new context hooks for every later event.
		 * @param next - The replacement hooks.
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
		 * Handles the bound child's exit: execution is withdrawn first, the
		 * binding is cleared, the epoch is retired, and the controller disposed.
		 * @param child - The child that exited.
		 * @param epoch - Its epoch.
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

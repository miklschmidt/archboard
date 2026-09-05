// The approvals surface's one owner of in-flight decisions and their results.
// It feeds the committed approvals panel (`@/ui/workbench`): the busy keys it
// disables cards on, and the two respond actions it calls. Every decision goes
// out once, against the target captured when it was made, and its result is
// kept beside the card until the host's own record replaces it.

import type { BrowserApproval, BrowserDynamicApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalCard,
	WorkbenchApprovalDecisionResult,
	WorkbenchApprovalsView,
} from "@/ui/workbench-approvals/contracts";
import { resolveApprovalChoice } from "@/ui/workbench-approvals/lib/choice";
import {
	dynamicCard,
	ordinaryCard,
	projectWorkbenchApprovals,
	workbenchApprovalsInput,
} from "@/ui/workbench-approvals/lib/projection";
import { submitApprovalDecision } from "@/ui/workbench-approvals/lib/submit";
import type {
	WorkbenchApprovalsTransportPort,
	WorkbenchCommandIntent,
} from "@/ui/workbench-approvals/transport-port";
import type {
	ApprovalChoice,
	DynamicApprovalVerdict,
	WorkbenchActions,
} from "@/ui/workbench/contracts";

/** The controller's own state beside the transport's. */
interface WorkbenchApprovalsDecisionState {
	/** Keys of decisions on the wire: an approval's request id, or a dynamic approval's call id. */
	readonly busyApprovals: readonly string[];
	/** The last result per key, until the host's own record replaces it. */
	readonly results: ReadonlyMap<string, WorkbenchApprovalDecisionResult>;
}

/** The approvals controller. */
interface WorkbenchApprovalsController {
	/** Notified when a decision starts or settles. */
	readonly subscribe: (listener: () => void) => () => void;
	readonly decisionState: () => WorkbenchApprovalsDecisionState;
	/** The surface for the current transport state and clock. */
	readonly view: (nowMs: number) => WorkbenchApprovalsView;
	readonly respondToApproval: (
		approval: BrowserApproval,
		choice: ApprovalChoice,
	) => Promise<WorkbenchApprovalDecisionResult>;
	readonly respondToDynamicApproval: (
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	) => Promise<WorkbenchApprovalDecisionResult>;
	/** The actions the committed approvals panel calls. */
	readonly panelActions: Pick<WorkbenchActions, "respondToApproval" | "respondToDynamicApproval">;
}

/** How the controller reads the clock. */
interface WorkbenchApprovalsControllerOptions {
	readonly now?: () => number;
}

const NOT_OFFERED: WorkbenchApprovalDecisionResult = Object.freeze({
	status: "refused",
	code: "not_offered",
	outcome: "not_delivered",
	message: "That decision is not offered for this request.",
});

const ALREADY_BUSY: WorkbenchApprovalDecisionResult = Object.freeze({
	status: "refused",
	code: "decision_in_flight",
	outcome: "not_delivered",
	message: "A decision on this request is already on the wire.",
});

/**
 * The target a decision is offered against, read when the decision is made.
 * Capturing is a transport call that can refuse; a refusal is a null target,
 * which the submission reports rather than guessing another.
 * @param transport The transport port.
 * @returns The captured intent, or null.
 */
function captureTarget(transport: WorkbenchApprovalsTransportPort): WorkbenchCommandIntent | null {
	try {
		return transport.captureCommandIntent();
	} catch {
		return null;
	}
}

/**
 * One approvals controller over one transport.
 * @param transport The transport port.
 * @param options The clock.
 * @returns The controller.
 */
function createWorkbenchApprovalsController(
	transport: WorkbenchApprovalsTransportPort,
	options: WorkbenchApprovalsControllerOptions = {},
): WorkbenchApprovalsController {
	const now = options.now ?? Date.now;
	const listeners = new Set<() => void>();
	const busy = new Set<string>();
	const results = new Map<string, WorkbenchApprovalDecisionResult>();

	/**
	 * Tell every listener.
	 */
	function publish(): void {
		for (const listener of listeners) {
			listener();
		}
	}

	/**
	 * The projection input for the transport as it stands now.
	 * @param nowMs The clock.
	 * @returns The input.
	 */
	function input(nowMs: number): ReturnType<typeof workbenchApprovalsInput> {
		return workbenchApprovalsInput(transport.state(), nowMs, transport.capabilities());
	}

	/**
	 * Send one resolved decision on one card, keyed for the panel.
	 * @param key The busy key.
	 * @param card The card.
	 * @param choice The panel's choice.
	 * @returns How it settled.
	 */
	async function decide(
		key: string,
		card: WorkbenchApprovalCard,
		choice: ApprovalChoice,
	): Promise<WorkbenchApprovalDecisionResult> {
		if (busy.has(key)) {
			return ALREADY_BUSY;
		}
		const resolved = resolveApprovalChoice(card, choice);
		if (resolved === null) {
			results.set(key, NOT_OFFERED);
			publish();
			return NOT_OFFERED;
		}
		busy.add(key);
		publish();
		const result = await submitApprovalDecision({
			transport,
			card,
			offerId: resolved.offerId,
			form: resolved.form,
			target: captureTarget(transport),
		});
		busy.delete(key);
		results.set(key, result);
		publish();
		return result;
	}

	/**
	 * Decide one ordinary approval.
	 * @param approval The request.
	 * @param choice The panel's choice.
	 * @returns How it settled.
	 */
	function respondToApproval(
		approval: BrowserApproval,
		choice: ApprovalChoice,
	): Promise<WorkbenchApprovalDecisionResult> {
		const projection = input(now());
		const context = {
			nowMs: projection.nowMs,
			canCommand: projection.canCommand,
			canRespond: projection.canRespondOrdinary,
			connection: projection.state.connection,
			staleSnapshot: projection.state.kind === "stream",
			connectionReason: "reason" in projection.state ? projection.state.reason : null,
		};
		return decide(String(approval.requestId), ordinaryCard(approval, context), choice);
	}

	/**
	 * Decide one dynamic coordination approval.
	 * @param approval The request.
	 * @param verdict Approve or decline.
	 * @returns How it settled.
	 */
	function respondToDynamicApproval(
		approval: BrowserDynamicApproval,
		verdict: DynamicApprovalVerdict,
	): Promise<WorkbenchApprovalDecisionResult> {
		const projection = input(now());
		const context = {
			nowMs: projection.nowMs,
			canCommand: projection.canCommand,
			canRespond: projection.canRespondDynamic,
			connection: projection.state.connection,
			staleSnapshot: projection.state.kind === "stream",
			connectionReason: "reason" in projection.state ? projection.state.reason : null,
		};
		return decide(approval.identity.callId, dynamicCard(approval, context), { kind: verdict });
	}

	const panelActions: WorkbenchApprovalsController["panelActions"] = Object.freeze({
		/**
		 * Decide one ordinary approval from the panel.
		 * @param approval The request.
		 * @param choice The panel's choice.
		 */
		respondToApproval: (approval: BrowserApproval, choice: ApprovalChoice): void => {
			void respondToApproval(approval, choice);
		},
		/**
		 * Decide one dynamic approval from the panel.
		 * @param approval The request.
		 * @param verdict Approve or decline.
		 */
		respondToDynamicApproval: (
			approval: BrowserDynamicApproval,
			verdict: DynamicApprovalVerdict,
		): void => {
			void respondToDynamicApproval(approval, verdict);
		},
	});

	return Object.freeze({
		/**
		 * Follow the controller's decision state.
		 * @param listener Notified on every change.
		 * @returns Release the subscription.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * The decision state.
		 * @returns The busy keys and the results.
		 */
		decisionState: (): WorkbenchApprovalsDecisionState => ({
			busyApprovals: Object.freeze([...busy]),
			results: new Map(results),
		}),
		/**
		 * The surface for the transport as it stands now.
		 * @param nowMs The clock.
		 * @returns The view.
		 */
		view: (nowMs: number): WorkbenchApprovalsView => projectWorkbenchApprovals(input(nowMs)),
		respondToApproval,
		respondToDynamicApproval,
		panelActions,
	});
}

export {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
	type WorkbenchApprovalsControllerOptions,
	type WorkbenchApprovalsDecisionState,
};

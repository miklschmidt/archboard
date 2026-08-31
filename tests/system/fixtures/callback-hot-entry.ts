import { kept } from "../../../src/runtime/engine/hot.js";
import { COORDINATOR_CAPABILITY_POLICY } from "../../../src/runtime/codex-coordinator/index.js";
import { restoreIdentityAuthorities } from "../../../src/shared/codex-workbench-identity/index.js";
import type {
	CoordinatorCallbackOptions,
	CoordinatorCallbacks,
	CoordinatorCallbacksRetainedState,
} from "../../../src/runtime/codex-coordinator-callbacks/index.js";
import type {
	PaneFocusEvent,
	PaneSelectionEvent,
	SettledSemanticChangeEvent,
} from "../../../src/runtime/codex-semantic-context/index.js";
import type { WorkhorseOperationEvent } from "../../../src/runtime/codex-workhorse-operations/index.js";

interface Metrics {
	activeSubscriptions: number;
	cleanupCount: number;
	deliveryCount: number;
	narrationCount: number;
}

interface Gate {
	generation: number;
	moduleEvaluations: number;
	readonly retained: CoordinatorCallbacksRetainedState;
	readonly options: CoordinatorCallbackOptions;
	readonly metrics: Metrics;
	readonly operationListeners: Set<(event: WorkhorseOperationEvent) => void>;
	readonly installers: Array<CoordinatorCallbackModule["installCodexCoordinatorCallbacks"]>;
	readonly instances: CoordinatorCallbacks[];
}

interface CoordinatorCallbackModule {
	readonly installCodexCoordinatorCallbacks: (
		retained: CoordinatorCallbacksRetainedState,
		options: CoordinatorCallbackOptions,
	) => CoordinatorCallbacks;
}

interface ProtocolRecord {
	readonly phase: "installed" | "verified";
	readonly pid: number;
	readonly generation: number;
	readonly moduleEvaluations: number;
	readonly installerId: number;
	readonly installerChanged: boolean;
	readonly instanceId: number;
	readonly activeSubscriptions: number;
	readonly activeBeforeDispose: number | null;
	readonly cleanupCount: number;
	readonly deliveryCount: number;
	readonly narrationCount: number;
	readonly settledCount: number;
}

const childId = "archboard:child:h33333333333333333333333333333333";
const authorities = restoreIdentityAuthorities({
	childId,
	epoch: "archboard:epoch:h33333333333333333333333333333333.h44444444444444444444444444444444",
});
const identity = authorities.identity;
const child = identity.validator.childId;
const epoch = identity.validator.epoch;
const coordinator = identity.decoder.adoptThreadId("hot-coordinator");
const workhorse = identity.decoder.adoptThreadId("hot-workhorse");
const turn = identity.decoder.adoptTurnId("hot-turn");
const call = identity.decoder.createLogicalToolCallCorrelation({
	threadId: coordinator,
	turnId: turn,
	callId: identity.decoder.adoptDynamicToolCallId("hot-call"),
	namespace: "archboard_app",
	tool: "delegate_to_workhorse",
	manifestHash: "hot-manifest",
});
const epochRecord = {
	correlation: { childId: child, epoch, operationId: "hot-link" },
	operation: { id: "hot-link", kind: "thread_link", rpc: "thread/read" },
	status: "committed",
	outcome: "delivered",
	provenance: {
		childId: child,
		epoch,
		threadId: workhorse,
		turnId: turn,
		threadSource: "appServer",
		workspaceRoot: "/hot-workspace",
		instructionHash: "hot-instruction",
		manifestHash: "hot-manifest",
		confirmedAtMs: 10,
	},
	reason: null,
	createdAtMs: 9,
	updatedAtMs: 10,
} as const;
const proof = { record: epochRecord, manifestRevision: 3 };
const executableLink = {
	kind: "thread_link",
	state: "executable",
	childId: child,
	epoch,
	threadId: workhorse,
	source: "appServer",
	status: "idle",
	loaded: true,
	canAcceptDirectInput: true,
	reason: null,
} as const;
const link = {
	binding: {
		paneId: "hot-pane",
		revision: 1,
		link: executableLink,
		cas: { revision: 1, paneId: "hot-pane", childId: child, epoch, threadId: workhorse },
	},
	target: {
		threadId: workhorse,
		childId: child,
		epoch,
		operationId: "hot-link",
		provenance: proof,
	},
};

function operationEvent(): WorkhorseOperationEvent {
	return {
		operation: "delegate_to_workhorse",
		queueOperation: null,
		rpc: "turn/start",
		type: "completed",
		outcome: "delivered",
		correlation: {
			operationId: authorities.operation.issuer.mintOperationId(),
			childId: child,
			epoch,
			coordinatorThreadId: coordinator,
			coordinatorTurnId: turn,
			workhorseThreadId: workhorse,
			coordinatorCall: call,
			clientUserMessageId: "hot-message",
			queuedSubmissionId: null,
			turnId: turn,
		},
		queuedSubmissionIds: [],
		detail: "hot callback",
	};
}

function createGate(): Gate {
	const metrics: Metrics = {
		activeSubscriptions: 0,
		cleanupCount: 0,
		deliveryCount: 0,
		narrationCount: 0,
	};
	const operationListeners = new Set<(event: WorkhorseOperationEvent) => void>();
	const register = <Event>(set: Set<(event: Event) => void>, listener: (event: Event) => void) => {
		set.add(listener);
		metrics.activeSubscriptions += 1;
		let cleaned = false;
		return () => {
			if (cleaned) return;
			cleaned = true;
			set.delete(listener);
			metrics.activeSubscriptions -= 1;
			metrics.cleanupCount += 1;
		};
	};
	const settled = new Set<(event: SettledSemanticChangeEvent) => void>();
	const focus = new Set<(event: PaneFocusEvent) => void>();
	const selection = new Set<(event: PaneSelectionEvent) => void>();
	const options: CoordinatorCallbackOptions = {
		operations: { subscribe: (listener) => register(operationListeners, listener) },
		semantic: {
			subscribeSettledChange: (listener) => register(settled, listener),
			subscribePaneFocus: (listener) => register(focus, listener),
			subscribePaneSelection: (listener) => register(selection, listener),
		},
		session: {
			threadInjectItems: async (params) => {
				metrics.deliveryCount += 1;
				metrics.narrationCount += params.items.length;
				return {};
			},
		},
		realtime: {
			appendDeveloper: async () => ({
				attempted: false,
				outcome: "not_delivered",
				reason: "stale_session",
			}),
		},
		threadLink: {
			classify: async () => ({
				link: executableLink,
				thread: null,
				observation: {
					persisted: true,
					persistedRows: 1,
					loaded: true,
					loadedOccurrences: 1,
					source: "appServer",
					status: "idle",
					canAcceptDirectInput: true,
				},
				currentEpoch: { childId: child, epoch },
				proof,
			}),
		},
		currentChild: () => ({ childId: child, epoch }),
		currentCoordinator: () => ({
			state: "ready",
			threadId: coordinator,
			childId: child,
			epoch,
			operationId: "hot-coordinator-operation",
			configured: null,
			effective: null,
			approvalPolicy: null,
			approvalsReviewer: null,
			sandboxPolicy: null,
			activePermissionProfile: null,
			review: null,
			capabilities: COORDINATOR_CAPABILITY_POLICY,
			persistence: null,
			reason: null,
		}),
		currentWorkhorseLink: () => link,
		currentRealtimeGeneration: () => null,
	};
	return {
		generation: -1,
		moduleEvaluations: 0,
		retained: { current: null },
		options,
		metrics,
		operationListeners,
		installers: [],
		instances: [],
	};
}

function protocol(record: ProtocolRecord): void {
	process.stdout.write(`CALLBACK_HOT ${JSON.stringify(record)}\n`);
}

const token = process.env.CALLBACK_HOT_TOKEN;
const key = process.env.CALLBACK_HOT_KEY;
if (!token || !key) throw new Error("Callback hot fixture requires token and key.");
const gate = kept<Gate>(key, createGate);
const { generation } = (await import(token)) as { generation: number };

if (generation !== gate.generation) {
	gate.generation = generation;
	const callbackModule: CoordinatorCallbackModule = await import(
		`../../../src/runtime/codex-coordinator-callbacks/index.js?hot=${generation}`
	);
	gate.moduleEvaluations += 1;
	const installerId = gate.installers.findIndex(
		(installer) => installer === callbackModule.installCodexCoordinatorCallbacks,
	);
	if (installerId < 0) gate.installers.push(callbackModule.installCodexCoordinatorCallbacks);
	const callbacks = callbackModule.installCodexCoordinatorCallbacks(gate.retained, gate.options);
	const instanceId = gate.instances.findIndex((instance) => instance === callbacks);
	if (instanceId < 0) gate.instances.push(callbacks);

	if (generation === 1) {
		protocol({
			phase: "installed",
			pid: process.pid,
			generation,
			moduleEvaluations: gate.moduleEvaluations,
			installerId: gate.installers.indexOf(callbackModule.installCodexCoordinatorCallbacks) + 1,
			installerChanged: false,
			instanceId: gate.instances.indexOf(callbacks) + 1,
			activeSubscriptions: gate.metrics.activeSubscriptions,
			activeBeforeDispose: null,
			cleanupCount: gate.metrics.cleanupCount,
			deliveryCount: gate.metrics.deliveryCount,
			narrationCount: gate.metrics.narrationCount,
			settledCount: callbacks.inspect().length,
		});
	} else if (generation === 2) {
		for (const listener of gate.operationListeners) listener(operationEvent());
		await callbacks.flush();
		const activeBeforeDispose = gate.metrics.activeSubscriptions;
		callbacks.dispose();
		callbacks.dispose();
		protocol({
			phase: "verified",
			pid: process.pid,
			generation,
			moduleEvaluations: gate.moduleEvaluations,
			installerId: gate.installers.indexOf(callbackModule.installCodexCoordinatorCallbacks) + 1,
			installerChanged: gate.installers.length === 2,
			instanceId: gate.instances.indexOf(callbacks) + 1,
			activeSubscriptions: gate.metrics.activeSubscriptions,
			activeBeforeDispose,
			cleanupCount: gate.metrics.cleanupCount,
			deliveryCount: gate.metrics.deliveryCount,
			narrationCount: gate.metrics.narrationCount,
			settledCount: callbacks.inspect().length,
		});
	}
}

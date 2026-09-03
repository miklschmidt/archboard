import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { CoordinatorCallbacks } from "../../../runtime/codex-coordinator-callbacks/index.js";
import type { CoordinatorToolDispatcher } from "../../../runtime/codex-coordinator-tools/index.js";
import type {
	CodexCoordinator,
	CoordinatorPersistedState,
} from "../../../runtime/codex-coordinator/index.js";
import type { CodexDynamicTools } from "../../../runtime/codex-dynamic-tools/index.js";
import type { CodexEpochStore } from "../../../runtime/codex-epoch/index.js";
import type { CodexProcess, CodexProcessChild } from "../../../runtime/codex-process/index.js";
import type { CodexRealtimeAdapter } from "../../../runtime/codex-realtime/index.js";
import type { SemanticContextPublisher } from "../../../runtime/codex-semantic-context/index.js";
import {
	CODEX_SESSION_CONTROL,
	type CodexSession,
	type ControlledCodexSession,
} from "../../../runtime/codex-session/index.js";
import type { CodexSpokenApprovalGate } from "../../../runtime/codex-spoken-approval/index.js";
import type { CodexThreadContextController } from "../../../runtime/codex-thread-context/index.js";
import type { CodexThreadLinkPort } from "../../../runtime/codex-thread-link/index.js";
import type { CodexTransport } from "../../../runtime/codex-transport/index.js";
import type { CodexWorkhorseOperations } from "../../../runtime/codex-workhorse-operations/index.js";
import type { CodexWorkhorseQueue } from "../../../runtime/codex-workhorse-queue/index.js";
import type { CodexWorkhorseStart } from "../../../runtime/codex-workhorse-start/index.js";
import type {
	IdentityAuthorities,
	IdentityLedger,
	OperationId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { CodexWorkbenchGateway } from "../../codex-workbench/index.js";
import { CodexWorkbenchCompositionError } from "./codex-workbench-error.js";
import { CODEX_GENERATION_REGISTRATION_KEYS } from "./codex-workbench-generation-contract.js";
import {
	createCodexWorkbenchRequestRouter,
	type CodexWorkbenchRequestOwners,
	type CodexWorkbenchRequestRouter,
} from "./codex-workbench-routing.js";

export const CODEX_WORKBENCH_OWNER = "archboard-canvas-codex-workbench" as const;

export type CodexWorkbenchState = "idle" | "starting" | "ready" | "stopping" | "failed";
export type CodexWorkbenchStopReason = "shutdown" | "child_exit";
export type CodexTransportExit = Parameters<Parameters<CodexTransport["onExit"]>[0]>[0];

export interface CodexWorkbenchSnapshot {
	readonly owner: typeof CODEX_WORKBENCH_OWNER;
	readonly state: CodexWorkbenchState;
	readonly generation: number;
	readonly childPid: number | null;
	readonly ready: boolean;
	readonly failure: string | null;
}

export interface CodexWorkbenchComponents {
	readonly identity: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly transport: CodexTransport;
	readonly session: ControlledCodexSession;
	readonly threadLink: CodexThreadLinkPort;
	readonly workhorse: CodexWorkhorseStart;
	readonly semanticPublisher: SemanticContextPublisher;
	readonly realtime: CodexRealtimeAdapter;
	readonly approvals: CodexApprovalBroker;
	readonly dynamicTools: CodexDynamicTools;
	readonly coordinatorTools: CoordinatorToolDispatcher;
	readonly semanticDelivery: CodexThreadContextController;
	readonly coordinator: CodexCoordinator;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly operations: CodexWorkhorseOperations;
	readonly callbacks: CoordinatorCallbacks;
	readonly spokenApproval: CodexSpokenApprovalGate;
	readonly gateway: CodexWorkbenchGateway;
}

export interface CodexWorkbenchGenerationHooks {
	readonly threadContext: Parameters<CodexThreadContextController["replaceHooks"]>[0];
	readonly onNotification: Parameters<CodexTransport["onServerNotification"]>[0];
	readonly installIdentityDecoders: (identity: IdentityAuthorities) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installApprovalProjection: (components: CodexWorkbenchComponents) => () => void;
	readonly installBrowserGateway: (gateway: CodexWorkbenchGateway) => () => void;
	readonly initializeSession: (
		session: CodexSession,
		components: CodexWorkbenchComponents,
	) => Promise<void>;
	readonly stopBrowser: (
		gateway: CodexWorkbenchGateway,
		reason: CodexWorkbenchStopReason,
	) => Promise<void>;
	readonly stopRealtime: (realtime: CodexRealtimeAdapter) => Promise<void>;
	readonly stopQueue: (queue: CodexWorkhorseQueue<OperationId>) => Promise<void> | void;
	readonly cancelDynamicApprovalsAndWaits: (
		components: CodexWorkbenchComponents,
		cause: "host_shutdown" | "child_disconnected",
	) => Promise<void>;
	readonly settleOrdinaryRequests: (
		approvals: CodexApprovalBroker,
		cause: "host_shutdown" | "child_disconnected",
	) => Promise<void>;
}

interface GenerationRegistrations {
	transportRequest: (() => void) | null;
	transportNotification: (() => void) | null;
	lifecycleSignals: (() => void) | null;
	browserGateway: (() => void) | null;
	approvalProjection: (() => void) | null;
}

interface GenerationState {
	readonly components: CodexWorkbenchComponents;
	readonly owners: CodexWorkbenchRequestOwners;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly assertActivationCurrent: () => void;
	registrations: GenerationRegistrations;
	active: boolean;
	initialized: boolean;
	stopped: boolean;
	stopPromise: Promise<void> | null;
	stopComplete: boolean;
	finishComplete: boolean;
	childSettlement: Promise<void> | null;
}

export interface CodexWorkbenchGeneration {
	readonly components: CodexWorkbenchComponents;
	readonly identityLedger: IdentityLedger;
	readonly transport: CodexTransport;
	readonly gateway: CodexWorkbenchGateway;
	readonly activate: () => Promise<void>;
	readonly deactivate: () => void;
	readonly retireChild: (exit: CodexTransportExit) => Promise<void>;
	readonly stop: (reason: CodexWorkbenchStopReason) => Promise<void>;
	readonly finishStop: () => void;
}

export interface CreateCodexWorkbenchGenerationLifecycleOptions {
	readonly components: CodexWorkbenchComponents;
	readonly identityLedger: IdentityLedger;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly assertActivationCurrent: () => void;
}

class GenerationInstallError extends Error {
	override readonly name = "CodexWorkbenchGenerationInstallError";
	override readonly cause: unknown;

	constructor(
		readonly stage: string,
		readonly cleanupFailure: Error | null,
		cause: unknown,
	) {
		super(`Codex generation installation failed at ${stage}.`);
		const error = cause instanceof Error ? cause : new Error(String(cause));
		this.cause =
			cleanupFailure === null
				? error
				: new AggregateError(
						[error, cleanupFailure],
						"Codex generation installation and partial cleanup both failed.",
					);
	}
}

function failureMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function appendFailure(current: Error | null, next: unknown, message: string): Error {
	const nextError = next instanceof Error ? next : new Error(String(next));
	return current === null ? nextError : new AggregateError([current, nextError], message);
}

function emptyRegistrations(): GenerationRegistrations {
	return {
		transportRequest: null,
		transportNotification: null,
		lifecycleSignals: null,
		browserGateway: null,
		approvalProjection: null,
	};
}

/** Clear ownership before invoking cleanup so a throwing disposer is unreachable. */
function releaseRegistrations(registrations: GenerationRegistrations, label: string): Error | null {
	let failure: Error | null = null;
	for (const key of CODEX_GENERATION_REGISTRATION_KEYS) {
		const cleanup = registrations[key];
		registrations[key] = null;
		if (cleanup === null) continue;
		try {
			cleanup();
		} catch (error) {
			failure = appendFailure(failure, error, `${label} ${key} cleanup failed.`);
		}
	}
	return failure;
}

async function settleChildExit(
	state: GenerationState,
	child: Parameters<CodexWorkbenchGateway["childExit"]>[0],
	epoch: Parameters<CodexWorkbenchGateway["childExit"]>[1],
): Promise<void> {
	const { approvals, coordinatorTools, gateway, semanticDelivery, spokenApproval } =
		state.components;
	let failure: Error | null = null;
	for (const operation of [
		() => semanticDelivery.childExit(child, epoch),
		() => gateway.childExit(child, epoch),
		() => spokenApproval.onChildExit({ child, epoch }),
		() => coordinatorTools.onChildExit({ child, epoch }),
		() => approvals.childExit({ child, epoch }),
	]) {
		try {
			await Promise.resolve().then(operation);
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child-exit cleanup failed.");
		}
	}
	if (failure !== null) throw failure;
}

function installRegistrations(
	state: GenerationState,
	router: CodexWorkbenchRequestRouter,
	onNotification: Parameters<CodexTransport["onServerNotification"]>[0],
): GenerationRegistrations {
	const registrations = emptyRegistrations();
	let stage = "transportRequest";
	try {
		registrations.transportRequest = state.components.transport.onServerRequest(router.route);
		stage = "transportNotification";
		registrations.transportNotification =
			state.components.transport.onServerNotification(onNotification);
		stage = "threadContext";
		state.components.semanticDelivery.replaceHooks(state.hooks.threadContext);
		stage = "identityDecoders";
		state.hooks.installIdentityDecoders(state.components.identity);
		stage = "lifecycleSignals";
		registrations.lifecycleSignals = state.hooks.installLifecycleSignals(state.components);
		stage = "browserGateway";
		registrations.browserGateway = state.hooks.installBrowserGateway(state.components.gateway);
		stage = "approvalProjection";
		registrations.approvalProjection = state.hooks.installApprovalProjection(state.components);
		return registrations;
	} catch (error) {
		throw new GenerationInstallError(
			stage,
			releaseRegistrations(registrations, "Partial Codex generation"),
			error,
		);
	}
}

/** Build generation dispatch and teardown around a complete, freshly assembled graph. */
export function createCodexWorkbenchGenerationLifecycle(
	options: CreateCodexWorkbenchGenerationLifecycleOptions,
): CodexWorkbenchGeneration {
	const components = options.components;
	const owners = Object.freeze({
		approvals: components.approvals,
		dynamicTools: components.dynamicTools,
		coordinatorTools: components.coordinatorTools,
		session: components.session,
	});
	const router = createCodexWorkbenchRequestRouter(owners);
	const state: GenerationState = {
		components,
		owners,
		hooks: options.hooks,
		assertActivationCurrent: options.assertActivationCurrent,
		registrations: emptyRegistrations(),
		active: false,
		initialized: false,
		stopped: false,
		stopPromise: null,
		stopComplete: false,
		finishComplete: false,
		childSettlement: null,
	};

	const onNotification: Parameters<CodexTransport["onServerNotification"]>[0] = (event) => {
		if (!state.active || state.stopped) return;
		state.hooks.onNotification(event);
		components.session[CODEX_SESSION_CONTROL].onNotification(event);
		components.coordinator.onNotification(event);
		components.operations.onNotification(event);
		components.realtime.onNotification(event);
		components.spokenApproval.onNotification(event);
	};
	const activeRouter: CodexWorkbenchRequestRouter = {
		route: (request) => {
			if (!state.active || state.stopped) return;
			router.route(request);
		},
	};
	const deactivate = (): void => {
		state.active = false;
		const registrations = state.registrations;
		state.registrations = emptyRegistrations();
		const failure = releaseRegistrations(registrations, "Retired Codex generation");
		if (failure !== null) throw failure;
	};
	const activate = async (): Promise<void> => {
		state.assertActivationCurrent();
		if (state.stopped)
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"A retired Codex generation cannot be activated.",
			);
		if (state.active) return;
		state.registrations = installRegistrations(state, activeRouter, onNotification);
		state.active = true;
		if (state.initialized) return;
		try {
			await state.hooks.initializeSession(components.session, components);
			state.assertActivationCurrent();
			if (state.stopped)
				throw new CodexWorkbenchCompositionError(
					"not_started",
					"A retired Codex generation cannot publish initialized readiness.",
				);
			state.initialized = true;
		} catch (error) {
			let failure: Error = error instanceof Error ? error : new Error(String(error));
			try {
				deactivate();
			} catch (cleanupError) {
				failure = appendFailure(failure, cleanupError, "Codex activation cleanup failed.");
			}
			throw failure;
		}
	};
	const retireChild = (exit: CodexTransportExit): Promise<void> => {
		if (state.childSettlement !== null) return state.childSettlement;
		const settlement = settleChildExit(state, exit.child, exit.epoch);
		state.childSettlement = settlement;
		return settlement;
	};

	const stop = (reason: CodexWorkbenchStopReason): Promise<void> => {
		if (state.stopComplete) return Promise.resolve();
		if (state.stopPromise !== null) return state.stopPromise;
		state.stopped = true;
		let failure: Error | null = null;
		try {
			deactivate();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex dispatch revocation failed.");
		}
		const cause = reason === "shutdown" ? "host_shutdown" : "child_disconnected";
		const operation = (async (): Promise<void> => {
			const attempt = async (cleanup: () => Promise<unknown> | void): Promise<void> => {
				try {
					await cleanup();
				} catch (error) {
					failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
				}
			};
			const childSettlement = state.childSettlement;
			if (reason === "child_exit" && childSettlement !== null) await attempt(() => childSettlement);
			await attempt(() => state.hooks.stopBrowser(components.gateway, reason));
			await attempt(() => state.hooks.stopRealtime(components.realtime));
			await attempt(() => components.realtime.dispose());
			await attempt(() => components.semanticPublisher.dispose());
			await attempt(() => state.hooks.stopQueue(components.queue));
			await attempt(() => state.hooks.cancelDynamicApprovalsAndWaits(components, cause));
			await attempt(() => state.hooks.settleOrdinaryRequests(components.approvals, cause));
			await attempt(() => components.session[CODEX_SESSION_CONTROL].dispose());
			await attempt(() => components.callbacks.dispose());
			await attempt(() => components.spokenApproval.dispose());
			await attempt(() => components.semanticDelivery.dispose());
			await attempt(() => components.coordinatorTools.dispose());
			await attempt(() => components.dynamicTools.dispose());
			if (reason === "shutdown") await attempt(() => components.transport.shutdown());
			if (reason === "shutdown" && childSettlement !== null) await attempt(() => childSettlement);
			if (failure !== null) throw failure;
		})().finally(() => {
			state.stopPromise = null;
			state.stopComplete = true;
		});
		state.stopPromise = operation;
		return operation;
	};

	const finishStop = (): void => {
		if (state.finishComplete) return;
		state.finishComplete = true;
		let failure: Error | null = null;
		for (const dispose of [() => components.approvals.dispose(), () => components.epoch.close()]) {
			try {
				dispose();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex final cleanup failed.");
			}
		}
		if (failure !== null) throw failure;
	};

	return Object.freeze({
		components,
		identityLedger: options.identityLedger,
		transport: components.transport,
		gateway: components.gateway,
		activate,
		deactivate,
		retireChild,
		stop,
		finishStop,
	});
}

export interface CodexWorkbenchStableKernel {
	readonly identityLedger: IdentityLedger;
	readonly transport: CodexTransport;
}

export interface CodexWorkbenchKernelAcquisition {
	readonly kernel: CodexWorkbenchStableKernel;
	readonly identity: IdentityAuthorities;
}

export interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly kernel: CodexWorkbenchStableKernel | null;
	readonly initialIdentity: IdentityAuthorities | null;
	readonly adoptedSession: "login-capable" | "thread-capable" | null;
	readonly adoptedCoordinator: CoordinatorPersistedState | null;
	readonly assertActivationCurrent: () => void;
	readonly markSessionReady: (accountReady: boolean) => void;
}

export type CodexWorkbenchGenerationFactory = (
	input: CodexWorkbenchGenerationInput,
) => Promise<CodexWorkbenchGeneration>;

export interface CodexWorkbenchOwnerOptions {
	readonly createProcess: () => CodexProcess;
	readonly createKernel: (input: CodexWorkbenchGenerationInput) => CodexWorkbenchKernelAcquisition;
	readonly createGeneration: CodexWorkbenchGenerationFactory;
}

export interface CodexWorkbenchOwner {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
	readonly snapshot: () => CodexWorkbenchSnapshot;
	readonly gateway: () => CodexWorkbenchGateway;
	readonly shutdown: () => Promise<CodexWorkbenchSnapshot>;
}

export type CodexWorkbenchOwnerSlots = CodexWorkbenchOwner;

export interface CodexWorkbenchExitHandler {
	handle: (event: CodexTransportExit) => void;
}

export interface CodexWorkbenchExitBridge {
	event: CodexTransportExit | null;
	handler: CodexWorkbenchExitHandler | null;
}

export interface CodexWorkbenchOwnerRuntime {
	readonly process: CodexProcess;
	identityLedger: IdentityLedger | null;
	transport: CodexTransport | null;
	operation: number;
	sessionInitialized: boolean;
	accountReady: boolean;
	released: boolean;
	readonly exitBridge: CodexWorkbenchExitBridge;
}

export interface CodexWorkbenchRetainedControl {
	current: CodexWorkbenchOwnerSlots | null;
	runtime: CodexWorkbenchOwnerRuntime | null;
	readonly wrappers: CodexWorkbenchOwnerSlots;
}

export interface CodexWorkbenchRetainedState {
	owner: typeof CODEX_WORKBENCH_OWNER | null;
	generation: number;
	state: CodexWorkbenchState;
	failure: string | null;
	process: CodexProcess | null;
	control: CodexWorkbenchRetainedControl;
}

export type AssertCodexWorkbenchRetainedState = (retained: CodexWorkbenchRetainedState) => void;

function emptyRetainedControl(): CodexWorkbenchRetainedControl {
	const control = { current: null, runtime: null } as CodexWorkbenchRetainedControl;
	const current = (): CodexWorkbenchOwnerSlots => {
		if (control.current === null)
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench has no active retained owner dispatch.",
			);
		return control.current;
	};
	Object.defineProperty(control, "wrappers", {
		enumerable: true,
		value: Object.freeze({
			start: () => current().start(),
			shutdown: () => current().shutdown(),
			snapshot: () => current().snapshot(),
			gateway: () => current().gateway(),
		} satisfies CodexWorkbenchOwnerSlots),
	});
	return control;
}

export function emptyCodexWorkbenchRetainedState(): CodexWorkbenchRetainedState {
	return {
		owner: null,
		generation: 0,
		state: "idle",
		failure: null,
		process: null,
		control: emptyRetainedControl(),
	};
}

function isCurrentRuntime(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): boolean {
	return retained.control.runtime === runtime && !runtime.released;
}

function ownsTicket(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	ticket: number,
): boolean {
	return isCurrentRuntime(retained, runtime) && runtime.operation === ticket;
}

function reserveTicket(runtime: CodexWorkbenchOwnerRuntime): number {
	runtime.operation += 1;
	return runtime.operation;
}

function snapshot(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): CodexWorkbenchSnapshot {
	const current = isCurrentRuntime(retained, runtime);
	return Object.freeze({
		owner: CODEX_WORKBENCH_OWNER,
		state: current ? retained.state : "idle",
		generation: current ? retained.generation : 0,
		childPid: current ? (runtime.process.currentChild()?.pid ?? null) : null,
		ready: current && retained.state === "ready",
		failure: current ? retained.failure : null,
	});
}

function revokePublicDispatch(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
): void {
	if (retained.control.runtime === runtime) retained.control.current = null;
}

function releaseRegistration(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	state: CodexWorkbenchState,
	failure: string | null,
): void {
	if (runtime.released) return;
	runtime.released = true;
	runtime.exitBridge.handler = null;
	runtime.identityLedger = null;
	runtime.transport = null;
	if (retained.control.runtime !== runtime) return;
	retained.state = state;
	retained.failure = failure;
	retained.owner = null;
	retained.process = null;
	retained.control.current = null;
	retained.control.runtime = null;
}

function stopProcess(
	local: OwnerLocalState,
	runtime: CodexWorkbenchOwnerRuntime,
): Promise<Error | null> {
	if (local.processStopPromise !== null) return local.processStopPromise;
	const attempt = (async (): Promise<Error | null> => {
		try {
			await runtime.process.stop();
			return null;
		} catch (error) {
			return error instanceof Error ? error : new Error(String(error));
		}
	})();
	const operation = attempt.then((result) => {
		// A failed verified stop keeps the process owner reachable. A later
		// application force pass must perform a fresh TERM/KILL-and-observe
		// attempt rather than replay the first failure forever.
		if (result !== null && local.processStopPromise === operation) local.processStopPromise = null;
		return result;
	});
	local.processStopPromise = operation;
	return operation;
}

interface CandidateReadiness {
	initialized: boolean;
	accountReady: boolean;
}

type LifecycleTransactionPhase = "starting" | "candidate_activation" | "committed" | "invalidated";

interface LifecycleTransaction {
	readonly ticket: number;
	readonly child: CodexProcessChild;
	phase: LifecycleTransactionPhase;
	transport: CodexTransport | null;
}

interface GenerationResource {
	readonly generation: CodexWorkbenchGeneration;
	cleanup: Promise<Error | null> | null;
}

interface OwnerLocalState {
	currentGeneration: CodexWorkbenchGeneration | null;
	transaction: LifecycleTransaction | null;
	readonly resources: Map<CodexWorkbenchGeneration, GenerationResource>;
	readonly cleanupHistory: WeakMap<CodexWorkbenchGeneration, Promise<Error | null>>;
	startPromise: Promise<CodexWorkbenchSnapshot> | null;
	shutdownPromise: Promise<CodexWorkbenchSnapshot> | null;
	processStopPromise: Promise<Error | null> | null;
	nextChild: ((child: CodexProcessChild) => void) | null;
	processChildUnsubscribe: (() => void) | null;
	recoveryBarrier: Promise<Error | null>;
	restart: (() => void) | null;
}

function ownsProcessChild(process: CodexProcess, child: CodexProcessChild): boolean {
	const current = process.currentChild();
	return (
		current !== null &&
		current.pid === child.pid &&
		current.stdin === child.stdin &&
		current.stdout === child.stdout &&
		current.stderr === child.stderr
	);
}

function ownsTransaction(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
): boolean {
	if (
		local.transaction !== transaction ||
		transaction.phase === "invalidated" ||
		transaction.phase === "committed" ||
		!ownsTicket(retained, runtime, transaction.ticket) ||
		retained.state !== "starting" ||
		runtime.exitBridge.event !== null ||
		!ownsProcessChild(runtime.process, transaction.child)
	)
		return false;
	const transport = transaction.transport;
	if (transport === null) return true;
	try {
		return transport.inspect().state === "open";
	} catch {
		return false;
	}
}

function assertTransaction(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
	message: string,
): void {
	if (!ownsTransaction(retained, runtime, local, transaction))
		throw new CodexWorkbenchCompositionError("not_started", message);
}

function invalidateTransaction(local: OwnerLocalState): void {
	if (local.transaction !== null) local.transaction.phase = "invalidated";
	local.transaction = null;
}

function ownGeneration(
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
): GenerationResource {
	const existing = local.resources.get(generation);
	if (existing !== undefined) return existing;
	const resource: GenerationResource = { generation, cleanup: null };
	local.resources.set(generation, resource);
	return resource;
}

function beginGenerationCleanup(
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
	reason: CodexWorkbenchStopReason,
): Promise<Error | null> {
	const completed = local.cleanupHistory.get(generation);
	if (completed !== undefined) return completed;
	const resource = ownGeneration(local, generation);
	if (resource.cleanup !== null) return resource.cleanup;
	let stop: Promise<void>;
	try {
		stop = generation.stop(reason);
	} catch (error) {
		stop = Promise.reject(error);
	}
	const cleanup = (async (): Promise<Error | null> => {
		let failure: Error | null = null;
		try {
			await stop;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex graph shutdown failed.");
		}
		try {
			generation.finishStop();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
		}
		local.resources.delete(generation);
		return failure;
	})();
	resource.cleanup = cleanup;
	local.cleanupHistory.set(generation, cleanup);
	return cleanup;
}

function attachExitBridge(runtime: CodexWorkbenchOwnerRuntime, transport: CodexTransport): void {
	if (runtime.transport !== transport)
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			"The retained child-exit bridge does not own the acquired transport.",
		);
	const bridge = runtime.exitBridge;
	// This is the only process-lifetime listener. Its closure reaches exactly the
	// terminal latch and replaceable source handler, never lifecycle authority.
	transport.onExit((event) => {
		if (bridge.event !== null) return;
		bridge.event = Object.freeze({ ...event });
		bridge.handler?.handle(bridge.event);
	});
}

function generationInput(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	transaction: LifecycleTransaction,
	generation: number,
	child: CodexProcessChild,
	readiness: CandidateReadiness,
	initialIdentity: IdentityAuthorities | null = null,
	adoptedCoordinator: CoordinatorPersistedState | null = null,
): CodexWorkbenchGenerationInput {
	const kernel =
		runtime.identityLedger === null || runtime.transport === null
			? null
			: { identityLedger: runtime.identityLedger, transport: runtime.transport };
	return Object.freeze({
		generation,
		child,
		process: runtime.process,
		kernel,
		initialIdentity,
		adoptedSession: runtime.sessionInitialized
			? runtime.accountReady
				? "thread-capable"
				: "login-capable"
			: null,
		adoptedCoordinator,
		assertActivationCurrent: () =>
			assertTransaction(
				retained,
				runtime,
				local,
				transaction,
				"A retired Codex activation cannot mutate production readiness.",
			),
		markSessionReady: (accountReady: boolean) => {
			assertTransaction(
				retained,
				runtime,
				local,
				transaction,
				"A retired Codex activation cannot publish session readiness.",
			);
			readiness.initialized = true;
			readiness.accountReady = accountReady;
		},
	});
}

function terminalShutdown(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	priorFailure: Error | null = null,
): Promise<CodexWorkbenchSnapshot> {
	if (local.shutdownPromise !== null) return local.shutdownPromise;
	reserveTicket(runtime);
	invalidateTransaction(local);
	revokePublicDispatch(retained, runtime);
	runtime.exitBridge.handler = null;
	local.nextChild = null;
	const processChildUnsubscribe = local.processChildUnsubscribe;
	local.processChildUnsubscribe = null;
	processChildUnsubscribe?.();
	if (isCurrentRuntime(retained, runtime)) retained.state = "stopping";
	let synchronousFailure = priorFailure;
	local.currentGeneration = null;
	// Each stop call revokes one graph before this function reaches its first await.
	const graphCleanups = Array.from(local.resources.keys(), (generation) =>
		beginGenerationCleanup(local, generation, "shutdown"),
	);
	const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
		let failure = synchronousFailure;
		for (const cleanup of graphCleanups) {
			const cleanupFailure = await cleanup;
			if (cleanupFailure !== null)
				failure = appendFailure(failure, cleanupFailure, "Codex graph shutdown failed.");
		}
		const processFailure = await stopProcess(local, runtime);
		if (processFailure !== null)
			failure = appendFailure(failure, processFailure, "Codex process shutdown failed.");
		releaseRegistration(
			retained,
			runtime,
			failure === null ? "idle" : "failed",
			failure === null ? null : failureMessage(failure),
		);
		if (failure !== null)
			throw new CodexWorkbenchCompositionError(
				"shutdown_failed",
				"The production Codex workbench did not shut down cleanly.",
				failure,
			);
		return snapshot(retained, runtime);
	})().finally(() => {
		synchronousFailure = null;
		local.shutdownPromise = null;
	});
	local.shutdownPromise = operation;
	return operation;
}

function observeChildExit(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	exit: CodexTransportExit,
): void {
	if (!isCurrentRuntime(retained, runtime) || runtime.exitBridge.event !== exit) return;
	const ledger = runtime.identityLedger;
	if (ledger === null || exit.child !== ledger.childId || exit.epoch !== ledger.epoch) return;
	reserveTicket(runtime);
	invalidateTransaction(local);
	revokePublicDispatch(retained, runtime);
	retained.state = "starting";
	retained.failure = null;
	let failure: Error | null = null;
	const settlementOwner = local.currentGeneration;
	local.currentGeneration = null;
	let settlement: Promise<void> = Promise.resolve();
	if (settlementOwner !== null) {
		try {
			settlement = settlementOwner.retireChild(exit);
		} catch (error) {
			settlement = Promise.reject(error);
		}
	}
	const graphCleanups = Array.from(local.resources.keys(), (generation) =>
		beginGenerationCleanup(local, generation, "child_exit"),
	);
	const operation = (async (): Promise<Error | null> => {
		try {
			await settlement;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child settlement failed.");
		}
		for (const cleanup of graphCleanups) {
			const cleanupFailure = await cleanup;
			if (cleanupFailure !== null)
				failure = appendFailure(failure, cleanupFailure, "Codex child graph cleanup failed.");
		}
		return failure;
	})();
	local.recoveryBarrier = operation;
	runtime.identityLedger = null;
	runtime.transport = null;
	runtime.sessionInitialized = false;
	runtime.accountReady = false;
	runtime.exitBridge.event = null;
	local.restart?.();
}

function replaceExitHandler(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
): CodexWorkbenchExitHandler {
	const handler: CodexWorkbenchExitHandler = {
		handle: (event) => observeChildExit(retained, runtime, local, event),
	};
	runtime.exitBridge.handler = handler;
	return handler;
}

function publishReadySlots(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
): CodexWorkbenchOwnerSlots {
	const slots: CodexWorkbenchOwnerSlots = {
		start: () => Promise.resolve(snapshot(retained, runtime)),
		shutdown: () => terminalShutdown(retained, runtime, local),
		snapshot: () => snapshot(retained, runtime),
		gateway: () => {
			if (!isCurrentRuntime(retained, runtime) || retained.state !== "ready")
				throw new CodexWorkbenchCompositionError(
					"not_started",
					"The production Codex workbench browser gateway is not ready.",
				);
			return generation.gateway;
		},
	};
	retained.control.current = slots;
	replaceExitHandler(retained, runtime, local);
	return slots;
}

/** Install one stable process port; every graph remains only in replaceable source closures. */
export function installCodexWorkbenchOwnerLifecycle(
	retained: CodexWorkbenchRetainedState,
	options: CodexWorkbenchOwnerOptions,
	assertRetained: AssertCodexWorkbenchRetainedState,
): CodexWorkbenchOwner {
	assertRetained(retained);
	if (retained.owner !== null)
		throw new CodexWorkbenchCompositionError(
			"duplicate_owner",
			`The retained Codex workbench already has active owner ${String(retained.owner)}.`,
		);
	retained.owner = CODEX_WORKBENCH_OWNER;
	let processOwner: CodexProcess;
	try {
		processOwner = options.createProcess();
		retained.process = processOwner;
	} catch (error) {
		retained.owner = null;
		retained.process = null;
		retained.state = "failed";
		retained.failure = failureMessage(error);
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			"The production Codex process owner could not be created.",
			error,
		);
	}
	const local: OwnerLocalState = {
		currentGeneration: null,
		transaction: null,
		resources: new Map(),
		cleanupHistory: new WeakMap(),
		startPromise: null,
		shutdownPromise: null,
		processStopPromise: null,
		nextChild: null,
		processChildUnsubscribe: null,
		recoveryBarrier: Promise.resolve(null),
		restart: null,
	};
	const exitBridge: CodexWorkbenchExitBridge = {
		event: null,
		handler: null,
	};
	const runtime: CodexWorkbenchOwnerRuntime = {
		process: processOwner,
		identityLedger: null,
		transport: null,
		operation: 0,
		sessionInitialized: false,
		accountReady: false,
		released: false,
		exitBridge,
	};
	retained.control.runtime = runtime;
	replaceExitHandler(retained, runtime, local);
	local.processChildUnsubscribe = runtime.process.onChild((child) => local.nextChild?.(child));

	const initialSlots: CodexWorkbenchOwnerSlots = {
		start: () => {
			if (local.startPromise !== null) return local.startPromise;
			if (!isCurrentRuntime(retained, runtime))
				return Promise.reject(
					new CodexWorkbenchCompositionError(
						"not_started",
						"The Codex workbench source generation cannot start this retired runtime.",
					),
				);
			const ticket = reserveTicket(runtime);
			retained.state = "starting";
			retained.failure = null;
			const generationNumber = ++retained.generation;
			const readiness: CandidateReadiness = { initialized: false, accountReady: false };
			const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
				let candidate: CodexWorkbenchGeneration | null = null;
				let resolveChild!: (prepared: {
					readonly child: CodexProcessChild;
					readonly transaction: LifecycleTransaction;
					readonly initialIdentity: IdentityAuthorities;
				}) => void;
				let rejectChild!: (error: unknown) => void;
				const childReady = new Promise<{
					readonly child: CodexProcessChild;
					readonly transaction: LifecycleTransaction;
					readonly initialIdentity: IdentityAuthorities;
				}>((resolve, reject) => {
					resolveChild = resolve;
					rejectChild = reject;
				});
				let acceptedChild = false;
				const receiveChild = (child: CodexProcessChild) => {
					if (acceptedChild) return;
					acceptedChild = true;
					try {
						if (!ownsTicket(retained, runtime, ticket) || !ownsProcessChild(runtime.process, child))
							throw new CodexWorkbenchCompositionError(
								"not_started",
								"A retired Codex startup cannot acquire a child kernel.",
							);
						const transaction: LifecycleTransaction = {
							ticket,
							child,
							phase: "starting",
							transport: null,
						};
						local.transaction = transaction;
						const acquisition = options.createKernel(
							generationInput(
								retained,
								runtime,
								local,
								transaction,
								generationNumber,
								child,
								readiness,
							),
						);
						runtime.identityLedger = acquisition.kernel.identityLedger;
						runtime.transport = acquisition.kernel.transport;
						transaction.transport = acquisition.kernel.transport;
						attachExitBridge(runtime, acquisition.kernel.transport);
						resolveChild({ child, transaction, initialIdentity: acquisition.identity });
					} catch (error) {
						rejectChild(error);
					}
				};
				local.nextChild = receiveChild;
				try {
					const processStart = runtime.process.start().catch((error) => {
						rejectChild(error);
						throw error;
					});
					void processStart.catch(() => undefined);
					const { child, transaction, initialIdentity } = await childReady;
					const recoveryFailure = await local.recoveryBarrier;
					if (recoveryFailure !== null) throw recoveryFailure;
					assertTransaction(
						retained,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot construct a generation.",
					);
					candidate = await options.createGeneration(
						generationInput(
							retained,
							runtime,
							local,
							transaction,
							generationNumber,
							child,
							readiness,
							initialIdentity,
						),
					);
					ownGeneration(local, candidate);
					assertTransaction(
						retained,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot install child-exit observation.",
					);
					if (
						runtime.identityLedger !== candidate.identityLedger ||
						runtime.transport !== candidate.transport
					)
						throw new CodexWorkbenchCompositionError(
							"startup_failed",
							"The first Codex generation did not adopt its synchronously acquired kernel.",
						);
					assertTransaction(
						retained,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot activate a generation.",
					);
					transaction.phase = "candidate_activation";
					local.currentGeneration = candidate;
					await candidate.activate();
					assertTransaction(
						retained,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot continue after activation.",
					);
					await processStart;
					assertTransaction(
						retained,
						runtime,
						local,
						transaction,
						"A retired Codex startup cannot publish readiness.",
					);
					runtime.sessionInitialized = readiness.initialized;
					runtime.accountReady = readiness.accountReady;
					retained.state = "ready";
					transaction.phase = "committed";
					local.transaction = null;
					publishReadySlots(retained, runtime, local, candidate);
					assertRetained(retained);
					return snapshot(retained, runtime);
				} catch (error) {
					let failure = error instanceof Error ? error : new Error(String(error));
					if (candidate !== null) {
						const cleanupFailure = await beginGenerationCleanup(local, candidate, "shutdown");
						if (local.currentGeneration === candidate) local.currentGeneration = null;
						if (cleanupFailure !== null)
							failure = appendFailure(
								failure,
								cleanupFailure,
								"Codex startup and cleanup both failed.",
							);
					}
					if (ownsTicket(retained, runtime, ticket)) {
						runtime.exitBridge.handler = null;
						local.nextChild = null;
						const processChildUnsubscribe = local.processChildUnsubscribe;
						local.processChildUnsubscribe = null;
						processChildUnsubscribe?.();
						const processFailure = await stopProcess(local, runtime);
						if (processFailure !== null)
							failure = appendFailure(
								failure,
								processFailure,
								"Codex startup process cleanup failed.",
							);
						invalidateTransaction(local);
						releaseRegistration(retained, runtime, "failed", failureMessage(failure));
					}
					throw new CodexWorkbenchCompositionError(
						"startup_failed",
						"The production Codex workbench did not become ready.",
						failure,
					);
				} finally {
					if (local.nextChild === receiveChild) local.nextChild = null;
					local.startPromise = null;
				}
			})();
			local.startPromise = operation;
			return operation;
		},
		shutdown: () => terminalShutdown(retained, runtime, local),
		snapshot: () => snapshot(retained, runtime),
		gateway: () => {
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"The production Codex workbench browser gateway is not ready.",
			);
		},
	};
	retained.control.current = initialSlots;
	local.restart = () => {
		if (!isCurrentRuntime(retained, runtime) || runtime.released) return;
		retained.control.current = initialSlots;
		void initialSlots.start().catch(() => undefined);
	};
	assertRetained(retained);
	return Object.freeze({
		start: () => retained.control.wrappers.start(),
		// Keep terminal ownership in this returned handle after public dispatch
		// is revoked. The Canvas lifetime may need one force retry to prove the
		// detached process group is gone.
		shutdown: () => terminalShutdown(retained, runtime, local),
		snapshot: () => retained.control.wrappers.snapshot(),
		gateway: () => retained.control.wrappers.gateway(),
	});
}

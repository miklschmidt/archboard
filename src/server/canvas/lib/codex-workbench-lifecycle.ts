import type { CodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import type { CoordinatorCallbacks } from "../../../runtime/codex-coordinator-callbacks/index.js";
import type { CoordinatorToolDispatcher } from "../../../runtime/codex-coordinator-tools/index.js";
import type { CodexCoordinator } from "../../../runtime/codex-coordinator/index.js";
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
export type CodexWorkbenchStopReason = "reload" | "shutdown" | "child_exit";

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
		cause: "host_shutdown" | "child_disconnected" | "source_reload",
	) => Promise<void>;
	readonly settleOrdinaryRequests: (
		approvals: CodexApprovalBroker,
		cause: "host_shutdown" | "child_disconnected" | "source_reload",
	) => Promise<void>;
}

interface GenerationRegistrations {
	transportRequest: (() => void) | null;
	transportNotification: (() => void) | null;
	transportExit: (() => void) | null;
	lifecycleSignals: (() => void) | null;
	browserGateway: (() => void) | null;
	approvalProjection: (() => void) | null;
}

interface GenerationState {
	readonly components: CodexWorkbenchComponents;
	readonly owners: CodexWorkbenchRequestOwners;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly onChildExitStart: () => void;
	readonly onChildExitFinished: (failure: Error | null) => Promise<void> | void;
	registrations: GenerationRegistrations;
	active: boolean;
	initialized: boolean;
	stopped: boolean;
	stopPromise: Promise<void> | null;
	stopComplete: boolean;
	finishComplete: boolean;
	readonly pendingChildSettlements: Set<Promise<unknown>>;
}

export interface CodexWorkbenchGeneration {
	readonly components: CodexWorkbenchComponents;
	readonly identityLedger: IdentityLedger;
	readonly transport: CodexTransport;
	readonly gateway: CodexWorkbenchGateway;
	readonly activate: () => Promise<void>;
	readonly deactivate: () => void;
	readonly stop: (reason: CodexWorkbenchStopReason) => Promise<void>;
	readonly finishStop: () => void;
}

export interface CreateCodexWorkbenchGenerationLifecycleOptions {
	readonly components: CodexWorkbenchComponents;
	readonly identityLedger: IdentityLedger;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly onChildExitStart: () => void;
	readonly onChildExitFinished: (failure: Error | null) => Promise<void> | void;
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
		transportExit: null,
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

function trackSettlement(state: GenerationState, promise: Promise<unknown>): void {
	state.pendingChildSettlements.add(promise);
	void promise.then(
		() => state.pendingChildSettlements.delete(promise),
		() => state.pendingChildSettlements.delete(promise),
	);
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
	onExit: Parameters<CodexTransport["onExit"]>[0],
): GenerationRegistrations {
	const registrations = emptyRegistrations();
	let stage = "transportRequest";
	try {
		registrations.transportRequest = state.components.transport.onServerRequest(router.route);
		stage = "transportNotification";
		registrations.transportNotification =
			state.components.transport.onServerNotification(onNotification);
		stage = "transportExit";
		registrations.transportExit = state.components.transport.onExit(onExit);
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
		onChildExitStart: options.onChildExitStart,
		onChildExitFinished: options.onChildExitFinished,
		registrations: emptyRegistrations(),
		active: false,
		initialized: false,
		stopped: false,
		stopPromise: null,
		stopComplete: false,
		finishComplete: false,
		pendingChildSettlements: new Set(),
	};

	const onNotification: Parameters<CodexTransport["onServerNotification"]>[0] = (event) => {
		if (!state.active || state.stopped) return;
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
	const onExit: Parameters<CodexTransport["onExit"]>[0] = ({ child, epoch }) => {
		if (!state.active || state.stopped) return;
		state.onChildExitStart();
		const settlement = settleChildExit(state, child, epoch);
		trackSettlement(state, settlement);
		const retirement = (async (): Promise<void> => {
			let failure: Error | null = null;
			for (const operation of [() => settlement, () => stop("child_exit"), () => finishStop()]) {
				try {
					await Promise.resolve(operation());
				} catch (error) {
					failure = appendFailure(failure, error, "Codex child retirement failed.");
				}
			}
			try {
				await state.onChildExitFinished(failure);
			} catch (error) {
				failure = appendFailure(failure, error, "Codex child retirement failed.");
			}
			if (failure !== null) throw failure;
		})();
		void retirement.catch(() => undefined);
	};

	const deactivate = (): void => {
		state.active = false;
		const registrations = state.registrations;
		state.registrations = emptyRegistrations();
		const failure = releaseRegistrations(registrations, "Retired Codex generation");
		if (failure !== null) throw failure;
	};
	const activate = async (): Promise<void> => {
		if (state.stopped)
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"A retired Codex generation cannot be activated.",
			);
		if (state.active) return;
		state.registrations = installRegistrations(state, activeRouter, onNotification, onExit);
		state.active = true;
		if (state.initialized) return;
		try {
			await state.hooks.initializeSession(components.session, components);
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
		const cause =
			reason === "shutdown"
				? "host_shutdown"
				: reason === "child_exit"
					? "child_disconnected"
					: "source_reload";
		const operation = (async (): Promise<void> => {
			const attempt = async (cleanup: () => Promise<unknown> | void): Promise<void> => {
				try {
					await cleanup();
				} catch (error) {
					failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
				}
			};
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
			if (reason !== "reload")
				await attempt(() => Promise.allSettled(Array.from(state.pendingChildSettlements)));
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
		stop,
		finishStop,
	});
}

export interface CodexWorkbenchStableKernel {
	readonly identityLedger: IdentityLedger;
	readonly transport: CodexTransport;
}

export interface CodexWorkbenchGenerationInput {
	readonly generation: number;
	readonly child: CodexProcessChild;
	readonly process: CodexProcess;
	readonly kernel: CodexWorkbenchStableKernel | null;
	readonly adoptedSession: "login-capable" | "thread-capable" | null;
	readonly markSessionReady: (accountReady: boolean) => void;
	readonly onChildExitStart: () => void;
	readonly onChildExitFinished: (failure: Error | null) => Promise<void>;
}

export type CodexWorkbenchGenerationFactory = (
	input: CodexWorkbenchGenerationInput,
) => Promise<CodexWorkbenchGeneration>;

export interface CodexWorkbenchOwnerOptions {
	readonly createProcess: () => CodexProcess;
	readonly createGeneration: CodexWorkbenchGenerationFactory;
}

export interface CodexWorkbenchOwner {
	readonly start: () => Promise<CodexWorkbenchSnapshot>;
	readonly reload: (
		createGeneration: CodexWorkbenchGenerationFactory,
	) => Promise<CodexWorkbenchSnapshot>;
	readonly snapshot: () => CodexWorkbenchSnapshot;
	readonly gateway: () => CodexWorkbenchGateway;
	readonly shutdown: () => Promise<CodexWorkbenchSnapshot>;
}

export type CodexWorkbenchOwnerSlots = CodexWorkbenchOwner;

export interface CodexWorkbenchOwnerRuntime {
	readonly process: CodexProcess;
	identityLedger: IdentityLedger | null;
	transport: CodexTransport | null;
	operation: number;
	sessionInitialized: boolean;
	accountReady: boolean;
	released: boolean;
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
			reload: (factory: CodexWorkbenchGenerationFactory) => current().reload(factory),
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

async function cleanupGeneration(
	generation: CodexWorkbenchGeneration | null,
	reason: CodexWorkbenchStopReason,
): Promise<Error | null> {
	if (generation === null) return null;
	let failure: Error | null = null;
	try {
		await generation.stop(reason);
	} catch (error) {
		failure = appendFailure(failure, error, "Codex graph shutdown failed.");
	}
	try {
		generation.finishStop();
	} catch (error) {
		failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
	}
	return failure;
}

async function stopProcess(runtime: CodexWorkbenchOwnerRuntime): Promise<Error | null> {
	try {
		await runtime.process.stop();
		return null;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

interface CandidateReadiness {
	initialized: boolean;
	accountReady: boolean;
}

function generationInput(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	ticket: number,
	generation: number,
	child: CodexProcessChild,
	readiness: CandidateReadiness,
	onRetire: (failure: Error | null) => Promise<void>,
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
		adoptedSession: runtime.sessionInitialized
			? runtime.accountReady
				? "thread-capable"
				: "login-capable"
			: null,
		markSessionReady: (accountReady: boolean) => {
			readiness.initialized = true;
			readiness.accountReady = accountReady;
		},
		onChildExitStart: () => {
			if (!ownsTicket(retained, runtime, ticket)) return;
			reserveTicket(runtime);
			revokePublicDispatch(retained, runtime);
			retained.state = "stopping";
		},
		onChildExitFinished: onRetire,
	});
}

async function finishChildRetirement(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	priorFailure: Error | null,
): Promise<void> {
	let failure = priorFailure;
	const processFailure = await stopProcess(runtime);
	if (processFailure !== null)
		failure = appendFailure(failure, processFailure, "Codex child-exit process cleanup failed.");
	releaseRegistration(
		retained,
		runtime,
		failure === null ? "idle" : "failed",
		failure === null ? null : failureMessage(failure),
	);
	if (failure !== null) throw failure;
}

interface OwnerLocalState {
	currentGeneration: CodexWorkbenchGeneration | null;
	startPromise: Promise<CodexWorkbenchSnapshot> | null;
	shutdownPromise: Promise<CodexWorkbenchSnapshot> | null;
}

function terminalShutdown(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
): Promise<CodexWorkbenchSnapshot> {
	if (local.shutdownPromise !== null) return local.shutdownPromise;
	reserveTicket(runtime);
	revokePublicDispatch(retained, runtime);
	if (isCurrentRuntime(retained, runtime)) retained.state = "stopping";
	const generation = local.currentGeneration;
	local.currentGeneration = null;
	// stop() revokes route, notification, exit, and hook registrations before
	// returning its first promise.
	const graphStop = generation?.stop("shutdown") ?? Promise.resolve();
	const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
		let failure: Error | null = null;
		try {
			await graphStop;
		} catch (error) {
			failure = appendFailure(failure, error, "Codex graph shutdown failed.");
		}
		const processFailure = await stopProcess(runtime);
		if (processFailure !== null)
			failure = appendFailure(failure, processFailure, "Codex process shutdown failed.");
		if (generation !== null) {
			try {
				generation.finishStop();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex final listener cleanup failed.");
			}
		}
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
		local.shutdownPromise = null;
	});
	local.shutdownPromise = operation;
	return operation;
}

function publishReadySlots(
	retained: CodexWorkbenchRetainedState,
	runtime: CodexWorkbenchOwnerRuntime,
	local: OwnerLocalState,
	generation: CodexWorkbenchGeneration,
): CodexWorkbenchOwnerSlots {
	let reloadPromise: Promise<CodexWorkbenchSnapshot> | null = null;
	const slots: CodexWorkbenchOwnerSlots = {
		start: () => Promise.resolve(snapshot(retained, runtime)),
		reload: (createGeneration) => {
			if (reloadPromise !== null) return reloadPromise;
			if (!isCurrentRuntime(retained, runtime) || local.currentGeneration !== generation)
				return Promise.reject(
					new CodexWorkbenchCompositionError(
						"not_started",
						"The production Codex workbench is not ready for generation replacement.",
					),
				);
			const ticket = reserveTicket(runtime);
			const nextNumber = ++retained.generation;
			retained.state = "starting";
			let operation!: Promise<CodexWorkbenchSnapshot>;
			retained.control.current = {
				start: () => Promise.resolve(snapshot(retained, runtime)),
				reload: () => operation,
				shutdown: () => terminalShutdown(retained, runtime, local),
				snapshot: () => snapshot(retained, runtime),
				gateway: () => {
					throw new CodexWorkbenchCompositionError(
						"not_started",
						"The production Codex workbench browser gateway is being replaced.",
					);
				},
			};
			let removalFailure: Error | null = null;
			try {
				generation.deactivate();
			} catch (error) {
				removalFailure = appendFailure(removalFailure, error, "Codex generation removal failed.");
			}
			operation = (async (): Promise<CodexWorkbenchSnapshot> => {
				let candidate: CodexWorkbenchGeneration | null = null;
				const readiness: CandidateReadiness = {
					initialized: runtime.sessionInitialized,
					accountReady: runtime.accountReady,
				};
				try {
					if (removalFailure !== null) throw removalFailure;
					const child = runtime.process.currentChild();
					if (child === null)
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"The Codex child disappeared before generation replacement.",
						);
					candidate = await createGeneration(
						generationInput(retained, runtime, ticket, nextNumber, child, readiness, (failure) =>
							finishChildRetirement(retained, runtime, failure),
						),
					);
					if (!ownsTicket(retained, runtime, ticket)) {
						await cleanupGeneration(candidate, "reload");
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"A retired Codex generation cannot publish replacement readiness.",
						);
					}
					local.currentGeneration = candidate;
					try {
						await candidate.activate();
					} catch (error) {
						if (local.currentGeneration === candidate) local.currentGeneration = generation;
						throw error;
					}
					if (!ownsTicket(retained, runtime, ticket)) {
						await cleanupGeneration(candidate, "reload");
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"A retired Codex generation cannot publish replacement readiness.",
						);
					}
					const oldFailure = await cleanupGeneration(generation, "reload");
					if (oldFailure !== null) throw oldFailure;
					runtime.identityLedger = candidate.identityLedger;
					runtime.transport = candidate.transport;
					runtime.sessionInitialized = readiness.initialized;
					runtime.accountReady = readiness.accountReady;
					retained.state = "ready";
					retained.failure = null;
					publishReadySlots(retained, runtime, local, candidate);
					return snapshot(retained, runtime);
				} catch (error) {
					if (candidate !== null) {
						await cleanupGeneration(candidate, "reload");
						if (local.currentGeneration === candidate) local.currentGeneration = generation;
					}
					if (ownsTicket(retained, runtime, ticket) && removalFailure === null) {
						try {
							runtime.transport?.replaceIdentity(generation.components.identity.identity);
							await generation.activate();
							local.currentGeneration = generation;
							retained.state = "ready";
							retained.control.current = publishReadySlots(retained, runtime, local, generation);
						} catch (rollbackError) {
							const failure = new AggregateError(
								[error, rollbackError],
								"Codex generation replacement and rollback both failed.",
							);
							await terminalShutdown(retained, runtime, local).catch(() => undefined);
							throw new CodexWorkbenchCompositionError(
								"reload_failed",
								"The production Codex workbench could not replace or restore its generation.",
								failure,
							);
						}
					}
					if (ownsTicket(retained, runtime, ticket) && removalFailure !== null) {
						await terminalShutdown(retained, runtime, local).catch(() => undefined);
						retained.state = "failed";
						retained.failure = failureMessage(removalFailure);
						throw new CodexWorkbenchCompositionError(
							"reload_failed",
							"The production Codex workbench could not remove its retired generation cleanly.",
							removalFailure,
						);
					}
					throw error;
				}
			})().finally(() => {
				reloadPromise = null;
			});
			reloadPromise = operation;
			return operation;
		},
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
	const runtime: CodexWorkbenchOwnerRuntime = {
		process: processOwner,
		identityLedger: null,
		transport: null,
		operation: 0,
		sessionInitialized: false,
		accountReady: false,
		released: false,
	};
	const local: OwnerLocalState = {
		currentGeneration: null,
		startPromise: null,
		shutdownPromise: null,
	};
	retained.control.runtime = runtime;

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
				let resolveChild!: (child: CodexProcessChild) => void;
				let rejectChild!: (error: unknown) => void;
				const childReady = new Promise<CodexProcessChild>((resolve, reject) => {
					resolveChild = resolve;
					rejectChild = reject;
				});
				const unsubscribe = runtime.process.onChild(resolveChild);
				try {
					const processStart = runtime.process.start().catch((error) => {
						rejectChild(error);
						throw error;
					});
					void processStart.catch(() => undefined);
					const child = await childReady;
					if (!ownsTicket(retained, runtime, ticket))
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"A retired Codex startup cannot publish a child.",
						);
					candidate = await options.createGeneration(
						generationInput(
							retained,
							runtime,
							ticket,
							generationNumber,
							child,
							readiness,
							(failure) => finishChildRetirement(retained, runtime, failure),
						),
					);
					if (!ownsTicket(retained, runtime, ticket)) {
						await cleanupGeneration(candidate, "shutdown");
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"A retired Codex startup cannot publish generation readiness.",
						);
					}
					local.currentGeneration = candidate;
					try {
						await candidate.activate();
					} catch (error) {
						if (local.currentGeneration === candidate) local.currentGeneration = null;
						throw error;
					}
					await processStart;
					if (!ownsTicket(retained, runtime, ticket)) {
						await cleanupGeneration(candidate, "shutdown");
						throw new CodexWorkbenchCompositionError(
							"not_started",
							"A retired Codex startup cannot publish readiness.",
						);
					}
					runtime.identityLedger = candidate.identityLedger;
					runtime.transport = candidate.transport;
					runtime.sessionInitialized = readiness.initialized;
					runtime.accountReady = readiness.accountReady;
					retained.state = "ready";
					publishReadySlots(retained, runtime, local, candidate);
					assertRetained(retained);
					return snapshot(retained, runtime);
				} catch (error) {
					let failure = error instanceof Error ? error : new Error(String(error));
					if (candidate !== null) {
						const cleanupFailure = await cleanupGeneration(candidate, "shutdown");
						if (local.currentGeneration === candidate) local.currentGeneration = null;
						if (cleanupFailure !== null)
							failure = appendFailure(
								failure,
								cleanupFailure,
								"Codex startup and cleanup both failed.",
							);
					}
					const processFailure = await stopProcess(runtime);
					if (processFailure !== null)
						failure = appendFailure(
							failure,
							processFailure,
							"Codex startup process cleanup failed.",
						);
					if (ownsTicket(retained, runtime, ticket))
						releaseRegistration(retained, runtime, "failed", failureMessage(failure));
					throw new CodexWorkbenchCompositionError(
						"startup_failed",
						"The production Codex workbench did not become ready.",
						failure,
					);
				} finally {
					unsubscribe();
					local.startPromise = null;
				}
			})();
			local.startPromise = operation;
			return operation;
		},
		reload: () =>
			Promise.reject(
				new CodexWorkbenchCompositionError(
					"not_started",
					"The production Codex workbench is still starting.",
				),
			),
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
	assertRetained(retained);
	return retained.control.wrappers;
}

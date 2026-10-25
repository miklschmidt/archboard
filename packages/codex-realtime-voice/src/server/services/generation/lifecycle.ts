import type { CodexApprovalBroker } from "#runtime/services/approvals/contract.ts";
import type { CodexWorkbenchDomain } from "#server/protocol/generation/domain.ts";
import type { CodexEpochStore } from "#runtime/store/epoch/contract.ts";
import {
	CODEX_SESSION_CONTROL,
	type CodexSession,
	type ControlledCodexSession,
} from "@archboard/codex-app-server/session";
import type { CodexThreadLinkPort } from "#runtime/rules/thread-link/contract.ts";
import type { CodexTransport } from "@archboard/codex-app-server/transport";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	IdentityLedger,
} from "@archboard/codex-app-server/identity";
import type { CodexWorkbenchGateway } from "#server/protocol/gateway/contract.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import { CodexWorkbenchCompositionError } from "#server/rules/generation/error.ts";
import { appendFailure } from "#server/rules/generation/failures.ts";
import { CODEX_GENERATION_REGISTRATION_KEYS } from "#server/protocol/generation/generation-contract.ts";
import { shutdownSteps } from "#server/services/generation/shutdown-steps.ts";
import {
	createCodexWorkbenchRequestRouter,
	type CodexWorkbenchRequestOwners,
	type CodexWorkbenchRequestRouter,
} from "#server/services/dynamic-tools/routing.ts";

/** The one owner name every Codex workbench snapshot reports itself under. */
const CODEX_WORKBENCH_OWNER = "codex-realtime-voice-workbench" as const;

/** Where the workbench owner is in its life. */
type CodexWorkbenchState = "idle" | "starting" | "ready" | "stopping" | "failed";

/** Why a generation is stopping: the server is going, or its child went. */
type CodexWorkbenchStopReason = "shutdown" | "child_exit";

/** What the transport reports when the Codex child exits. */
type CodexTransportExit = Parameters<Parameters<CodexTransport["onExit"]>[0]>[0];

interface CodexWorkbenchSnapshot {
	readonly owner: typeof CODEX_WORKBENCH_OWNER;
	readonly state: CodexWorkbenchState;
	readonly generation: number;
	readonly childPid: number | null;
	readonly ready: boolean;
	readonly failure: string | null;
}

/**
 * What one Codex child generation owns: what describes the child, what every conversation on it
 * shares, and its tab sessions, which own each conversation's workhorse, coordinator and voice.
 */
interface CodexWorkbenchComponents {
	readonly identity: IdentityAuthorities;
	readonly epoch: CodexEpochStore;
	readonly transport: CodexTransport;
	readonly session: ControlledCodexSession;
	readonly threadLink: CodexThreadLinkPort;
	readonly approvals: CodexApprovalBroker;
	readonly dynamicTools: CodexWorkbenchDomain | null;
	readonly sessions: CodexWorkbenchSessions;
	readonly gateway: CodexWorkbenchGateway;
}

/** What every tab session of a generation is built over. */
type CodexWorkbenchSharedComponents = Omit<CodexWorkbenchComponents, "sessions" | "gateway">;

interface CodexWorkbenchGenerationHooks {
	readonly onNotification: Parameters<CodexTransport["onServerNotification"]>[0];
	readonly installIdentityDecoders: (identity: IdentityAuthorities) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installApprovalProjection: (components: CodexWorkbenchComponents) => () => void;
	/** Serve the tabs' sockets through the gateway, opening each tab's session as it connects. */
	readonly installBrowserGateway: (
		components: Pick<CodexWorkbenchComponents, "gateway" | "sessions">,
	) => () => void;
	readonly initializeSession: (
		session: CodexSession,
		components: CodexWorkbenchComponents,
	) => Promise<void>;
	readonly stopBrowser: (
		gateway: CodexWorkbenchGateway,
		reason: CodexWorkbenchStopReason,
	) => Promise<void>;
	/**
	 * Retire the generation's dynamic wait and quarantine owner on child exit.
	 * Ordinary settlement never reaches it, so an in-flight wait would otherwise
	 * outlive the child that owns it.
	 */
	readonly retireDynamicLifecycle: (child: ChildId, epoch: ChildEpoch) => Promise<void> | void;
	readonly cancelDynamicApprovalsAndWaits: (
		components: CodexWorkbenchComponents,
		cause: "server_shutdown" | "child_disconnected",
	) => Promise<void>;
	readonly settleOrdinaryRequests: (
		approvals: CodexApprovalBroker,
		cause: "server_shutdown" | "child_disconnected",
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

interface CodexWorkbenchGeneration {
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

interface CreateCodexWorkbenchGenerationLifecycleOptions {
	readonly components: CodexWorkbenchComponents;
	readonly identityLedger: IdentityLedger;
	readonly hooks: CodexWorkbenchGenerationHooks;
	readonly assertActivationCurrent: () => void;
}

class GenerationInstallError extends Error {
	override readonly name = "CodexWorkbenchGenerationInstallError";
	override readonly cause: unknown;

	/**
	 * Name the stage a generation's installation failed at, carrying both that
	 * failure and whatever cleaning up the part-installed generation cost.
	 * @param stage Which registration was being installed.
	 * @param cleanupFailure What releasing the partial installation threw, if anything.
	 * @param cause What the installation itself threw.
	 */
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

/**
 * A generation that has registered nothing yet.
 * @returns The empty registrations.
 */
function emptyRegistrations(): GenerationRegistrations {
	return {
		transportRequest: null,
		transportNotification: null,
		lifecycleSignals: null,
		browserGateway: null,
		approvalProjection: null,
	};
}

/**
 * Release every registration a generation holds. Ownership is cleared before
 * each disposer runs, so a disposer that throws cannot be reached twice.
 * @param registrations What the generation registered.
 * @param label What these registrations were, for the failure.
 * @returns The failures the release produced, or null when it was clean.
 */
function releaseRegistrations(registrations: GenerationRegistrations, label: string): Error | null {
	let failure: Error | null = null;
	for (const key of CODEX_GENERATION_REGISTRATION_KEYS) {
		const cleanup = registrations[key];
		registrations[key] = null;
		if (cleanup === null) {
			continue;
		}
		try {
			cleanup();
		} catch (error) {
			failure = appendFailure(failure, error, `${label} ${key} cleanup failed.`);
		}
	}
	return failure;
}

/**
 * Tell every owner that this generation's Codex child has exited, running each
 * of them whatever the others do and reporting them all together.
 * @param state The generation.
 * @param child The child that exited.
 * @param epoch Its epoch.
 */
async function settleChildExit(
	state: GenerationState,
	child: Parameters<CodexWorkbenchGateway["childExit"]>[0],
	epoch: Parameters<CodexWorkbenchGateway["childExit"]>[1],
): Promise<void> {
	const { approvals, gateway, sessions } = state.components;
	let failure: Error | null = null;
	const owners: (() => Promise<unknown> | void)[] = [
		/**
		 * The approval broker settles what it had pending for this child.
		 * @returns Resolves once it has.
		 */
		() => approvals.childExit({ child, epoch }),
		/**
		 * Every tab session drops the board news it was carrying, settles what its spoken approval
		 * was waiting on, and settles its coordinator's tool calls.
		 * @returns Resolves once they have.
		 */
		() => sessions.childExit(child, epoch),
		/**
		 * The dynamic wait and quarantine owner is retired, because ordinary
		 * settlement never reaches it.
		 * @returns Resolves once it has.
		 */
		() => state.hooks.retireDynamicLifecycle(child, epoch),
		/**
		 * The browser gateway tells every connection the child has gone.
		 * @returns Resolves once it has.
		 */
		() => gateway.childExit(child, epoch),
	];
	for (const operation of owners) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- child-exit owners settle in this order, each fully before the next
			await Promise.resolve().then(operation);
		} catch (error) {
			failure = appendFailure(failure, error, "Codex child-exit cleanup failed.");
		}
	}
	if (failure !== null) {
		throw failure;
	}
}

/**
 * Register this generation with the transport, the
 * lifecycle signals, the browser gateway and the approval projection, in that
 * order, releasing whatever was registered when one of them fails.
 * @param state The generation.
 * @param router Where server requests go.
 * @param onNotification Where server notifications go.
 * @returns What was registered.
 */
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
		stage = "identityDecoders";
		state.hooks.installIdentityDecoders(state.components.identity);
		stage = "lifecycleSignals";
		registrations.lifecycleSignals = state.hooks.installLifecycleSignals(state.components);
		stage = "browserGateway";
		registrations.browserGateway = state.hooks.installBrowserGateway(state.components);
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

/**
 * Build generation dispatch and teardown around a complete, freshly assembled
 * graph.
 * @param options The graph, its identity ledger, its hooks, and the activation check.
 * @returns The generation.
 */
function createCodexWorkbenchGenerationLifecycle(
	options: CreateCodexWorkbenchGenerationLifecycleOptions,
): CodexWorkbenchGeneration {
	const components = options.components;
	const owners = Object.freeze({
		approvals: components.approvals,
		dynamicTools: components.dynamicTools,
		sessions: components.sessions,
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

	/**
	 * Hand one server notification to the generation's owners and then to the
	 * tab session its thread belongs to, and to none once the generation is
	 * retired or stopped.
	 * @param event The notification.
	 */
	const onNotification: Parameters<CodexTransport["onServerNotification"]>[0] = (event) => {
		if (!state.active || state.stopped) {
			return;
		}
		state.hooks.onNotification(event);
		components.session[CODEX_SESSION_CONTROL].onNotification(event);
		components.sessions.onNotification(event);
	};
	const activeRouter: CodexWorkbenchRequestRouter = {
		/**
		 * Route one server request, and drop it once the generation is retired or
		 * stopped: a retired graph must answer nothing.
		 * @param request The request.
		 */
		route: (request) => {
			if (!state.active || state.stopped) {
				return;
			}
			router.route(request);
		},
	};
	/** Revoke this generation's dispatch and release every registration it holds. */
	const deactivate = (): void => {
		state.active = false;
		const registrations = state.registrations;
		state.registrations = emptyRegistrations();
		const failure = releaseRegistrations(registrations, "Retired Codex generation");
		if (failure !== null) {
			throw failure;
		}
	};
	/**
	 * Register this generation, and initialize its session the first time it is
	 * activated.
	 */
	const activate = async (): Promise<void> => {
		state.assertActivationCurrent();
		if (state.stopped) {
			throw new CodexWorkbenchCompositionError(
				"not_started",
				"A retired Codex generation cannot be activated.",
			);
		}
		if (state.active) {
			return;
		}
		state.registrations = installRegistrations(state, activeRouter, onNotification);
		state.active = true;
		if (!state.initialized) {
			await initializeSession();
		}
	};

	/**
	 * Initialize this generation's session, undoing the registration when the
	 * initialization fails so a half-installed graph never dispatches.
	 */
	const initializeSession = async (): Promise<void> => {
		try {
			await state.hooks.initializeSession(components.session, components);
			state.assertActivationCurrent();
			if (state.stopped) {
				throw new CodexWorkbenchCompositionError(
					"not_started",
					"A retired Codex generation cannot publish initialized readiness.",
				);
			}
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

	/**
	 * Settle this generation against its child's exit, once.
	 * @param exit What the transport reported.
	 * @returns Resolves once every owner has settled.
	 */
	const retireChild = (exit: CodexTransportExit): Promise<void> => {
		if (state.childSettlement !== null) {
			return state.childSettlement;
		}
		const settlement = settleChildExit(state, exit.child, exit.epoch);
		state.childSettlement = settlement;
		return settlement;
	};

	/**
	 * Stop this generation: revoke its dispatch, then dispose every owner in the
	 * order they must go, keeping each failure rather than losing it.
	 * @param reason Why it is stopping.
	 * @returns Resolves once every owner has been disposed.
	 */
	const stop = (reason: CodexWorkbenchStopReason): Promise<void> => {
		if (state.stopComplete) {
			return Promise.resolve();
		}
		if (state.stopPromise !== null) {
			return state.stopPromise;
		}
		state.stopped = true;
		let failure: Error | null = null;
		try {
			deactivate();
		} catch (error) {
			failure = appendFailure(failure, error, "Codex dispatch revocation failed.");
		}
		const operation = (async (): Promise<void> => {
			/**
			 * Run one teardown step, keeping its failure beside the others rather than
			 * letting it stop the steps that follow.
			 * @param cleanup The step.
			 */
			const attempt = async (cleanup: () => Promise<unknown> | void): Promise<void> => {
				try {
					await cleanup();
				} catch (error) {
					failure = appendFailure(failure, error, "Codex workbench shutdown failed.");
				}
			};
			for (const step of shutdownSteps(state, reason)) {
				// oxlint-disable-next-line no-await-in-loop -- owners are disposed in this order, each fully before the next
				await attempt(step);
			}
			if (failure !== null) {
				throw failure;
			}
		})().finally(() => {
			state.stopPromise = null;
			state.stopComplete = true;
		});
		state.stopPromise = operation;
		return operation;
	};

	/** Dispose what outlives the stop itself: the approval broker and the epoch store. */
	const finishStop = (): void => {
		if (state.finishComplete) {
			return;
		}
		state.finishComplete = true;
		let failure: Error | null = null;
		for (const dispose of [() => components.approvals.dispose(), () => components.epoch.close()]) {
			try {
				dispose();
			} catch (error) {
				failure = appendFailure(failure, error, "Codex final cleanup failed.");
			}
		}
		if (failure !== null) {
			throw failure;
		}
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

export { CODEX_WORKBENCH_OWNER, createCodexWorkbenchGenerationLifecycle };
export type {
	CodexTransportExit,
	CodexWorkbenchComponents,
	CodexWorkbenchGeneration,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchSharedComponents,
	CodexWorkbenchSnapshot,
	CodexWorkbenchState,
	CodexWorkbenchStopReason,
	CreateCodexWorkbenchGenerationLifecycleOptions,
	GenerationState,
};

import { domainScope } from "#server/services/generation/domain.ts";
import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";
import type { CodexApprovalBroker } from "#runtime/services/approvals/contract.ts";
import { CodexTransportRemoteError } from "@archboard/codex-app-server/transport";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
} from "#server/services/generation/workbench.ts";
import { ACCOUNT_READ_FAILED_REASON } from "#server/services/actions/account.ts";
import {
	publishProjection,
	retire,
	type GenerationOwners,
} from "#server/services/generation/owners.ts";
import type { CodexWorkbenchServer } from "#server/protocol/generation/host.ts";

/** An empty SHA-256, which is what an effect-free epoch step hashes to. */
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** What building one generation's hooks needs from around it. */
interface HookContext {
	readonly server: CodexWorkbenchServer;
	/** Where the child keeps what it writes, and the directory it works in. */
	readonly storage: Pick<CodexWorkbenchStorage, "coordinatorDirectory">;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/**
 * Take ownership of this child's epoch and initialize its session, which a
 * generation that adopted a running session has already had done for it.
 * @param context What the generation provides.
 * @param session The session to initialize.
 * @param components The graph it belongs to.
 */
async function startEpochAndSession(
	context: HookContext,
	session: Parameters<CodexWorkbenchGenerationHooks["initializeSession"]>[0],
	components: CodexWorkbenchComponents,
): Promise<void> {
	const { input, storage } = context;
	const epochSnapshot = components.epoch.snapshot();
	input.assertActivationCurrent();
	components.epoch.startEpoch({
		childId: components.identity.identity.validator.childId,
		epoch: components.identity.identity.validator.epoch,
		operationId: components.identity.operation.issuer.mintOperationId(),
		kind: "epoch_start",
		rpc: "epoch/start",
		workspaceRoot: storage.coordinatorDirectory,
		// Epoch ownership has no remote instruction or tool-manifest effect.
		instructionHash: EMPTY_HASH,
		manifestHash: EMPTY_HASH,
		...(epochSnapshot.manifest.activeEpoch === null ? {} : { expected: epochSnapshot.cas }),
	});
	input.assertActivationCurrent();
	await session.initialize();
	input.assertActivationCurrent();
	input.child.lifecycle.markAppServerReady();
}

/**
 * Read the account, or null when Codex answered the read with an error. Since
 * Codex 0.158.0 a ChatGPT account read asks the backend for its workspace
 * routing, so a network failure is an answer the session survives; a read
 * Codex never answered is still a startup failure.
 * @param session The session.
 * @returns The account, or null when Codex could not read it.
 */
async function readAccountOrNull(
	session: Parameters<CodexWorkbenchGenerationHooks["initializeSession"]>[0],
) {
	try {
		return await session.accountRead();
	} catch (error) {
		if (error instanceof CodexTransportRemoteError) return null;
		throw error;
	}
}

/**
 * Initialize this generation's session: take its epoch, read the account, and
 * publish how far it got. Every step re-checks that this activation is still
 * the owner's, so a superseded generation publishes nothing. An account Codex
 * could not read leaves the session ready and signed-in work unavailable until
 * the account is refreshed.
 * @param context What the generation provides.
 * @param session The session.
 * @param components The graph it belongs to.
 */
async function initializeSession(
	context: HookContext,
	session: Parameters<CodexWorkbenchGenerationHooks["initializeSession"]>[0],
	components: CodexWorkbenchComponents,
): Promise<void> {
	const { input, owners } = context;
	input.assertActivationCurrent();
	if (input.adoptedSession === null) {
		await startEpochAndSession(context, session, components);
	}
	input.assertActivationCurrent();
	const account = await readAccountOrNull(session);
	input.assertActivationCurrent();
	if (account === null) {
		input.markSessionReady(false);
		input.assertActivationCurrent();
		owners.browserState.account = {
			kind: "account",
			state: "failed",
			reason: ACCOUNT_READ_FAILED_REASON,
		};
		publishProjection(owners);
		return;
	}
	// Signed in is thread-capable: the conversation's first message or Talk
	// starts the coordinator, not the sign-in.
	const signedIn = account.account !== null;
	input.markSessionReady(signedIn);
	input.assertActivationCurrent();
	owners.browserState.account = { kind: "codex_account_response", response: account };
	// Readiness is derived, so the browser only learns the new account facts
	// once the projection listeners publish them.
	publishProjection(owners);
	if (signedIn) {
		input.assertActivationCurrent();
		input.child.lifecycle.markAccountReady();
	}
}

/**
 * Cancel every approval still pending, because the workbench or its child is
 * going.
 * @param approvals The approval broker.
 * @param cause Why they are being cancelled.
 */
async function settleOrdinaryRequests(
	approvals: CodexApprovalBroker,
	cause: "server_shutdown" | "child_disconnected",
): Promise<void> {
	const reason = cause === "server_shutdown" ? "server shutdown" : "child disconnected";
	for (const snapshot of approvals.inspect()) {
		if (snapshot.state === "pending") {
			// oxlint-disable-next-line no-await-in-loop -- approvals are cancelled one at a time, each fully before the next
			await approvals.cancel(snapshot.requestId, reason);
		}
	}
}

/**
 * Settle everything one generation's own owners are still holding: its
 * timeline, its coordination approvals, its waits, its effect authority and
 * its browser projection subscription.
 * @param owners The generation's record.
 * @param cause Why they are settling.
 */
async function settleGenerationOwners(
	owners: GenerationOwners,
	cause: "server_shutdown" | "child_disconnected",
): Promise<void> {
	owners.timeline?.dispose();
	owners.coordinatorTimeline?.dispose();
	await owners.domain?.shutdown?.(cause);
	releaseGenerationOwners(owners);
}

/**
 * Release what a settled generation still holds: its effect authority, its
 * browser projection subscription and its approval owner.
 * @param owners The generation's record.
 */
function releaseGenerationOwners(owners: GenerationOwners): void {
	owners.dynamicProjectionUnsubscribe?.();
}

/**
 * The lifecycle hooks one production generation runs under: what it does with
 * a notification, how it publishes to browsers, how its session comes up, and
 * how everything it owns goes away.
 * @param context What the generation provides.
 * @returns The hooks.
 */
function createProductionHooks(context: HookContext): CodexWorkbenchGenerationHooks {
	const { server, owners } = context;
	return {
		/**
		 * Hand one server notification to every owner in this generation that
		 * reads them.
		 * @param event The notification.
		 */
		onNotification: (event) => {
			for (const listener of owners.accountListeners) listener(event);
			owners.timeline?.onNotification(event);
			owners.coordinatorTimeline?.onNotification(event);
			owners.domain?.onNotification?.(event);
		},
		/**
		 * Keep identity decoding with the transport that already owns it.
		 * @returns No additional decoder installation.
		 */
		installIdentityDecoders: () => undefined,
		/**
		 * Install the host lifecycle subscription for this generation.
		 * @param components The complete generation graph.
		 * @returns The host cleanup, or an empty cleanup when the host supplies none.
		 */
		installLifecycleSignals: (components) =>
			server.host.onGeneration?.(domainScope(context, components)) ?? (() => undefined),
		/**
		 * Begin publishing this generation's approvals to browsers, once.
		 * @returns Stops publishing them.
		 */
		installApprovalProjection: () => {
			if (owners.approvalProjectionInstalled) {
				throw new Error("The Codex approval projection is already installed.");
			}
			owners.approvalProjectionInstalled = true;
			return () => {
				owners.approvalProjectionInstalled = false;
			};
		},
		/**
		 * Attach the host browser connections to this generation's gateway.
		 * @param components The complete generation graph.
		 * @returns The host cleanup, or an empty cleanup when the host supplies none.
		 */
		installBrowserGateway: (components) =>
			server.host.onBrowserGateway?.(components) ?? (() => undefined),
		/**
		 * Initialize this generation's session.
		 * @param session The session.
		 * @param components The graph it belongs to.
		 * @returns Resolves once its readiness has been published.
		 */
		initializeSession: (session, components) => initializeSession(context, session, components),
		/**
		 * Dispose the browser gateway before the generation ends.
		 * @param gateway The generation's browser gateway.
		 * @returns Nothing after the gateway releases its resources.
		 */
		stopBrowser: (gateway) => gateway.dispose(),
		/**
		 * Retire the dynamic wait and quarantine owner on child exit, which
		 * ordinary settlement never reaches.
		 * @param child The child that exited.
		 * @param epoch Its epoch.
		 */
		retireDynamicLifecycle: async (child, epoch) => {
			await owners.domain?.childExit?.(child, epoch);
		},
		/**
		 * Settle everything this generation owns that a shutdown must not leave
		 * running, then retire the record itself: its timeline, approval
		 * decisions, wait owners, effect authority and browser projection
		 * listeners all leave with it.
		 * @param _components The graph, which this hook reads nothing from.
		 * @param cause Why it is settling.
		 */
		cancelDynamicApprovalsAndWaits: async (_components, cause) => {
			await settleGenerationOwners(owners, cause);
			retire(owners);
		},
		settleOrdinaryRequests,
	};
}

export { createProductionHooks };
export type { HookContext };

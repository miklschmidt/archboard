import type { CodexApprovalBroker } from "@/runtime/codex-approvals";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
} from "@/server/canvas/lib/codex-workbench";
import { publishProjection } from "@/server/canvas/lib/codex-workbench-bindings";
import {
	retire,
	type GenerationOwners,
} from "@/server/canvas/lib/codex-workbench-generation-owners";
import type { CanvasCodexWorkbenchHost } from "@/server/canvas/lib/codex-workbench-host";

/** An empty SHA-256, which is what an effect-free epoch step hashes to. */
const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** What building one generation's hooks needs from around it. */
interface HookContext {
	readonly host: CanvasCodexWorkbenchHost;
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
	const { input, host } = context;
	const epochSnapshot = components.epoch.snapshot();
	input.assertActivationCurrent();
	components.epoch.startEpoch({
		childId: components.identity.identity.validator.childId,
		epoch: components.identity.identity.validator.epoch,
		operationId: components.identity.operation.issuer.mintOperationId(),
		kind: "epoch_start",
		rpc: "epoch/start",
		workspaceRoot: host.checkoutRoot,
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
 * Bring up the coordinator a signed-in account can run turns through.
 * @param context What the generation provides.
 * @param components The graph it belongs to.
 */
async function ensureCoordinator(
	context: HookContext,
	components: CodexWorkbenchComponents,
): Promise<void> {
	const { input } = context;
	input.assertActivationCurrent();
	const coordinator = await components.coordinator.ensure({
		operationId: components.identity.operation.issuer.mintOperationId(),
	});
	input.assertActivationCurrent();
	if (coordinator.state !== "ready") {
		throw new Error(coordinator.reason ?? "The production Codex coordinator did not become ready.");
	}
}

/**
 * Initialize this generation's session: take its epoch, read the account, and
 * publish how far it got. Every step re-checks that this activation is still
 * the owner's, so a superseded generation publishes nothing.
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
	const account = await session.accountRead();
	input.assertActivationCurrent();
	const signedIn = account.account !== null;
	if (signedIn) {
		await ensureCoordinator(context, components);
	}
	input.assertActivationCurrent();
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
	cause: "host_shutdown" | "child_disconnected",
): Promise<void> {
	const reason = cause === "host_shutdown" ? "host shutdown" : "child disconnected";
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
	cause: "host_shutdown" | "child_disconnected",
): Promise<void> {
	owners.timeline?.dispose();
	owners.approval?.settleAll(cause);
	if (owners.lifecycle !== null) {
		await owners.lifecycle.shutdown();
	}
	releaseGenerationOwners(owners);
}

/**
 * Release what a settled generation still holds: its effect authority, its
 * browser projection subscription and its approval owner.
 * @param owners The generation's record.
 */
function releaseGenerationOwners(owners: GenerationOwners): void {
	owners.authority?.dispose();
	owners.dynamicProjectionUnsubscribe?.();
	owners.approval?.dispose();
}

/**
 * The lifecycle hooks one production generation runs under: what it does with
 * a notification, how it publishes to browsers, how its session comes up, and
 * how everything it owns goes away.
 * @param context What the generation provides.
 * @returns The hooks.
 */
function createProductionHooks(context: HookContext): CodexWorkbenchGenerationHooks {
	const { host, owners } = context;
	return {
		threadContext: {
			/**
			 * The canonical context one settled change is delivered as.
			 * @param event The settled change.
			 * @param binding The pane it is delivered to.
			 * @returns The context.
			 */
			contextForEvent: (event, binding) => host.contextForEvent(event, binding.paneId),
		},
		/**
		 * Hand one server notification to every owner in this generation that
		 * reads them.
		 * @param event The notification.
		 */
		onNotification: (event) => {
			for (const listener of owners.accountListeners) listener(event);
			owners.timeline?.onNotification(event);
			owners.approval?.onNotification(event);
			owners.lifecycle?.onNotification(event);
		},
		installIdentityDecoders: host.installIdentityDecoders,
		installLifecycleSignals: host.installLifecycleSignals,
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
		installBrowserGateway: host.installBrowserGateway,
		/**
		 * Initialize this generation's session.
		 * @param session The session.
		 * @param components The graph it belongs to.
		 * @returns Resolves once its readiness has been published.
		 */
		initializeSession: (session, components) => initializeSession(context, session, components),
		stopBrowser: host.stopBrowser,
		stopRealtime: host.stopRealtime,
		stopQueue: host.stopQueue,
		/**
		 * Retire the dynamic wait and quarantine owner on child exit, which
		 * ordinary settlement never reaches.
		 * @param child The child that exited.
		 * @param epoch Its epoch.
		 */
		retireDynamicLifecycle: async (child, epoch) => {
			await owners.lifecycle?.childExit(child, epoch);
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

import { ArchboardContextSchema } from "@/runtime/codex-instructions";
import type { createCodexWaitGraph } from "@/runtime/codex-wait-graph";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
} from "@/server/canvas/lib/codex-workbench";
import {
	createCanvasDynamicApprovalOwner,
	type CanvasDynamicApprovalOwner,
} from "@/server/canvas/lib/codex-workbench-approvals";
import {
	createCanvasDynamicAuthorityAdapters,
	type CanvasDynamicAuthorityAdapters,
} from "@/server/canvas/lib/codex-workbench-authority";
import {
	createCanvasDynamicLifecycleOwner,
	type CanvasDynamicLifecycleOwner,
} from "@/server/canvas/lib/codex-workbench-operation-lifecycle";
import type { CanvasCodexWorkbenchHost } from "@/server/canvas/lib/codex-workbench-host";
import {
	closedTransport,
	requireCreated,
	type GenerationOwners,
} from "@/server/canvas/lib/codex-workbench-generation-owners";

/** What building one generation's dynamic owners needs from around it. */
interface DynamicOwnerContext {
	readonly host: CanvasCodexWorkbenchHost;
	readonly waitGraph: ReturnType<typeof createCodexWaitGraph>;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/** The three dynamic owners every dynamic adapter is served from. */
interface DynamicOwners {
	readonly authority: CanvasDynamicAuthorityAdapters;
	readonly approval: CanvasDynamicApprovalOwner;
	readonly lifecycle: CanvasDynamicLifecycleOwner;
}

/**
 * Build this generation's effect authority: how a dynamic caller's pane, link
 * and operation become the canonical context an effect runs under.
 * @param context What the generation provides.
 * @param created What the graph has built so far.
 * @returns The authority adapters.
 */
function createAuthority(
	context: DynamicOwnerContext,
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): CanvasDynamicAuthorityAdapters {
	if (
		created.identity === undefined ||
		created.epoch === undefined ||
		created.threadLink === undefined
	) {
		throw new Error("Dynamic authority dependencies are not ready.");
	}
	return createCanvasDynamicAuthorityAdapters({
		identity: created.identity,
		epoch: created.epoch,
		threadLink: created.threadLink,
		paneIds: context.host.paneIds,
		/**
		 * The canonical context one dynamic effect runs under, captured against
		 * the caller's own pane and thread rather than whatever is current.
		 * @param authorityContext The caller's authority and the operation it is running.
		 * @returns The context.
		 */
		contextFor: (authorityContext) => {
			const captured = context.host.contextForOperation(
				{
					paneId: authorityContext.authority.paneId,
					childId: authorityContext.authority.childId,
					epoch: authorityContext.authority.epoch,
					threadId: authorityContext.authority.threadId,
				},
				{ id: authorityContext.operationId, kind: authorityContext.kind, rpc: "turn/start" },
			);
			return ArchboardContextSchema.parse({
				...captured,
				workhorse: {
					threadId: authorityContext.caller.wireThreadId,
					turnId: authorityContext.caller.wireTurnId,
				},
			});
		},
	});
}

/**
 * Build this generation's coordination approval owner, and publish its
 * decisions to the browser projection while one is installed.
 * @param context What the generation provides.
 * @param created What the graph has built so far.
 * @returns The approval owner.
 */
function createApproval(
	context: DynamicOwnerContext,
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): CanvasDynamicApprovalOwner {
	const identity = requireCreated(created, "identity");
	const owners = context.owners;
	const approval = createCanvasDynamicApprovalOwner({
		identity,
		/**
		 * The clock every approval expiry is measured against.
		 * @returns Now, in milliseconds.
		 */
		now: () => Date.now(),
		/**
		 * The browser command one dynamic caller's approval is asked under, bound
		 * to the pane that caller's thread is linked to.
		 * @param threadId The calling thread.
		 * @returns The command and the link it captured.
		 */
		bindingForCaller: (threadId) => {
			const paneId = owners.authority?.paneForThread(threadId) ?? null;
			if (paneId === null) throw new Error("The dynamic caller has no live pane binding.");
			return {
				commandId: identity.identity.issuer.mintBrowserCommandId(),
				paneId,
				capturedLink: {
					threadId,
					childId: identity.identity.validator.childId,
					epoch: identity.identity.validator.epoch,
				},
			};
		},
	});
	owners.dynamicProjectionUnsubscribe = approval.subscribe(() => {
		if (!owners.approvalProjectionInstalled) return;
		for (const listener of owners.projectionListeners) listener();
	});
	return approval;
}

/**
 * Build this generation's dynamic wait and quarantine owner, including the
 * fail-closed epoch teardown a dynamic caller may ask for.
 * @param context What the generation provides.
 * @param created What the graph has built so far.
 * @returns The lifecycle owner.
 */
function createLifecycle(
	context: DynamicOwnerContext,
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): CanvasDynamicLifecycleOwner {
	const transport = requireCreated(created, "transport");
	return createCanvasDynamicLifecycleOwner({
		identity: requireCreated(created, "identity"),
		waitGraph: context.waitGraph,
		waitForTargets: context.host.waitForTargets,
		/**
		 * End this child's epoch, fail-closed.
		 *
		 * This is the owner's terminal path, not a bare process stop: it revokes
		 * public dispatch and the browser gateway before the child goes away, and
		 * the proof is read back from the transport and the terminal owner
		 * snapshot rather than asserted.
		 * @param child The child.
		 * @param epoch Its epoch.
		 * @returns What the teardown proved.
		 */
		shutdownEpoch: async (child, epoch) => {
			const terminal = await context.input.shutdownOwner();
			const transportClosed = closedTransport(transport);
			const sessionClosed =
				transportClosed && terminal.state !== "ready" && terminal.childPid === null;
			if (!transportClosed || !sessionClosed) {
				throw new Error(
					"The fail-closed Codex epoch shutdown did not observe a closed session and transport.",
				);
			}
			return { child, epoch, sessionClosed: true, transportClosed: true };
		},
		onFatal: context.host.onFatal,
	});
}

/**
 * This generation's dynamic owners, built the first time a dynamic adapter
 * asks for them and kept on the generation's own record.
 * @param context What the generation provides.
 * @param created What the graph has built so far.
 * @returns The owners.
 */
function requireDynamicOwners(
	context: DynamicOwnerContext,
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): DynamicOwners {
	const owners = context.owners;
	owners.authority ??= createAuthority(context, created);
	owners.approval ??= createApproval(context, created);
	owners.lifecycle ??= createLifecycle(context, created);
	return { authority: owners.authority, approval: owners.approval, lifecycle: owners.lifecycle };
}

export { requireDynamicOwners };
export type { DynamicOwnerContext, DynamicOwners };

import { ArchboardContextSchema } from "#runtime/rules/instructions/context.ts";
import type { createCodexWaitGraph } from "#runtime/state/wait-graph/wait-graph.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
} from "#server/services/generation/workbench.ts";
import {
	createServerDynamicApprovalOwner,
	type ServerDynamicApprovalOwner,
} from "#server/services/actions/dynamic-approvals.ts";
import {
	createServerDynamicAuthorityAdapters,
	type ServerDynamicAuthorityAdapters,
} from "#server/services/dynamic-tools/authority.ts";
import {
	createServerDynamicLifecycleOwner,
	type ServerDynamicLifecycleOwner,
} from "#server/services/generation/operation-lifecycle.ts";
import type { ArchboardWorkbenchServer } from "#server/protocol/generation/archboard-host.ts";
import { parseWorkhorseLinkKey, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import {
	closedTransport,
	requireCreated,
	type GenerationOwners,
} from "#server/services/generation/owners.ts";

/** What building one generation's dynamic owners needs from around it. */
interface DynamicOwnerContext {
	readonly server: ArchboardWorkbenchServer;
	readonly waitGraph: ReturnType<typeof createCodexWaitGraph>;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/** The three dynamic owners every dynamic adapter is served from. */
interface DynamicOwners {
	readonly authority: ServerDynamicAuthorityAdapters;
	readonly approval: ServerDynamicApprovalOwner;
	readonly lifecycle: ServerDynamicLifecycleOwner;
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
): ServerDynamicAuthorityAdapters {
	if (
		created.identity === undefined ||
		created.epoch === undefined ||
		created.threadLink === undefined
	) {
		throw new Error("Dynamic authority dependencies are not ready.");
	}
	return createServerDynamicAuthorityAdapters({
		identity: created.identity,
		epoch: created.epoch,
		threadLink: created.threadLink,
		/**
		 * The link key of the workhorse that started a thread.
		 * @param threadId The thread.
		 * @returns The key, or null when no workhorse did.
		 */
		linkKeyForThread: (threadId) => created.sessions?.workhorseForThread(threadId)?.key ?? null,
		/**
		 * The canonical context one dynamic effect runs under, captured against
		 * the caller's own tab session and thread rather than whatever is current.
		 * @param authorityContext The caller's authority and the operation it is running.
		 * @returns The context.
		 */
		contextFor: (authorityContext) => {
			const workhorse = parseWorkhorseLinkKey(authorityContext.authority.paneId);
			if (workhorse === null) {
				throw new Error("The dynamic caller's context authority names no workhorse.");
			}
			const captured = context.server.contextForOperation(
				{
					tabSessionId: workhorse.tabSessionId,
					checkout: workhorse.checkout,
					clientId: null,
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
 * The tab session of the workhorse a link key names.
 * @param key The link key, or null when the caller has none.
 * @returns The tab session, or null.
 */
function tabSessionOfLinkKey(key: string | null): TabSessionId | null {
	return key === null ? null : (parseWorkhorseLinkKey(key)?.tabSessionId ?? null);
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
): ServerDynamicApprovalOwner {
	const identity = requireCreated(created, "identity");
	const owners = context.owners;
	const approval = createServerDynamicApprovalOwner({
		identity,
		/**
		 * The clock every approval expiry is measured against.
		 * @returns Now, in milliseconds.
		 */
		now: () => Date.now(),
		/**
		 * The tab session one dynamic caller's approval belongs to, and the
		 * browser command it is asked under until that session's pane holding the
		 * lease reads it and takes it over.
		 * @param threadId The calling thread.
		 * @returns The session, and the command and link it captured.
		 */
		bindingForCaller: (threadId) => {
			const tabSessionId = tabSessionOfLinkKey(owners.authority?.paneForThread(threadId) ?? null);
			if (tabSessionId === null) throw new Error("The dynamic caller has no live tab session.");
			return {
				tabSessionId,
				binding: {
					commandId: identity.identity.issuer.mintBrowserCommandId(),
					paneId: tabSessionId,
					capturedLink: {
						threadId,
						childId: identity.identity.validator.childId,
						epoch: identity.identity.validator.epoch,
					},
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
): ServerDynamicLifecycleOwner {
	const transport = requireCreated(created, "transport");
	return createServerDynamicLifecycleOwner({
		identity: requireCreated(created, "identity"),
		waitGraph: context.waitGraph,
		waitForTargets: context.server.waitForTargets,
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
		onFatal: context.server.onFatal,
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

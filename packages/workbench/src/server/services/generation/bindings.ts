import type { CodexWorkbenchStorage } from "#server/protocol/generation/host.ts";
import type { createCodexWaitGraph } from "#runtime/state/wait-graph/wait-graph.ts";
import type { ApprovalSnapshot } from "#runtime/services/approvals/contract.ts";
import type { ThreadId } from "@archboard/codex-app-server/identity";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
	ProductionCodexWorkbenchBindings,
} from "#server/services/generation/workbench.ts";
import {
	cancelTabSessionApprovals,
	tabSessionLink,
	workhorseApprovalLink,
} from "#server/services/actions/ordinary-approvals.ts";
import { createServerDynamicOperationIdAdapter } from "#server/services/generation/operation-lifecycle.ts";
import { publishProjection, type GenerationOwners } from "#server/services/generation/owners.ts";
import {
	requireDynamicOwners,
	type DynamicOwnerContext,
} from "#server/services/generation/dynamic-owners.ts";
import { createGatewayBinding } from "#server/services/generation/gateway-binding.ts";
import {
	createSessionBindings,
	createWorkhorseBindings,
} from "#server/services/sessions/bindings.ts";
import type { CodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import type { ArchboardWorkbenchServer } from "#server/protocol/generation/archboard-host.ts";

/** What building one generation's bindings needs from around it. */
interface BindingContext {
	readonly server: ArchboardWorkbenchServer;
	readonly storage: CodexWorkbenchStorage;
	readonly waitGraph: ReturnType<typeof createCodexWaitGraph>;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/**
 * The bindings the storage-shaped owners are built from: where Codex writes,
 * which child this generation runs against, and the directory of its own it runs in.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function storageBindings(
	context: BindingContext,
): Pick<
	ProductionCodexWorkbenchBindings,
	"epoch" | "transport" | "session" | "threadLink" | "dynamicTools"
> {
	const { storage, input } = context;
	return {
		/**
		 * Where this installation keeps its epoch manifest and Codex storage.
		 * @returns The epoch binding.
		 */
		epoch: () => ({
			rootDirectory: storage.epochRoot,
			codexHome: storage.codexHome,
			sqliteHome: storage.sqliteHome,
		}),
		/**
		 * The child this generation's transport speaks to.
		 * @returns The transport binding.
		 */
		transport: () => ({ child: input.child }),
		/**
		 * Where the session's own storage and configuration live.
		 * @returns The session binding.
		 */
		session: () => ({
			storage: {
				codexHome: storage.codexHome,
				sqliteHome: storage.sqliteHome,
				configPath: storage.configPath,
			},
			workingDirectory: storage.coordinatorDirectory,
			lifecycle: input.child.lifecycle,
		}),
		/**
		 * How the thread-link owner reads the epoch a link must belong to.
		 * @param created What the graph has built so far.
		 * @returns The thread-link binding.
		 */
		threadLink: (created) => ({
			threadSource: context.server.host.instructions.workhorse.threadSource,
			/**
			 * The epoch now active, which a link is only valid within.
			 * @returns The epoch, or null before one is started.
			 */
			currentEpoch: () => created.epoch?.snapshot().manifest.activeEpoch ?? null,
		}),
		/**
		 * What the dynamic tools may wait on. A thread they start works where its caller works.
		 * @returns The dynamic tools binding.
		 */
		dynamicTools: () => ({ waitGraph: context.waitGraph }),
	};
}

/**
 * Who an approval on one thread is shown to: the panes of the checkout of the workhorse that
 * asked, or every pane of the tab when its coordinator asked. A session that is ending holds
 * nothing an approval could be shown on.
 * @param sessions The generation's tab sessions, once they are built.
 * @param threadId The thread the approval was asked on.
 * @returns The link, or none when no tab session holds the thread.
 */
function approvalLink(
	sessions: CodexWorkbenchSessions | undefined,
	threadId: ThreadId,
): { readonly link: string | null } {
	const session = sessions?.forThread(threadId) ?? null;
	if (sessions === undefined || session === null) {
		return { link: null };
	}
	const workhorse = sessions.workhorseForThread(threadId);
	return {
		link:
			workhorse === null
				? tabSessionLink(session.id)
				: workhorseApprovalLink(session.id, workhorse.checkout),
	};
}

/**
 * Cancel an approval nobody can be shown, because no live tab session holds the
 * thread that asked: a running turn must never wait on nobody. Once cancelled
 * it is retired, since no browser will show its terminal either.
 * @param approvals The broker, once it is built.
 * @param snapshot The approval as the broker just published it.
 */
function cancelUnheld(
	approvals: CodexWorkbenchComponents["approvals"] | undefined,
	snapshot: ApprovalSnapshot,
): void {
	if (
		approvals === undefined ||
		snapshot.binding.link !== null ||
		(snapshot.state !== "staged" && snapshot.state !== "pending")
	) {
		return;
	}
	// After the broker has finished publishing the approval it is taking in.
	queueMicrotask(() => {
		void approvals
			.cancel(snapshot.requestId, "No browser tab holds the thread that asked.")
			.then(() => {
				if (approvals.get(snapshot.requestId) !== undefined) {
					approvals.acknowledge(snapshot.requestId);
				}
				return undefined;
			})
			// Something else settled it first; the broker reports its own write failures.
			.catch(() => undefined);
	});
}

/**
 * The bindings the approval and dynamic owners are built from.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function approvalBindings(
	context: BindingContext,
): Pick<ProductionCodexWorkbenchBindings, "approvals" | "dynamicAdapters" | "sessions"> {
	const { server, owners } = context;
	const dynamicContext: DynamicOwnerContext = {
		server,
		waitGraph: context.waitGraph,
		input: context.input,
		owners,
	};
	return {
		/**
		 * How ordinary approvals are linked to the pane that must answer them.
		 * @param created What the graph has built so far.
		 * @returns The approvals binding.
		 */
		approvals: (created) => ({
			onError: server.onFatal,
			/**
			 * The tab session one approval belongs to: the one that started the
			 * thread that asked.
			 * @param request The approval request.
			 * @returns The link, or none.
			 */
			getCurrentBinding: (request) => approvalLink(created.sessions, request.threadId),
			/**
			 * Cancel an approval no tab session holds, and publish what an approval changed.
			 * @param snapshot The approval as it now stands.
			 */
			onChange: (snapshot) => {
				cancelUnheld(created.approvals, snapshot);
				publishProjection(owners);
			},
		}),
		/**
		 * How an ended tab session's approvals are settled: its coordination
		 * approvals and its ordinary ones alike, since nobody is left to answer.
		 * @param created What the graph has built so far.
		 * @returns The sessions binding.
		 */
		sessions: (created) => ({
			shownConversationOf: context.server.shownConversationOf,
			resolveCheckout: context.server.host.resolveCheckout,
			/**
			 * Settle every approval an ended tab session was still to answer.
			 * @param id The tab session.
			 * @returns Resolves once they are settled.
			 */
			endApprovals: async (id) => {
				owners.approval?.endSession(id);
				if (created.approvals !== undefined) {
					await cancelTabSessionApprovals(created.approvals, id);
				}
			},
		}),
		dynamicAdapters: {
			/**
			 * The coordination approval port dynamic effects ask through.
			 * @param created What the graph has built so far.
			 * @returns The port.
			 */
			approval: (created) => requireDynamicOwners(dynamicContext, created).approval.port,
			/**
			 * The thread authority a dynamic effect runs under.
			 * @param created What the graph has built so far.
			 * @returns The authority.
			 */
			threadAuthority: (created) => requireDynamicOwners(dynamicContext, created).authority.thread,
			/**
			 * The context authority a dynamic effect captures through.
			 * @param created What the graph has built so far.
			 * @returns The authority.
			 */
			context: (created) => requireDynamicOwners(dynamicContext, created).authority.context,
			/**
			 * How a dynamic effect mints its operation id.
			 * @param created What the graph has built so far.
			 * @returns The adapter.
			 */
			operationId: (created) => {
				if (created.identity === undefined) {
					throw new Error("Operation authority is not ready.");
				}
				return createServerDynamicOperationIdAdapter(created.identity.operation);
			},
			/**
			 * The wait and quarantine port a dynamic effect uses.
			 * @param created What the graph has built so far.
			 * @returns The port.
			 */
			lifecycle: (created) => requireDynamicOwners(dynamicContext, created).lifecycle.port,
		},
	};
}

/**
 * Compose production storage, binding readers, delivery and browser access.
 * @param context What the generation provides.
 * @returns The bindings.
 */
function createProductionBindings(context: BindingContext): ProductionCodexWorkbenchBindings {
	return {
		...storageBindings(context),
		...approvalBindings(context),
		/**
		 * What each owner of one tab session's coordinator and voice is configured with.
		 * @param scope The session's id, state and workhorses.
		 * @param shared The generation's components it runs over.
		 * @returns The session's bindings.
		 */
		tabSession: (scope, shared) =>
			createSessionBindings({
				scope,
				server: context.server,
				shared,
				coordinatorDirectory: context.storage.coordinatorDirectory,
				/** Tell every browser projection listener the session changed something it shows. */
				publishProjection: () => {
					publishProjection(context.owners);
				},
			}),
		/**
		 * What each owner of one workhorse is configured with.
		 * @param scope The workhorse's session, checkout and link key.
		 * @param shared The generation's components it runs over.
		 * @returns The workhorse's bindings.
		 */
		workhorse: (scope, shared) =>
			createWorkhorseBindings({ scope, server: context.server, shared }),
		gateway: createGatewayBinding(context),
	};
}

export { type BindingContext, createProductionBindings };

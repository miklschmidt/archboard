import type { createCodexWaitGraph } from "@/runtime/codex-wait-graph";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import type {
	CodexWorkbenchGenerationInput,
	ProductionCodexWorkbenchBindings,
} from "@/server/archboard/lib/codex-workbench";
import { createServerDynamicOperationIdAdapter } from "@/server/archboard/lib/codex-workbench-operation-lifecycle";
import type { GenerationOwners } from "@/server/archboard/lib/codex-workbench-generation-owners";
import {
	requireDynamicOwners,
	type DynamicOwnerContext,
} from "@/server/archboard/lib/codex-workbench-dynamic-owners";
import { createGatewayBinding } from "@/server/archboard/lib/codex-workbench-gateway-binding";
import { createSessionBindings } from "@/server/archboard/lib/codex-workbench-session-bindings";
import type { CodexWorkbenchSessions } from "@/server/archboard/lib/codex-workbench-sessions";
import type {
	CodexWorkbenchServer,
	CodexWorkbenchStorage,
} from "@/server/archboard/lib/codex-workbench-server";

/** What building one generation's bindings needs from around it. */
interface BindingContext {
	readonly server: CodexWorkbenchServer;
	readonly storage: CodexWorkbenchStorage;
	readonly waitGraph: ReturnType<typeof createCodexWaitGraph>;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/**
 * Tell every browser projection listener that something it shows has changed,
 * while a projection is installed.
 * @param owners The generation's record.
 */
function publishProjection(owners: GenerationOwners): void {
	if (!owners.approvalProjectionInstalled) return;
	for (const listener of owners.projectionListeners) listener();
}

/**
 * The bindings the storage-shaped owners are built from: where Codex writes,
 * which child this generation runs against, and which checkout it works in.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function storageBindings(
	context: BindingContext,
): Pick<
	ProductionCodexWorkbenchBindings,
	"epoch" | "transport" | "session" | "threadLink" | "dynamicTools"
> {
	const { storage, server, input } = context;
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
			checkoutRoot: server.checkoutRoot,
			lifecycle: input.child.lifecycle,
		}),
		/**
		 * How the thread-link owner reads the epoch a link must belong to.
		 * @param created What the graph has built so far.
		 * @returns The thread-link binding.
		 */
		threadLink: (created) => ({
			/**
			 * The epoch now active, which a link is only valid within.
			 * @returns The epoch, or null before one is started.
			 */
			currentEpoch: () => created.epoch?.snapshot().manifest.activeEpoch ?? null,
		}),
		/**
		 * What the dynamic tools may wait on and work in.
		 * @returns The dynamic tools binding.
		 */
		dynamicTools: () => ({ waitGraph: context.waitGraph, checkoutRoot: server.checkoutRoot }),
	};
}

/**
 * The pane an approval on one thread belongs to: the pane the semantic delivery
 * of the thread's tab session is bound to, when that binding names the thread.
 * @param sessions The generation's tab sessions, once they are built.
 * @param threadId The thread the approval was asked on.
 * @returns The link, or none.
 */
function approvalLink(
	sessions: CodexWorkbenchSessions | undefined,
	threadId: ThreadId,
): { readonly link: string | null } {
	const binding =
		sessions?.forThread(threadId)?.components.semanticDelivery.snapshot().binding ?? null;
	return binding?.target.threadId === threadId
		? { link: `pane:${binding.paneId}` }
		: { link: null };
}

/**
 * The bindings the approval and dynamic owners are built from.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function approvalBindings(
	context: BindingContext,
): Pick<ProductionCodexWorkbenchBindings, "approvals" | "dynamicAdapters"> {
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
			 * The pane one approval belongs to, which is the pane the semantic
			 * delivery of the thread's tab session is bound to when that binding
			 * names the same thread.
			 * @param request The approval request.
			 * @returns The link, or none.
			 */
			getCurrentBinding: (request) => approvalLink(created.sessions, request.threadId),
			/** Publish what an approval changed. */
			onChange: () => {
				publishProjection(owners);
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
		 * What each owner of one tab session is configured with.
		 * @param _id The session, which nothing it is configured with depends on yet.
		 * @param shared The generation's components it runs over.
		 * @param state What the session remembers.
		 * @returns The session's bindings.
		 */
		tabSession: (_id, shared, state) =>
			createSessionBindings({
				server: context.server,
				shared,
				state,
				/** Tell every browser projection listener the session changed something it shows. */
				publishProjection: () => {
					publishProjection(context.owners);
				},
			}),
		gateway: createGatewayBinding(context),
	};
}

export { type BindingContext, createProductionBindings, publishProjection };

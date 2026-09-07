import type { ProductionCodexWorkbenchBindings } from "@/server/canvas/lib/codex-workbench";
import { createCanvasBrowserGatewayOptions } from "@/server/canvas/lib/codex-workbench-browser-gateway";
import {
	createCanvasBrowserProjectionBudget,
	createCanvasTimelineOwner,
} from "@/server/canvas/lib/codex-workbench-timeline";
import { requireCreated } from "@/server/canvas/lib/codex-workbench-generation-owners";
import {
	requireDynamicOwners,
	type DynamicOwnerContext,
} from "@/server/canvas/lib/codex-workbench-dynamic-owners";
import type { BindingContext } from "@/server/canvas/lib/codex-workbench-bindings";
import { publishProjection } from "@/server/canvas/lib/codex-workbench-bindings";

/**
 * How this generation serves browsers: one gateway over the component graph,
 * the timeline it publishes, and the owned process as its change source.
 *
 * Child lifecycle transitions change readiness without any browser command, so
 * the owned process — not a command result — is what the gateway watches.
 * @param context What the generation provides.
 * @returns The gateway binding.
 */
function createGatewayBinding(
	context: BindingContext,
): ProductionCodexWorkbenchBindings["gateway"] {
	const { host, owners, input } = context;
	const dynamicContext: DynamicOwnerContext = {
		host,
		waitGraph: context.waitGraph,
		input,
		owners,
	};
	return (created) => {
		const dynamic = requireDynamicOwners(dynamicContext, created).approval;
		const budget = createCanvasBrowserProjectionBudget();
		owners.timeline ??= createCanvasTimelineOwner({
			session: requireCreated(created, "session"),
			identity: requireCreated(created, "identity").identity.decoder,
			approvals: requireCreated(created, "approvals"),
			/** Publish what the timeline changed. */
			onChange: () => {
				publishProjection(owners);
			},
			budget,
		});
		const options = createCanvasBrowserGatewayOptions({
			components: created,
			dynamicApprovals: dynamic,
			timeline: owners.timeline,
			budget,
			state: owners.browserState,
			leaseLedger: host.browserLeaseLedger,
			checkoutRoot: host.checkoutRoot,
			/**
			 * What the owned Codex process reports, which browser readiness is
			 * partly derived from.
			 * @returns The process snapshot.
			 */
			process: () => input.process.snapshot(),
			/**
			 * The canonical context one browser command runs under, captured
			 * against the pane and link the command was leased under.
			 * @param commandContext The lease's authority.
			 * @param operation The operation the command is.
			 * @returns The context.
			 */
			contextForOperation: (commandContext, operation) => {
				const threadId = commandContext.link.threadId;
				if (threadId === null || threadId === undefined) {
					throw new Error("A browser command has no executable thread link.");
				}
				return host.contextForOperation(
					{
						paneId: commandContext.paneId,
						childId: commandContext.childId,
						epoch: commandContext.epoch,
						threadId,
						linkRevision: commandContext.linkRevision,
					},
					operation,
				);
			},
			/**
			 * Watch what the browser is shown.
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			onChange: (listener) => {
				owners.projectionListeners.add(listener);
				return () => {
					owners.projectionListeners.delete(listener);
				};
			},
			/**
			 * Watch the account notifications the browser's account arm is built from.
			 * @param listener What to tell.
			 * @returns Unsubscribes.
			 */
			onAccountNotification: (listener) => {
				owners.accountListeners.add(listener);
				return () => {
					owners.accountListeners.delete(listener);
				};
			},
		});
		return {
			...options,
			lifecycle: {
				/**
				 * The owned process is the gateway's change source.
				 * @param listener What to tell.
				 * @returns Unsubscribes.
				 */
				onChange: (listener) => input.process.subscribe(() => listener()),
			},
		};
	};
}

export { createGatewayBinding };

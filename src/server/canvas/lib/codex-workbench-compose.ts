import { CODEX_SESSION_CONTROL } from "@/runtime/codex-session";
import {
	createCodexWorkbenchGenerationLifecycle,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
} from "@/server/canvas/lib/codex-workbench-lifecycle";
import type {
	CodexWorkbenchComponentFactories,
	ComposeCodexWorkbenchGenerationOptions,
} from "@/server/canvas/lib/codex-workbench-contract";

/** The graph while it is still being built, each component filled in as it is made. */
type MutableComponents = {
	-readonly [Name in keyof CodexWorkbenchComponents]?: CodexWorkbenchComponents[Name];
};

/** What one built component needs undone if a later one fails to build. */
type ConstructionCleanup = () => Promise<unknown> | void;

/**
 * Build and activate the one complete child-generation graph.
 * @param options The factories, the ledger, the hooks, and whether this
 * generation owns its transport and is activated as it is built.
 * @returns The generation, activated unless the caller asked otherwise.
 */
async function composeCodexWorkbenchGeneration(
	options: ComposeCodexWorkbenchGenerationOptions,
): Promise<CodexWorkbenchGeneration> {
	const created: MutableComponents = {};
	const constructionCleanups: ConstructionCleanup[] = [];
	let components: CodexWorkbenchComponents;
	try {
		components = constructComponents(
			options.factories,
			options.ownsTransport !== false,
			created,
			constructionCleanups,
		);
	} catch (error) {
		throw await unwoundFailure(constructionCleanups, error);
	}
	const source = createCodexWorkbenchGenerationLifecycle({
		components,
		identityLedger: options.identityLedger,
		hooks: options.hooks,
		assertActivationCurrent: options.assertActivationCurrent ?? (() => undefined),
	});
	if (options.activate !== false) {
		await source.activate();
	}
	return source;
}

/**
 * Build every component in dependency order, recording as it goes what each
 * one needs undone: the order here is the graph, and each factory reads the
 * components built before it out of `created`.
 * @param factories One factory per component.
 * @param ownsTransport Whether this generation owns the transport it uses, and
 * so must shut it down; a generation over a kernel's transport does not.
 * @param created Filled in as each component is built, for the factories to read.
 * @param cleanups Appended to as each component that needs unwinding is built.
 * @returns Every component, frozen.
 */
function constructComponents(
	factories: CodexWorkbenchComponentFactories,
	ownsTransport: boolean,
	created: MutableComponents,
	cleanups: ConstructionCleanup[],
): CodexWorkbenchComponents {
	const identity = factories.identity(created);
	created.identity = identity;
	const epoch = factories.epoch(created);
	created.epoch = epoch;
	cleanups.push(() => epoch.close());
	const transport = factories.transport(created);
	created.transport = transport;
	if (ownsTransport) {
		cleanups.push(() => transport.shutdown());
	}
	const session = factories.session(created);
	created.session = session;
	cleanups.push(() => session[CODEX_SESSION_CONTROL].dispose());
	const threadLink = factories.threadLink(created);
	created.threadLink = threadLink;
	const workhorse = factories.workhorse(created);
	created.workhorse = workhorse;
	const semanticPublisher = factories.semanticPublisher(created);
	created.semanticPublisher = semanticPublisher;
	cleanups.push(() => semanticPublisher.dispose());
	const realtime = factories.realtime(created);
	created.realtime = realtime;
	cleanups.push(() => realtime.dispose());
	const approvals = factories.approvals(created);
	created.approvals = approvals;
	cleanups.push(() => approvals.dispose());
	const dynamicTools = factories.dynamicTools(created);
	created.dynamicTools = dynamicTools;
	cleanups.push(() => dynamicTools.dispose());
	const semanticDelivery = factories.semanticDelivery(created);
	created.semanticDelivery = semanticDelivery;
	cleanups.push(() => semanticDelivery.dispose());
	const coordinator = factories.coordinator(created);
	created.coordinator = coordinator;
	const queue = factories.queue(created);
	created.queue = queue;
	const operations = factories.operations(created);
	created.operations = operations;
	const spokenApproval = factories.spokenApproval(created);
	created.spokenApproval = spokenApproval;
	cleanups.push(() => spokenApproval.dispose());
	const coordinatorTools = factories.coordinatorTools(created);
	created.coordinatorTools = coordinatorTools;
	cleanups.push(() => coordinatorTools.dispose());
	const callbacks = factories.callbacks(created);
	created.callbacks = callbacks;
	cleanups.push(() => callbacks.dispose());
	const gateway = factories.gateway(created);
	created.gateway = gateway;
	cleanups.push(() => gateway.dispose());
	return Object.freeze({
		identity,
		epoch,
		transport,
		session,
		threadLink,
		workhorse,
		semanticPublisher,
		realtime,
		approvals,
		dynamicTools,
		semanticDelivery,
		coordinator,
		queue,
		operations,
		spokenApproval,
		coordinatorTools,
		callbacks,
		gateway,
	} satisfies CodexWorkbenchComponents);
}

/**
 * Undo a half-built graph and say what to throw: whatever failed, joined with
 * anything that then failed to unwind, so no failure is swallowed.
 * @param cleanups What each built component needs undone, in build order.
 * @param error What construction failed with.
 * @returns The error to throw.
 */
async function unwoundFailure(
	cleanups: readonly ConstructionCleanup[],
	error: unknown,
): Promise<Error> {
	let failure = error instanceof Error ? error : new Error(String(error));
	for (const cleanup of cleanups.toReversed()) {
		try {
			// oxlint-disable-next-line no-await-in-loop -- unwinding is strictly reverse construction order; a component must be gone before the one it was built on
			await cleanup();
		} catch (cleanupError) {
			const next = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
			failure = new AggregateError([failure, next], "Codex construction cleanup failed.");
		}
	}
	return failure;
}

export { composeCodexWorkbenchGeneration };

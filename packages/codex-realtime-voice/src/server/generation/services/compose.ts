import type { CodexSessionControl } from "@archboard/codex-app-server/connection";
import {
	createCodexWorkbenchGenerationLifecycle,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
} from "#server/owner/services/lifecycle.ts";
import type {
	CodexWorkbenchComponentFactories,
	ComposeCodexWorkbenchGenerationOptions,
} from "#server/generation/protocol/contract.ts";

/** The graph while it is still being built, each component filled in as it is made. */
type MutableComponents = {
	-readonly [Name in keyof CodexWorkbenchComponents]?: CodexWorkbenchComponents[Name];
};

/** What one built component needs undone if a later one fails to build. */
type ConstructionCleanup = () => Promise<unknown> | void;

/**
 * Build and activate the one complete child-generation graph.
 * @param options The factories, the connection, the hooks, and whether this
 * generation is activated as it is built.
 * @returns The generation, activated unless the caller asked otherwise.
 */
async function composeCodexWorkbenchGeneration(
	options: ComposeCodexWorkbenchGenerationOptions,
): Promise<CodexWorkbenchGeneration> {
	const created: MutableComponents = {};
	const constructionCleanups: ConstructionCleanup[] = [];
	let constructed: ConstructedComponents;
	try {
		constructed = constructComponents(options.factories, created, constructionCleanups);
	} catch (error) {
		throw await unwoundFailure(constructionCleanups, error);
	}
	const source = createCodexWorkbenchGenerationLifecycle({
		...constructed,
		connection: options.connection,
		hooks: options.hooks,
		assertActivationCurrent: options.assertActivationCurrent ?? (() => undefined),
	});
	if (options.activate !== false) {
		await source.activate();
	}
	return source;
}

/** Every component, and the control of the session among them. */
interface ConstructedComponents {
	readonly components: CodexWorkbenchComponents;
	readonly sessionControl: CodexSessionControl;
}

/**
 * Build every component in dependency order, recording as it goes what each
 * one needs undone: the order here is the graph, and each factory reads the
 * components built before it out of `created`. The transport belongs to the
 * connection, so construction never shuts it down.
 * @param factories One factory per component.
 * @param created Filled in as each component is built, for the factories to read.
 * @param cleanups Appended to as each component that needs unwinding is built.
 * @returns Every component, frozen, and the session's control.
 */
function constructComponents(
	factories: CodexWorkbenchComponentFactories,
	created: MutableComponents,
	cleanups: ConstructionCleanup[],
): ConstructedComponents {
	const identity = factories.identity(created);
	created.identity = identity;
	const epoch = factories.epoch(created);
	created.epoch = epoch;
	cleanups.push(() => epoch.close());
	const transport = factories.transport(created);
	created.transport = transport;
	const { session, control: sessionControl } = factories.session(created);
	created.session = session;
	cleanups.push(() => sessionControl.dispose());
	const threadLink = factories.threadLink(created);
	created.threadLink = threadLink;
	const approvals = factories.approvals(created);
	created.approvals = approvals;
	cleanups.push(() => approvals.dispose());
	const dynamicTools = factories.dynamicTools(created);
	created.dynamicTools = dynamicTools;
	cleanups.push(() => dynamicTools?.dispose());
	const sessions = factories.sessions(created);
	created.sessions = sessions;
	cleanups.push(async () => {
		try {
			await sessions.stop();
		} finally {
			await sessions.dispose();
		}
	});
	const gateway = factories.gateway(created);
	created.gateway = gateway;
	cleanups.push(() => gateway.dispose());
	const components = Object.freeze({
		identity,
		epoch,
		transport,
		session,
		threadLink,
		approvals,
		dynamicTools,
		sessions,
		gateway,
	} satisfies CodexWorkbenchComponents);
	return { components, sessionControl };
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

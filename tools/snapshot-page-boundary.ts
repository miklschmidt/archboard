// The snapshot page (apps/web/snapshot.html) draws a model snapshot with no Archboard server, so
// it never loads the agent, the workbench or the voice. The build holds it to that: it fails when
// a chunk the page can load, at once or later, holds one of their modules.
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Rolldown } from "vite-plus";

/** The modules of the agent, the workbench and the voice. */
const AGENT_MODULES =
	/(?:packages[\\/](?:workbench|codex-realtime-voice|codex-app-server)|node_modules[\\/](?:@assistant-ui|assistant-stream))[\\/]/;

/** The checkout, which a refusal names modules relative to. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The name of the page's entry chunk. */
const SNAPSHOT_ENTRY = "snapshot";

/**
 * Fail the build when the snapshot page can load agent, workbench or voice code.
 * @returns The build-only plugin.
 */
function snapshotPageBoundary(): Plugin {
	return {
		name: "archboard-snapshot-page-boundary",
		apply: "build",
		/**
		 * Walk the chunks that the snapshot page can load.
		 * @param _options The output options.
		 * @param bundle The written chunks and assets.
		 */
		generateBundle(_options, bundle) {
			const agent = agentModulesOf(bundle).map((id) => relative(ROOT, id));
			if (agent.length > 0) {
				this.error(`The snapshot page loads agent code: ${agent.slice(0, 5).join(", ")}`);
			}
		},
	};
}

/**
 * The agent modules in the chunks that the snapshot page can load.
 * @param bundle The written chunks and assets.
 * @returns Their ids.
 * @throws {Error} When the bundle has no snapshot page.
 */
function agentModulesOf(bundle: Rolldown.OutputBundle): string[] {
	const chunks = new Map(
		Object.values(bundle).flatMap((output) =>
			output.type === "chunk" ? [[output.fileName, output] as const] : [],
		),
	);
	const entry = [...chunks.values()].find(
		(chunk) => chunk.isEntry && chunk.name === SNAPSHOT_ENTRY,
	);
	if (entry === undefined) throw new Error("The build has no snapshot page.");
	return reachedFrom(entry, chunks).flatMap((chunk) =>
		chunk.moduleIds.filter((id) => AGENT_MODULES.test(id)),
	);
}

/**
 * Every chunk that an entry imports, at once or later, and the entry itself.
 * @param entry The entry chunk.
 * @param chunks The chunks of the bundle, by file name.
 * @returns The chunks.
 */
function reachedFrom(
	entry: Rolldown.OutputChunk,
	chunks: ReadonlyMap<string, Rolldown.OutputChunk>,
): Rolldown.OutputChunk[] {
	const reached = new Map([[entry.fileName, entry]]);
	for (const chunk of reached.values()) {
		for (const file of [...chunk.imports, ...chunk.dynamicImports]) {
			const next = chunks.get(file);
			if (next !== undefined) reached.set(file, next);
		}
	}
	return [...reached.values()];
}

export { snapshotPageBoundary };

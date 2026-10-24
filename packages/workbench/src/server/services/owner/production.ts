import path from "node:path";
import { mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";

import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "@archboard/codex-app-server/process";
import { createCodexWaitGraph } from "#runtime/state/wait-graph/wait-graph.ts";
import { stateDir } from "@archboard/workspace/state-dir";
import { PORT, serverUrl } from "#server/services/host/listener-address.ts";
import type { InstallProductionCodexWorkbenchOptions } from "#server/services/generation/workbench.ts";
import { createProductionBindings } from "#server/services/generation/bindings.ts";
import { createGenerationOwnerStore } from "#server/services/generation/owners.ts";
import { createProductionHooks } from "#server/services/generation/hooks.ts";
import type {
	CodexWorkbenchServer,
	CodexWorkbenchStorage,
} from "#server/protocol/generation/host.ts";

/**
 * Make the coordinators' directory, holding the archboard skill the server ships as
 * `.agents/skills/archboard`, a link to the skill in the server's own source. A link left by a
 * server of another checkout is pointed at this one's.
 * @param directory The coordinators' directory.
 * @param sourceRoot The checkout whose source the server runs.
 */
function prepareCoordinatorDirectory(directory: string, sourceRoot: string): void {
	const skills = path.join(directory, ".agents", "skills");
	mkdirSync(skills, { recursive: true, mode: 0o700 });
	const link = path.join(skills, "archboard");
	const skill = path.join(sourceRoot, "skills", "archboard");
	let current: string | null = null;
	try {
		current = readlinkSync(link);
	} catch {
		current = null;
	}
	if (current === skill) {
		return;
	}
	rmSync(link, { recursive: true, force: true });
	symlinkSync(skill, link, "dir");
}

/**
 * Create this installation's Codex storage under the server state directory,
 * with a mode nobody else on the machine can read.
 *
 * The Codex home and its database are the machine's, shared by every server, so
 * one sign-in serves them all: Codex takes several processes on one home. What
 * archboard keeps about its own child, the owner lock and the epoch ledger, is
 * the server's, under its port (TASK-313). The ledger is read, changed and
 * written by one process, and a second server's child would make this one's
 * stale. The directory the coordinators work in is the server's too.
 * @param sourceRoot The checkout whose source the server runs, whose skill the coordinators read.
 * @returns Where each part of it lives.
 */
function createWorkbenchStorage(sourceRoot: string): CodexWorkbenchStorage {
	const root = path.join(stateDir(), "codex-workbench");
	const ownerDirectory = path.join(root, "canvases", String(PORT));
	mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
	const coordinatorDirectory = path.join(ownerDirectory, "coordinator");
	prepareCoordinatorDirectory(coordinatorDirectory, sourceRoot);
	const codexHome = path.join(root, "codex-home");
	return {
		root,
		codexHome,
		sqliteHome: path.join(root, "sqlite-home"),
		ownerDirectory,
		coordinatorDirectory,
		epochRoot: path.join(ownerDirectory, "epoch"),
		configPath: path.join(codexHome, "config.toml"),
	};
}

/**
 * Build the one mandatory real production installation used by the server
 * application: the proven executable, the storage under it, and the bindings
 * and hooks each generation is built from.
 * @param server What the server provides the workbench.
 * @returns The installation options.
 */
export function createServerCodexWorkbenchInstallation(
	server: CodexWorkbenchServer,
): InstallProductionCodexWorkbenchOptions {
	// Prove the mandatory runtime before creating any workbench storage. The
	// process owner proves it again at each spawn so a later replacement cannot
	// inherit a stale verification.
	const executablePath = verifyCodexExecutable(resolveProjectCodexExecutable()).executablePath;
	const storage = createWorkbenchStorage(server.sourceRoot);
	const waitGraph = createCodexWaitGraph();
	const generations = createGenerationOwnerStore();

	return {
		process: {
			executablePath,
			workingDirectory: storage.coordinatorDirectory,
			storage: { rootDirectory: storage.root, ownerDirectory: storage.ownerDirectory },
			hostEnvironment: { ARCHBOARD_URL: serverUrl(), ARCHBOARD_NO_AUTOSTART: "1" },
			pathPrefixes: [path.join(server.sourceRoot, "bin")],
			onGroupOwned: server.onCodexProcessGroupOwned,
		},
		/**
		 * Everything one generation is built from.
		 * @param input The generation's input.
		 * @returns Its bindings.
		 */
		bindings: (input) =>
			createProductionBindings({
				server,
				storage,
				waitGraph,
				input,
				owners: generations.for(input),
			}),
		/**
		 * The lifecycle hooks one generation runs under.
		 * @param input The generation's input.
		 * @returns Its hooks.
		 */
		hooks: (input) =>
			createProductionHooks({ server, storage, input, owners: generations.for(input) }),
	};
}

export type { CodexWorkbenchServer } from "#server/protocol/generation/host.ts";

import { pinnedCheckoutOf } from "#server/sessions/services/panes.ts";
import { installWorkbenchTabSessions } from "#server/panes/services/tab-sessions.ts";
import type { VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
import { ARCHBOARD_AGENT } from "#runtime/host/services/archboard.ts";
import path from "node:path";
import { mkdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";

import { resolveCodexExecutable } from "@archboard/codex-app-server/process";
import { installation } from "@archboard/workspace/installation";
import { stateDir } from "@archboard/workspace/state-dir";
import { PORT, serverUrl } from "#server/host/services/listener-address.ts";
import type { ArchboardWorkbenchServer } from "#server/generation/protocol/archboard-host.ts";

/**
 * Make the coordinators' directory, holding the archboard skill the server ships as
 * `.agents/skills/archboard`, a link to the skill of the server's own installation. A link left by
 * a server of another checkout is pointed at this one's.
 * @param directory The coordinators' directory.
 */
function prepareCoordinatorDirectory(directory: string): void {
	const skills = path.join(directory, ".agents", "skills");
	mkdirSync(skills, { recursive: true, mode: 0o700 });
	const link = path.join(skills, "archboard");
	const skill = path.join(installation().skillsDirectory, "archboard");
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
 * @returns The private installation root and process owner directory.
 */
function createWorkbenchStorage(): VoiceAgentOptions["storage"] {
	const root = path.join(stateDir(), "codex-workbench");
	const ownerDirectory = path.join(root, "canvases", String(PORT));
	mkdirSync(ownerDirectory, { recursive: true, mode: 0o700 });
	const coordinatorDirectory = path.join(ownerDirectory, "coordinator");
	prepareCoordinatorDirectory(coordinatorDirectory);
	return {
		directory: root,
		ownerDirectory,
	};
}

/**
 * Build the one mandatory real production voice agent options used by the
 * server application: the proven executable, the storage under it, Archboard's
 * identity, instructions and tools, and the extensions each generation uses.
 * @param server What the server provides the workbench.
 * @returns The voice agent options.
 */
export function createServerVoiceAgentOptions(server: ArchboardWorkbenchServer): VoiceAgentOptions {
	// Prove the mandatory runtime before creating any workbench storage. The
	// process owner proves it again at each spawn so a later replacement cannot
	// inherit a stale verification.
	const executablePath = resolveCodexExecutable(installation().codexLocation);
	const storage = createWorkbenchStorage();

	return {
		storage,
		checkouts: server.host.resolveCheckout,
		identity: ARCHBOARD_AGENT.identity,
		instructions: ARCHBOARD_AGENT.instructions,
		onFatal: server.host.onFatal,
		extensions: {
			tools: ARCHBOARD_AGENT.tools,
			contextCodec: server.host.contextCodec,
			coordinatorContextFor: server.host.coordinatorContextFor,
			voiceFor: server.host.voiceFor,
			contextForOperation: server.host.contextForOperation,
			checkoutLabel: server.host.checkoutLabel,
			...(server.host.narrative ? { narrative: server.host.narrative } : {}),
			...(server.host.domainTools ? { domainTools: server.host.domainTools } : {}),
			...(server.host.onGeneration ? { onGeneration: server.host.onGeneration } : {}),
			...(server.host.onBrowserGateway ? { onBrowserGateway: server.host.onBrowserGateway } : {}),
			browserCheckoutOf: pinnedCheckoutOf,
			installBrowserSessions: installWorkbenchTabSessions,
			browserLeaseLedger: server.browserLeaseLedger,
		},
		codex: {
			executablePath,
			hostEnvironment: { ARCHBOARD_URL: serverUrl(), ARCHBOARD_NO_AUTOSTART: "1" },
			pathPrefixes: [installation().binDirectory],
			onGroupOwned: server.onCodexProcessGroupOwned,
		},
	};
}

export type { ArchboardWorkbenchServer } from "#server/generation/protocol/archboard-host.ts";

import { resolveCodexExecutable } from "@archboard/codex-app-server/process";
import { createWorkbenchThreadProfile } from "#runtime/host/rules/instructions.ts";
import type { WorkbenchDynamicTools } from "#runtime/host/protocol/instructions.ts";
import type { VoiceAgentIdentity } from "#runtime/host/protocol/identity.ts";
import type {
	WorkbenchContextSource,
	WorkbenchVoicePolicy,
} from "#runtime/host/protocol/context-source.ts";
import type { ContextChange, ContextReceipt } from "#server/sessions/announce/protocol/contract.ts";
import type { TabSessions } from "#server/sessions/services/browser-tabs.ts";
import { assertSocketOrigin } from "#server/agent/services/admission.ts";
import {
	createVoiceConnector,
	type VoiceConnection,
	type VoiceRoute,
	type VoiceSocket,
} from "#server/agent/services/connect.ts";
import {
	serveBunBrowserSockets,
	type VoiceAgentBunHandlers,
	type VoiceAgentBunOptions,
} from "#server/agent/services/bun-serve.ts";
import { voiceStartAttempts } from "#server/voice/services/start-trace.ts";
import {
	createCodexWorkbench,
	type CodexWorkbenchExtensions,
	type CreateCodexWorkbenchOptions,
} from "#server/owner/services/workbench.ts";

/**
 * Deliberate extension points for a host that adds its own domain to the agent: context sources,
 * domain tools and voice narratives. A host without a domain passes none.
 */
export type VoiceAgentExtensions = Omit<CodexWorkbenchExtensions, "onFatal"> & {
	/** What the coordinator is told about the host page. Default: the admitted checkouts, as data. */
	readonly context?: WorkbenchContextSource;
	/** How voice starts, for a narrative or an ordinary session. Default: plain live voice. */
	readonly voice?: WorkbenchVoicePolicy;
	/** Extra Codex dynamic tools per role, appended to the built-in coordination tools. */
	readonly tools?: {
		readonly coordinator?: WorkbenchDynamicTools;
		readonly workhorse?: WorkbenchDynamicTools;
	};
};

/** Everything a host supplies to run one realtime Codex voice agent. */
export interface VoiceAgentOptions {
	/**
	 * The agent's private state: Codex home, SQLite home and process-owner records. Created with
	 * mode 0700. Keep it outside every checkout. The directory and everything below it must not
	 * be a symbolic link. A link above it that you or root own, in directories no other user can
	 * change, such as `/tmp` on macOS, is resolved once, here; any other link is refused at start.
	 */
	readonly directory: string;
	/** Where process-owner records live. Default: `<directory>/owner`. */
	readonly ownerDirectory?: string;
	/**
	 * The checkouts a workhorse may work in: absolute paths, or a function that returns the
	 * admitted path for a named checkout and null for a refused one.
	 */
	readonly checkouts: readonly string[] | ((named: string) => string | null);
	/**
	 * The page origins that may open the agent's sockets beside a loopback page of the server's
	 * own origin, each exactly, such as `https://voice.example.com`.
	 */
	readonly origins?: readonly string[];
	/**
	 * The host's own instructions, appended to the built-in coordinator and workhorse roles.
	 * Default for each: a short line that keeps the role to its job.
	 */
	readonly instructions?: { readonly coordinator?: string; readonly workhorse?: string };
	/** Receives a fault the agent cannot recover from. Default: write it to the console. */
	readonly onFatal?: (error: unknown) => void;
	/**
	 * How to run Codex: which executable, extra environment, PATH prefixes, secrets to redact from
	 * diagnostics, and an optional callback that receives the process group. Read once, when the
	 * agent is created. Without `executablePath`, the agent finds the installed `@openai/codex`
	 * (under `installedIn`, or in the platform package of `releasedIn`) and proves it then, and
	 * throws a `CodexExecutableError` when it cannot. Every start proves the executable again.
	 */
	readonly codex?: VoiceAgentCodex;
	/**
	 * How the agent names itself to Codex, to the user and in its records. Keep every value once
	 * threads exist: a thread keeps the names it started with.
	 */
	readonly identity?: Partial<VoiceAgentIdentity>;
	/** Domain extensions; see {@link VoiceAgentExtensions}. */
	readonly extensions?: VoiceAgentExtensions;
}

/** The Codex process inputs, with the executable optional and where to find it when left out. */
type VoiceAgentCodex = Omit<CreateCodexWorkbenchOptions["process"], "executablePath"> &
	NonNullable<Parameters<typeof resolveCodexExecutable>[0]>;

/** The host text each role gets when the host gives none. */
const DEFAULT_INSTRUCTIONS = Object.freeze({
	coordinator: "Answer short questions yourself. Give sustained work to the workhorse.",
	workhorse: "Do the work the person asks for in this checkout.",
});

/**
 * The Codex process inputs of the workbench: a given executable as it is, since each start proves
 * it, or else the installed one, found and proven now.
 * @param codex The host's Codex inputs, if any.
 * @returns The process inputs with an executable path.
 */
function codexProcess(codex: VoiceAgentCodex = {}): CreateCodexWorkbenchOptions["process"] {
	const { executablePath, installedIn: _installedIn, releasedIn: _releasedIn, ...process } = codex;
	return { ...process, executablePath: executablePath ?? resolveCodexExecutable(codex) };
}

type Workbench = ReturnType<typeof createCodexWorkbench>;

/** The agent's private Codex process: idle, starting, ready, or failed, with its failure. */
type VoiceAgentStatus = ReturnType<Workbench["snapshot"]>;

/** One realtime Codex voice agent: a coordinator per browser tab and a workhorse per checkout. */
export interface VoiceAgent {
	/**
	 * Start the private Codex process and wait for it. Start again after a failure or a shutdown
	 * to replace the process. Sockets need not wait for it: a socket connected before is served
	 * once the process is ready.
	 * @returns The status once the process is ready: `ready` is always `true`.
	 * @throws {Error} When Codex cannot start, an error whose `code` is `startup_failed` and whose
	 * `cause` names the reason; {@link VoiceAgent.status} then reads `failed`. A start during a
	 * shutdown, or while the process already runs, also rejects.
	 */
	readonly start: () => Promise<VoiceAgentStatus>;
	/** Read the process status without starting anything. */
	readonly status: () => VoiceAgentStatus;
	/**
	 * Connect one browser socket, from any WebSocket library: register it now, and serve its
	 * frames once Codex is ready, across Codex restarts too. A `{ request }` route whose origin or
	 * URL the agent refuses closes the socket with 1008 and registers nothing.
	 * @returns The connection: hand it every frame, and close it when the socket closes.
	 * @throws {TypeError} When the route names a checkout the agent does not admit, or names none
	 * while the agent admits more than one.
	 */
	readonly connect: (socket: VoiceSocket, route: VoiceRoute) => VoiceConnection;
	/**
	 * Serve browser sockets on one path of a `Bun.serve` server: spread the result into its
	 * options, as `Bun.serve({ port, ...agent.bunHandlers({ path: "/voice" }) })`. It connects
	 * each socket as `connect` does, and refuses an upgrade that `connect` would refuse before it
	 * upgrades: 403 for an origin, 400 for a URL without a tab session and chat. A request that is
	 * not a socket upgrade on `path` goes to `fetch`, and a socket that `fetch` upgrades itself
	 * goes to `websocket`, the host's own handlers.
	 * @returns The `fetch` and `websocket` of `Bun.serve` options.
	 * @throws {TypeError} When the path could never admit a socket, or the checkout is not admitted,
	 * or the agent admits more than one checkout and the options name none.
	 */
	readonly bunHandlers: <HostData = undefined>(
		options: VoiceAgentBunOptions<HostData>,
	) => VoiceAgentBunHandlers<HostData>;
	/**
	 * Close the sockets the agent admitted from their upgrade requests, release every connection,
	 * stop the Codex process and forget every browser tab. A later {@link VoiceAgent.start}
	 * serves the sockets that connect again.
	 */
	readonly shutdown: () => Promise<void>;
	/**
	 * The browser tabs as the agent's sockets name them: the tab of a browser, the checkout whose
	 * conversation a tab shows, a change of it the person made, and every change of it.
	 */
	readonly tabs: Pick<TabSessions, "of" | "shown" | "current" | "show" | "onShownChange">;
	/**
	 * The exact coordinator and workhorse profiles the agent's threads start with: identity,
	 * composed instruction text, dynamic tools, and the SHA-256 of each. A host can record these
	 * digests to notice when a change of its instructions or tools would reach Codex.
	 */
	readonly instructions: Workbench["instructions"];
	/**
	 * Tell the agents of the browser tabs that something they should know about changed: the
	 * workhorses of some checkouts, the coordinator, the live voice, or any combination. A
	 * workhorse hears one `feed` and `sequence` at most once, and nothing starts a turn. The
	 * audiences are told concurrently, so no audience waits for another, and no order between them
	 * is promised.
	 * @returns One receipt per tab session and audience, and per checkout for a workhorse.
	 * @throws {TypeError} When the change is malformed, for example when it names no audience.
	 * @throws {Error} While {@link VoiceAgent.status} does not read ready.
	 */
	readonly announce: (change: ContextChange) => Promise<readonly ContextReceipt[]>;
	/**
	 * What happened in the last voice starts of this process: the stages of each, with sizes,
	 * states and the words of whatever refused it. It holds no audio and no prompt text.
	 * @returns The kept attempts, oldest first.
	 */
	readonly voiceStartTrace: typeof voiceStartAttempts;
}

/**
 * Compose the host's role instructions and tools into immutable thread profiles.
 * @param options The host's options.
 * @param tools The host's extra tools per role.
 * @returns The coordinator and workhorse profiles.
 */
function threadProfiles(options: VoiceAgentOptions, tools: VoiceAgentExtensions["tools"]) {
	/**
	 * Compose one role.
	 * @param role The role.
	 * @returns Its immutable profile.
	 */
	const profile = (role: "coordinator" | "workhorse") =>
		createWorkbenchThreadProfile({
			identity: options.identity ?? {},
			role,
			domainInstructions: options.instructions?.[role] ?? DEFAULT_INSTRUCTIONS[role],
			dynamicTools: tools?.[role] ?? [],
		});
	return { coordinator: profile("coordinator"), workhorse: profile("workhorse") };
}

/**
 * Write a fault the host gave no handler for.
 * @param error The fault.
 */
function logFatal(error: unknown): void {
	console.error("The voice agent hit a fault it cannot recover from:", error);
}

/**
 * The origins an agent admits beside its loopback default.
 * @param origins The origins the host lists, if any.
 * @returns Them.
 * @throws {TypeError} When one is not exactly an HTTP(S) origin.
 */
function admittedOrigins(origins: readonly string[] = []): ReadonlySet<string> {
	for (const origin of origins) assertSocketOrigin(origin);
	return new Set(origins);
}

/**
 * The checkout a socket works in when its route names none.
 * @param checkouts The admitted checkouts.
 * @returns The only listed one, or undefined when there are more or a function admits them.
 */
function onlyCheckoutOf(checkouts: VoiceAgentOptions["checkouts"]): string | undefined {
	return typeof checkouts !== "function" && checkouts.length === 1 ? checkouts[0] : undefined;
}

/**
 * The workbench the agent runs over, from the host's options.
 * @param options The host's options.
 * @returns The workbench's options.
 */
function workbenchOptions(options: VoiceAgentOptions): CreateCodexWorkbenchOptions {
	const { context, voice, tools, ...extensions } = options.extensions ?? {};
	const { ownerDirectory } = options;
	return {
		storage: {
			rootDirectory: options.directory,
			...(ownerDirectory === undefined ? {} : { ownerDirectory }),
		},
		process: codexProcess(options.codex),
		host: {
			instructions: threadProfiles(options, tools),
			allowedCheckouts: options.checkouts,
			onFatal: options.onFatal ?? logFatal,
			...(context === undefined ? {} : { context }),
			...(voice === undefined ? {} : { voice }),
		},
		extensions,
	};
}

/**
 * Create a realtime Codex voice agent. Nothing starts until {@link VoiceAgent.start}.
 * @param options The state directory, checkouts and, optionally, origins, instructions, Codex
 * process, identity and extensions.
 * @returns The agent's lifecycle and socket operations.
 * @throws {TypeError} When an origin, an instruction or an identity value has the wrong shape.
 */
export function createVoiceAgent(options: VoiceAgentOptions): VoiceAgent {
	const origins = admittedOrigins(options.origins);
	const workbench = createCodexWorkbench(workbenchOptions(options));
	const connector = createVoiceConnector({
		connections: workbench.connections,
		admit: workbench.resolveCheckout,
		onlyCheckout: onlyCheckoutOf(options.checkouts),
		origins,
	});
	return Object.freeze({
		start: workbench.start,
		status: workbench.snapshot,
		connect: connector.connect,
		/**
		 * Serve browser sockets on one path of a Bun.serve server.
		 * @param bunOptions The path, checkout and the host's own handlers.
		 * @returns The handlers for Bun.serve.
		 */
		bunHandlers: <HostData = undefined>(bunOptions: VoiceAgentBunOptions<HostData>) => {
			const checkout = connector.checkoutFor(bunOptions.checkout);
			return serveBunBrowserSockets(connector.connect, origins, { ...bunOptions, checkout });
		},
		/** Close and release every connection, then stop the Codex process. */
		shutdown: async () => {
			try {
				await connector.closeAll();
				await workbench.connections.drain();
			} finally {
				await workbench.shutdown();
			}
		},
		tabs: Object.freeze({
			of: workbench.tabs.of,
			shown: workbench.tabs.shown,
			current: workbench.tabs.current,
			show: workbench.tabs.show,
			onShownChange: workbench.tabs.onShownChange,
		}),
		instructions: workbench.instructions,
		announce: workbench.announce,
		voiceStartTrace: voiceStartAttempts,
	});
}

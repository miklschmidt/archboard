import type { Server } from "node:http";
import { createWorkbenchThreadProfile } from "#runtime/rules/host/instructions.ts";
import type { WorkbenchDynamicTools } from "#runtime/protocol/host/instructions.ts";
import type { VoiceAgentIdentity } from "#runtime/protocol/host/identity.ts";
import type {
	WorkbenchContextSource,
	WorkbenchVoicePolicy,
} from "#runtime/protocol/host/context-source.ts";
import type { BrowserLeaseLedger } from "#server/protocol/gateway/contract.ts";
import {
	attachBrowserSockets,
	type VoiceAgentAttachOptions,
} from "#server/services/agent/attach.ts";
import {
	createCodexWorkbench,
	type CodexWorkbenchExtensions,
	type CreateCodexWorkbenchOptions,
} from "#server/services/owner/workbench.ts";

/**
 * Deliberate extension points for a host that adds its own domain to the agent: context sources,
 * domain tools, voice presentation and its own browser socket routing. A host without a domain
 * passes none.
 */
export type VoiceAgentExtensions = Omit<CodexWorkbenchExtensions, "onFatal"> & {
	/** What the coordinator is told about the host page. Default: nothing beyond the conversation. */
	readonly context?: WorkbenchContextSource;
	/** How voice is presented and recorded. Default: plain live voice. */
	readonly voice?: WorkbenchVoicePolicy;
	/** Extra Codex dynamic tools per role, appended to the built-in coordination tools. */
	readonly tools?: {
		readonly coordinator?: WorkbenchDynamicTools;
		readonly workhorse?: WorkbenchDynamicTools;
	};
	/** A browser command-lease ledger the host shares with its own sockets. */
	readonly browserLeaseLedger?: BrowserLeaseLedger;
};

/** Everything a host supplies to run one realtime Codex voice agent. */
export interface VoiceAgentOptions {
	/**
	 * The agent's private state: Codex home, SQLite home and process-owner records. Created with
	 * mode 0700. Keep it outside every checkout.
	 */
	readonly storage: {
		readonly directory: string;
		/** Where process-owner records live. Default: `<directory>/owner`. */
		readonly ownerDirectory?: string;
	};
	/**
	 * How to run Codex: the verified executable path, extra environment, PATH prefixes, secrets
	 * to redact from diagnostics, and an optional callback that receives the process group. Read
	 * once, when the agent is created.
	 */
	readonly codex: CreateCodexWorkbenchOptions["process"];
	/**
	 * The checkouts a workhorse may work in: absolute paths, or a function that returns the
	 * admitted path for a named checkout and null for a refused one.
	 */
	readonly checkouts: readonly string[] | ((named: string) => string | null);
	/** The host's own instructions, appended to the built-in coordinator and workhorse roles. */
	readonly instructions: { readonly coordinator: string; readonly workhorse: string };
	/**
	 * How the agent names itself to Codex, to the user and in its records. Each value left out is
	 * that of `DEFAULT_VOICE_AGENT_IDENTITY`. Keep every value once threads exist: a thread
	 * keeps the names it started with.
	 */
	readonly identity?: Partial<VoiceAgentIdentity>;
	/** Receives a fault the agent cannot recover from. The host decides whether to stop. */
	readonly onFatal: (error: unknown) => void;
	/** Domain extensions; see {@link VoiceAgentExtensions}. */
	readonly extensions?: VoiceAgentExtensions;
}

type Workbench = ReturnType<typeof createCodexWorkbench>;

/** The agent's private Codex process: idle, starting, ready, or failed, with its failure. */
export type VoiceAgentStatus = ReturnType<Workbench["snapshot"]>;

/**
 * The browser connection port, for a host that serves the agent's browser messages on a socket
 * of its own instead of {@link VoiceAgent.attach}: accept a socket with its pane, tab session and
 * checkout, hand it each parsed request, close it, and drain accepted work.
 */
export type VoiceAgentBrowserPort = Workbench["browser"];

/** One realtime Codex voice agent: a coordinator per browser tab and a workhorse per checkout. */
export interface VoiceAgent {
	/**
	 * Start the private Codex process and wait for it. Resolves with its status; check `ready`.
	 * Start again after a failure or a shutdown to replace the process.
	 */
	readonly start: () => Promise<VoiceAgentStatus>;
	/** Read the process status without starting anything. */
	readonly status: () => VoiceAgentStatus;
	/**
	 * Serve browser sockets on one path of a `node:http` server, which Bun runs. Attach once
	 * {@link VoiceAgent.start} is ready: a socket that arrives while the process is not ready is
	 * closed with 1011. A socket that sends a binary or non-JSON frame is closed with 1003.
	 * @returns Detach: stops accepting, closes those sockets and waits for their work.
	 * @throws {TypeError} When the path or origin could never admit a socket, or the agent admits
	 * more than one checkout and the options name none.
	 */
	readonly attach: (server: Server, options: VoiceAgentAttachOptions) => () => Promise<void>;
	/**
	 * Detach every attached server, stop the Codex process and forget every browser tab. After a
	 * later {@link VoiceAgent.start}, attach again to serve sockets.
	 */
	readonly shutdown: () => Promise<void>;
	/** The browser connection port; see {@link VoiceAgentBrowserPort}. */
	readonly browser: VoiceAgentBrowserPort;
	/**
	 * The exact coordinator and workhorse profiles the agent's threads start with: identity,
	 * composed instruction text, dynamic tools, and the SHA-256 of each. A host can record these
	 * digests to notice when a change of its instructions or tools would reach Codex.
	 */
	readonly instructions: Workbench["instructions"];
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
			domainInstructions: options.instructions[role],
			dynamicTools: tools?.[role] ?? [],
		});
	return { coordinator: profile("coordinator"), workhorse: profile("workhorse") };
}

/**
 * The checkout a socket path works in: the named one, or the only listed checkout.
 * @param checkouts The agent's admitted checkouts.
 * @param named The checkout the host named for the path.
 * @returns The checkout to register sockets with.
 */
function socketCheckout(checkouts: VoiceAgentOptions["checkouts"], named: string | undefined) {
	if (named !== undefined) return named;
	if (typeof checkouts !== "function" && checkouts.length === 1) return checkouts[0]!;
	throw new TypeError("Name the checkout these sockets work in: the agent admits more than one.");
}

/**
 * Create a realtime Codex voice agent. Nothing starts until {@link VoiceAgent.start}.
 * @param options The storage, Codex process, checkouts, instructions, identity and extensions.
 * @returns The agent's lifecycle and browser operations.
 */
export function createVoiceAgent(options: VoiceAgentOptions): VoiceAgent {
	const { context, voice, tools, browserLeaseLedger, ...extensions } = options.extensions ?? {};
	const workbench = createCodexWorkbench({
		storage: {
			rootDirectory: options.storage.directory,
			...(options.storage.ownerDirectory === undefined
				? {}
				: { ownerDirectory: options.storage.ownerDirectory }),
		},
		process: options.codex,
		host: {
			instructions: threadProfiles(options, tools),
			allowedCheckouts: options.checkouts,
			onFatal: options.onFatal,
			...(context === undefined ? {} : { context }),
			...(voice === undefined ? {} : { voice }),
		},
		extensions,
		...(browserLeaseLedger === undefined ? {} : { browserLeaseLedger }),
	});
	const detachers = new Set<() => Promise<void>>();
	return Object.freeze({
		start: workbench.start,
		status: workbench.snapshot,
		/**
		 * Serve browser sockets on one path and remember the attachment for shutdown.
		 * @param server The HTTP server.
		 * @param attachOptions The path, origin and checkout of its sockets.
		 * @returns Detach for this attachment.
		 */
		attach: (server: Server, attachOptions: VoiceAgentAttachOptions) => {
			const detach = attachBrowserSockets(server, workbench.browser, {
				...attachOptions,
				checkout: socketCheckout(options.checkouts, attachOptions.checkout),
			});
			/** Detach once and forget the attachment. */
			const tracked = async (): Promise<void> => {
				detachers.delete(tracked);
				await detach();
			};
			detachers.add(tracked);
			return tracked;
		},
		/** Detach every attachment, then stop the Codex process. */
		shutdown: async () => {
			try {
				await Promise.all([...detachers].map((detach) => detach()));
			} finally {
				await workbench.shutdown();
			}
		},
		browser: workbench.browser,
		instructions: workbench.instructions,
	});
}

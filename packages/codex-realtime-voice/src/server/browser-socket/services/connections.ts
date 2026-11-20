import type { BrowserConnectionInstance } from "#server/chat-conversations/gateway/protocol/contract.ts";
import type { CodexWorkbenchHostPolicy } from "#server/generation/protocol/host.ts";
import type { TabSessionId } from "#server/tab-session/rules/tab-session.ts";
import type { TabSessions } from "#server/sessions/services/browser-tabs.ts";
import { assertOpaqueName } from "#server/chat-conversations/gateway/operations/browser-command.ts";
import {
	createServerCodexBrowserSocketOwner,
	type ServerCodexBrowserSocketSend,
} from "#server/browser-socket/services/socket.ts";

/** One registered browser socket: who it is, where its frames go back, and what it shows. */
export interface BrowserRegistration {
	readonly instance: BrowserConnectionInstance;
	readonly browserId: string;
	readonly tabSessionId: TabSessionId;
	/** The chat the socket shows now, read on every frame; null while it shows none. */
	readonly chat: () => string | null;
	/** The checkout that pins its tab's shown conversation on the first read. */
	readonly checkout: () => string | undefined;
	readonly transport: ServerCodexBrowserSocketSend;
}

type GatewayScope = Parameters<NonNullable<CodexWorkbenchHostPolicy["onBrowserGateway"]>>[0];
type SocketOwner = ReturnType<typeof createServerCodexBrowserSocketOwner>;

/**
 * Keep the agent's browser registrations across replaceable Codex generations. A socket registers
 * once, whether or not a generation is installed; each generation that installs accepts every
 * registration, and a frame that arrives while none is installed finds no owner.
 * @param tabs The tab sessions the registrations name.
 * @returns The registry and its generation installation.
 */
export function createWorkbenchBrowserConnections(tabs: TabSessions) {
	const registrations = new Map<string, BrowserRegistration>();
	let current: SocketOwner | null = null;
	return Object.freeze({
		/**
		 * The checkout that pins a browser's tab on its first read.
		 * @param browserId The browser.
		 * @returns The checkout, or undefined when none is registered.
		 */
		checkoutOf: (browserId: string) => registrations.get(browserId)?.checkout(),
		/**
		 * Install this generation's socket owner, and accept every registration on it.
		 * @param scope The generation's gateway and session operations.
		 * @returns The generation cleanup.
		 */
		install: (scope: GatewayScope) => {
			const installed = createServerCodexBrowserSocketOwner({
				gateway: scope.gateway,
				/**
				 * The chat a registered browser shows now.
				 * @param id The browser.
				 * @returns The chat, or null before registration or while it shows none.
				 */
				chatForBrowser: (id) => registrations.get(id)?.chat() ?? null,
				/**
				 * The tab session a registered browser named.
				 * @param id The browser.
				 * @returns The tab session, or null before registration.
				 */
				tabSessionForBrowser: (id) => registrations.get(id)?.tabSessionId ?? null,
				/**
				 * Open the tab session a registered browser names.
				 * @param id The tab session.
				 */
				openTabSession: (id) => {
					scope.sessions.open(id);
				},
			});
			try {
				for (const { instance, browserId } of registrations.values())
					installed.accept(instance, browserId);
			} catch (error) {
				installed.dispose();
				throw error;
			}
			current = installed;
			return () => {
				if (current === installed) current = null;
				installed.dispose();
			};
		},
		/**
		 * Register a socket, replacing the browser's earlier one, and accept it on the installed
		 * generation, if any.
		 * @param registration The socket's identity, chat, checkout and send.
		 */
		register: (registration: BrowserRegistration) => {
			assertOpaqueName(registration.browserId, "browser");
			registrations.set(registration.browserId, registration);
			tabs.note(registration.browserId, registration.tabSessionId);
			current?.accept(registration.instance, registration.browserId);
		},
		/**
		 * Hand one recognized frame to the installed generation.
		 * @param instance The socket.
		 * @param browserId The browser.
		 * @param frame The frame.
		 * @returns The handling, or null while no generation is installed.
		 * @throws {Error} When the socket was replaced or released.
		 */
		handle: (instance: BrowserConnectionInstance, browserId: string, frame: unknown) => {
			const owner = current;
			if (owner === null) return null;
			const registration = registrations.get(browserId);
			if (registration?.instance !== instance)
				throw new Error("The browser socket instance is not registered.");
			return owner.handle(instance, browserId, frame, registration.transport);
		},
		/**
		 * Release one exact socket without forgetting its replacement.
		 * @param instance The socket.
		 * @param browserId The browser.
		 */
		close: async (instance: BrowserConnectionInstance, browserId: string) => {
			await current?.close(instance, browserId);
			if (registrations.get(browserId)?.instance === instance) {
				tabs.forget(browserId);
				registrations.delete(browserId);
			}
		},
		/**
		 * Wait for the publications and closes the installed generation took on.
		 * @returns Resolves when they settled.
		 */
		drain: () => current?.drain() ?? Promise.resolve(),
		/** Forget every registration, once the agent stopped. */
		clear: () => {
			registrations.clear();
		},
	});
}

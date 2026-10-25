import type { BrowserConnectionInstance } from "#server/protocol/gateway/contract.ts";
import type { CodexWorkbenchHostPolicy } from "#server/protocol/generation/host.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { TabSessions } from "#server/services/sessions/browser-tabs.ts";
import { assertOpaqueName } from "#server/operations/command/browser-command.ts";
import { createServerCodexBrowserSocketOwner } from "#server/services/browser-socket/socket.ts";

interface BrowserRegistration {
	readonly instance: BrowserConnectionInstance;
	readonly paneId: string;
	readonly tabSessionId: TabSessionId;
	readonly checkout: string;
}
type GatewayScope = Parameters<NonNullable<CodexWorkbenchHostPolicy["onBrowserGateway"]>>[0];
type SocketOwner = ReturnType<typeof createServerCodexBrowserSocketOwner>;
type SocketTransport = Parameters<SocketOwner["handle"]>[3];

/**
 * Own browser registrations and their socket adapter over replaceable Codex generations.
 * @param tabs The core tab registry.
 * @param admit The host checkout admission policy.
 * @param requireReady Refuses operations outside a ready generation.
 * @returns Browser ingress and its generation installation boundary.
 */
export function createWorkbenchBrowserConnections(
	tabs: TabSessions,
	admit: (named: string) => string | null,
	requireReady: () => void,
) {
	const registrations = new Map<string, BrowserRegistration>();
	let current: SocketOwner | null = null;
	/**
	 * Require this generation's installed socket adapter.
	 * @returns The socket adapter.
	 */
	const owner = (): SocketOwner => {
		requireReady();
		if (current === null) throw new Error("The host provides its own browser socket adapter.");
		return current;
	};
	return Object.freeze({
		/**
		 * Read the registered checkout that pins a browser tab on its first read.
		 * @param id The browser identity.
		 * @returns The registered checkout, or undefined before registration.
		 */
		checkoutOf: (id: string) => registrations.get(id)?.checkout,
		/**
		 * Install the existing socket owner before this generation accepts browser work.
		 * @param scope The generation gateway and session operations.
		 * @returns The generation cleanup.
		 */
		install: (scope: GatewayScope) => {
			const installed = createServerCodexBrowserSocketOwner({
				gateway: scope.gateway,
				/**
				 * Resolve a browser surface from its authoritative socket registration.
				 * @param id The registered browser identity.
				 * @returns The surface identity, or null before registration.
				 */
				paneForBrowser: (id) => registrations.get(id)?.paneId ?? null,
				tabSessionForBrowser: tabs.of,
				/**
				 * Open the tab session its registered browser names.
				 * @param id The registered tab session identity.
				 */
				openTabSession: (id) => {
					scope.sessions.open(id);
				},
			});
			current = installed;
			return () => {
				if (current === installed) current = null;
				installed.dispose();
			};
		},
		/** Release registrations after the workbench stops. */
		clear: () => {
			registrations.clear();
		},
		port: Object.freeze({
			/**
			 * Accept an exact socket and register its admitted checkout and tab session.
			 * @param instance The exact physical socket capability.
			 * @param browserId The browser identity assigned by the host.
			 * @param registration The host-owned surface, session, and checkout registration.
			 */
			accept: (
				instance: BrowserConnectionInstance,
				browserId: string,
				registration: Omit<BrowserRegistration, "instance">,
			) => {
				const installed = owner();
				assertOpaqueName(browserId, "browser");
				assertOpaqueName(registration.paneId, "pane");
				const checkout = admit(registration.checkout);
				if (checkout === null)
					throw new Error("The checkout is not admitted by this workbench host.");
				registrations.set(browserId, { ...registration, checkout, instance });
				tabs.note(browserId, registration.tabSessionId);
				tabs.shown(registration.tabSessionId, () => checkout);
				installed.accept(instance, browserId);
			},
			/**
			 * Route a browser envelope through the existing gateway and publication owner.
			 * @param instance The exact physical socket capability.
			 * @param browserId The registered browser identity.
			 * @param input The browser envelope.
			 * @param transport The host socket send boundary.
			 * @returns Resolves after the request and its publication settle.
			 */
			handle: async (
				instance: BrowserConnectionInstance,
				browserId: string,
				input: unknown,
				transport: SocketTransport,
			) => {
				if (registrations.get(browserId)?.instance !== instance)
					throw new Error("The browser socket instance is not registered.");
				return owner().handle(instance, browserId, input, transport);
			},
			/**
			 * Close one exact socket without forgetting its replacement.
			 * @param instance The exact physical socket capability.
			 * @param browserId The registered browser identity.
			 */
			close: async (instance: BrowserConnectionInstance, browserId: string) => {
				await current?.close(instance, browserId);
				if (registrations.get(browserId)?.instance === instance) {
					tabs.forget(browserId);
					registrations.delete(browserId);
				}
			},
			/**
			 * Wait for publications and closes already accepted by the current socket owner.
			 * @returns Resolves when the accepted work settles.
			 */
			drain: () => current?.drain() ?? Promise.resolve(),
		}),
	});
}

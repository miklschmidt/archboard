import type { TransportServerNotification } from "@archboard/codex-app-server/transport";

/** A notification as the transport hands it to a session's listeners. */
type ServerNotification = TransportServerNotification["notification"];

/**
 * Types a notification that a test writes as Codex sends it, as the transport would hand it over.
 * @param value - The method and params, as Codex sends them.
 * @returns The same value, typed as a decoded notification.
 */
function serverNotification(value: unknown): ServerNotification {
	return value as ServerNotification;
}

export { serverNotification, type ServerNotification };

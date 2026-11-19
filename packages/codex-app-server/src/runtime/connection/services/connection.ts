import { createCodexSession } from "#runtime/session/services/session.ts";
import type {
	CodexSessionOptions,
	OpenedCodexSession,
} from "#runtime/session/services/session-api.ts";
import { createCodexTransport } from "#runtime/transport/clients/transport.ts";
import type {
	CodexTransport,
	CodexTransportChild,
} from "#runtime/transport/clients/transport-types.ts";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "#shared/rules/workbench-identity.ts";
import type { IdentityAuthorities } from "#shared/schemas/identity-capabilities.ts";
import type { ChildEpoch, ChildId } from "#shared/schemas/identity-values.ts";

/** What a Codex connection is opened over. */
export interface CodexConnectionOptions {
	/** The app-server child's stdio and exit. */
	readonly child: CodexTransportChild;
	/** The host's record prefix, `^[a-z][a-z0-9-]{0,15}$`, that the child's identities carry. */
	readonly recordPrefix: string;
}

/**
 * The authorities and the transport of one Codex child epoch. Every identity the authorities
 * mint, and every frame the transport carries, belongs to this child and epoch alone.
 */
export interface CodexConnection {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly identity: IdentityAuthorities;
	readonly transport: CodexTransport;
}

/** What a session takes beyond the connection it is opened on. */
export type CodexConnectionSessionOptions = Omit<
	CodexSessionOptions,
	"transport" | "identity" | "listenerOwnership"
>;

/**
 * Opens a connection to one app-server child: a fresh child and epoch, the authorities that
 * name identities in them, and the transport over the child's stdio. A child that has already
 * exited yields a closed transport; register dynamic dispatchers only while it is open.
 * @param options The child and the host's record prefix.
 * @returns The connection.
 * @throws {TypeError} When the record prefix is not of its shape.
 */
export function openCodexConnection(options: CodexConnectionOptions): CodexConnection {
	const ledger = createIdentityLedger(options.recordPrefix);
	const identity = createIdentityAuthorities(ledger);
	const transport = createCodexTransport({ child: options.child, identity: identity.identity });
	return Object.freeze({ child: ledger.childId, epoch: ledger.epoch, identity, transport });
}

/**
 * Opens a session on a connection. The caller owns the returned control: it delivers the
 * transport's notifications and server requests to the session and disposes of it.
 * @param connection The connection.
 * @param options The storage, working directory, lifecycle, readiness and clock.
 * @returns The session and its control.
 */
export function openCodexSession(
	connection: CodexConnection,
	options: CodexConnectionSessionOptions,
): OpenedCodexSession {
	return createCodexSession({
		...options,
		transport: connection.transport,
		identity: connection.identity.identity,
		listenerOwnership: "composition",
	});
}

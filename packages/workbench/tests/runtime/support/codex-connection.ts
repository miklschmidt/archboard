import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { openCodexConnection, type CodexConnection } from "@archboard/codex-app-server/connection";
import type { IdentityAuthorities } from "@archboard/codex-app-server/identity";

/** The app-server child a connection is opened over. */
type CodexChild = Parameters<typeof openCodexConnection>[0]["child"];

/** An app-server child that has already exited: its connection mints identities and sends nothing. */
class ExitedChild extends EventEmitter implements CodexChild {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly exitCode = 0;
	readonly signalCode = null;
}

/**
 * A connection over a child that already exited, for a test that needs real identities of one
 * child epoch and no Codex.
 * @param recordPrefix The host's record prefix.
 * @returns The connection; its transport is closed.
 */
function testConnection(recordPrefix = "codex"): CodexConnection {
	return openCodexConnection({ child: new ExitedChild(), recordPrefix });
}

/**
 * The authorities of a fresh child epoch, minted the way production mints them.
 * @param recordPrefix The host's record prefix.
 * @returns The identity and operation authorities.
 */
function testAuthorities(recordPrefix = "codex"): IdentityAuthorities {
	return testConnection(recordPrefix).identity;
}

export { testAuthorities, testConnection };

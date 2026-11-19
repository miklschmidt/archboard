import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import {
	openCodexConnection,
	type CodexConnection,
	type CodexConnectionOptions,
} from "@archboard/codex-app-server/connection";
import type { IdentityAuthorities } from "@archboard/codex-app-server/identity";
import { createCodexBrowserModel } from "#shared/browser/schemas/model.ts";
import type { BrowserIdentities } from "#tests/shared/support/browser-identities.ts";
import type { DynamicFixtureSource } from "#tests/shared/support/dynamic-approval.ts";

/** The app-server child a connection is opened over. */
type CodexChild = CodexConnectionOptions["child"];

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

/**
 * The identities of one connection's authorities, in the shape browser fixtures take, so a
 * server test can build them through the issuing ledger.
 * @param authorities The authorities.
 * @returns One brander per identity domain, each adopting or minting through the ledger.
 */
function authorityIdentities(authorities: IdentityAuthorities): BrowserIdentities {
	const { decoder, issuer, validator } = authorities.identity;
	return {
		child: validator.childId,
		epoch: validator.epoch,
		otherEpoch: () => issuer.mintChildEpoch(),
		thread: (raw) => decoder.adoptThreadId(raw),
		turn: (raw) => decoder.adoptTurnId(raw),
		item: (raw) => decoder.adoptItemId(raw),
		queuedSubmission: (raw) => decoder.adoptQueuedSubmissionId(raw),
		login: (raw) => decoder.adoptLoginId(raw),
		approval: (raw) => decoder.adoptApprovalId(raw),
		dynamicToolCall: (raw) => decoder.adoptDynamicToolCallId(raw),
		jsonRpcRequest: (raw) => decoder.adoptJsonRpcRequestId(raw),
		nextJsonRpcRequest: () => issuer.mintJsonRpcRequestId(),
		browserCommand: () => issuer.mintBrowserCommandId(),
		realtimeSession: () => issuer.mintRealtimeSessionId(),
		operation: () => authorities.operation.issuer.mintOperationId(),
	};
}

/**
 * A dynamic-approval fixture source bound to one connection's ledger: its model refuses an
 * identity the ledger did not issue, or one of another epoch.
 * @param authorities The authorities.
 * @returns The identities and the authority-bound model.
 */
function authorityFixtureSource(authorities: IdentityAuthorities): DynamicFixtureSource {
	return { ids: authorityIdentities(authorities), model: createCodexBrowserModel(authorities) };
}

export { authorityFixtureSource, testAuthorities, testConnection };

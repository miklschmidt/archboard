// Lease identity: claim, renew and release, each refusing an answer whose
// identity moved, and the account read that shares their reconciliation.

import type { BrowserCommandLease } from "@/shared/codex-browser-model";
import type { BrowserWorkbenchAccountReadResult } from "@/ui/workbench-transport/contract";
import { accountReady } from "@/ui/workbench-transport/lib/capabilities";
import {
	capabilityContext,
	captureLease,
	incompatible,
	isCurrent,
	notify,
	requireRun,
	type TransportCore,
} from "@/ui/workbench-transport/lib/core";
import { reconcileAfterUnsequencedResult, request } from "@/ui/workbench-transport/lib/session";
import {
	messageOf,
	transportFailure,
	type SocketRun,
} from "@/ui/workbench-transport/lib/socket-run";
import { sameLeaseTarget } from "@/ui/workbench-transport/lib/targeting";
import {
	parseBrowserCommandLease,
	parseRequiredBrowserCommandLease,
} from "@/ui/workbench-transport/lib/wire";
import { parseBrowserAccountReadResult } from "@/ui/workbench-transport/lib/wire-results";
import { BrowserWorkbenchWireError } from "@/ui/workbench-transport/lib/wire-identity";

/**
 * The live run once the account is readable, or a refusal.
 * @param core The core.
 * @param message The refusal's words.
 * @returns The run.
 */
function requireAccountReady(core: TransportCore, message: string): SocketRun {
	if (core.activeRun === null || !accountReady(capabilityContext(core))) {
		throw transportFailure("not_ready", message);
	}
	return core.activeRun;
}

/**
 * Stop the run on an unreadable or misattributed answer and refuse the call.
 * @param core The core.
 * @param run The run.
 * @param message Plain words.
 * @param commandId The lease it concerns, if any.
 * @param cause The wire error.
 */
function stopIncompatible(
	core: TransportCore,
	run: SocketRun,
	message: string,
	commandId: BrowserCommandLease["commandId"] | null,
	cause: unknown,
): never {
	incompatible(core, run, cause);
	throw transportFailure(
		"incompatible_contract",
		message,
		{ commandId },
		{
			outcome: "outcome_unknown",
			cause,
		},
	);
}

/**
 * Parse a lease answer, stopping the run when it is unreadable.
 * @param core The core.
 * @param run The run.
 * @param value The answer.
 * @param existing The lease the call was about, or null.
 * @param parse The parser for the answer.
 * @param what The answer's name in a refusal.
 * @returns The parsed lease.
 */
function parseLeaseAnswer<Lease extends BrowserCommandLease | null>(
	core: TransportCore,
	run: SocketRun,
	value: unknown,
	existing: BrowserCommandLease | null,
	parse: (answer: unknown) => Lease,
	what: string,
): Lease {
	try {
		return parse(value);
	} catch (error) {
		return stopIncompatible(
			core,
			run,
			messageOf(error, `The ${what} is incompatible.`),
			existing?.commandId ?? null,
			error,
		);
	}
}

/**
 * Adopt a lease answer, refusing one whose identity moved.
 * @param core The core.
 * @param run The run.
 * @param value The answer.
 * @param existing The lease it must still name, or null for a fresh claim.
 * @param parse The parser for the answer.
 * @param what The answer's name in a refusal.
 * @returns The lease, or null when released to nothing.
 */
async function adoptLease<Lease extends BrowserCommandLease | null>(
	core: TransportCore,
	run: SocketRun,
	value: unknown,
	existing: BrowserCommandLease | null,
	parse: (answer: unknown) => Lease,
	what: string,
): Promise<Lease> {
	const lease = parseLeaseAnswer(core, run, value, existing, parse, what);
	if (existing !== null && lease !== null && !sameLeaseTarget(lease, existing)) {
		const error = new BrowserWorkbenchWireError(
			`The ${what} identity does not match the active lease.`,
		);
		stopIncompatible(core, run, error.message, existing.commandId, error);
	}
	if (isCurrent(core, run)) {
		core.currentLease = lease;
		notify(core);
		await reconcileAfterUnsequencedResult(core, run);
	}
	return lease;
}

/**
 * Claim a fresh lease.
 * @param core The core.
 * @returns The lease.
 */
async function claimLease(core: TransportCore): Promise<BrowserCommandLease> {
	const run = requireAccountReady(
		core,
		"The workbench is not ready to claim a browser command lease.",
	);
	const value = await request(core, run, { action: "claimLease", kind: "lease" });
	return adoptLease(core, run, value, null, parseRequiredBrowserCommandLease, "lease result");
}

/**
 * Renew the active lease.
 * @param core The core.
 * @returns The renewed lease.
 */
async function renewLease(core: TransportCore): Promise<BrowserCommandLease> {
	const run = requireRun(core);
	const lease = captureLease(core, run);
	const value = await request(core, run, {
		action: "renewLease",
		kind: "lease",
		commandId: lease.commandId,
	});
	return adoptLease(
		core,
		run,
		value,
		lease,
		parseRequiredBrowserCommandLease,
		"renewed workbench lease",
	);
}

/**
 * Release the active lease.
 * @param core The core.
 * @returns The released lease, or null when none was held.
 */
async function releaseLease(core: TransportCore): Promise<BrowserCommandLease | null> {
	const run = requireRun(core);
	const existing = core.currentLease;
	if (existing === null) {
		return null;
	}
	captureLease(core, run);
	const value = await request(core, run, {
		action: "releaseLease",
		kind: "lease",
		commandId: existing.commandId,
	});
	return adoptLease(
		core,
		run,
		value,
		existing,
		parseBrowserCommandLease,
		"released workbench lease",
	);
}

/**
 * Read the account.
 * @param core The core.
 * @returns The account result.
 */
async function accountRead(core: TransportCore): Promise<BrowserWorkbenchAccountReadResult> {
	const run = requireAccountReady(core, "The workbench is not ready to read account state.");
	const value = await request(core, run, { action: "accountRead", kind: "account" });
	let result: BrowserWorkbenchAccountReadResult;
	try {
		result = parseBrowserAccountReadResult(value);
	} catch (error) {
		stopIncompatible(
			core,
			run,
			messageOf(error, "The account result is incompatible."),
			null,
			error,
		);
	}
	await reconcileAfterUnsequencedResult(core, run);
	return result;
}

export { accountRead, claimLease, releaseLease, renewLease, requireAccountReady, stopIncompatible };

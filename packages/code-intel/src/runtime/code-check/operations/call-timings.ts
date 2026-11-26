// How the calls an anchor names run their callee, read in one checkout for
// the upgrade inventory (TASK-663.09, TASK-663.08), which seeds `async`
// where they are awaited or started and `sync` where they are plain.

import {
	anchoredCalls,
	anchorTiming,
	calleeInCode,
} from "#runtime/code-facts/operations/anchored-calls.ts";
import type { CallTiming } from "#shared/protocol/code-check.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { listReadableFiles } from "#runtime/code-facts/operations/readable-files.ts";

/**
 * Reads how the calls an anchor names run their callee, in one checkout,
 * through code facts alone, with no language server: a call through a value
 * whose callee no import names is unknown. The checkout's files are listed
 * once, so one reader serves every anchor of an upgrade.
 * @param root The checkout's root on this machine.
 * @param signal Ends the reading.
 * @returns For an anchor's file, relative to the root, and its symbol: the
 * timing of its calls taken together (`anchorTiming`), or undefined where the
 * file calls nothing of that name or code facts cannot read it.
 */
async function readCallTimings(
	root: string,
	signal: AbortSignal,
): Promise<(anchor: { path: string; symbol: string }) => Promise<CallTiming | undefined>> {
	const checkout = { root, files: await listReadableFiles(root, signal) };
	const pass = createCodeFacts().pass(signal);
	return async (anchor) => {
		const facts = await pass.read(checkout, anchor.path);
		if (facts === undefined || facts.adapter === "text") return undefined;
		const callee = calleeInCode(pass, checkout, anchor.path);
		const calls = await anchoredCalls(facts, anchor.symbol, callee);
		return anchorTiming(calls.map((call) => call.timing));
	};
}

export { readCallTimings };

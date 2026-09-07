// The server-rendering proof: an isolated, server-owned headless Chromium
// renders the canonical persisted board three times, survives a child exit,
// is replaced, and every acquisition, job and cleanup is audited into one
// disposable report. The pieces live in scripts/probe-server-rendering-chromium/.
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import {
	loadPersistedRenderInput,
	rejectMalformedPersistedBoard,
	startFixtureServer,
	type FixtureCleanupAudit,
	type FixtureServerOwner,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./probe-server-rendering-chromium/fixture-server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { runInboundMermaid } from "./probe-server-rendering-chromium/inbound-mermaid.ts";
import {
	assertSemantics,
	comparable,
	proveImmediateFailureIsNotTimeout,
	provePartialAcquisitionCleanup,
	requireRuntimeEvaluateTimeout,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./probe-server-rendering-chromium/proof-assertions.ts";
import {
	cleanupTimeoutMs,
	ownedOutputDirectory,
	requirePreflight,
	root,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./probe-server-rendering-chromium/proof-environment.ts";
import {
	errorMessage,
	requireRecord,
	type JsonRecord,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./probe-server-rendering-chromium/proof-values.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import type { CleanupAudit } from "./probe-server-rendering-chromium/renderer-process.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { RendererSession } from "./probe-server-rendering-chromium/renderer-session.ts";

type RendererPhase = "primary" | "childExit" | "replacement";

const phaseLabels: Record<RendererPhase, string> = {
	primary: "Primary",
	childExit: "Child-exit",
	replacement: "Replacement",
};

const output = ownedOutputDirectory(Bun.argv.slice(2));
const reportPath = join(output, "report.json");
let fixtureServer: FixtureServerOwner | null = null;
let fixtureCleanup: FixtureCleanupAudit | null = null;
const rendererCleanups: Record<RendererPhase, CleanupAudit | null> = {
	primary: null,
	childExit: null,
	replacement: null,
};
let report: JsonRecord = {
	status: "failed",
	output: { directory: output, owner: "probe", repositoryRelative: relative(root, output) },
};
let failure: unknown = null;

/**
 * Acquire a renderer, run one phase's actions in it, then shut it down and
 * refuse to continue unless the shutdown was clean. The cleanup audit is
 * recorded for the report before any failure is raised.
 * @param phase The phase name, which keys its cleanup audit in the report.
 * @param act The actions to run against the acquired renderer.
 * @throws {AggregateError} When both the actions and the cleanup failed.
 * @throws {Error} When either the actions or the cleanup failed.
 */
async function runRendererPhase(
	phase: RendererPhase,
	act: (renderer: RendererSession) => Promise<void>,
): Promise<void> {
	const renderer = await RendererSession.acquire();
	let actionFailure: unknown = null;
	try {
		await act(renderer);
	} catch (error) {
		actionFailure = error;
	}
	const cleanup = await renderer.shutdown();
	rendererCleanups[phase] = cleanup;
	if (!cleanup.clean || !cleanup.profileRemoved) {
		const cleanupFailure = new Error(
			`${phaseLabels[phase]} renderer cleanup failed: ${JSON.stringify(cleanup)}`,
		);
		if (actionFailure) {
			throw new AggregateError([actionFailure, cleanupFailure]);
		}
		throw cleanupFailure;
	}
	if (actionFailure) {
		throw actionFailure;
	}
}

/**
 * Render the fixture three times in one renderer and prove the results agree,
 * then prove the missing-image, immediate-failure and timeout behaviours.
 * @param primary The acquired renderer.
 * @param fixtureUrl The fixture page URL.
 * @param evidence The evidence gathered before the renderer was acquired.
 * @throws {Error} When any render or proof fails.
 */
async function runPrimaryPhase(
	primary: RendererSession,
	fixtureUrl: string,
	evidence: { malformedBoard: string; partialAcquisition: JsonRecord },
): Promise<void> {
	const startup = await primary.start(fixtureUrl);
	const first = await primary.runJob("first");
	assertSemantics(first.result);
	const warm = primary.memory();
	const second = await primary.runJob("second");
	assertSemantics(second.result);
	const third = await primary.runJob("third");
	assertSemantics(third.result);
	const steady = primary.memory();
	if (
		comparable(first.result) !== comparable(second.result) ||
		comparable(first.result) !== comparable(third.result)
	) {
		throw new Error("Identical persistent-renderer jobs diverged in output or semantics.");
	}
	const base = {
		backend: "isolated server-owned headless Chromium",
		browserClient: "none",
		output: { directory: output, owner: "probe", disposable: true },
		...evidence,
	};
	report = {
		status: "running",
		...base,
		primary: { startup, first, warm, second, third, steady, serial: primary.serialEvidence() },
	};
	const inbound = await runInboundMermaid(first.result);
	const inboundSecond = await runInboundMermaid(second.result);
	if (JSON.stringify(inbound) !== JSON.stringify(inboundSecond)) {
		throw new Error(
			"Canonical inbound Mermaid conversion did not preserve stable ids and bindings.",
		);
	}
	const missingImage = await primary.runJob("missing-image", "missing-image");
	if (!isRejected(() => assertSemantics(missingImage.result))) {
		throw new Error("Missing embedded image was accepted as a complete render.");
	}
	const immediateDifferentCause = await proveImmediateFailureIsNotTimeout(primary);
	const timeout = await requireRuntimeEvaluateTimeout(primary, "intentional-timeout", "stall");
	report = {
		status: "passed",
		...base,
		primary: {
			startup,
			first,
			warm,
			second,
			third,
			steady,
			inbound,
			inboundSecond,
			serial: primary.serialEvidence(),
			immediateDifferentCause,
			timeout,
		},
	};
}

/**
 * Whether a check throws.
 * @param check The check to run.
 * @returns Whether it threw.
 */
function isRejected(check: () => void): boolean {
	try {
		check();
		return false;
	} catch {
		return true;
	}
}

/**
 * Terminate the renderer's group from outside and prove the next job reports the exit.
 * @param childExit The acquired renderer.
 * @param fixtureUrl The fixture page URL.
 * @throws {Error} When the child lingers or its exit is not surfaced.
 */
async function runChildExitPhase(childExit: RendererSession, fixtureUrl: string): Promise<void> {
	const startup = await childExit.start(fixtureUrl);
	childExit.terminateProcessGroupForProof();
	await Promise.race([childExit.child.exited, Bun.sleep(cleanupTimeoutMs)]);
	if (childExit.child.exitCode === null) {
		throw new Error(`Renderer child did not exit within ${cleanupTimeoutMs} ms.`);
	}
	let rejection: string | null = null;
	try {
		await childExit.runJob("after-child-exit");
	} catch (error) {
		rejection = errorMessage(error);
	}
	if (!rejection?.includes("Chromium exited")) {
		throw new Error(
			`Renderer child exit was not surfaced to the caller: ${rejection ?? "no error"}`,
		);
	}
	report["childExit"] = { startup, exitCode: childExit.child.exitCode, rejection };
}

/**
 * Render once in a replacement renderer.
 * @param replacement The acquired renderer.
 * @param fixtureUrl The fixture page URL.
 * @throws {Error} When the render fails its semantics.
 */
async function runReplacementPhase(
	replacement: RendererSession,
	fixtureUrl: string,
): Promise<void> {
	const startup = await replacement.start(fixtureUrl);
	const job = await replacement.runJob("replacement");
	assertSemantics(job.result);
	report["replacement"] = {
		startup,
		job,
		memory: replacement.memory(),
		serial: replacement.serialEvidence(),
	};
}

/**
 * Refuse a replacement render that differs from the persistent renderer's first.
 * @throws {Error} When the two results differ.
 */
function requireReplacementAgrees(): void {
	const primaryResult = requireRecord(
		requireRecord(requireRecord(report, "primary"), "first"),
		"result",
	);
	const replacementResult = requireRecord(
		requireRecord(requireRecord(report, "replacement"), "job"),
		"result",
	);
	if (comparable(primaryResult) !== comparable(replacementResult)) {
		throw new Error("Replacement renderer diverged from the persistent renderer.");
	}
}

/**
 * Close the fixture server and fold a leaked fixture into the failure and report.
 * @param server The fixture server, if one was started.
 */
async function closeFixture(server: FixtureServerOwner | null): Promise<void> {
	if (!server) {
		return;
	}
	fixtureCleanup = await server.close();
	if (fixtureCleanup.clean) {
		return;
	}
	const cleanupFailure = new Error(
		`Fixture server cleanup failed: ${JSON.stringify(fixtureCleanup)}`,
	);
	failure = failure ? new AggregateError([failure, cleanupFailure]) : cleanupFailure;
	report = {
		...report,
		status: "failed",
		fixtureCleanupFailure: cleanupFailure.message,
	};
}

try {
	requirePreflight();
	const input = loadPersistedRenderInput();
	const malformedBoard = await rejectMalformedPersistedBoard(output);
	if (malformedBoard !== "Error") {
		throw new Error(`Malformed persisted board did not reject with Error: ${malformedBoard}`);
	}
	const partialAcquisition = await provePartialAcquisitionCleanup(input);
	const fixture = await startFixtureServer(input);
	fixtureServer = fixture;
	await runRendererPhase("primary", (primary) =>
		runPrimaryPhase(primary, fixture.url, { malformedBoard, partialAcquisition }),
	);
	await runRendererPhase("childExit", (childExit) => runChildExitPhase(childExit, fixture.url));
	await runRendererPhase("replacement", (replacement) =>
		runReplacementPhase(replacement, fixture.url),
	);
	requireReplacementAgrees();
} catch (error) {
	failure = error;
	report = {
		...report,
		status: "failed",
		failure:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: String(error),
	};
} finally {
	await closeFixture(fixtureServer);
	report["cleanup"] = {
		temporaryOutput: {
			directory: output,
			exists: existsSync(output),
			retainedReport: true,
		},
		fixture: fixtureCleanup,
		primary: rendererCleanups.primary,
		childExit: rendererCleanups.childExit,
		replacement: rendererCleanups.replacement,
	};
	await Bun.write(reportPath, JSON.stringify(report, null, 2) + "\n");
}

if (failure) {
	throw new Error(`Server rendering proof failed. Disposable report: ${reportPath}`);
}
globalThis.process.stdout.write(
	`Server rendering proof passed. Disposable report: ${reportPath}\n`,
);

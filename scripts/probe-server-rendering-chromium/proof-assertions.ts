// What the proof checks: the semantics of each render result, the
// intentional-timeout oracle and partial-acquisition cleanup.
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { CdpTimeoutError } from "./devtools-client.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { FixtureAcquisitionError, startFixtureServer } from "./fixture-server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { jobTimeoutMs } from "./proof-environment.ts";
import {
	errorMessage,
	isRecord,
	requireBoolean,
	requireNumber,
	requireRecord,
	requireSha256,
	type JsonRecord,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./proof-values.ts";
import {
	RendererAcquisitionError,
	RendererJobError,
	TimeoutOracleRejectionError,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./renderer-errors.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { RendererSession, type RendererJobMode } from "./renderer-session.ts";

const RENDERER_ACQUISITION_STAGES = [
	"before-profile",
	"after-profile",
	"after-port",
	"after-spawn-before-group-capture",
	"group-capture-failure",
	"group-capture-timeout",
	"after-spawn",
] as const;
const FIXTURE_ACQUISITION_STAGES = [
	"before-vite-create",
	"after-vite-create",
	"after-vite-listen",
] as const;
/** Stages that fail before Chromium is spawned, so no group or pipes exist to prove gone. */
const PRE_SPAWN_STAGES = new Set<string>(["before-profile", "after-profile", "after-port"]);

/**
 * Refuse a PNG whose fixture regions have too few pixels of their colour.
 * @param colors The colour summaries keyed by region.
 * @throws {Error} When a region has fewer than 100 pixels.
 */
function requireVisibleColors(colors: Record<string, JsonRecord>): void {
	for (const [name, color] of Object.entries(colors)) {
		if (requireNumber(color["count"], `PNG ${name} colour count is missing.`) < 100) {
			throw new Error(`PNG lacks visible ${name} colour pixels.`);
		}
	}
}

/**
 * Refuse a PNG whose service, store and decision regions are not laid out as the fixture draws them.
 * @param service The service region bounds.
 * @param store The store region bounds.
 * @param decision The decision region bounds.
 * @throws {Error} When the store is not right of the service or the decision not below it.
 */
function requireFixtureLayout(service: JsonRecord, store: JsonRecord, decision: JsonRecord): void {
	if (
		requireNumber(service["maxX"], "PNG service bounds missing.") >=
			requireNumber(store["minX"], "PNG store bounds missing.") ||
		requireNumber(decision["minY"], "PNG decision bounds missing.") <=
			requireNumber(service["maxY"], "PNG service bounds missing.")
	) {
		throw new Error("PNG fixture regions are not in the expected service, store, decision layout.");
	}
}

/**
 * Check the PNG export: bytes, hash, signature, plausible size and the fixture's colours and layout.
 * @param result The job result.
 * @throws {Error} When any PNG expectation fails.
 */
function assertPng(result: JsonRecord): void {
	const png = requireRecord(result, "png");
	if (requireNumber(png["bytes"], "PNG byte count is missing.") < 1) {
		throw new Error("PNG export is empty.");
	}
	requireSha256(png["hash"], "PNG SHA-256 is missing.");
	requireBoolean(png["isPng"], "PNG signature is invalid.");
	const semantics = requireRecord(png, "semantics");
	const width = requireNumber(semantics["width"], "PNG width is missing.");
	const height = requireNumber(semantics["height"], "PNG height is missing.");
	if (width < 500 || height < 300) {
		throw new Error(`PNG dimensions are implausible: ${width}x${height}.`);
	}
	const colors = requireRecord(semantics, "colors");
	const background = requireRecord(colors, "background");
	const service = requireRecord(colors, "service");
	const store = requireRecord(colors, "store");
	const decision = requireRecord(colors, "decision");
	requireVisibleColors({ background, service, store, decision });
	requireFixtureLayout(service, store, decision);
}

/**
 * Refuse SVG semantics missing the persisted background, fills, label, font, image or arrow.
 * @param semantics The SVG semantics summary.
 * @throws {Error} When any expectation fails.
 */
function requireSvgSemantics(semantics: JsonRecord): void {
	if (semantics["root"] !== "svg") {
		throw new Error("SVG root is not svg.");
	}
	requireBoolean(semantics["background"], "SVG lacks the persisted background.");
	const fills = semantics["fills"];
	if (!Array.isArray(fills) || fills.some((fill) => !isRecord(fill) || fill["present"] !== true)) {
		throw new Error("SVG lacks one of the persisted fixture fills.");
	}
	for (const [key, message] of [
		["hasBoundLabel", "SVG lacks the bound Service API label."],
		["hasExcalifont", "SVG lacks the required Excalifont text."],
		["fontLoaded", "The bundled Excalifont is not loaded."],
		["hasEmbeddedImage", "SVG lacks the persisted embedded image."],
		["hasArrowVisual", "SVG lacks the bound arrow visual."],
	] as const) {
		requireBoolean(semantics[key], message);
	}
}

/**
 * Check the SVG export: bytes, hash, semantics and enough native shapes.
 * @param result The job result.
 * @throws {Error} When any SVG expectation fails.
 */
function assertSvg(result: JsonRecord): void {
	const svg = requireRecord(result, "svg");
	if (requireNumber(svg["bytes"], "SVG byte count is missing.") < 1) {
		throw new Error("SVG export is empty.");
	}
	requireSha256(svg["hash"], "SVG SHA-256 is missing.");
	const semantics = requireRecord(svg, "semantics");
	requireSvgSemantics(semantics);
	const shapes = semantics["shapes"];
	if (!Array.isArray(shapes) || shapes.length < 8) {
		throw new Error("SVG does not contain enough native rendered shapes.");
	}
}

/**
 * The string member of each summary record, as text, sorted.
 * @param items The summary records.
 * @param key The member to read.
 * @returns The sorted texts.
 */
function sortedTexts(items: unknown[], key: string): string[] {
	return items.map((item) => String(isRecord(item) ? item[key] : undefined)).toSorted();
}

/**
 * The `from>to` text of an edge summary.
 * @param edge The edge summary.
 * @returns The connection text.
 */
function connectionText(edge: unknown): string {
	const record = isRecord(edge) ? edge : {};
	return `${String(record["from"])}>${String(record["to"])}`;
}

/**
 * Refuse a Mermaid graph summary whose labels or connections differ from the canonical diagram.
 * @param semantics The graph summary with `nodes` and `edges`.
 * @throws {Error} When the summary is absent or differs.
 */
function requireCanonicalGraph(semantics: JsonRecord): void {
	const nodes = semantics["nodes"];
	const edges = semantics["edges"];
	if (!Array.isArray(nodes) || !Array.isArray(edges)) {
		throw new Error("Mermaid graph summary is absent.");
	}
	const labels = sortedTexts(nodes, "label");
	const connections = edges.map(connectionText).toSorted();
	if (
		JSON.stringify(labels) !==
			JSON.stringify(["Board operation", "PNG and SVG", "Server render"]) ||
		JSON.stringify(connections) !==
			JSON.stringify(["Board operation>Server render", "Server render>PNG and SVG"])
	) {
		throw new Error(
			`Mermaid graph does not match the canonical labels and connectivity: ${JSON.stringify(semantics)}`,
		);
	}
}

/**
 * Check the in-page Mermaid conversion and its rejection of a malformed diagram.
 * @param result The job result.
 * @throws {Error} When any Mermaid expectation fails.
 */
function assertMermaid(result: JsonRecord): void {
	const mermaid = requireRecord(result, "mermaid");
	if (requireNumber(mermaid["elementCount"], "Mermaid element count is missing.") < 5) {
		throw new Error("Mermaid conversion returned too few elements.");
	}
	if (result["invalidMermaid"] !== "Error") {
		throw new Error("Malformed Mermaid did not reject with Error.");
	}
	requireCanonicalGraph(requireRecord(mermaid, "elements"));
}

/**
 * Check every semantic expectation of one render job.
 * @param result The job result.
 * @throws {Error} When the page reported an error or any expectation fails.
 */
function assertSemantics(result: JsonRecord): void {
	if ("error" in result) {
		throw new Error(`Browser probe failed: ${JSON.stringify(result["error"])}`);
	}
	assertPng(result);
	assertSvg(result);
	assertMermaid(result);
}

/**
 * A job result in the form two results are compared in.
 * @param result The job result.
 * @returns Its JSON text.
 */
function comparable(result: JsonRecord): string {
	return JSON.stringify(result);
}

interface TimeoutEvidence {
	elapsedMs: number;
	reason: string;
	phase: JsonRecord;
}

/**
 * The elapsed-time window an intentional timeout must land in.
 * @returns The earliest and latest acceptable milliseconds.
 */
function timeoutBounds(): { earliestMs: number; latestMs: number } {
	// Timers can fire a little early against the monotonic clock and a loaded host can deliver late.
	// The bounds retain the 20-second allowance while allowing one percent early and five percent late.
	return {
		earliestMs: jobTimeoutMs - Math.ceil(jobTimeoutMs * 0.01),
		latestMs: jobTimeoutMs + Math.ceil(jobTimeoutMs * 0.05),
	};
}

/**
 * The oracle's rejection of a failure that is not the intentional timeout of the named job.
 * @param error The failure to examine.
 * @param name The expected job name.
 * @param elapsedMs How long the job took to fail.
 * @returns The rejection, or the accepted job error.
 */
function timeoutOracle(
	error: unknown,
	name: string,
	elapsedMs: number,
): TimeoutOracleRejectionError | RendererJobError {
	if (!(error instanceof RendererJobError) || error.job !== name) {
		return new TimeoutOracleRejectionError("job", error);
	}
	if (error.phase["phase"] !== "intentional-timeout") {
		return new TimeoutOracleRejectionError("phase", error);
	}
	if (!(error.cause instanceof CdpTimeoutError)) {
		return new TimeoutOracleRejectionError("cause", error);
	}
	if (error.cause.method !== "Runtime.evaluate" || error.cause.timeoutMs !== jobTimeoutMs) {
		return new TimeoutOracleRejectionError("method", error);
	}
	const bounds = timeoutBounds();
	if (elapsedMs < bounds.earliestMs || elapsedMs > bounds.latestMs) {
		return new TimeoutOracleRejectionError("duration", error);
	}
	return error;
}

/**
 * Run a job that must time out in `Runtime.evaluate` and prove that it did.
 * @param session The renderer.
 * @param name The job name.
 * @param mode The job mode.
 * @returns The timeout evidence.
 * @throws {TimeoutOracleRejectionError} When the job failed for another reason.
 * @throws {Error} When the job completed.
 */
async function requireRuntimeEvaluateTimeout(
	session: RendererSession,
	name: string,
	mode: RendererJobMode,
): Promise<TimeoutEvidence> {
	const startedAt = performance.now();
	try {
		await session.runJob(name, mode);
	} catch (error) {
		const elapsedMs = performance.now() - startedAt;
		const verdict = timeoutOracle(error, name, elapsedMs);
		if (verdict instanceof TimeoutOracleRejectionError) {
			throw verdict;
		}
		return { elapsedMs, reason: errorMessage(verdict.cause), phase: verdict.phase };
	}
	throw new Error(`Intentional timeout job ${name} completed instead of timing out.`);
}

/**
 * Whether a rejection's cause is the staged intentional-timeout job failing for a non-timeout reason.
 * @param rejection The oracle's rejection.
 * @returns Whether the cause matches the job and phase but is not a DevTools timeout.
 */
function isImmediateFailureCause(rejection: TimeoutOracleRejectionError): boolean {
	const { cause } = rejection;
	return (
		cause instanceof RendererJobError &&
		cause.job === "intentional-timeout" &&
		cause.phase["phase"] === "intentional-timeout" &&
		!(cause.cause instanceof CdpTimeoutError)
	);
}

/**
 * Prove the oracle rejects an immediate evaluation failure staged at the
 * timeout phase, so a timeout cannot be faked by any other failure.
 * @param session The renderer.
 * @returns Evidence of the rejection.
 * @throws {Error} When the oracle did not reject on cause, or took too long.
 */
async function proveImmediateFailureIsNotTimeout(session: RendererSession): Promise<JsonRecord> {
	const startedAt = performance.now();
	let rejection: TimeoutOracleRejectionError | null = null;
	try {
		await requireRuntimeEvaluateTimeout(
			session,
			"intentional-timeout",
			"immediate-evaluation-failure",
		);
	} catch (error) {
		if (!(error instanceof TimeoutOracleRejectionError)) {
			throw error;
		}
		rejection = error;
	}
	const elapsedMs = performance.now() - startedAt;
	if (!rejection || rejection.reason !== "cause") {
		throw new Error(
			`Immediate failure did not prove a non-timeout cause: ${rejection?.reason ?? "no rejection"}.`,
		);
	}
	if (!isImmediateFailureCause(rejection)) {
		throw new Error(
			`Immediate failure did not match the timeout job and phase before its cause was rejected: ${JSON.stringify(
				rejection.cause,
			)}.`,
		);
	}
	if (elapsedMs > Math.ceil(jobTimeoutMs * 0.05)) {
		throw new Error(`Immediate differently caused failure took ${elapsedMs.toFixed(1)} ms.`);
	}
	const cause = rejection.cause instanceof RendererJobError ? rejection.cause : undefined;
	return {
		elapsedMs,
		rejection: rejection.message,
		phase: cause?.phase,
		cause: cause?.cause instanceof Error ? cause.cause.name : "unknown",
	};
}

/**
 * Whether a post-spawn acquisition failure proved its group and pipes gone.
 * @param error The acquisition failure.
 * @returns Whether the cleanup audit proves group, leader and pipes released.
 */
function provedProcessCleanup(error: RendererAcquisitionError): boolean {
	const { cleanup } = error;
	return (
		cleanup.processGroupProven &&
		cleanup.groupAbsent &&
		cleanup.leaderSettled &&
		cleanup.pipesSettled
	);
}

/**
 * Inject one renderer acquisition failure and prove its cleanup.
 * @param stage The stage to fail.
 * @returns Evidence of the failure and its cleanup.
 * @throws {Error} When the failure was accepted or cleanup was incomplete.
 */
async function proveRendererAcquisitionCleanup(
	stage: (typeof RENDERER_ACQUISITION_STAGES)[number],
): Promise<JsonRecord> {
	try {
		await RendererSession.acquire(stage);
	} catch (error) {
		if (!(error instanceof RendererAcquisitionError)) {
			throw error;
		}
		if (!error.cleanup.clean || !error.cleanup.profileRemoved || !error.cleanup.portReleased) {
			throw new Error(
				`Injected renderer acquisition ${stage} did not clean up: ${JSON.stringify(error.cleanup)}`,
				{ cause: error },
			);
		}
		if (!PRE_SPAWN_STAGES.has(stage) && !provedProcessCleanup(error)) {
			throw new Error(
				`Injected post-spawn acquisition ${stage} did not prove group and pipe cleanup: ${JSON.stringify(error.cleanup)}`,
				{ cause: error },
			);
		}
		return { stage, failureStage: error.stage, cleanup: error.cleanup };
	}
	throw new Error(`Injected renderer acquisition failure ${stage} was accepted.`);
}

/**
 * Inject one fixture acquisition failure and prove its cleanup.
 * @param input The render input to serve.
 * @param stage The stage to fail.
 * @returns Evidence of the failure and its cleanup.
 * @throws {Error} When the failure was accepted or cleanup was incomplete.
 */
async function proveFixtureAcquisitionCleanup(
	input: JsonRecord,
	stage: (typeof FIXTURE_ACQUISITION_STAGES)[number],
): Promise<JsonRecord> {
	try {
		await startFixtureServer(input, stage);
	} catch (error) {
		if (!(error instanceof FixtureAcquisitionError)) {
			throw error;
		}
		if (!error.cleanup.clean) {
			throw new Error(
				`Injected fixture acquisition ${stage} did not clean up: ${JSON.stringify(error.cleanup)}`,
				{ cause: error },
			);
		}
		return { stage, cleanup: error.cleanup };
	}
	throw new Error(`Injected fixture acquisition failure ${stage} was accepted.`);
}

/**
 * Fail every renderer and fixture acquisition stage in turn and prove each cleans up.
 * @param input The render input to serve.
 * @returns The evidence per stage.
 */
async function provePartialAcquisitionCleanup(input: JsonRecord): Promise<JsonRecord> {
	const renderer: JsonRecord[] = [];
	for (const stage of RENDERER_ACQUISITION_STAGES) {
		// oxlint-disable-next-line no-await-in-loop -- one renderer at a time; each injected failure must clean up before the next
		renderer.push(await proveRendererAcquisitionCleanup(stage));
	}
	const fixture: JsonRecord[] = [];
	for (const stage of FIXTURE_ACQUISITION_STAGES) {
		// oxlint-disable-next-line no-await-in-loop -- one fixture server at a time; each injected failure must clean up before the next
		fixture.push(await proveFixtureAcquisitionCleanup(input, stage));
	}
	return { renderer, fixture };
}

export {
	assertSemantics,
	comparable,
	proveImmediateFailureIsNotTimeout,
	provePartialAcquisitionCleanup,
	requireRuntimeEvaluateTimeout,
};

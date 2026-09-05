import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import * as publicApi from "@/ui/codex-realtime";
import {
	FakeBrowser,
	correlation,
	host,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";

const indexPath = path.resolve(import.meta.dirname, "../index.ts");
const moduleRoot = path.dirname(indexPath);
const SOURCE_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

/**
 * Whether a file name is source.
 * @param name The file name.
 * @returns True for source-like extensions.
 */
function sourceLike(name: string): boolean {
	return SOURCE_LIKE_EXTENSIONS.has(path.extname(name));
}

/**
 * The source files at a module root.
 * @param root The module root.
 * @returns Sorted file names.
 */
function rootEntries(root: string): string[] {
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isFile() && sourceLike(entry.name))
		.map((entry) => entry.name)
		.toSorted();
}

const EXPECTED_VALUE_EXPORTS = [
	"assertRealtimeTransition",
	"canTransitionRealtimeState",
	"INITIAL_REALTIME_STATE",
	"REALTIME_PHASES",
	"REALTIME_TRANSITIONS",
	"transitionRealtimeState",
	"createRealtimeMediaSession",
	"REALTIME_MEDIA_FEATURE",
	"browserRealtimeMediaEnvironment",
	"browserRealtimeMediaSupported",
] as const;

const EXPECTED_TYPE_EXPORTS = [
	"AnswerSdp",
	"AppendNotDeliveredReason",
	"AppendOutcome",
	"AppendOutcomeReason",
	"AppendOutcomeUnknownReason",
	"AppendSpeechRequest",
	"AppendTextRequest",
	"CommandNotDeliveredReason",
	"CommandOutcome",
	"CommandOutcomeReason",
	"CommandOutcomeUnknownReason",
	"CreateOfferSdp",
	"RealtimeCommandRequest",
	"RealtimeCorrelation",
	"RealtimeCorrelationId",
	"RealtimeDiagnosticCode",
	"RealtimeHost",
	"RealtimeItemId",
	"RealtimePhase",
	"RealtimeRecoverableErrorReason",
	"RealtimeSemanticEvent",
	"RealtimeSemanticEventListener",
	"RealtimeSessionId",
	"RealtimeState",
	"RealtimeTerminalErrorReason",
	"RealtimeTranscriptRecord",
	"RealtimeTranscriptRole",
	"RealtimeTranscriptStatus",
	"RealtimeTransitionReason",
	"RealtimeUnsubscribe",
	"RecoveryRequest",
	"RemoteMediaAttachment",
	"StopRequest",
	"RealtimeMediaListener",
	"RealtimeMediaSession",
	"RealtimeMediaSessionOptions",
	"RealtimeMediaSnapshot",
	"RealtimeDataChannel",
	"RealtimeEventSource",
	"RealtimeMediaDevices",
	"RealtimeMediaEnvironment",
	"RealtimeMediaStream",
	"RealtimeMediaTrack",
	"RealtimePeer",
	"RealtimeReceiver",
	"RealtimeSender",
	"RealtimeTimer",
] as const;

/**
 * The names an entrypoint re-exports, values and types apart.
 * @param sourceText The entrypoint source.
 * @returns The exported names in order.
 */
function exportedNames(sourceText: string): { values: string[]; types: string[] } {
	const values: string[] = [];
	const types: string[] = [];
	for (const match of sourceText.matchAll(
		/export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];/gu,
	)) {
		const destination = match[1] === undefined ? values : types;
		destination.push(...specifierNames(match[2] ?? ""));
	}
	return { values, types };
}

/**
 * The exported names in one export specifier list.
 * @param specifiers The comma-separated specifiers.
 * @returns The names as exported.
 */
function specifierNames(specifiers: string): string[] {
	return specifiers
		.split(",")
		.map(
			(name) =>
				name
					.trim()
					.split(/\s+as\s+/u)
					.at(-1) ?? "",
		)
		.filter((name) => name !== "");
}

describe("codex realtime public API", () => {
	test("keeps the index as the sole entrypoint with the exact frozen export surface", () => {
		expect(rootEntries(moduleRoot)).toEqual(["index.ts"]);
		expect(exportedNames(fs.readFileSync(indexPath, "utf8"))).toEqual({
			values: [...EXPECTED_VALUE_EXPORTS],
			types: [...EXPECTED_TYPE_EXPORTS],
		});
		expect(Object.keys(publicApi).toSorted()).toEqual([...EXPECTED_VALUE_EXPORTS].toSorted());
		expect(publicApi.REALTIME_MEDIA_FEATURE).toBe("webrtc-audio");
	});

	test("drives negotiation, output metering, stop and dispose through the index alone", async () => {
		const env = new FakeBrowser();
		const media = publicApi.createRealtimeMediaSession(host(env), {
			environment: env.environment(),
		});
		let observedLevel = -1;
		const unsubscribe = media.outputLevel.subscribe((level) => {
			observedLevel = Math.max(observedLevel, level);
		});
		const started = await media.start(correlation());
		expect(started.state.phase).toBe("listening");
		env.frame();
		expect(media.outputLevel.current()).toBeGreaterThan(0);
		const stopped = await media.stop();
		const disposable = publicApi.createRealtimeMediaSession(host(env), {
			environment: env.environment(),
		});
		await disposable.dispose();
		unsubscribe();
		expect(observedLevel).toBeGreaterThan(0);
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(disposable.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		expect(env.order).toContain("hostOffer");
		env.assertReleased();
	});

	test("reports no realtime support outside a browser", () => {
		expect(publicApi.browserRealtimeMediaSupported()).toBe(false);
	});
});

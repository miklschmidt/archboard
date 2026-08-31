import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as publicApi from "../index.js";
import {
	correlation,
	FakeBrowser,
	host,
	restoreFakeBrowsers,
} from "./support/media-session-fakes.js";
import type {
	RealtimeCorrelation,
	RealtimeHost,
	RealtimeMediaSession,
	RealtimeMediaSnapshot,
} from "../index.js";

const indexPath = path.resolve(import.meta.dirname, "../index.ts");
const moduleRoot = path.dirname(indexPath);
const SOURCE_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

function sourceLike(name: string): boolean {
	return SOURCE_LIKE_EXTENSIONS.has(path.extname(name));
}

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
	"RealtimeMediaSnapshot",
] as const;

const CONSUMER_FIXTURE = `
import { createRealtimeMediaSession } from "../../index.js";
import type {
  RealtimeCorrelation,
  RealtimeHost,
  RealtimeMediaSession,
} from "../../index.js";

export async function exercise(
  host: RealtimeHost,
  correlation: RealtimeCorrelation,
  afterStart: (session: RealtimeMediaSession) => Promise<void>,
) {
  const session = createRealtimeMediaSession(host);
  let observedLevel = -1;
  const unsubscribe = session.subscribe((snapshot) => {
    observedLevel = Math.max(observedLevel, snapshot.inputLevel);
  });
  const started = await session.start(correlation);
  await afterStart(session);
  const metered = session.getSnapshot();
  const stopped = await session.stop();
  const disposable = createRealtimeMediaSession(host);
  await disposable.dispose();
  const disposed = disposable.getSnapshot();
  unsubscribe();
  return { started, metered, observedLevel, stopped, disposed };
}
`;

function exportedNames(sourceText: string): { values: string[]; types: string[] } {
	const values: string[] = [];
	const types: string[] = [];
	for (const match of sourceText.matchAll(
		/export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];/gu,
	)) {
		const destination = match[1] ? types : values;
		for (const name of (match[2] ?? "").split(",")) {
			const exported = name.trim().split(/\s+as\s+/u)[1] ?? name.trim();
			if (exported) destination.push(exported);
		}
	}
	return { values, types };
}

interface ConsumerFixture {
	exercise: (
		host: RealtimeHost,
		correlation: RealtimeCorrelation,
		afterStart: (session: RealtimeMediaSession) => Promise<void>,
	) => Promise<{
		started: RealtimeMediaSnapshot;
		metered: RealtimeMediaSnapshot;
		observedLevel: number;
		stopped: RealtimeMediaSnapshot;
		disposed: RealtimeMediaSnapshot;
	}>;
}

async function withConsumerFixture<T>(run: (fixturePath: string) => Promise<T>): Promise<T> {
	const temporaryRoot = fs.mkdtempSync(path.join(moduleRoot, ".public-api-"));
	const fixturePath = path.join(temporaryRoot, "consumer.ts");
	try {
		fs.writeFileSync(
			fixturePath,
			CONSUMER_FIXTURE.replaceAll("../../index.js", pathToFileURL(indexPath).href),
		);
		return await run(fixturePath);
	} finally {
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

afterEach(restoreFakeBrowsers);

describe("codex realtime public API", () => {
	test("keeps the index as the sole entrypoint with the exact frozen export surface", async () => {
		expect(rootEntries(moduleRoot)).toEqual(["index.ts"]);
		expect(["index.ts", "client.js"].filter(sourceLike).toSorted()).toEqual([
			"client.js",
			"index.ts",
		]);
		expect(exportedNames(fs.readFileSync(indexPath, "utf8"))).toEqual({
			values: [...EXPECTED_VALUE_EXPORTS],
			types: [...EXPECTED_TYPE_EXPORTS],
		});
		expect(Object.keys(publicApi).toSorted()).toEqual([...EXPECTED_VALUE_EXPORTS].toSorted());
		expect(publicApi.REALTIME_MEDIA_FEATURE).toBe("webrtc-audio");
	});

	test("executes a framework-free index consumer through negotiation, metering, stop, and dispose", async () => {
		const env = new FakeBrowser();
		await withConsumerFixture(async (fixturePath) => {
			const consumer = (await import(
				`${pathToFileURL(fixturePath).href}?v=${crypto.randomUUID()}`
			)) as ConsumerFixture;
			const result = await consumer.exercise(host(env), correlation(), async (session) => {
				expect(session.getSnapshot().state.phase).toBe("listening");
				env.frame();
				expect(session.getSnapshot().inputLevel).toBeGreaterThan(0);
			});
			expect(result.started.state.phase).toBe("listening");
			expect(result.metered.inputLevel).toBeGreaterThan(0);
			expect(result.observedLevel).toBeGreaterThan(0);
			expect(result.stopped.state).toEqual({ phase: "closed", reason: "stopped" });
			expect(result.disposed.state).toEqual({ phase: "closed", reason: "disposed" });
			expect(env.order).toContain("hostOffer");
			env.assertReleased();
		});
	});

	test("keeps a consumer fixture's imports limited to the public index", () => {
		const imports = [...CONSUMER_FIXTURE.matchAll(/from\s+["']([^"']+)["']/gu)].map(
			(match) => match[1],
		);
		expect(imports).toEqual(["../../index.js", "../../index.js"]);
		expect(CONSUMER_FIXTURE).not.toMatch(
			/(?:react|archboard|codex|internal|store|fake|generated)/iu,
		);
	});
});

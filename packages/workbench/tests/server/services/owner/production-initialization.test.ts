import {
	identities,
	waitOwnerFor,
	waitProbe,
} from "#tests/server/support/generation/terminal-fixture.ts";
import { createArchboardVoicePolicy } from "#runtime/services/host/archboard-voice.ts";
import { archboardPublisher } from "#server/services/host/archboard-publisher.ts";
import {
	createCodexWaitGraph,
	createCodexRealtimeAdapter,
} from "@archboard/codex-realtime-voice/runtime";
import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import {
	parseRealtimeSessionId,
	parseRealtimeCorrelationId,
} from "@archboard/codex-realtime-voice/realtime";
import {
	createSemanticContextPublisher,
	type SemanticContextInput,
} from "#runtime/api/semantic-context.ts";
import type { SessionParams } from "@archboard/codex-app-server/session";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readlinkSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutPort, SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { findVault } from "@archboard/workspace/vault";
import { withProductionState } from "#tests/server/support/generation/production-state.ts";
import { createServerVoiceAgentOptions } from "#server/services/owner/production.ts";

function installation() {
	const root = mkdtempSync(join(tmpdir(), "archboard-production-storage-"));
	return withProductionState(root, () => ({
		root,
		value: createServerVoiceAgentOptions({
			sourceRoot: "/repo",
			host: { resolveCheckout: (named: string) => named },
		} as never),
	}));
}

describe("production Codex storage", () => {
	test("the servers on a machine share one Codex home, and each port owns its own state", async () => {
		const { root, value } = installation();
		try {
			const workbench =
				process.platform === "darwin"
					? join(root, "Library", "Application Support", "archboard", "codex-workbench")
					: process.platform === "win32"
						? join(root, "Archboard", "codex-workbench")
						: join(root, "archboard", "codex-workbench");
			const owner = join(
				workbench,
				"canvases",
				process.env["PORT"] || String(checkoutPort(SOURCE_CHECKOUT)),
			);
			expect({
				rootDirectory: value.storage.directory,
				ownerDirectory: value.storage.ownerDirectory,
			}).toEqual({ rootDirectory: workbench, ownerDirectory: owner });
			expect(statSync(owner).mode & 0o777).toBe(0o700);
			// The coordinator works in a directory of its own, in no checkout, and reads the server's
			// archboard skill from there (ADR 0050).
			const coordinator = join(owner, "coordinator");
			expect(existsSync(coordinator)).toBe(true);
			expect(readlinkSync(join(coordinator, ".agents", "skills", "archboard"))).toBe(
				join("/repo", "skills", "archboard"),
			);
			expect(existsSync(join(coordinator, ".archboard"))).toBe(false);
			// So a command the coordinator runs without -C finds no vault and is refused, rather than
			// read the boards of a checkout it does not work in.
			expect(await findVault({ directory: null, cwd: coordinator })).toMatchObject({
				ok: false,
				code: "VAULT_NOT_FOUND",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("Archboard realtime startup context", () => {
	test("captures startup semantics under the exact minted wire session", async () => {
		const authorities = createIdentityAuthorities();
		const workhorseThreadId = authorities.identity.decoder.adoptThreadId("voice-workhorse");
		const coordinatorThreadId = authorities.identity.decoder.adoptThreadId("voice-coordinator");
		const input: SemanticContextInput = {
			repository: "/repo",
			child: {
				id: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
			},
			threadLink: { state: "executable", reason: null },
			workhorse: { threadId: workhorseThreadId, turnId: null },
			coordinator: { threadId: coordinatorThreadId, realtimeSessionId: null },
			board: {
				key: "architecture",
				name: "Architecture",
				vault: "/repo/.archboard/vault",
				file: "boards/architecture.semantic.json",
				version: 7,
			},
			pane: { paneId: "pane-a", focused: true },
			architecture: {
				variant: null,
				view: null,
				selection: {
					count: 1,
					subjects: [{ kind: "node" as const, id: "node-a", name: "Gateway" }],
				},
				differences: null,
				reconciliation: { required: false, count: 0, blockedBy: null, issues: [] },
			},
			claim: { holder: "none", doing: null },
			doing: "Explaining the architecture",
			cursor: { feedId: "feed-a", sequence: 4 },
			description: "Architecture board",
		};
		const semanticPublisherOptions = {
			feed: { onChange: () => () => undefined },
			feedId: "feed-a",
			fresh: { read: () => input },
			contextForChange: () => input,
			now: () => 1_800_000_000_000,
		};
		const publisher = createSemanticContextPublisher(semanticPublisherOptions);
		const starts: SessionParams<"thread/realtime/start">[] = [];
		try {
			const production = {
				voice: createArchboardVoicePolicy(),
				freshSemanticBrief: archboardPublisher(publisher, semanticPublisherOptions)
					.freshBriefForRealtime,
				currentBinding: () => ({
					child: authorities.identity.validator.childId,
					epoch: authorities.identity.validator.epoch,
					linkedThreadId: workhorseThreadId,
					coordinatorThreadId,
				}),
			};
			const adapter = createCodexRealtimeAdapter({
				...production,
				coordinatorContext: {
					read: () => '{"type":"archboard_board_catalogue","boards":[],"omitted":0}',
					subscribe: () => () => {},
				},
				identity: authorities.identity,
				session: {
					realtimeStart: async (params) => {
						starts.push(params);
						return {};
					},
					realtimeAppendText: async () => ({}),
					threadInjectItems: async () => ({}),
					realtimeAppendSpeech: async () => ({}),
					realtimeStop: async () => ({}),
					timelineListPage: async () => ({
						data: [],
						nextCursor: null,
						activeRealtimeSessionAtPageStart: null,
					}),
				},
			});
			const pending = adapter.createOffer({
				sessionId: parseRealtimeSessionId("browser-session"),
				correlationId: parseRealtimeCorrelationId("browser-correlation"),
				sdp: "offer",
			});
			void pending.catch(() => undefined);
			await Promise.resolve();
			const start = starts[0];
			if (start === undefined) {
				throw new Error("The realtime start was not sent.");
			}
			// The brief is captured for this start's callbacks, and reaches neither model's start.
			expect(start.initialItems).toEqual([]);
			expect(start.realtimeStartInstructions).not.toContain("semantic_context");
			const exactBrief = adapter.generation()?.semanticBrief;
			if (exactBrief === undefined) {
				throw new Error("The generation has no semantic brief.");
			}
			expect(JSON.parse(exactBrief).coordinator.realtimeSessionId).toBe(start.realtimeSessionId);
			expect(adapter.generation()).toMatchObject({ wireSessionId: start.realtimeSessionId });
			adapter.dispose();
			await expect(pending).rejects.toThrow("disposed");
		} finally {
			publisher.dispose();
		}
	});
});

test("child-exit settlement aborts the domain's live dynamic waits", async () => {
	const h = identities();
	const { owner, counters } = waitProbe(h, createCodexWaitGraph());
	const waitOwner = waitOwnerFor(h, "thread-target");
	try {
		await Promise.resolve(owner.port.registerWaitOwner({ owner: waitOwner }));
		const waiting = owner.port
			.waitForTargets({
				owner: waitOwner,
				cursor: null,
				timeoutMs: 60_000,
				previousSequence: 0,
			})
			.then(
				() => "resolved",
				(error: unknown) => error,
			);
		await owner.childExit(waitOwner.child, waitOwner.epoch);
		expect(
			await Promise.race([
				waiting,
				(async () => {
					for (let turn = 0; turn < 10; turn++) await Promise.resolve();
					return "still pending";
				})(),
			]),
		).toMatchObject({ code: "child_disconnected" });
		expect(counters.aborts).toBe(1);
	} finally {
		await owner.shutdown();
	}
});

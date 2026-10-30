import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
	retainArchitectureCheckpoint,
} from "@archboard/board/store-write";
import { startOwnedServer } from "../../support/owned-server.ts";
import { productionServer } from "./production-server.ts";
import {
	prepareProductionFixture,
	openApplicationSocket,
	productionLeaseTarget,
	productionSnapshot,
	productionRecords,
	productionPane,
} from "./codex-production.ts";
import { createRequester } from "./http.ts";
import {
	SEMANTIC_PANE_CONTEXT_ROUTE,
	type SemanticPaneContextSchema,
} from "@archboard/board/pane-context";
import type { z } from "zod";

type Report = z.infer<typeof SemanticPaneContextSchema>;

export async function canonicalNarration(resources: AsyncDisposableStack, proposal = false) {
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "../fixtures/fake-codex-production.ts"),
	);
	cpSync(resolve("examples/canonical-model/.archboard/vault"), fixture.vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Narration Author"],
		["config", "user.email", "voice@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed narration"],
	]) {
		const result = Bun.spawnSync(["git", "-C", fixture.root, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	const initial = readArchitectureModel(fixture.vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const retained = await retainArchitectureCheckpoint(fixture.vault, {
		target: "current",
		operationId: "voice-target",
		writer: "agent",
		doing: "Retain the voice target",
		expectedRevision: initial.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const target = { model: initial.manifest.id, state: initial.selectedState!.id };
	const claim = await claimArchitectureSubjects(fixture.vault, {
		target,
		writer: "agent",
		reason: "Author canonical narration",
		subjects: ["Shop"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const authored = await editArchitectureModule(fixture.vault, {
		target,
		expectedRevision: initial.revision,
		writer: "agent",
		operationId: "voice-narrative",
		doing: "Author canonical narration",
		claim: claim.claim.id,
		...(proposal ? { proposal: { type: "create" as const, name: "Narrated proposal" } } : {}),
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Canonical tour",
					target: { checkpoint: retained.checkpoint.id },
					beats: [
						{
							title: "Front door",
							narrative: proposal
								? "The proposed gateway accepts the request."
								: "The gateway accepts the request.",
							reading: {
								grammar: "architecture",
								selection: ["Shop#Gateway"],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
						{
							title: "Worker",
							narrative: "The worker handles the request.",
							reading: {
								grammar: "architecture",
								selection: ["Shop#Worker"],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
						{
							title: "Unavailable",
							narrative: "Never narrate this missing subject.",
							reading: {
								grammar: "architecture",
								selection: ["Shop#Missing"],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
					],
				},
			},
		],
	});
	if (!authored.success) throw new Error(JSON.stringify(authored));
	await releaseArchitectureClaim(fixture.vault, { claim: claim.claim.id, writer: "agent" });
	const model = await readArchitectureModel(fixture.vault, undefined, undefined, {
		walkthrough: "Canonical tour",
		state: authored.target.state!,
		shared: true,
	});
	if (!model.success || model.playback === undefined) throw new Error(JSON.stringify(model));
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: {
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, "state"),
		},
	});
	resources.defer(() => server.dispose());
	const socket = await openApplicationSocket(server.base, "canonical-voice", {
		vault: fixture.vault,
	});
	resources.defer(() => socket.close());
	const presentationRequests: unknown[] = [];
	socket.socket.on("message", (raw) => {
		const message = JSON.parse(String(raw));
		if (message.type === "pane_present") presentationRequests.push(message);
	});
	const request = createRequester(server);
	await request("/api/panes", {
		method: "POST",
		doing: false,
		body: { ...productionPane("canonical-voice", "A", true, true), board: null, recording: true },
	});
	let sequence = 0;
	const architecture: NonNullable<Report["architecture"]> = {
		vault: fixture.vault,
		model: model.manifest.id,
		expectedRevision: model.revision.digest,
		expectedSourceRevision: model.playback.sourceRevision.digest,
		selection: model.playback.source,
		subjects: [],
		reading: { focus: [], relationshipKinds: [], groups: [], grammar: "architecture" },
	};
	const report = (presentation: Report["presentation"], capture = architecture) =>
		request(SEMANTIC_PANE_CONTEXT_ROUTE, {
			method: "POST",
			doing: false,
			body: {
				paneId: "A",
				clientId: "canonical-voice",
				board: null,
				variant: null,
				view: null,
				selection: [],
				version: null,
				architecture: capture,
				presentation,
				at: new Date().toISOString(),
				sequence: sequence++,
			},
		});
	await report(null);
	await socket.request("connect");
	const command = async (name: string, extra: Record<string, unknown> = {}) =>
		socket.request("command", {
			command: {
				kind: "browser_command",
				command: name,
				...productionLeaseTarget(await socket.request("claimLease")),
				...extra,
			},
		});
	await command("threadLinkCreate");
	const link = productionSnapshot(await socket.request("snapshot"))["threadLink"] as Record<
		string,
		unknown
	>;
	await socket.request("mediaReady", { ready: true });
	const start = (recording = true) =>
		command("realtimeStart", {
			threadId: link["threadId"],
			sdp: "v=0",
			narrative: {
				walkthrough: model.playback!.walkthrough.id,
				...(recording ? { recording: { language: "en" } } : {}),
			},
		});
	const frames = (method: string) =>
		productionRecords(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === method,
		);
	const spoken = () =>
		frames("thread/realtime/appendSpeech").map((entry) => String(entry.params?.["text"]));
	const beat = (
		index: number,
		arrived = true,
		answering: string | null = null,
	): NonNullable<Report["presentation"]> => ({
		walkthrough: model.playback!.walkthrough.id,
		beat: index,
		of: 3,
		arrived,
		answering,
	});
	return {
		presentationRequests,
		fixture,
		model,
		sourceCheckpoint: authored.checkpoint.id,
		architecture,
		report,
		start,
		beat,
		spoken,
		frames,
		socket,
	};
}

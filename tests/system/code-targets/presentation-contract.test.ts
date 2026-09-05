import { expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
	extractSceneElements,
	makeIdentity,
	renderBoardNote,
	vaultPathFor,
} from "../../../src/runtime/engine/board.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { TEST_CODE_TARGET_PRESENTATION_CASE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../boards/support/pane-websocket.ts";
import { completeElement } from "./support/elements.ts";
import { assertIntroducedBindingPresentation } from "./support/presentation-routes.ts";

const repoRoot = join(import.meta.dir, "../../..");
const serverPath = join(repoRoot, "src/server.ts");
const localRepository = "github.com/acme/local";

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString());
	}
}

function node(
	id: string,
	binding: { repo: string; path: string; branch?: string; commit?: string },
	link: string | null = null,
): ServerElement {
	return completeElement({
		id,
		type: "rectangle",
		x: 20,
		y: 20,
		width: 160,
		height: 80,
		link,
		customData: { archboard: { binding } },
	});
}

test(
	"every public presentation is fresh, provenance-safe, and board-addressed",
	async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-presentation-contract-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const checkout = join(root, "checkout");
		const outside = join(root, "outside");
		const registry = join(root, "state", "repos.json");
		const openerConfig = join(root, "state", "opener.json");
		const openerExecutable = join(root, "machine", "opener");
		const openerArgv = ["--machine-session", join(root, "machine", "captures"), "{path}"];
		mkdirSync(join(checkout, "src", "directory"), { recursive: true });
		mkdirSync(outside);
		mkdirSync(vault);
		mkdirSync(join(root, "state"));
		mkdirSync(join(root, "machine", "captures"), { recursive: true });
		writeFileSync(openerExecutable, "#!/bin/sh\nexit 0\n");
		chmodSync(openerExecutable, 0o700);
		writeFileSync(join(checkout, "src", "index.ts"), "export {};\n");
		writeFileSync(join(outside, "secret.ts"), "secret\n");
		symlinkSync(join(outside, "secret.ts"), join(checkout, "src", "escape.ts"));
		git(checkout, "init", "-q");
		git(checkout, "remote", "add", "origin", `https://${localRepository}.git`);
		const registryEntry = {
			repo: localRepository,
			root: checkout,
			source: "declared",
			addedAt: "2026-01-01",
		};
		writeFileSync(registry, JSON.stringify([registryEntry]));
		writeFileSync(
			openerConfig,
			JSON.stringify({
				version: 1,
				kind: "custom",
				executable: openerExecutable,
				argv: openerArgv,
			}),
		);

		const identity = makeIdentity({ board: "targets" });
		const elements = [
			node("local-file", { repo: localRepository, path: "src/index.ts" }),
			node("local-directory", { repo: localRepository, path: "src/directory" }),
			node("missing", { repo: localRepository, path: "src/later.ts" }),
			node("escape", { repo: localRepository, path: "src/escape.ts" }),
			node("commit", {
				repo: "github.com/acme/remote",
				path: "src/a b#%/café.ts",
				commit: "deadbeef",
				branch: "ignored",
			}),
			node("branch", { repo: "github.com/acme/remote", path: "docs", branch: "feature/links" }),
			node("head", { repo: "github.com/acme/remote", path: "src" }),
			node("root-empty", { repo: "github.com/acme/remote", path: "", branch: "main" }),
			node("root-dot", { repo: "github.com/acme/remote", path: "." }),
			node("other-host", { repo: "gitlab.com/acme/remote", path: "src" }),
			node(
				"bound-human",
				{ repo: "gitlab.com/acme/remote", path: "src" },
				"https://human.example/bound",
			),
			completeElement({
				id: "unbound-human",
				type: "rectangle",
				x: 220,
				y: 20,
				width: 160,
				height: 80,
				link: "file:///human-authored.ts",
			}),
			completeElement({
				id: "unmarked-internal",
				type: "rectangle",
				x: 420,
				y: 20,
				width: 160,
				height: 80,
				link: "/api/code-targets/open?board=human&element=kept",
			}),
		] as ServerElement[];
		const note = vaultPathFor(identity, vault);
		writeFileSync(
			note,
			renderBoardNote(
				{ type: "excalidraw", version: 2, elements, appState: {}, files: {} },
				null,
				identity,
			),
		);
		const canvas = await startOwnedCanvas({
			serverPath,
			vault,
			env: { ARCHBOARD_REPOS: registry, ARCHBOARD_OPENER_CONFIG: openerConfig },
		});
		resources.defer(() => canvas.dispose());
		const api = createJsonRequester(canvas);
		const opened = await api("/api/boards/open", { method: "POST", body: { board: "targets" } });
		expect(opened.status, JSON.stringify(opened.body)).toBe(200);
		const read = async () => {
			const response = await api<{ elements: ServerElement[] }>("/api/elements?board=targets");
			expect(response.status).toBe(200);
			return new Map(response.body.elements.map((element) => [element.id, element]));
		};
		const expectTransitionLeavesNoteUntouched = async (
			transition: () => void,
			observe: () => Promise<void>,
		) => {
			const beforeBytes = readFileSync(note);
			const beforeMtime = statSync(note, { bigint: true }).mtimeNs;
			transition();
			await observe();
			expect(readFileSync(note)).toEqual(beforeBytes);
			expect(statSync(note, { bigint: true }).mtimeNs).toBe(beforeMtime);
		};

		let presented = await read();
		expect(presented.get("local-file")?.link).toBe(
			"/api/code-targets/open?board=targets&element=local-file",
		);
		expect(presented.get("local-directory")?.link).toBe(
			"/api/code-targets/open?board=targets&element=local-directory",
		);
		expect(presented.get("missing")?.link).toBe(
			"https://github.com/acme/local/tree/HEAD/src/later.ts",
		);
		expect(presented.get("escape")?.link).toBe(
			"https://github.com/acme/local/tree/HEAD/src/escape.ts",
		);
		expect(presented.get("commit")?.link).toBe(
			"https://github.com/acme/remote/tree/deadbeef/src/a%20b%23%25/caf%C3%A9.ts",
		);
		expect(presented.get("branch")?.link).toBe(
			"https://github.com/acme/remote/tree/feature%2Flinks/docs",
		);
		expect(presented.get("head")?.link).toBe("https://github.com/acme/remote/tree/HEAD/src");
		expect(presented.get("root-empty")?.link).toBe("https://github.com/acme/remote/tree/main");
		expect(presented.get("root-dot")?.link).toBe("https://github.com/acme/remote/tree/HEAD");
		expect(presented.get("other-host")?.link).toBeNull();
		expect(presented.get("bound-human")?.link).toBe("https://human.example/bound");
		expect(presented.get("unbound-human")?.link).toBe("file:///human-authored.ts");
		expect(presented.get("unmarked-internal")?.link).toBe(
			"/api/code-targets/open?board=human&element=kept",
		);

		await assertIntroducedBindingPresentation({
			api,
			base: canvas.base,
			vault,
			binding: { repo: localRepository, path: "src/index.ts" },
		});

		await expectTransitionLeavesNoteUntouched(
			() => writeFileSync(registry, "[]\n"),
			async () =>
				expect((await read()).get("local-file")?.link).toBe(
					"https://github.com/acme/local/tree/HEAD/src/index.ts",
				),
		);
		await expectTransitionLeavesNoteUntouched(
			() =>
				writeFileSync(registry, JSON.stringify([{ ...registryEntry, root: join(root, "moved") }])),
			async () =>
				expect((await read()).get("local-directory")?.link).toBe(
					"https://github.com/acme/local/tree/HEAD/src/directory",
				),
		);
		await expectTransitionLeavesNoteUntouched(
			() => writeFileSync(registry, JSON.stringify([registryEntry])),
			async () =>
				expect((await read()).get("local-file")?.link).toBe(
					"/api/code-targets/open?board=targets&element=local-file",
				),
		);
		await expectTransitionLeavesNoteUntouched(
			() => writeFileSync(join(checkout, "src", "later.ts"), "later\n"),
			async () =>
				expect((await read()).get("missing")?.link).toBe(
					"/api/code-targets/open?board=targets&element=missing",
				),
		);
		await expectTransitionLeavesNoteUntouched(
			() => git(checkout, "remote", "set-url", "origin", "https://github.com/other/repo.git"),
			async () =>
				expect((await read()).get("local-file")?.link).toBe(
					"https://github.com/acme/local/tree/HEAD/src/index.ts",
				),
		);
		await expectTransitionLeavesNoteUntouched(
			() => git(checkout, "remote", "set-url", "origin", `https://${localRepository}.git`),
			async () =>
				expect((await read()).get("local-file")?.link).toBe(
					"/api/code-targets/open?board=targets&element=local-file",
				),
		);

		const exactInternal = "/api/code-targets/open?board=targets&element=local-file";
		const exactCommit = "https://github.com/acme/remote/tree/deadbeef/src/a%20b%23%25/caf%C3%A9.ts";
		const exactLegacyDirectory = pathToFileURL(join(checkout, "src", "directory")).href;
		const preservedEchoes = {
			branch: "https://github.com/acme/remote/tree/feature%2Flinks/other",
			head: "https://github.com/acme/remote/tree/main/src",
			"root-empty": "https://github.com/acme/other/tree/main",
			"root-dot": "opaque:not-a-public-presentation",
			missing: "/api/code-targets/open?board=other&element=missing",
			escape: "/api/code-targets/open?board=targets&element=other",
			"bound-human": "https://human.example/bound",
			"unbound-human": "file:///human-authored.ts",
			"unmarked-internal": "/api/code-targets/open?board=human&element=kept",
		} as const;
		const echoCases = [
			["local-file", exactInternal],
			["commit", exactCommit],
			["local-directory", exactLegacyDirectory],
			...Object.entries(preservedEchoes),
		] as const;
		const presentedEchoes = await read();
		for (const [index, [id, link]] of echoCases.entries()) {
			const presentedElement = presentedEchoes.get(id);
			const changed = await api(`/api/elements/changes?board=targets`, {
				method: "POST",
				body: {
					clientId: "echo-matrix",
					upserts: [{ id, link, x: 30 + index, customData: presentedElement?.customData }],
					deletes: [],
				},
			});
			expect(changed.status, `${id}: ${JSON.stringify(changed.body)}`).toBe(200);
		}
		let raw = readFileSync(note, "utf8");
		let stored = new Map(extractSceneElements(raw).map((element) => [element.id, element]));
		for (const id of ["local-file", "commit"]) {
			expect(stored.get(id)?.link, id).toBeNull();
		}
		expect(stored.get("local-directory")?.link).toBe(exactLegacyDirectory);
		for (const [id, link] of Object.entries(preservedEchoes)) {
			expect(stored.get(id)?.link, id).toBe(link);
		}
		const agentPresented = (await read()).get("commit")!;
		const agentEcho = await api(`/api/elements/changes?board=targets`, {
			method: "POST",
			body: {
				origin: "agent",
				upserts: [
					{
						id: agentPresented.id,
						x: agentPresented.x + 1,
						link: agentPresented.link,
						customData: agentPresented.customData,
					},
				],
				deletes: [],
			},
		});
		expect(agentEcho.status).toBe(200);
		raw = readFileSync(note, "utf8");
		stored = new Map(extractSceneElements(raw).map((element) => [element.id, element]));
		expect(stored.get("commit")?.link).toBeNull();
		expect(stored.get("bound-human")?.link).toBe("https://human.example/bound");
		expect(raw).not.toContain("presentationTarget");

		const humanPane = await openTestPane(canvas.base, api, "presentation-human", 0, {
			board: "targets",
			primary: true,
		});
		const peerPane = await openTestPane(canvas.base, api, "presentation-peer", 640, {
			board: "targets",
		});
		resources.defer(() => humanPane.close());
		resources.defer(() => peerPane.close());
		const humanPresented = (await read()).get("local-file")!;
		const peerStart = peerPane.since();
		const humanChange = await api(`/api/elements/changes?board=targets`, {
			method: "POST",
			body: {
				origin: "human",
				clientId: humanPane.clientId,
				upserts: [
					{
						id: humanPresented.id,
						x: humanPresented.x + 2,
						link: humanPresented.link,
						customData: humanPresented.customData,
					},
				],
				deletes: [],
			},
		});
		expect(humanChange.status).toBe(200);
		const peerChange = await waitForPaneMessage(peerPane, peerStart, "elements_changed");
		const peerUpdated = (peerChange?.["updated"] as ServerElement[] | undefined) ?? [];
		expect(peerUpdated.find((element) => element.id === "local-file")?.link).toBe(
			"https://github.com/acme/local/tree/HEAD/src/index.ts",
		);
		const activationResponse = await fetch(new URL("/api/code-targets/open", canvas.base), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Host: new URL(canvas.base).host,
				Origin: canvas.base,
				"Sec-Fetch-Site": "same-origin",
			},
			body: JSON.stringify({ board: "targets", element: "local-file" }),
		});
		const activationBody = await activationResponse.text();
		expect(activationResponse.status, activationBody).toBe(200);
		writeFileSync(registry, "[]\n");
		const stalePeerStart = peerPane.since();
		const stalePeerChange = await api(`/api/elements/changes?board=targets`, {
			method: "POST",
			body: {
				origin: "human",
				clientId: humanPane.clientId,
				upserts: [
					{
						id: humanPresented.id,
						x: humanPresented.x + 3,
						link: humanPresented.link,
						customData: humanPresented.customData,
					},
				],
				deletes: [],
			},
		});
		expect(stalePeerChange.status).toBe(200);
		const stalePeerMessage = await waitForPaneMessage(peerPane, stalePeerStart, "elements_changed");
		const stalePeerElements = (stalePeerMessage?.["updated"] as ServerElement[] | undefined) ?? [];
		expect(stalePeerElements.find(({ id }) => id === "local-file")?.link).toBe(
			"https://github.com/acme/local/tree/HEAD/src/index.ts",
		);
		writeFileSync(registry, JSON.stringify([registryEntry]));
		await humanPane.close();
		await peerPane.close();

		raw = readFileSync(note, "utf8");
		const internalCandidates = [
			"local-file",
			"local-directory",
			"missing",
			"escape",
			"commit",
			"branch",
			"head",
			"root-empty",
			"root-dot",
			"other-host",
			"bound-human",
		].map((id) => `/api/code-targets/open?board=targets&element=${id}`);
		const githubCandidates = [
			"https://github.com/acme/local/tree/HEAD/src/index.ts",
			"https://github.com/acme/local/tree/HEAD/src/directory",
			"https://github.com/acme/local/tree/HEAD/src/later.ts",
			"https://github.com/acme/local/tree/HEAD/src/escape.ts",
			exactCommit,
			"https://github.com/acme/remote/tree/feature%2Flinks/docs",
			"https://github.com/acme/remote/tree/HEAD/src",
			"https://github.com/acme/remote/tree/main",
			"https://github.com/acme/remote/tree/HEAD",
		];
		const legacyCandidates = [
			pathToFileURL(join(checkout, "src", "index.ts")).href,
			pathToFileURL(join(checkout, "src", "later.ts")).href,
		];
		for (const derived of [...internalCandidates, ...githubCandidates, ...legacyCandidates]) {
			expect(raw).not.toContain(`"link": ${JSON.stringify(derived)}`);
		}
		for (const machineValue of [registry, openerConfig, openerExecutable, ...openerArgv]) {
			expect(raw).not.toContain(machineValue);
		}
		expect(raw).toContain(exactLegacyDirectory);
		for (const human of Object.values(preservedEchoes)) {
			expect(raw).toContain(human);
		}
	},
	TEST_CODE_TARGET_PRESENTATION_CASE_TIMEOUT_MS,
);

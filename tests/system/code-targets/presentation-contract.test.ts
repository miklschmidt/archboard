import { expect, test } from "bun:test";
import {
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

import { makeIdentity, renderBoardNote, vaultPathFor } from "../../../src/runtime/engine/board.ts";
import { expandElements } from "../../../src/runtime/engine/expand-elements.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../boards/support/pane-websocket.ts";
import { findingElements } from "../browser/fixtures/fixed-point-scene.ts";
import { completeElement } from "./support/elements.ts";

const repoRoot = join(import.meta.dir, "../../..");
const serverPath = join(repoRoot, "src/server.ts");
const localRepository = "github.com/acme/local";

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
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

test("every public presentation is fresh, portable, and board-addressed", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-presentation-contract-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const checkout = join(root, "checkout");
	const outside = join(root, "outside");
	const registry = join(root, "state", "repos.json");
	mkdirSync(join(checkout, "src", "directory"), { recursive: true });
	mkdirSync(outside);
	mkdirSync(vault);
	mkdirSync(join(root, "state"));
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
		...(expandElements([...findingElements], { forStore: true }) as ServerElement[]),
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
	const beforeBytes = readFileSync(note);
	const beforeMtime = statSync(note, { bigint: true }).mtimeNs;
	const canvas = await startOwnedCanvas({ serverPath, vault, env: { ARCHBOARD_REPOS: registry } });
	resources.defer(() => canvas.dispose());
	const api = createJsonRequester(canvas);
	const opened = await api("/api/boards/open", { method: "POST", body: { board: "targets" } });
	expect(opened.status, JSON.stringify(opened.body)).toBe(200);
	const read = async () => {
		const response = await api<{ elements: ServerElement[] }>("/api/elements?board=targets");
		expect(response.status).toBe(200);
		return new Map(response.body.elements.map((element) => [element.id, element]));
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

	writeFileSync(registry, "[]\n");
	presented = await read();
	expect(presented.get("local-file")?.link).toBe(
		"https://github.com/acme/local/tree/HEAD/src/index.ts",
	);
	writeFileSync(registry, JSON.stringify([{ ...registryEntry, root: join(root, "moved") }]));
	expect((await read()).get("local-directory")?.link).toBe(
		"https://github.com/acme/local/tree/HEAD/src/directory",
	);
	writeFileSync(registry, JSON.stringify([registryEntry]));
	writeFileSync(join(checkout, "src", "later.ts"), "later\n");
	expect((await read()).get("missing")?.link).toBe(
		"/api/code-targets/open?board=targets&element=missing",
	);
	git(checkout, "remote", "set-url", "origin", "https://github.com/other/repo.git");
	expect((await read()).get("local-file")?.link).toBe(
		"https://github.com/acme/local/tree/HEAD/src/index.ts",
	);
	git(checkout, "remote", "set-url", "origin", `https://${localRepository}.git`);

	const pane = await openTestPane(canvas.base, api, "presentation-observer", 0, {
		primary: true,
		focused: true,
	});
	resources.defer(() => pane.close());
	const start = pane.since();
	const pending = api<{ results: unknown[] }>("/api/export/findings?board=targets", {
		method: "POST",
		body: { policy: {} },
	});
	const message = await waitForPaneMessage(pane, start, "export_findings_request");
	const outbound = (message?.elements as ServerElement[] | undefined) ?? [];
	expect(outbound.find((element) => element.id === "local-file")?.link).toBe(
		"/api/code-targets/open?board=targets&element=local-file",
	);
	for (const finding of (message?.findings as Array<{ findingIndex: number }> | undefined) ?? []) {
		await api("/api/export/findings/result", {
			method: "POST",
			body: {
				requestId: message?.requestId,
				findingIndex: finding.findingIndex,
				error: "controlled",
			},
		});
	}
	await pending;
	expect(readFileSync(note)).toEqual(beforeBytes);
	expect(statSync(note, { bigint: true }).mtimeNs).toBe(beforeMtime);
	const raw = beforeBytes.toString("utf8");
	for (const derived of [
		"/api/code-targets/open?board=targets&element=local-file",
		"https://github.com/acme/remote/tree/deadbeef/src/a%20b%23%25/caf%C3%A9.ts",
		`file://${checkout}/src/index.ts`,
		checkout,
	])
		expect(raw).not.toContain(derived);
	expect(raw).toContain("https://human.example/bound");
	expect(raw).toContain("file:///human-authored.ts");
});

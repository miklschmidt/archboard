import { expect, test } from "bun:test";
import { cpSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

import { readArchitectureModel } from "@archboard/model/store-read";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/model/store-write";
import { startOwnedServer } from "../support/owned-server.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	runServerCli,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

// The snapshot page (snapshot.html) draws a file that `archboard model snapshot` wrote, from a
// static host and with no Archboard server: the selected state, drawn in the page, against its
// comparison state. It sends no request to /api and opens no socket. A file of another format
// version names the versions that the page reads, and the page follows the system's theme.

const repoRoot = resolve(import.meta.dir, "../../..");

/** Short on purpose: each wait names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 15_000 } as const;

/** Where the host serves the build, as a static host serves a project. */
const SUB_PATH = "/project/";

/** Where the host serves the snapshot files, beside the build. */
const SNAPSHOTS = "snapshots/";

/**
 * Write a model with a draft that changes one module, as a team would, and snapshot the draft.
 * The server that answered the command is gone once this returns.
 * @param holder The directory that holds the vault.
 * @returns The directory that holds the snapshot file `draft.snapshot.json`.
 */
async function writeSnapshot(holder: string): Promise<string> {
	const vault = vaultIn(holder);
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Snapshot Author"],
		["config", "user.email", "snapshot@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
	]) {
		const result = Bun.spawnSync(["git", "-C", holder, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	const current = readArchitectureModel(vault);
	if (!current.success || !current.manifest.current) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "proposing a draft to share",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const created = await editArchitectureModule(vault, {
		target,
		expectedRevision: current.revision,
		operationId: "snapshot-page-draft",
		writer: "agent",
		claim: claimed.claim.id,
		doing: "proposing queued requests",
		proposal: { type: "create", name: "Queued" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted requests." },
			},
		],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	try {
		runServerCli(server, [
			"model",
			"snapshot",
			"--state",
			"Queued",
			"--out",
			"draft.snapshot.json",
		]);
	} finally {
		await server.dispose();
	}
	return holderOf(vault);
}

/** One request the static host received. */
interface Received {
	readonly path: string;
	readonly socket: boolean;
}

/**
 * Serve the build and the snapshots as a static host does, under a sub-path, and keep every
 * request it receives. It answers nothing else: no API and no socket.
 * @param snapshots The directory of the snapshot files.
 * @returns The host's origin, what it received, and how to stop it.
 */
function serveStatically(snapshots: string) {
	const build = join(repoRoot, "dist/frontend");
	const received: Received[] = [];
	const host = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (request) => {
			const { pathname } = new URL(request.url);
			received.push({
				path: pathname,
				socket: request.headers.get("upgrade")?.toLowerCase() === "websocket",
			});
			if (!pathname.startsWith(SUB_PATH)) return new Response("Not found", { status: 404 });
			const inside = normalize(decodeURIComponent(pathname.slice(SUB_PATH.length) || "index.html"));
			const file = inside.startsWith(SNAPSHOTS)
				? join(snapshots, inside.slice(SNAPSHOTS.length))
				: join(build, inside);
			return !inside.startsWith("..") && statSync(file, { throwIfNoEntry: false })?.isFile()
				? new Response(Bun.file(file))
				: new Response("Not found", { status: 404 });
		},
	});
	return { base: `http://127.0.0.1:${host.port}`, received, stop: () => host.stop(true) };
}

/**
 * Whether the page drew the snapshot's picture.
 * @param browser The page.
 * @returns Settles once it has.
 */
const drawn = (browser: AgentBrowserSession): Promise<boolean> =>
	pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector("[data-slot='model-diagram'] svg") !== null`),
		(atRest) => atRest,
		"the snapshot to be drawn",
		WAIT,
	);

test("the snapshot page draws a snapshot and its comparison from a static host, with no server", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const snapshots = await writeSnapshot(join(ownerRoot, "snapshot-home"));
	const draft = JSON.parse(readFileSync(join(snapshots, "draft.snapshot.json"), "utf8"));
	writeFileSync(join(snapshots, "later.snapshot.json"), JSON.stringify({ ...draft, format: 2 }));
	const host = serveStatically(snapshots);
	resources.defer(() => host.stop());
	registerServerBase(host.base);
	const page = `${host.base}${SUB_PATH}snapshot.html`;

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["set", "media", "light"]);
	await browser.run(["open", `${page}?snapshot=${SNAPSHOTS}draft.snapshot.json`]);
	await browser.run(["set", "viewport", "1600", "1000"]);
	await drawn(browser);

	// The draft is drawn against the current state it changes.
	expect(
		await browser.eval<boolean>(
			`document.querySelector("[data-slot='model-diagram'] [data-semantic-id='Shop#Gateway'][data-semantic-standing='changed']") !== null`,
		),
	).toBeTrue();
	expect(
		await browser.eval<boolean>(
			`document.querySelector("[data-slot='snapshot-comparison']") !== null`,
		),
	).toBeTrue();
	// The picture was drawn in the page: its layout worker and the core came from the build.
	const urls = await browser.eval<string[]>(
		`performance.getEntriesByType("resource").map((entry) => entry.name)`,
	);
	expect(urls.some((url) => /\/assets\/layout-worker-[^/]+\.js$/.test(url))).toBeTrue();
	expect(urls.some((url) => url.endsWith(".wasm"))).toBeTrue();
	expect(urls.filter((url) => !url.startsWith(`${host.base}${SUB_PATH}`))).toEqual([]);
	// The icons came from the snapshot, and nothing was asked of a server.
	expect(
		await browser.eval<boolean>(
			`document.querySelector("[data-slot='model-diagram'] [data-type-icon] path") !== null`,
		),
	).toBeTrue();
	expect(host.received.filter(({ path, socket }) => socket || !path.startsWith(SUB_PATH))).toEqual(
		[],
	);
	expect(host.received.some(({ path }) => path.includes("/api/"))).toBeFalse();
	expect(host.received.some(({ path }) => path.includes("/diagram-icons/"))).toBeFalse();

	// A reader opens a module of the picture, and steps back out to the whole model.
	const scope = `document.querySelector("[data-slot='snapshot-heading'] [aria-current]")?.textContent`;
	const model = await browser.eval<string>(scope);
	await browser.eval(`(() => {
		const card = document.querySelector("[data-slot='model-diagram'] [data-semantic-id='Shop#Gateway']");
		const box = card.getBoundingClientRect();
		card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: box.x + 8, clientY: box.y + 8 }));
	})()`);
	await pollUntil(
		() => browser.eval<string>(scope),
		(open) => open === "Gateway",
		"Gateway to open",
		WAIT,
	);
	await browser.eval(`document.querySelector("[data-slot='snapshot-heading'] h1 button").click()`);
	await pollUntil(
		() => browser.eval<string>(scope),
		(open) => open === model,
		"the model",
		WAIT,
	);

	// The theme follows the system's preference while the page is open.
	expect(await browser.eval<string>(`document.documentElement.dataset.theme`)).toBe("light");
	await browser.run(["set", "media", "dark"]);
	await pollUntil(
		() => browser.eval<string>(`document.documentElement.dataset.theme`),
		(theme) => theme === "dark",
		"the page to take the system's dark theme",
		WAIT,
	);

	// A file of another format version names the versions that the page reads.
	await browser.run(["open", `${page}?snapshot=${SNAPSHOTS}later.snapshot.json`]);
	const refusal = await pollUntil(
		() =>
			browser.eval<string>(
				`document.querySelector("[data-slot='snapshot-notice'][role='alert']")?.textContent ?? ""`,
			),
		(text) => text !== "",
		"the page to refuse a snapshot of another format version",
		WAIT,
	);
	expect(refusal).toMatch(/\b2\b/);
	expect(refusal).toMatch(/\b1\b/);
	expect(
		await browser.eval<boolean>(`document.querySelector("[data-slot='model-diagram']") === null`),
	).toBeTrue();

	// The host records what a page asks of a server: the application page, served beside the
	// snapshot page, asks for the API at once.
	expect(host.received.some(({ path }) => path.startsWith("/api/"))).toBeFalse();
	await browser.run(["open", `${host.base}${SUB_PATH}`]);
	await pollUntil(
		() => Promise.resolve(host.received.some(({ path }) => path.startsWith("/api/"))),
		(asked) => asked,
		"the application page to ask the host for the API",
		WAIT,
	);
}, 90_000);

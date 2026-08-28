import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
	bin: { archboard: string };
};
const executable = join(repoRoot, packageJson.bin.archboard);
const vault = mkdtempSync(join(tmpdir(), "archboard-version-route-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createRequester>;

interface VersionBody {
	code?: string;
	error?: string;
	version?: number;
	held?: unknown;
	elements?: unknown[];
	document?: unknown[];
	fingerprint?: { version?: number; note?: string };
	versionConflict?: { expected?: number; actual?: number };
}

const box = (id: string, x: number) => ({
	id,
	type: "rectangle",
	x,
	y: 10,
	width: 60,
	height: 40,
});

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const versionInOwnedNote = (bytes: Buffer): number => {
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(bytes.toString("utf8"));
	if (!frontmatter) throw new Error("Owned board note has no literal frontmatter block.");
	const versions = frontmatter[1]!.match(/^version:\s*(\d+)\s*$/gm) ?? [];
	if (versions.length !== 1) {
		throw new Error(`Owned board note has ${versions.length} literal version fields.`);
	}
	return Number(versions[0]!.slice(versions[0]!.indexOf(":") + 1).trim());
};

const cli = (args: string[]) =>
	spawnSync(executable, args, {
		encoding: "utf8",
		input: "",
		env: {
			...process.env,
			EXPRESS_SERVER_URL: canvas.base,
			EXCALIDRAW_NO_AUTOSTART: "1",
			ARCHBOARD_VAULT: vault,
			LOG_LEVEL: "error",
		},
	});

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: join(repoRoot, "src/server.ts"), vault });
	request = createRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

describe.serial("board version write boundary", () => {
	test("writes return the note fingerprint and current version", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });
		const first = await request<VersionBody>("/api/elements?board=payments", {
			method: "POST",
			body: box("one", 10),
		});
		const noteFile = join(vault, "payments.excalidraw.md");
		expect(first.body.fingerprint?.version).toBe(1);
		expect(versionInOwnedNote(readFileSync(noteFile))).toBe(1);
		expect(first.body.fingerprint?.note).toBe(sha256(readFileSync(noteFile)));

		const second = await request<VersionBody>("/api/elements?board=payments", {
			method: "POST",
			body: box("two", 200),
		});
		expect(second.body.fingerprint?.version).toBe(2);
		const info = await request<VersionBody>("/api/boards/info?board=payments");
		expect(info.body.version).toBe(2);
	});

	test("matching expectations pass and stale expectations return the current untouched board", async () => {
		const kept = await request<VersionBody>("/api/elements?board=payments&expectVersion=2", {
			method: "POST",
			body: box("three", 400),
		});
		expect(kept.status).toBe(200);
		expect(kept.body.fingerprint?.version).toBe(3);

		const noteFile = join(vault, "payments.excalidraw.md");
		const before = readFileSync(noteFile);
		const stale = await request<VersionBody>("/api/elements?board=payments&expectVersion=2", {
			method: "POST",
			body: box("four", 600),
		});
		expect(stale.status).toBe(409);
		expect(stale.body.code).toBe("BOARD_VERSION_CONFLICT");
		expect(stale.body.versionConflict).toMatchObject({ expected: 2, actual: 3 });
		expect(stale.body.error).toMatch(/1 time\(s\)/);

		const current = await request<VersionBody>("/api/elements?board=payments");
		const info = await request<VersionBody>("/api/boards/info?board=payments");
		expect(stale.body.document).toEqual(current.body.elements);
		expect(stale.body.version).toBe(3);
		expect(stale.body.version).toBe(info.body.version);
		expect(readFileSync(noteFile)).toEqual(before);
		expect(info.body.held).toBeUndefined();
	});

	test("invalid, no-note, and non-specialized routes use the same boundary", async () => {
		const invalid = await request<VersionBody>("/api/elements?board=payments&expectVersion=soon", {
			method: "POST",
			body: box("five", 800),
		});
		expect(invalid.status).toBe(400);
		expect(invalid.body.code).toBe("BAD_EXPECTED_VERSION");

		await request("/api/boards/new", { method: "POST", body: { board: "fresh" } });
		const first = await request<VersionBody>("/api/elements?board=fresh&expectVersion=0", {
			method: "POST",
			body: box("six", 10),
		});
		expect(first.status).toBe(200);
		expect(first.body.fingerprint?.version).toBe(1);

		const batch = await request<VersionBody>("/api/elements/batch?board=payments&expectVersion=1", {
			method: "POST",
			body: { elements: [box("seven", 10)] },
		});
		expect(batch.status).toBe(409);
		expect(batch.body.code).toBe("BOARD_VERSION_CONFLICT");
	});

	test("the package CLI distinguishes stale refusal from usage error", () => {
		const noteFile = join(vault, "payments.excalidraw.md");
		const at = versionInOwnedNote(readFileSync(noteFile));
		const common = ["add", "--board", "payments", "--one"];
		const said = ["--doing", "adding a box against a version"];
		const ok = cli([
			...common,
			JSON.stringify(box("cli-one", 900)),
			"--expect-version",
			String(at),
			...said,
		]);
		expect(ok.status).toBe(0);

		const refused = cli([
			...common,
			JSON.stringify(box("cli-two", 950)),
			"--expect-version",
			String(at),
			...said,
		]);
		expect(refused.status).toBe(5);
		expect(refused.stderr).toMatch(/version/);
		expect(refused.stderr.indexOf("Refusing to write")).toBeGreaterThanOrEqual(0);
		expect(refused.stderr.indexOf("Refusing to write")).toBeLessThan(
			refused.stderr.indexOf('"document"'),
		);
		expect(refused.stderr).toContain(`"version": ${at + 1}`);

		const mistyped = cli([
			...common,
			JSON.stringify(box("cli-three", 10)),
			"--expect-version",
			"latest",
			...said,
		]);
		expect(mistyped.status).toBe(2);
		expect(mistyped.stderr).toMatch(/--expect-version takes a whole number/);
	});
});

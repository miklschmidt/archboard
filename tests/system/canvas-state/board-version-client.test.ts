import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";
import type {
	applyElementChanges,
	currentExpectedVersion,
	forgetVersionsSeen,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
} from "../../../src/runtime/engine/canvas-client.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const environmentKeys = [
	"EXPRESS_SERVER_URL",
	"ENABLE_CANVAS_SYNC",
	"EXCALIDRAW_NO_AUTOSTART",
	"ARCHBOARD_VAULT",
	"LOG_FILE_PATH",
] as const;

interface Client {
	applyElementChanges: typeof applyElementChanges;
	currentExpectedVersion: typeof currentExpectedVersion;
	forgetVersionsSeen: typeof forgetVersionsSeen;
	setExpectedVersion: typeof setExpectedVersion;
	setRequestedBoard: typeof setRequestedBoard;
	setWriteDoing: typeof setWriteDoing;
}

interface VersionAnswer {
	code?: string;
	error?: string;
	version?: number;
	fingerprint?: { version?: number };
	versionConflict?: { expected?: number; actual?: number };
	conflict?: { reason?: string; versionMove?: string; message?: string };
	document?: Array<{ id?: string }>;
	success?: boolean;
}

const box = (id: string, x: number) => ({
	id,
	type: "rectangle",
	x,
	y: 10,
	width: 60,
	height: 40,
});

function restoreEnvironment(prior: Map<string, string | undefined>): void {
	for (const key of environmentKeys) {
		const value = prior.get(key);
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe.serial("board version client state", () => {
	test("claims, a long-lived client, human writes, and hash conflicts keep distinct authority", async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-version-client-"));
		const vault = join(root, "vault");
		mkdirSync(vault);
		let canvas: OwnedCanvas | undefined;
		let client: Client | undefined;
		let prior: Map<string, string | undefined> | undefined;

		try {
			canvas = await startOwnedCanvas({
				serverPath: join(repoRoot, "src/server.ts"),
				vault,
			});
			prior = new Map(environmentKeys.map((key) => [key, process.env[key]]));
			process.env["EXPRESS_SERVER_URL"] = canvas.base;
			process.env["ENABLE_CANVAS_SYNC"] = "true";
			process.env["EXCALIDRAW_NO_AUTOSTART"] = "1";
			process.env["ARCHBOARD_VAULT"] = canvas.vault;
			process.env["LOG_FILE_PATH"] = join(root, "canvas-client.log");

			client = await import("../../../src/runtime/engine/canvas-client.ts");
			const request = createRequester(canvas);

			await request("/api/boards/new", { method: "POST", body: { board: "claimed" } });
			const claimedFile = join(vault, "claimed.excalidraw.md");
			await request("/api/elements?board=claimed", { method: "POST", body: box("ten", 10) });
			const claim = await request<VersionAnswer>("/api/boards/claim", {
				method: "POST",
				body: { board: "claimed", reason: "redrawing the claimed board" },
			});
			expect(claim.body.version).toBe(2);

			const underClaim = await request<VersionAnswer>("/api/elements?board=claimed", {
				method: "POST",
				body: box("eleven", 200),
			});
			expect(underClaim.status).toBe(200);
			expect(underClaim.body.fingerprint?.version).toBe(3);

			const claimedBytes = readFileSync(claimedFile, "utf8");
			writeFileSync(
				claimedFile,
				claimedBytes.replace(/^version: 3$/m, "version: 5").replace('"x": 200', '"x": 260'),
			);
			const staleClaim = await request<VersionAnswer>("/api/elements?board=claimed", {
				method: "POST",
				body: box("twelve", 400),
			});
			expect(staleClaim.status).toBe(409);
			expect(staleClaim.body.code).toBe("BOARD_VERSION_CONFLICT");
			expect(staleClaim.body.versionConflict).toMatchObject({ expected: 3, actual: 5 });
			expect(staleClaim.body.error).toMatch(/only one you get/);

			const afterTelling = await request<VersionAnswer>(
				"/api/elements?board=claimed&expectVersion=5",
				{ method: "POST", body: box("thirteen", 500) },
			);
			expect([200, 409]).toContain(afterTelling.status);
			expect(afterTelling.body.conflict?.reason).toBe("changed");
			await request("/api/boards/claim/release", {
				method: "POST",
				body: { board: "claimed" },
			});

			client.forgetVersionsSeen();
			client.setExpectedVersion(null);
			client.setWriteDoing("driving a long-lived client");
			client.setRequestedBoard("remembered");
			await request("/api/boards/new", { method: "POST", body: { board: "remembered" } });
			const rememberedFile = join(vault, "remembered.excalidraw.md");

			const first = await client.applyElementChanges({ upserts: [box("r1", 10)] });
			expect(first.fingerprint?.version).toBe(2);
			const second = await client.applyElementChanges({ upserts: [box("r2", 200)] });
			expect(second.fingerprint?.version).toBe(3);

			const rememberedBytes = readFileSync(rememberedFile, "utf8");
			writeFileSync(
				rememberedFile,
				rememberedBytes.replace(/^version: 3$/m, "version: 6").replace('"x": 200', '"x": 280'),
			);
			let clientError: unknown;
			try {
				await client.applyElementChanges({ upserts: [box("r3", 400)] });
			} catch (error) {
				clientError = error;
			}
			const refused = clientError as {
				code?: string;
				refusal?: { version?: number; document?: Array<{ id?: string; x?: number }> };
			};
			expect(refused.code).toBe("BOARD_VERSION_CONFLICT");
			expect(refused.refusal?.version).toBe(6);
			expect(refused.refusal?.document).toContainEqual(
				expect.objectContaining({ id: "r2", x: 280 }),
			);
			expect(client.currentExpectedVersion()).toBe(6);

			client.setExpectedVersion(2);
			expect(client.currentExpectedVersion()).toBe(2);
			client.setExpectedVersion(null);
			client.forgetVersionsSeen();
			client.setRequestedBoard(null);
			client.setWriteDoing(null);

			// A pane's write is version-checked like an agent's (ADR 0022): it states
			// the version it last saw, is refused with the note when that has moved,
			// and is not accepted at all when it says nothing.
			const paneBoard = await request<VersionAnswer>("/api/boards/new", {
				method: "POST",
				body: { board: "pane" },
			});
			const seen = paneBoard.body.version!;
			const paneWrite = (
				expectVersion: string | null,
				id: string,
			): Promise<{ status: number; body: VersionAnswer }> =>
				request<VersionAnswer>(
					`/api/elements/changes?board=pane${expectVersion === null ? "" : `&expectVersion=${expectVersion}`}`,
					{
						method: "POST",
						doing: false,
						body: { upserts: [box(id, 700)], deletes: [], clientId: "pane-1-somebody" },
					},
				);
			const stated = await paneWrite(String(seen), "theirs");
			expect(stated.status).toBe(200);
			expect(stated.body.fingerprint?.version).toBe(seen + 1);
			const staleHuman = await paneWrite(String(seen), "late");
			expect(staleHuman.status).toBe(409);
			expect(staleHuman.body.code).toBe("BOARD_VERSION_CONFLICT");
			expect(staleHuman.body.versionConflict).toMatchObject({
				expected: seen,
				actual: seen + 1,
			});
			expect(staleHuman.body.version).toBe(seen + 1);
			expect(staleHuman.body.document).toContainEqual(expect.objectContaining({ id: "theirs" }));
			expect(staleHuman.body.document).not.toContainEqual(expect.objectContaining({ id: "late" }));
			const silentHuman = await paneWrite(null, "silent");
			expect(silentHuman.status).toBe(400);
			expect(silentHuman.body.code).toBe("BAD_EXPECTED_VERSION");
			expect(silentHuman.body.error).toMatch(/expectVersion.*required/);
			// While a board is held, nothing writes the note and nothing is checked;
			// the pane's stated version is not consulted, as for an agent.
			const heldHuman = await request<VersionAnswer>(
				"/api/elements/changes?board=claimed&expectVersion=1",
				{
					method: "POST",
					doing: false,
					body: { upserts: [box("theirs", 700)], deletes: [], clientId: "pane-1-somebody" },
				},
			);
			expect(heldHuman.status).toBe(200);
			expect(heldHuman.body.success).toBeTrue();

			await request("/api/boards/new", { method: "POST", body: { board: "shared" } });
			await request("/api/elements?board=shared", { method: "POST", body: box("eight", 10) });
			const sharedFile = join(vault, "shared.excalidraw.md");
			const ours = readFileSync(sharedFile);
			const foreign = Buffer.concat([ours, Buffer.from("\n<!-- Obsidian was here -->\n")]);
			writeFileSync(sharedFile, foreign);
			const hashRefusal = await request<VersionAnswer>(
				"/api/elements?board=shared&expectVersion=2",
				{ method: "POST", body: box("nine", 200) },
			);
			expect(hashRefusal.status).toBe(409);
			expect(hashRefusal.body.conflict?.reason).toBe("changed");
			expect(hashRefusal.body.conflict?.versionMove).toBe("unchanged");
			expect(hashRefusal.body.conflict?.message).toMatch(/does not keep that mark/);
			expect(readFileSync(sharedFile)).toEqual(foreign);
		} finally {
			if (client) {
				client.forgetVersionsSeen();
				client.setExpectedVersion(null);
				client.setRequestedBoard(null);
				client.setWriteDoing(null);
			}
			if (prior) {
				restoreEnvironment(prior);
			}
			await canvas?.dispose();
			rmSync(root, { recursive: true, force: true });
		}
	});
});

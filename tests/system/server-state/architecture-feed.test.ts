import { afterAll, beforeAll, expect, test } from "bun:test";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ArchitectureFeedFrameSchema, type ArchitectureFeedFrame } from "@archboard/model/contract";
import { openArchitectureFeed } from "../support/architecture-feed.ts";
import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";

const root = mkdtempSync(join(tmpdir(), "archboard-feed-"));
const first = vaultIn(join(root, "first"));
const second = vaultIn(join(root, "second"));
let server: OwnedServer;

beforeAll(async () => {
	for (const vault of [first, second]) seedCanonicalFixture(vault, "Shop", []);
	server = await startOwnedServer({
		serverPath: resolve(import.meta.dir, "../../../apps/server/src/server.ts"),
		vault: first,
	});
});

afterAll(async () => {
	await server?.dispose();
	rmSync(root, { recursive: true, force: true });
});

test("one socket follows every vault of a tab and names a vault it cannot read", async () => {
	const socket = new WebSocket(`${server.base.replace("http", "ws")}/api/architecture/events`);
	const frames: ArchitectureFeedFrame[] = [];
	const heard = new Promise<void>((settle) => {
		socket.addEventListener("message", (message) => {
			frames.push(ArchitectureFeedFrameSchema.parse(JSON.parse(String(message.data))));
			if (frames.length === 3) settle();
		});
	});
	await new Promise((settle) => socket.addEventListener("open", settle));
	const missing = join(root, "missing");
	for (const vault of [first, second, missing])
		socket.send(JSON.stringify({ type: "subscribe", vault }));
	await heard;
	socket.close();
	expect(frames.map(({ type, vault }) => [vault, type]).toSorted()).toEqual(
		[
			[first, "architecture_snapshot"],
			[missing, "architecture_unavailable"],
			[second, "architecture_snapshot"],
		].toSorted(),
	);
});

test("a malformed frame ends its own socket and leaves the server serving", async () => {
	const { host, hostname, port } = new URL(server.base);
	const socket = connect(Number(port), hostname);
	await once(socket, "connect");
	socket.write(
		`GET /api/architecture/events HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\n` +
			"Connection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
			"Sec-WebSocket-Version: 13\r\n\r\n",
	);
	await once(socket, "data");
	// Reserved bits and an unknown opcode: a frame that no client may send.
	socket.write(Buffer.from([0xff, 0x80, 1, 2, 3, 4]));
	await once(socket, "close");
	using feed = await openArchitectureFeed(server.base, first);
	expect((await feed.next()).type).toBe("architecture_snapshot");
});

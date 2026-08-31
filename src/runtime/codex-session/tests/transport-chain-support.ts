import { EventEmitter } from "node:events";
import { realpathSync, rmSync } from "node:fs";
import { PassThrough, Writable } from "node:stream";

import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createCodexTransport,
	type CodexTransport,
	type CodexTransportChild,
} from "../../codex-transport/index.js";
import { createCodexSession } from "../index.js";
import { makeStorage } from "./support.js";

class CapturingStdin extends Writable {
	readonly writes: Buffer[] = [];

	override _write(
		chunk: Buffer | string | Uint8Array,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.writes.push(Buffer.from(chunk));
		callback();
	}
}

class TransportSessionChild extends EventEmitter implements CodexTransportChild {
	readonly stdin = new CapturingStdin();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();

	dispose(): void {
		this.stdin.destroy();
		this.stdout.destroy();
		this.stderr.destroy();
		this.removeAllListeners();
	}
}

export interface TransportSessionFixture {
	readonly identity: IdentityAuthority;
	readonly transport: CodexTransport;
	readonly send: (value: unknown) => void;
	readonly frames: () => readonly Record<string, unknown>[];
	readonly settle: () => Promise<void>;
	readonly close: () => Promise<void>;
}

export function createTransportSessionFixture(now: () => number): TransportSessionFixture {
	const { root, storage } = makeStorage();
	const identity = createIdentityAuthority();
	const child = new TransportSessionChild();
	const transport = createCodexTransport({ child, identity });
	createCodexSession({
		transport,
		identity,
		storage,
		checkoutRoot: realpathSync(process.cwd()),
		now,
	});
	return {
		identity,
		transport,
		send: (value) => child.stdout.write(`${JSON.stringify(value)}\n`),
		frames: () =>
			child.stdin.writes.map(
				(frame) => JSON.parse(frame.toString("utf8")) as Record<string, unknown>,
			),
		settle: async () => {
			await new Promise<void>((resolve) => setImmediate(resolve));
			await new Promise<void>((resolve) => setImmediate(resolve));
		},
		close: async () => {
			try {
				await transport.shutdown();
			} finally {
				child.dispose();
				rmSync(root, { recursive: true, force: true });
			}
		},
	};
}

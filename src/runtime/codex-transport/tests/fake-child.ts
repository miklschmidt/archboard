import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

import { createCodexTransport, type CodexTransport, type CodexTransportChild } from "../index.js";
import type { DynamicDispatcherRegistration } from "../server-requests.js";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.js";

export type WireFrame = Record<string, unknown>;

export class FakeStdin extends Writable {
	readonly writes: Buffer[] = [];
	private blockedCallback: ((error?: Error | null) => void) | undefined;
	blockNext = false;
	failNext = false;
	finalizations = 0;

	constructor() {
		super({ highWaterMark: 1 });
	}

	override _write(
		chunk: Buffer | string | Uint8Array,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		this.writes.push(Buffer.from(chunk));
		if (this.failNext) {
			this.failNext = false;
			callback(new Error("fixture stdin failure"));
			return;
		}
		if (this.blockNext) {
			this.blockNext = false;
			this.blockedCallback = callback;
			return;
		}
		callback();
	}

	override _final(callback: (error?: Error | null) => void): void {
		this.finalizations += 1;
		callback();
	}

	override destroy(error?: Error): this {
		this.settleBlockedWrite(error);
		return super.destroy(error);
	}

	release(): void {
		this.settleBlockedWrite();
	}

	private settleBlockedWrite(error?: Error): void {
		const callback = this.blockedCallback;
		this.blockedCallback = undefined;
		if (callback) {
			callback(error);
			this.emit("drain");
		}
	}
}

export class FakeChild extends EventEmitter implements CodexTransportChild {
	readonly stdin = new FakeStdin();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();

	exit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.emit("exit", code, signal);
	}

	releaseBlockedWrite(): void {
		this.stdin.release();
	}

	dispose(): void {
		this.releaseBlockedWrite();
		this.stdin.destroy();
		this.stdin.writes.length = 0;
		this.stdout.destroy();
		this.stderr.destroy();
		this.stdin.removeAllListeners();
		this.stdout.removeAllListeners();
		this.stderr.removeAllListeners();
		this.removeAllListeners();
	}
}

export interface FakeChildHarness {
	readonly child: FakeChild;
	readonly identity: IdentityAuthority;
	readonly transport: CodexTransport;
	readonly close: () => Promise<void>;
}

export function createHarness(
	registrations?: readonly DynamicDispatcherRegistration[],
	identity: IdentityAuthority = createIdentityAuthority(),
): FakeChildHarness {
	const child = new FakeChild();
	identity.decoder.adoptThreadId("thread-1");
	const transport = createCodexTransport({ child, identity, dynamicDispatchers: registrations });
	const close = async (): Promise<void> => {
		const shutdown = transport.shutdown();
		child.releaseBlockedWrite();
		try {
			await shutdown;
		} finally {
			child.dispose();
		}
	};
	return { child, identity, transport, close };
}

export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the operation to reject");
}

export function frames(child: FakeChild): WireFrame[] {
	return child.stdin.writes.map((frame) => JSON.parse(frame.toString("utf8")) as WireFrame);
}

export function frameAt(child: FakeChild, index: number): WireFrame {
	const frame = frames(child)[index];
	if (!frame) throw new Error(`missing written frame ${index}`);
	return frame;
}

export function sendRaw(child: FakeChild, value: string | Buffer): void {
	child.stdout.write(value);
	if (typeof value === "string" && !value.endsWith("\n")) child.stdout.write("\n");
}

export function sendJson(child: FakeChild, value: unknown): void {
	sendRaw(child, `${JSON.stringify(value)}\n`);
}

export async function flushStreams(): Promise<void> {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

export function issueKinds(transport: CodexTransport): string[] {
	return transport.inspectIssues().map((issue) => issue.kind);
}

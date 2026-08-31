import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

import {
	createCodexTransport,
	type CodexTransport,
	type CodexTransportChild,
	type DynamicDispatcherRegistration,
} from "../index.js";
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

	release(): void {
		const callback = this.blockedCallback;
		this.blockedCallback = undefined;
		callback?.();
		this.emit("drain");
	}
}

export class FakeChild extends EventEmitter implements CodexTransportChild {
	readonly stdin = new FakeStdin();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();

	exit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.emit("exit", code, signal);
	}
}

export function createHarness(
	registrations?: readonly DynamicDispatcherRegistration[],
	identity: IdentityAuthority = createIdentityAuthority(),
) {
	const child = new FakeChild();
	const transport = createCodexTransport({ child, identity, dynamicDispatchers: registrations });
	return { child, identity, transport };
}

export async function closeTransport(transport: CodexTransport): Promise<void> {
	await transport.shutdown();
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

import { captureDetachedProcessGroup, signalOwnedProcessGroup } from "#runtime/processes/group.ts";

interface GitOwnerResult {
	readonly kind: "result";
	readonly exitCode?: number;
	readonly signalCode?: string | number;
	readonly spawnError?: string;
}

/**
 * Forward one child stream while respecting the owner's pipe backpressure.
 * @param stream The child pipe to read.
 * @param destination The owner pipe to write.
 */
async function forwardOutput(
	stream: ReadableStream<Uint8Array>,
	destination: NodeJS.WriteStream,
): Promise<void> {
	for await (const chunk of stream) {
		// Bun does not reliably emit `drain` for a child process's inherited
		// stdout/stderr pipe on Darwin. The write callback still reports when the
		// chunk has flushed, and bounds this owner's queued output to one chunk.
		await new Promise<void>((resolve, reject) => {
			destination.write(chunk, (error) => (error ? reject(error) : resolve()));
		});
	}
}

let releaseOwner!: () => void;
const released = new Promise<void>((resolve) => {
	releaseOwner = resolve;
});
/**
 * Decode only the input supplied in the parent's start message.
 * @param message The start message.
 * @returns The exact input bytes, when supplied.
 */
function suppliedInput(message: object): Uint8Array | undefined {
	return "input" in message && typeof message.input === "string"
		? Buffer.from(message.input, "base64")
		: undefined;
}

let commandInput: Uint8Array | undefined;
let startCommand!: () => void;
const started = new Promise<void>((resolve) => {
	startCommand = resolve;
});

/**
 * React to the parent's IPC commands: `start` releases the command, `release`
 * lets this owner exit once its parent has inspected the process group.
 * @param message Whatever arrived on the IPC channel.
 */
const onMessage = (message: unknown): void => {
	if (typeof message === "object" && message !== null && "kind" in message) {
		if (message.kind === "start") {
			commandInput = suppliedInput(message);
			startCommand();
		}
		if (message.kind === "release") {
			releaseOwner();
		}
	}
};
process.on("message", onMessage);
/**
 * End the detached group when its parent disappears at any stage.
 * Bun spins on closed IPC, and no parent remains to release this owner.
 */
const onDisconnect = (): void => {
	signalOwnedProcessGroup(captureDetachedProcessGroup(process.pid), "SIGKILL");
};
process.once("disconnect", onDisconnect);

/**
 * Send the command's outcome to the parent over IPC.
 * @param result The exit status, signal or spawn failure.
 */
function report(result: GitOwnerResult): void {
	if (!process.send) {
		throw new Error("Git process owner requires its Bun IPC channel.");
	}
	process.send(result);
}

const command = process.argv.slice(2);
await started;
let result: GitOwnerResult;
let output: Promise<unknown> = Promise.resolve();
try {
	const child = Bun.spawn(command, {
		stdin: commandInput === undefined ? "ignore" : new Blob([Buffer.from(commandInput)]),
		stdout: "pipe",
		stderr: "pipe",
	});
	output = Promise.all([
		forwardOutput(child.stdout, process.stdout),
		forwardOutput(child.stderr, process.stderr),
	]);
	const exitCode = await child.exited;
	result = {
		kind: "result",
		exitCode,
		...(child.signalCode === null ? {} : { signalCode: child.signalCode }),
	};
} catch (cause) {
	result = {
		kind: "result",
		spawnError: cause instanceof Error ? cause.message : String(cause),
	};
}

report(result);
await Promise.all([released, output]);
process.off("message", onMessage);
process.off("disconnect", onDisconnect);
if (process.connected) {
	if (!process.disconnect) {
		throw new Error("Git process owner cannot close its Bun IPC channel.");
	}
	process.disconnect();
}

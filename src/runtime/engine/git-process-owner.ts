interface GitOwnerResult {
	readonly kind: "result";
	readonly exitCode?: number;
	readonly signalCode?: string | number;
	readonly spawnError?: string;
}

let releaseOwner!: () => void;
const released = new Promise<void>((resolve) => {
	releaseOwner = resolve;
});
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
			startCommand();
		}
		if (message.kind === "release") {
			releaseOwner();
		}
	}
};
process.on("message", onMessage);

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
try {
	const child = Bun.spawn(command, {
		stdin: "ignore",
		stdout: "inherit",
		stderr: "inherit",
	});
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
await released;
process.off("message", onMessage);
if (process.connected) {
	if (!process.disconnect) {
		throw new Error("Git process owner cannot close its Bun IPC channel.");
	}
	process.disconnect();
}

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

process.on("message", (message: unknown) => {
	if (
		typeof message === "object" &&
		message !== null &&
		"kind" in message
	) {
		if (message.kind === "start") startCommand();
		if (message.kind === "release") releaseOwner();
	}
});

function report(result: GitOwnerResult): void {
	if (!process.send) throw new Error("Git process owner requires its Bun IPC channel.");
	process.send(result);
}

const command = process.argv.slice(2);
await started;
let child: ReturnType<typeof Bun.spawn>;
try {
	child = Bun.spawn(command, {
		stdin: "ignore",
		stdout: "inherit",
		stderr: "inherit",
	});
} catch (cause) {
	report({
		kind: "result",
		spawnError: cause instanceof Error ? cause.message : String(cause),
	});
	await released;
	process.exit(0);
}

const exitCode = await child.exited;
report({
	kind: "result",
	exitCode,
	...(child.signalCode === null ? {} : { signalCode: child.signalCode }),
});
await released;

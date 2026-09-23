interface OwnedServerRegistration {
	readonly dispose: () => Promise<void>;
	readonly disposeSync: () => void;
}

const activeServeres = new Set<OwnedServerRegistration>();
let handlersInstalled = false;
let interruptionInProgress = false;

async function disposeForSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interruptionInProgress) {
		return;
	}
	interruptionInProgress = true;
	await Promise.allSettled([...activeServeres].map(async (canvas) => canvas.dispose()));
	process.exit(signal === "SIGINT" ? 130 : 143);
}

function onSigint(): void {
	void disposeForSignal("SIGINT");
}

function onSigterm(): void {
	void disposeForSignal("SIGTERM");
}

function onExit(): void {
	for (const canvas of activeServeres) {
		canvas.disposeSync();
	}
}

function uninstallHandlers(): void {
	if (!handlersInstalled || activeServeres.size > 0) {
		return;
	}
	process.off("SIGINT", onSigint);
	process.off("SIGTERM", onSigterm);
	process.off("exit", onExit);
	handlersInstalled = false;
}

function installHandlers(): void {
	if (handlersInstalled) {
		return;
	}
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);
	process.on("exit", onExit);
	handlersInstalled = true;
}

function registerOwnedServer(registration: Readonly<OwnedServerRegistration>): void {
	activeServeres.add(registration);
	installHandlers();
}

function unregisterOwnedServer(registration: Readonly<OwnedServerRegistration>): void {
	activeServeres.delete(registration);
	uninstallHandlers();
}

export { registerOwnedServer, unregisterOwnedServer };
export type { OwnedServerRegistration };

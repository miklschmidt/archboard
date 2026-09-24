interface OwnedServerRegistration {
	readonly dispose: () => Promise<void>;
	readonly disposeSync: () => void;
}

const activeServers = new Set<OwnedServerRegistration>();
let handlersInstalled = false;
let interruptionInProgress = false;

async function disposeForSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interruptionInProgress) {
		return;
	}
	interruptionInProgress = true;
	await Promise.allSettled([...activeServers].map(async (server) => server.dispose()));
	process.exit(signal === "SIGINT" ? 130 : 143);
}

function onSigint(): void {
	void disposeForSignal("SIGINT");
}

function onSigterm(): void {
	void disposeForSignal("SIGTERM");
}

function onExit(): void {
	for (const server of activeServers) {
		server.disposeSync();
	}
}

function uninstallHandlers(): void {
	if (!handlersInstalled || activeServers.size > 0) {
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
	activeServers.add(registration);
	installHandlers();
}

function unregisterOwnedServer(registration: Readonly<OwnedServerRegistration>): void {
	activeServers.delete(registration);
	uninstallHandlers();
}

export { registerOwnedServer, unregisterOwnedServer };
export type { OwnedServerRegistration };

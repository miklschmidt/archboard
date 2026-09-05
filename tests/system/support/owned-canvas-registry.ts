interface OwnedCanvasRegistration {
	readonly dispose: () => Promise<void>;
	readonly disposeSync: () => void;
}

const activeCanvases = new Set<OwnedCanvasRegistration>();
let handlersInstalled = false;
let interruptionInProgress = false;

async function disposeForSignal(signal: "SIGINT" | "SIGTERM"): Promise<void> {
	if (interruptionInProgress) {
		return;
	}
	interruptionInProgress = true;
	await Promise.allSettled([...activeCanvases].map(async (canvas) => canvas.dispose()));
	process.exit(signal === "SIGINT" ? 130 : 143);
}

function onSigint(): void {
	void disposeForSignal("SIGINT");
}

function onSigterm(): void {
	void disposeForSignal("SIGTERM");
}

function onExit(): void {
	for (const canvas of activeCanvases) {
		canvas.disposeSync();
	}
}

function uninstallHandlers(): void {
	if (!handlersInstalled || activeCanvases.size > 0) {
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

function registerOwnedCanvas(registration: Readonly<OwnedCanvasRegistration>): void {
	activeCanvases.add(registration);
	installHandlers();
}

function unregisterOwnedCanvas(registration: Readonly<OwnedCanvasRegistration>): void {
	activeCanvases.delete(registration);
	uninstallHandlers();
}

export { registerOwnedCanvas, unregisterOwnedCanvas };
export type { OwnedCanvasRegistration };

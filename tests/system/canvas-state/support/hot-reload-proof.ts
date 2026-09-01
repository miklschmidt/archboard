import type { RawData, WebSocket } from "ws";

export const box = (label: string, x: number) => ({
	type: "rectangle",
	x,
	y: 40,
	width: 160,
	height: 80,
	label: { text: label },
	customData: { archboard: { node: label.toLowerCase(), kind: "service", name: label } },
});

interface WorkbenchResult {
	readonly type: "codex_workbench_result";
	readonly requestId: string;
	readonly ok: boolean;
	readonly value?: { readonly commandId?: unknown };
	readonly error?: string;
}

function request(socket: WebSocket, action: string): Promise<WorkbenchResult> {
	const requestId = `hot-codex-${globalThis.crypto.randomUUID()}`;
	return new Promise((resolve) => {
		const receive = (raw: RawData): void => {
			const message = JSON.parse(raw.toString()) as Partial<WorkbenchResult>;
			if (message.type !== "codex_workbench_result" || message.requestId !== requestId) return;
			socket.off("message", receive);
			resolve(message as WorkbenchResult);
		};
		socket.on("message", receive);
		socket.send(JSON.stringify({ type: "codex_workbench_request", requestId, action }));
	});
}

function requireSuccess(result: WorkbenchResult, action: string): WorkbenchResult {
	if (!result.ok) throw new Error(`Codex ${action} failed: ${result.error ?? "unknown error"}`);
	return result;
}

export async function claimCodexLease(socket: WebSocket): Promise<string> {
	requireSuccess(await request(socket, "connect"), "connect");
	const claimed = requireSuccess(await request(socket, "claimLease"), "claimLease");
	if (typeof claimed.value?.commandId !== "string")
		throw new Error("Codex claimLease returned no command id.");
	return claimed.value.commandId;
}

export async function renewCodexLease(socket: WebSocket, commandId: string): Promise<void> {
	const renewed = requireSuccess(await request(socket, "renewLease"), "renewLease");
	if (renewed.value?.commandId !== commandId)
		throw new Error("Codex renewLease changed the retained command id.");
}

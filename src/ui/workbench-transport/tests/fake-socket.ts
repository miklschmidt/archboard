import type { BrowserWorkbenchSocket } from "../index.js";

export type FakeSocketRequest = Record<string, unknown>;

export class FakeSocket extends EventTarget implements BrowserWorkbenchSocket {
	readonly sent: FakeSocketRequest[] = [];
	readyState = 1;
	onRequest: ((request: FakeSocketRequest, socket: FakeSocket) => void) | null = null;

	send(raw: string): void {
		const request = JSON.parse(raw) as FakeSocketRequest;
		this.sent.push(request);
		this.onRequest?.(request, this);
	}

	reply(request: FakeSocketRequest, value: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: true,
					value,
				}),
			}),
		);
	}

	replyFailure(request: FakeSocketRequest, error = "request rejected"): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "codex_workbench_result",
					requestId: request.requestId,
					action: request.action,
					ok: false,
					error,
				}),
			}),
		);
	}

	event(message: unknown): void {
		this.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "codex_workbench_event", message }),
			}),
		);
	}

	close(): void {
		this.readyState = 3;
		this.dispatchEvent(new Event("close"));
	}
}

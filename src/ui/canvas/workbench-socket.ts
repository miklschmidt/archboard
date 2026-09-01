import type { BrowserWorkbenchMediaOwner } from "../codex-workbench-media/index.js";
import {
	createBrowserWorkbenchTransport,
	type BrowserWorkbenchSocket,
	type BrowserWorkbenchState,
	type BrowserWorkbenchTransport,
} from "../workbench-transport/index.js";

export interface CanvasWorkbenchSocketGeneration {
	readonly socket: BrowserWorkbenchSocket;
	readonly transport: BrowserWorkbenchTransport;
}

export interface CanvasWorkbenchSocketOwner {
	readonly current: () => CanvasWorkbenchSocketGeneration | null;
	readonly attach: (socket: BrowserWorkbenchSocket) => Promise<BrowserWorkbenchState>;
	readonly detach: (socket: BrowserWorkbenchSocket) => Promise<void>;
	readonly dispose: () => Promise<void>;
}

export interface CanvasWorkbenchSocketOwnerOptions {
	readonly media: Pick<BrowserWorkbenchMediaOwner, "attach" | "detach" | "dispose">;
	readonly createTransport?: () => BrowserWorkbenchTransport;
}

interface Generation extends CanvasWorkbenchSocketGeneration {
	retired: boolean;
	cleanup: Promise<void> | null;
}

function stoppedState(reason = "No canvas workbench socket is attached."): BrowserWorkbenchState {
	return Object.freeze({
		kind: "connection",
		state: "stopped",
		connection: "stopped",
		snapshot: null,
		sequence: null,
		reason,
	}) satisfies BrowserWorkbenchState;
}

/**
 * Keep socket generation, transport generation, and media generation together.
 * The canvas session remains the only owner that can close the actual socket;
 * retiring a transport only removes its listeners and pending work.
 */
export function createCanvasWorkbenchSocketOwner(
	options: CanvasWorkbenchSocketOwnerOptions,
): CanvasWorkbenchSocketOwner {
	const createTransport = options.createTransport ?? createBrowserWorkbenchTransport;
	let active: Generation | null = null;
	let disposed = false;
	let latestAttach = 0;
	let retirement: Promise<void> = Promise.resolve();

	const state = (): BrowserWorkbenchState =>
		active?.transport.state() ??
		stoppedState(
			disposed
				? "The canvas workbench socket owner is disposed."
				: "No canvas workbench socket is attached.",
		);

	const retire = (generation: Generation): Promise<void> => {
		if (generation.retired) return generation.cleanup ?? Promise.resolve();
		generation.retired = true;
		if (active === generation) active = null;
		const cleanup = retirement.then(async () => {
			await options.media.detach(generation.transport).catch(() => undefined);
			await generation.transport.dispose().catch(() => undefined);
			return undefined;
		});
		generation.cleanup = cleanup;
		retirement = cleanup.catch(() => undefined);
		return cleanup;
	};

	const isCurrent = (generation: Generation, request: number): boolean =>
		!disposed && request === latestAttach && active === generation && !generation.retired;

	const attach = async (socket: BrowserWorkbenchSocket): Promise<BrowserWorkbenchState> => {
		const request = ++latestAttach;
		if (disposed) return stoppedState();
		const previous = active;
		if (previous?.socket === socket && !previous.retired) return previous.transport.state();
		if (previous !== null) await retire(previous);
		else await retirement;
		if (disposed || request !== latestAttach) return state();

		const generation: Generation = {
			socket,
			transport: createTransport(),
			retired: false,
			cleanup: null,
		};
		active = generation;
		try {
			await generation.transport.attach(socket);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return state();
			}
			await options.media.attach(generation.transport);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return state();
			}
			return generation.transport.state();
		} catch (error) {
			await retire(generation);
			throw error;
		}
	};

	const detach = async (socket: BrowserWorkbenchSocket): Promise<void> => {
		const generation = active;
		if (generation === null || generation.socket !== socket) return;
		++latestAttach;
		await retire(generation);
	};

	const dispose = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		++latestAttach;
		const generation = active;
		if (generation !== null) await retire(generation);
		else await retirement;
		await options.media.dispose().catch(() => undefined);
	};

	return Object.freeze({
		current: () => active,
		attach,
		detach,
		dispose,
	});
}

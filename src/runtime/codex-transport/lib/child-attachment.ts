import type { CodexTransportChild } from "@/runtime/codex-transport/lib/types";

interface ChildListenerHandlers {
	readonly onStdinError: () => void;
	readonly onStdinFinish: () => void;
	readonly onChildError: () => void;
	readonly onChildExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

interface ChildAttachment {
	/** Removes the listeners and routes later stream errors to a silent sink; idempotent. */
	readonly detach: () => void;
}

/** Anything with a destroy method: a child stream. */
interface Destroyable {
	readonly destroy: () => unknown;
}

/**
 * Swallows stream errors after the transport has detached; the process owner terminates the child.
 * @param _error The stream error.
 */
const ignoreTerminalStreamError = (_error: Error): void => {};

/**
 * Destroys a stream, ignoring a stream that refuses; the child owner terminates the process.
 * @param stream The stream.
 */
function destroyQuietly(stream: Destroyable): void {
	try {
		stream.destroy();
	} catch {
		// The child owner remains responsible for terminating the process.
	}
}

/**
 * Subscribes to the child's exit, error and stdin lifecycle events.
 * @param child The child process.
 * @param handlers What to do on each event.
 * @returns The attachment, whose detach removes the listeners once.
 */
function attachChildListeners(
	child: CodexTransportChild,
	handlers: ChildListenerHandlers,
): ChildAttachment {
	let attached = true;
	child.stdin.on("error", handlers.onStdinError);
	child.stdin.on("finish", handlers.onStdinFinish);
	child.on("error", handlers.onChildError);
	child.on("exit", handlers.onChildExit);

	/** Removes the listeners and installs the terminal error sinks; later calls do nothing. */
	const detach = (): void => {
		if (!attached) {
			return;
		}
		attached = false;
		child.removeListener("error", handlers.onChildError);
		child.removeListener("exit", handlers.onChildExit);
		child.stdin.removeListener("error", handlers.onStdinError);
		child.stdin.removeListener("finish", handlers.onStdinFinish);
		child.stdin.on("error", ignoreTerminalStreamError);
		child.stdout.on("error", ignoreTerminalStreamError);
		child.stderr.on("error", ignoreTerminalStreamError);
		child.on("error", ignoreTerminalStreamError);
	};

	return Object.freeze({ detach });
}

export { attachChildListeners, destroyQuietly };
export type { ChildAttachment, ChildListenerHandlers };

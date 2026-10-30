import { ArchitectureFeedFrameSchema, type ArchitectureFeedFrame } from "@archboard/board/model";

/** A tab's architecture socket, subscribed to one vault, read one frame at a time. */
interface ArchitectureFeed extends Disposable {
	readonly next: () => Promise<ArchitectureFeedFrame>;
}

/**
 * Open the architecture socket that a tab holds and subscribe to a vault.
 * @param base The server's address.
 * @param vault The vault.
 * @returns The feed, which closes its socket when disposed.
 */
async function openArchitectureFeed(base: string, vault: string): Promise<ArchitectureFeed> {
	const socket = new WebSocket(`${base.replace("http", "ws")}/api/architecture/events`);
	const frames: ArchitectureFeedFrame[] = [];
	const waiting: ((frame: ArchitectureFeedFrame) => void)[] = [];
	socket.addEventListener("message", (message) => {
		const frame = ArchitectureFeedFrameSchema.parse(JSON.parse(String(message.data)));
		const waiter = waiting.shift();
		if (waiter === undefined) frames.push(frame);
		else waiter(frame);
	});
	await new Promise((opened) => socket.addEventListener("open", opened));
	socket.send(JSON.stringify({ type: "subscribe", vault }));
	return {
		next: () => {
			const frame = frames.shift();
			return frame === undefined
				? new Promise((arrived) => waiting.push(arrived))
				: Promise.resolve(frame);
		},
		[Symbol.dispose]: () => socket.close(),
	};
}

export { openArchitectureFeed };

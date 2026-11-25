import { architectureFeedFrameSchema, type ArchitectureFeedFrame } from "@archboard/model/contract";

/** A tab's architecture socket, subscribed to one topic, read one frame at a time. */
interface ArchitectureFeed<Frame = ArchitectureFeedFrame> extends Disposable {
	readonly next: () => Promise<Frame>;
}

/** A tab's socket that follows the repositories of the machine. */
interface RepositoryFeed extends ArchitectureFeed<RepositoriesFrame> {
	/**
	 * Read listings until one is as the test expects.
	 * @param expected Whether a listing is the one.
	 * @returns That listing.
	 */
	readonly until: (expected: (frame: RepositoriesFrame) => boolean) => Promise<RepositoriesFrame>;
}

/** The listing of the repositories of the machine, as the feed sends it. */
type RepositoriesFrame = Extract<ArchitectureFeedFrame, { type: "repositories" }>;

/**
 * Open the architecture socket that a tab holds and subscribe to one topic.
 * @param base The server's address.
 * @param topic The vault, or the repositories of the machine.
 * @returns The feed, which closes its socket when disposed.
 */
async function openFeed(
	base: string,
	topic: { vault: string } | { topic: "repositories" },
): Promise<ArchitectureFeed> {
	const socket = new WebSocket(`${base.replace("http", "ws")}/api/architecture/events`);
	const frames: ArchitectureFeedFrame[] = [];
	const waiting: ((frame: ArchitectureFeedFrame) => void)[] = [];
	socket.addEventListener("message", (message) => {
		const frame = architectureFeedFrameSchema().parse(JSON.parse(String(message.data)));
		const waiter = waiting.shift();
		if (waiter === undefined) frames.push(frame);
		else waiter(frame);
	});
	await new Promise((opened) => socket.addEventListener("open", opened));
	socket.send(JSON.stringify({ type: "subscribe", ...topic }));
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

/**
 * Open the architecture socket that a tab holds and subscribe to a vault.
 * @param base The server's address.
 * @param vault The vault.
 * @returns The feed, which closes its socket when disposed.
 */
function openArchitectureFeed(base: string, vault: string): Promise<ArchitectureFeed> {
	return openFeed(base, { vault });
}

/**
 * Open the architecture socket that a tab holds and follow the repositories of the machine.
 * @param base The server's address.
 * @returns The feed of listings, which closes its socket when disposed.
 */
async function openRepositoryFeed(base: string): Promise<RepositoryFeed> {
	const feed = await openFeed(base, { topic: "repositories" });
	/**
	 * Read the next listing.
	 * @returns It.
	 */
	const next = async (): Promise<RepositoriesFrame> => {
		const frame = await feed.next();
		if (frame.type !== "repositories") throw new Error(`Not a listing: ${frame.type}`);
		return frame;
	};
	/**
	 * Read listings, in order, until one is as the test expects.
	 * @param expected Whether a listing is the one.
	 * @returns That listing.
	 */
	const until = async (
		expected: (frame: RepositoriesFrame) => boolean,
	): Promise<RepositoriesFrame> => {
		const frame = await next();
		return expected(frame) ? frame : until(expected);
	};
	return { next, until, [Symbol.dispose]: () => feed[Symbol.dispose]() };
}

export { openArchitectureFeed, openRepositoryFeed, type RepositoriesFrame };

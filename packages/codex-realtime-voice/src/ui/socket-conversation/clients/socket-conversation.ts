// One chat's conversation over sockets the host owns, one socket generation at a time. Each socket
// the host attaches gets a fresh transport and fresh controllers; the media owner is the
// conversation's and follows each generation. The transport attaches before the media, and the
// media detaches before the transport is disposed. Retirements run one after another, and an
// attach that a later attach, a detach or a dispose superseded publishes nothing. The host owns
// the socket: the conversation never closes it.

import { createBrowserWorkbenchMediaOwner } from "#ui/media/clients/media-owner.ts";
import type {
	BrowserWorkbenchMediaOwner,
	BrowserWorkbenchMediaOwnerOptions,
} from "#ui/media/clients/media-state.ts";
import {
	createConversationControllers,
	type ConversationControllers,
} from "#ui/conversation/state/controllers.ts";
import { createBrowserWorkbenchTransport } from "#ui/transport/clients/transport.ts";
import type {
	BrowserWorkbenchSocket,
	BrowserWorkbenchTransport,
} from "#ui/transport/state/contract.ts";

/** The conversation of one socket generation: what a page reads and the controllers it acts with. */
interface HostedConversation {
	/** The connection, readiness and last server snapshot of this generation. */
	readonly state: BrowserWorkbenchTransport["state"];
	/** The last server snapshot, or null before the first. */
	readonly snapshot: BrowserWorkbenchTransport["snapshot"];
	/** Hear every change of the state. Returns the unsubscribe. */
	readonly subscribe: BrowserWorkbenchTransport["subscribe"];
	/** Read the server's state again without repeating a command. */
	readonly refresh: BrowserWorkbenchTransport["refresh"];
	/** What can be done now. */
	readonly capabilities: BrowserWorkbenchTransport["capabilities"];
	/** The thread link and sign-in, the composer, the queue and the approvals of this generation. */
	readonly controllers: ConversationControllers;
	/** The conversation's voice, which follows each generation. */
	readonly media: BrowserWorkbenchMediaOwner;
}

/** What one chat's conversation is made with. */
interface SocketConversationOptions {
	/** The chat the conversation shows. */
	readonly chatId: string;
	/** Where the voice is played and heard, such as a recording's own audio elements. */
	readonly media?: BrowserWorkbenchMediaOwnerOptions;
}

/** One chat's conversation over the sockets the host attaches. */
interface SocketConversation {
	/**
	 * Attach a socket after the host registered it with the server, replacing the earlier one.
	 * @returns The conversation of this socket generation, or null when a later attach, a detach
	 * or a dispose superseded it.
	 * @throws {Error} When the transport or the media could not attach; the generation is retired.
	 */
	readonly attach: (socket: BrowserWorkbenchSocket) => Promise<HostedConversation | null>;
	/** Retire the generation on a socket, if it is the current one. The socket stays open. */
	readonly detach: (socket: BrowserWorkbenchSocket) => Promise<void>;
	/** The conversation of the attached socket, or null while none is attached. */
	readonly current: () => HostedConversation | null;
	/** The conversation's voice, which follows each generation. */
	readonly media: BrowserWorkbenchMediaOwner;
	/** Retire the current generation and dispose the media. The conversation attaches nothing after. */
	readonly dispose: () => Promise<void>;
}

/** What a conversation runs over: the real browser in production, doubles in tests. */
interface SocketConversationOwners {
	/** Make the transport of one socket generation. */
	readonly createTransport: () => BrowserWorkbenchTransport;
	/** The conversation's media owner. */
	readonly media: BrowserWorkbenchMediaOwner;
}

/** One socket generation, and whether it has been retired. */
interface Generation {
	readonly socket: BrowserWorkbenchSocket;
	readonly transport: BrowserWorkbenchTransport;
	readonly hosted: HostedConversation;
	/** Its bring-up, which an attach of the same socket shares. */
	up: Promise<HostedConversation | null>;
	retired: boolean;
	cleanup: Promise<void> | null;
}

/**
 * Run a cleanup step, swallowing its failure: retirement must finish.
 * @param step The step.
 */
async function quietly(step: () => Promise<unknown>): Promise<void> {
	try {
		await step();
	} catch {
		// A retiring generation's failure has nobody left to tell.
	}
}

/**
 * One chat's conversation over the owners it is given.
 * @param options The chat.
 * @param owners The transport factory and the media owner.
 * @returns The conversation.
 */
function openSocketConversation(
	options: Pick<SocketConversationOptions, "chatId">,
	owners: SocketConversationOwners,
): SocketConversation {
	const { media } = owners;
	let active: Generation | null = null;
	let published: Generation | null = null;
	let disposed = false;
	let latestAttach = 0;
	let retirement: Promise<void> = Promise.resolve();

	/**
	 * Detach a generation's media and dispose its transport, after earlier retirements.
	 * @param after The retirement already in progress.
	 * @param generation The generation.
	 */
	const cleanUpAfter = async (after: Promise<void>, generation: Generation): Promise<void> => {
		await after;
		await quietly(() => media.detach(generation.transport));
		await quietly(() => generation.transport.dispose());
	};

	/**
	 * Retire a generation once, after any retirement already in progress.
	 * @param generation The generation.
	 * @returns Settles when its media and transport are gone.
	 */
	const retire = (generation: Generation): Promise<void> => {
		if (generation.retired) return generation.cleanup ?? Promise.resolve();
		generation.retired = true;
		if (active === generation) active = null;
		if (published === generation) published = null;
		const cleanup = cleanUpAfter(retirement, generation);
		generation.cleanup = cleanup;
		retirement = quietly(() => cleanup);
		return cleanup;
	};

	/**
	 * Whether a generation is still the one an attach request is for.
	 * @param generation The generation.
	 * @param request The attach request number.
	 * @returns True while nothing has superseded it.
	 */
	const isCurrent = (generation: Generation, request: number): boolean =>
		!disposed && request === latestAttach && active === generation && !generation.retired;

	/**
	 * Attach a fresh generation's transport, then its media, retiring it if superseded.
	 * @param generation The generation.
	 * @param request The attach request number.
	 * @returns Its conversation, or null when superseded.
	 */
	const bringUp = async (
		generation: Generation,
		request: number,
	): Promise<HostedConversation | null> => {
		try {
			await generation.transport.attach(generation.socket);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return null;
			}
			await media.attach(generation.transport);
			if (!isCurrent(generation, request)) {
				await retire(generation);
				return null;
			}
			published = generation;
			return generation.hosted;
		} catch (error) {
			await retire(generation);
			throw error;
		}
	};

	/**
	 * A fresh generation on a socket: its transport, and the conversation over it.
	 * @param socket The socket.
	 * @returns The generation.
	 */
	const generationOn = (socket: BrowserWorkbenchSocket): Generation => {
		const transport = owners.createTransport();
		const hosted: HostedConversation = Object.freeze({
			state: transport.state,
			snapshot: transport.snapshot,
			subscribe: transport.subscribe,
			refresh: transport.refresh,
			capabilities: transport.capabilities,
			controllers: createConversationControllers({ chatId: options.chatId, transport }),
			media,
		});
		return { socket, transport, hosted, up: Promise.resolve(null), retired: false, cleanup: null };
	};

	return Object.freeze({
		/**
		 * Attach a socket, replacing the earlier generation.
		 * @param socket The socket.
		 * @returns The generation's conversation, or null when superseded.
		 */
		attach: async (socket: BrowserWorkbenchSocket) => {
			if (disposed) return null;
			const previous = active;
			if (previous?.socket === socket && !previous.retired) return previous.up;
			const request = ++latestAttach;
			await (previous === null ? retirement : retire(previous));
			if (disposed || request !== latestAttach) return null;
			const generation = generationOn(socket);
			active = generation;
			generation.up = bringUp(generation, request);
			return generation.up;
		},
		/**
		 * Retire the generation on a socket, if it is the current one.
		 * @param socket The socket.
		 */
		detach: async (socket: BrowserWorkbenchSocket) => {
			const generation = active;
			if (generation === null || generation.socket !== socket) return;
			++latestAttach;
			await retire(generation);
		},
		/**
		 * The conversation of the attached socket.
		 * @returns It, or null.
		 */
		current: () => published?.hosted ?? null,
		media,
		/** Retire everything and dispose the media owner. */
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			++latestAttach;
			const generation = active;
			await (generation === null ? retirement : retire(generation));
			await quietly(() => media.dispose());
		},
	});
}

/**
 * Make one chat's conversation over the sockets a host owns, as a page that multiplexes the voice
 * frames on a socket of its own does. Attach each socket after the server registered it.
 * @param options The chat, and where its voice is played and heard.
 * @returns The conversation.
 */
function createSocketConversation(options: SocketConversationOptions): SocketConversation {
	return openSocketConversation(options, {
		createTransport: createBrowserWorkbenchTransport,
		media: createBrowserWorkbenchMediaOwner(options.media),
	});
}

export {
	createSocketConversation,
	openSocketConversation,
	type HostedConversation,
	type SocketConversation,
	type SocketConversationOptions,
};

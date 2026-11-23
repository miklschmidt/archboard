// The repositories of this machine, as the tab holds them, and the one choice a person makes
// about them from the page: which checkout of a repository this machine reads (ADR 0050).
//
// The tab keeps a mirror of the listing that the server sends over the architecture feed. The
// server sends it when the tab starts to follow, again after every reconnect, and whenever the
// listing changes, whoever changed it. So nothing here reads the listing again, and no caller
// says when it is stale. A choice is answered with the listing, which goes into the mirror at
// once, so the page that chose can open what it chose without a wait for the feed.

import type { QueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import {
	repositoryListingSchema,
	type checkoutChoiceSchema,
} from "@archboard/workspace/repositories";
import { requestJson } from "@archboard/server-requests";
import { feedSocket } from "#ui/architecture-drawing/model-reader/access/clients/feed-socket.ts";

/** The listing as the server publishes it. */
type Listing = z.infer<ReturnType<typeof repositoryListingSchema>>;

/** What a tab knows of the repositories of this machine. */
interface Repositories {
	/** The repositories, once the server has sent them. */
	readonly repositories?: Listing["repositories"];
	/** Why there are none to show, while the server cannot send them. */
	readonly error: string | null;
	/** The server has not answered yet. */
	readonly loading: boolean;
}

/** What a page says while it has no listing and the server does not answer. */
const UNREACHABLE =
	"The Archboard server does not answer, so this page cannot list the repositories of this machine. It keeps trying.";

/** One mirror per query cache: the tab's. */
const mirrors = new WeakMap<QueryClient, ReturnType<typeof createMirror>>();

/**
 * The listing of one tab, followed while anything reads it.
 *
 * A server counts its listings, so the mirror keeps the newest of the answers and frames it gets:
 * two tabs that choose at once each get the answer to their own choice and the frame of the
 * other, in either order. A restarted server counts from zero again, so the revision resets
 * when the feed drops. From then on both answers and frames can advance it.
 * @param client The tab's query cache, whose feed socket carries the listing.
 * @returns The mirror.
 */
function createMirror(client: QueryClient) {
	const readers = new Set<() => void>();
	let state: Repositories = { error: null, loading: true };
	let order = { revision: -1 };
	let stopFollowing: (() => void) | null = null;
	/**
	 * Show what the mirror holds now.
	 * @param next It.
	 */
	function show(next: Repositories): void {
		state = next;
		for (const reader of readers) reader();
	}
	/**
	 * Keep the most recent listing, whether it came from the feed or a checkout answer.
	 * @param listing The listing.
	 */
	function take(listing: Pick<Listing, "revision" | "repositories">): void {
		if (listing.revision < order.revision) return;
		order.revision = listing.revision;
		show({ repositories: listing.repositories, error: null, loading: false });
	}
	/**
	 * A page with no listing says why. A dropped feed can reconnect to a restarted server.
	 * @param disconnected Whether the socket closed.
	 */
	function lost(disconnected: boolean): void {
		if (disconnected) order = { revision: -1 };
		if (state.repositories === undefined) show({ error: UNREACHABLE, loading: false });
	}
	return {
		/**
		 * Read the mirror while a reader stays, and follow the feed while any does.
		 * @param reader What hears each change.
		 * @returns The function that stops reading.
		 */
		subscribe: (reader: () => void): (() => void) => {
			readers.add(reader);
			stopFollowing ??= feedSocket(client).followRepositories({ event: take, lost });
			return () => {
				readers.delete(reader);
				if (readers.size > 0) return;
				stopFollowing?.();
				stopFollowing = null;
				order = { revision: -1 };
			};
		},
		/**
		 * What the mirror holds.
		 * @returns It.
		 */
		read: (): Repositories => state,
		/**
		 * Capture the listing order before a choice goes to the server.
		 * @returns How to accept the answer while that order still applies.
		 */
		beginChoice: (): ((listing: Listing) => void) => {
			const requested = order;
			return (listing) => {
				if (order === requested) take(listing);
			};
		},
	};
}

/**
 * The repositories of a tab, as a store that React reads, made when it is first read.
 * @param client The tab's query cache.
 * @returns Its mirror of the listing.
 */
function repositoryMirror(client: QueryClient): ReturnType<typeof createMirror> {
	let mirror = mirrors.get(client);
	if (mirror === undefined) {
		mirror = createMirror(client);
		mirrors.set(client, mirror);
	}
	return mirror;
}

/**
 * Choose the checkout of a repository that this machine reads. Every tab is sent the listing
 * that follows. This tab also accepts the answer immediately while its feed order still applies.
 * @param client The tab's query cache.
 * @param choice The repository and one of its known checkouts.
 * @returns Once the server has acknowledged the chosen checkout.
 * @throws {Error} When the server refuses, or answers with no listing.
 */
async function chooseCheckout(
	client: QueryClient,
	choice: z.infer<ReturnType<typeof checkoutChoiceSchema>>,
): Promise<void> {
	const answered = repositoryMirror(client).beginChoice();
	const answer = repositoryListingSchema().safeParse(
		await requestJson<unknown>("/api/repositories/chosen", { method: "PUT", payload: choice }),
	);
	if (!answer.success) {
		throw new Error("The Archboard server chose the checkout but did not list the repositories.");
	}
	answered(answer.data);
}

export { chooseCheckout, repositoryMirror, type Repositories };

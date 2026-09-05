import { expect, test } from "bun:test";

import {
	createWorkbenchTransportPublication,
	type WorkbenchTransportPublication,
} from "@/ui/canvas/workbench-publication";

/** A transport stands in for the real one; only identity matters here. */
interface FakeTransport {
	readonly name: string;
}

const FIRST: FakeTransport = { name: "first" };
const SECOND: FakeTransport = { name: "second" };

/**
 * A publisher over a switchable current transport, recording the order in
 * which a text listener and a voice-owner listener hear about it.
 */
class Harness {
	current: FakeTransport | null = FIRST;
	readonly lifecycle: string[] = [];
	readonly publications: (FakeTransport | null)[] = [];
	readonly publication: WorkbenchTransportPublication<FakeTransport>;
	#owned: FakeTransport | null = null;

	/** Wire the publisher to this harness's listeners. */
	constructor() {
		this.publication = createWorkbenchTransportPublication<FakeTransport>({
			current: this.currentTransport.bind(this),
			listener: {
				replacing: this.replacing.bind(this),
				publish: this.publish.bind(this),
				settled: this.settled.bind(this),
			},
		});
	}

	/**
	 * The transport the pane holds now.
	 * @returns The transport, or null.
	 */
	currentTransport(): FakeTransport | null {
		return this.current;
	}

	/**
	 * A voice owner bound to another transport retires before the clear.
	 * @param next The transport about to be published.
	 */
	replacing(next: FakeTransport): void {
		if (this.#owned !== null && this.#owned !== next) {
			this.lifecycle.push("voice:null", `dispose:${this.#owned.name}`);
			this.#owned = null;
		}
	}

	/**
	 * The text workbench hears the publication.
	 * @param transport The transport, or null.
	 */
	publish(transport: FakeTransport | null): void {
		this.lifecycle.push(`text:${transport?.name ?? "null"}`);
		this.publications.push(transport);
	}

	/**
	 * A voice owner is created once per transport and refreshed otherwise.
	 * @param transport The transport now current, or null.
	 */
	settled(transport: FakeTransport | null): void {
		if (transport !== null && this.#owned === null) {
			this.#owned = transport;
			this.lifecycle.push(`create:${transport.name}`, `voice:${transport.name}`);
		} else {
			this.lifecycle.push("evidence");
		}
	}
}

test("publishes each transport once, clears before replacement, and clears on dispose", () => {
	const pane = new Harness();
	const { publication } = pane;

	publication.reconcile();
	publication.reconcile();
	expect(pane.publications).toEqual([FIRST]);
	expect(publication.published()).toBe(FIRST);
	expect(pane.lifecycle).toEqual(["text:first", "create:first", "voice:first", "evidence"]);

	// A socket generation between transports clears the publication; the voice
	// owner survives it, so a reconnection needs no new session.
	pane.current = null;
	publication.reconcile();
	expect(pane.publications.at(-1)).toBeNull();
	expect(pane.lifecycle.slice(-2)).toEqual(["text:null", "evidence"]);
	expect(pane.lifecycle).not.toContain("dispose:first");

	pane.current = FIRST;
	publication.reconcile();
	expect(pane.publications.at(-1)).toBe(FIRST);
	expect(pane.lifecycle.slice(-2)).toEqual(["text:first", "evidence"]);
	expect(pane.lifecycle.filter((entry) => entry === "create:first")).toHaveLength(1);

	// A replacement retires the old voice owner, clears, publishes, then creates.
	pane.current = SECOND;
	publication.reconcile();
	expect(pane.lifecycle.slice(pane.lifecycle.lastIndexOf("voice:null"))).toEqual([
		"voice:null",
		"dispose:first",
		"text:null",
		"text:second",
		"create:second",
		"voice:second",
	]);

	publication.dispose();
	expect(pane.publications.at(-1)).toBeNull();
	expect(publication.published()).toBeNull();
	expect(pane.lifecycle.at(-1)).toBe("text:null");
});

test("a replacement straight from one transport to another never shows two at once", () => {
	const pane = new Harness();
	const { publication } = pane;
	publication.reconcile();
	pane.current = SECOND;
	publication.reconcile();
	expect(pane.publications).toEqual([FIRST, null, SECOND]);
	publication.dispose();
	publication.dispose();
	expect(pane.publications).toEqual([FIRST, null, SECOND, null]);
});

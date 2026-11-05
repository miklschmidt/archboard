// The talk relay: a conversation with the Codex voice plays in order. Your words and the voice's
// arrive word by word in the voice box, and the product's orb moves with the voice's words. Each
// thread's lines type out in its panel, and the panel at work rises from the trough. Every step
// runs on the page's visible time, so the conversation waits while the relay is off screen, and
// Talk and Pause hold it. With reduced motion, the whole conversation stands at once.

import { animate, prefersReducedMotion, whileVisible } from "./reveal";
import { typeLine } from "./type-line";
import { mountVoiceOrb, sayWord, wordLevel, type OrbMode, type SpokenWord } from "./voice-orb";

/** The product's word for each stage of the voice (packages/workbench/src/ui/rules/dock/circle-state.ts). */
const VOICE_WORDS: Partial<Record<OrbMode, string>> = {
	starting: "Starting",
	listening: "Listening",
	speaking: "Speaking",
};

/** How long the voice takes to connect before your first word, in milliseconds. */
const CONNECT = 500;

/** How long each kind of line waits after the line before it, in milliseconds. */
const GAP: Record<string, number> = { said: 450, relay: 300, command: 250, reply: 500 };

/** Your words come a little faster than the voice's. */
const YOUR_PACE = 0.8;

/**
 * Play the relay's conversation once it comes on screen.
 * @param root The relay.
 */
export function mountTalkRelay(root: HTMLElement): void {
	const orb = root.querySelector<HTMLCanvasElement>("[data-orb]");
	const state = root.querySelector<HTMLElement>("[data-voice-state]");
	const talk = root.querySelector<HTMLButtonElement>("[data-talk]");
	const panels = [...root.querySelectorAll<HTMLElement>("[data-thread-panel]")];
	const lines = [...root.querySelectorAll<HTMLElement>("[data-talk-line]")].sort(
		(a, b) => Number(a.dataset["order"]) - Number(b.dataset["order"]),
	);
	if (!orb || !state || !talk) return;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

	let mode: OrbMode = "listening";
	let word: SpokenWord | null = null;
	let speechTime = 0;
	const wakeOrb = mountVoiceOrb(orb, {
		mode: () => mode,
		level: () => wordLevel(word, speechTime),
	});
	const setMode = (next: OrbMode) => {
		mode = next;
		word = null;
		state.textContent = VOICE_WORDS[next] ?? "";
		wakeOrb();
	};
	const work = (thread: string | undefined) => {
		for (const panel of panels)
			panel.classList.toggle("is-working", panel.dataset["threadPanel"] === thread);
	};

	/** Show a line whole, as it stands once it was said or typed. */
	const finish = (line: HTMLElement) => {
		line.classList.remove("is-pending", "is-typing");
		line.style.minHeight = "";
		const text = line.querySelector<HTMLElement>(".text");
		if (text) text.textContent = line.dataset["text"] ?? "";
	};

	/** Say a line word by word, at the pace of speech. */
	const say = async (line: HTMLElement, signal: AbortSignal) => {
		const text = line.querySelector<HTMLElement>(".text");
		if (!text) return;
		const voice = line.dataset["who"] === "voice";
		work(undefined);
		setMode(voice ? "speaking" : "listening");
		const spans = (line.dataset["text"] ?? "").split(" ").map((part) => {
			const span = document.createElement("span");
			span.className = "w";
			span.textContent = part;
			return span;
		});
		text.replaceChildren(
			...spans.flatMap((span, at) => (at === 0 ? [span] : [document.createTextNode(" "), span])),
		);
		line.classList.remove("is-pending");
		const starts: number[] = [];
		let total = 0;
		for (const span of spans) {
			starts.push(total);
			total += sayWord(span.textContent ?? "", 0).ms * (voice ? 1 : YOUR_PACE);
		}
		let said = 0;
		await animate(
			root,
			total,
			(progress) => {
				speechTime = progress * total;
				while (said < spans.length && (starts[said] ?? Infinity) <= speechTime) {
					const span = spans[said];
					span?.classList.add("is-said");
					if (voice && span) word = sayWord(span.textContent ?? "", starts[said] ?? 0).word;
					said += 1;
				}
			},
			signal,
		);
		word = null;
	};

	/** Type a thread's line in its panel, which rises while it works. */
	const type = async (line: HTMLElement, signal: AbortSignal) => {
		work(line.dataset["thread"]);
		setMode("listening");
		// A command types from nothing: its line keeps the height it will have, so nothing moves.
		line.style.minHeight = `${line.getBoundingClientRect().height}px`;
		await typeLine(line, root, signal);
		line.style.minHeight = "";
	};

	let next = 0;
	let controller: AbortController | undefined;
	const setPlaying = (playing: boolean) => {
		talk.setAttribute("aria-pressed", String(playing));
	};

	const play = async () => {
		if (controller || motion.matches) return;
		controller = new AbortController();
		const { signal } = controller;
		setPlaying(true);
		try {
			if (next === 0) {
				for (const line of lines) line.classList.add("is-pending");
				setMode("starting");
				await animate(root, CONNECT, () => {}, signal);
			}
			for (; next < lines.length; next += 1) {
				const line = lines[next];
				if (!line) continue;
				await animate(root, GAP[line.dataset["kind"] ?? ""] ?? 300, () => {}, signal);
				if (line.dataset["kind"] === "said") await say(line, signal);
				else await type(line, signal);
			}
			next = 0;
			work(undefined);
			setMode("listening");
		} catch (error) {
			if (!signal.aborted) throw error;
		} finally {
			controller = undefined;
			setPlaying(false);
		}
	};

	/** Hold the conversation: the line under way starts again when it resumes. */
	const pause = () => {
		controller?.abort();
		work(undefined);
		setMode("listening");
	};

	// With reduced motion, the whole conversation stands at once and nothing plays.
	const settle = () => {
		talk.hidden = motion.matches;
		if (!motion.matches) return;
		controller?.abort();
		next = 0;
		for (const line of lines) finish(line);
		work(undefined);
		setMode("listening");
	};
	motion.addEventListener("change", settle);
	settle();

	talk.addEventListener("click", () => {
		if (controller) pause();
		else void play();
	});

	// The conversation starts once, as the relay first comes on screen.
	let started = false;
	whileVisible(root, (visible) => {
		if (!visible || started || prefersReducedMotion()) return;
		started = true;
		void play();
	});
	if (!motion.matches) for (const line of lines) line.classList.add("is-pending");
}

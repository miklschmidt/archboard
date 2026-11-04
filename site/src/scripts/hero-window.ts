// The hero's window: it scales to its column, it leans back while part of it is below the fold
// and stands straight once all of it is in view, and its drawing builds itself while the agent's
// commands type out. The cards wait as faint outlines, so the window is never empty; they land
// when the agent maps them, then a spark draws each line, then the traffic runs, as the product
// draws a picture (DESIGN.md, the Spark Rule). With reduced motion, everything is there at once.

import { animate } from "./reveal";
import { sparkLine } from "./spark";

/** How far the window leans back while it enters the viewport, in degrees. */
const TILT = 12;
/** How faint a card is before the agent maps it. */
const WAITING = 0.16;

interface Parts {
	svg: SVGSVGElement;
	nodes: SVGGElement[];
	shadows: SVGGElement[];
	/** The shadows each card or label casts, by its subject. */
	shadowsOf: Map<string, SVGGElement[]>;
	edges: SVGGElement[];
	labels: Map<string, SVGGElement>;
	traffic: SVGGElement[];
}

/**
 * Find the parts of the inline drawing.
 * @param svg The drawing.
 * @returns Its cards, shadows, lines, labels and traffic.
 */
function partsOf(svg: SVGSVGElement): Parts {
	const all = <T extends Element>(selector: string) => [...svg.querySelectorAll<T>(selector)];
	const labels = new Map<string, SVGGElement>();
	for (const label of all<SVGGElement>(
		'g[data-semantic-kind="edge"][data-semantic-part="label"]',
	)) {
		labels.set(label.dataset["semanticId"] ?? "", label);
	}
	const shadows = all<SVGGElement>(":scope > g.ab-shadow");
	const shadowsOf = new Map<string, SVGGElement[]>();
	for (const shadow of shadows) {
		for (const member of (shadow.dataset["members"] ?? "").split(" ")) {
			shadowsOf.set(member, [...(shadowsOf.get(member) ?? []), shadow]);
		}
	}
	return {
		svg,
		nodes: all<SVGGElement>('g[data-semantic-kind="node"]'),
		shadows,
		shadowsOf,
		edges: all<SVGGElement>('g[data-semantic-kind="edge"]:not([data-semantic-part])'),
		labels,
		traffic: all<SVGGElement>(":scope > g[data-traffic]"),
	};
}

/**
 * Show or hide a part with a transition.
 * @param element The part.
 * @param shown Whether it shows.
 * @param ms The transition's length.
 */
function setShown(element: SVGElement | HTMLElement, shown: boolean, ms = 420): void {
	element.style.transition = `opacity ${ms}ms cubic-bezier(0.16, 1, 0.3, 1), translate ${ms}ms cubic-bezier(0.16, 1, 0.3, 1)`;
	element.style.opacity = shown ? "1" : "0";
	element.style.translate = shown ? "0 0" : "0 -6px";
}

/**
 * Show a card as a faint outline that waits for the agent.
 * @param element The card.
 */
function setWaiting(element: SVGElement): void {
	element.style.transition = "none";
	element.style.opacity = String(WAITING);
	element.style.translate = "0 0";
}

/** Type one dock line on visible time. */
async function typeLine(
	line: HTMLElement,
	stage: HTMLElement,
	signal: AbortSignal,
): Promise<number> {
	const text = line.querySelector<HTMLElement>(".text");
	const full = line.dataset["text"] ?? "";
	line.classList.remove("is-pending");
	if (!text) return 0;
	if (!line.classList.contains("is-command")) {
		text.textContent = full;
		return 0;
	}
	line.classList.add("is-typing");
	const duration = full.length * 14;
	try {
		await animate(
			stage,
			duration,
			(progress) => {
				text.textContent = full.slice(0, Math.ceil(full.length * progress));
			},
			signal,
		);
		await animate(stage, 180, () => {}, signal);
	} finally {
		line.classList.remove("is-typing");
	}
	return duration + 180;
}

/** Set up the hero window, if the page has one. */
export function mountHeroWindow(): void {
	const playback = document.querySelector<HTMLElement>("[data-hero-playback]");
	const stage = document.querySelector<HTMLElement>("[data-window-stage]");
	const tilt = document.querySelector<HTMLElement>("[data-window-tilt]");
	const frame = document.querySelector<HTMLElement>("[data-window]");
	const svg = frame?.querySelector<SVGSVGElement>("[data-picture] svg");
	const replay = document.querySelector<HTMLButtonElement>("[data-replay]");
	if (!playback || !stage || !tilt || !frame || !svg || !replay) return;
	const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const controller = new AbortController();
	const { signal } = controller;
	const wait = (ms: number) => animate(playback, ms, () => {}, signal);

	// The window keeps its laid-out width (narrower on a phone, where only the canvas shows) and
	// scales to the stage.
	const fit = () =>
		stage.style.setProperty("--scale", String(stage.clientWidth / frame.offsetWidth));
	new ResizeObserver(fit).observe(stage);
	fit();

	// How much of the window is in view from below: none at the fold, all once its bottom edge is
	// on screen. A window that the viewport holds whole is straight.
	const lean = () => {
		const box = stage.getBoundingClientRect();
		const progress = Math.min(1, Math.max(0, (window.innerHeight - box.top) / box.height));
		tilt.style.setProperty(
			"--tilt",
			`${(motion.matches ? 0 : TILT * (1 - progress)).toFixed(2)}deg`,
		);
	};
	lean();
	window.addEventListener("scroll", lean, { passive: true });
	window.addEventListener("resize", lean);

	const parts = partsOf(svg);
	const lines = [...playback.querySelectorAll<HTMLElement>("[data-dock] [data-line]")];

	const reset = () => {
		frame.removeAttribute("data-claimed");
		for (const node of parts.nodes) setWaiting(node);
		for (const shadow of parts.shadows) setShown(shadow, false, 0);
		for (const edge of parts.edges) setShown(edge, false, 0);
		for (const label of parts.labels.values()) setShown(label, false, 0);
		for (const traffic of parts.traffic) setShown(traffic, false, 0);
		for (const line of lines) {
			line.classList.add("is-pending");
			line.classList.remove("is-typing");
			const text = line.querySelector<HTMLElement>(".text");
			if (text) text.textContent = "";
		}
	};

	const cue = async (name: string | undefined) => {
		signal.throwIfAborted();
		if (name === "claim") frame.setAttribute("data-claimed", "");
		if (name === "release") frame.removeAttribute("data-claimed");
		// A card or a label lands with the shadow it casts.
		const land = (id: string, part: SVGGElement, ms: number) => {
			setShown(part, true, ms);
			for (const shadow of parts.shadowsOf.get(id) ?? []) setShown(shadow, true, ms);
		};
		if (name === "cards") {
			await Promise.all(
				parts.nodes.map(async (node, index) => {
					await wait(200 + index * 150);
					land(node.dataset["semanticId"] ?? "", node, 520);
					await wait(520);
				}),
			);
			return 200 + Math.max(0, parts.nodes.length - 1) * 150 + 520;
		}
		if (name === "lines") {
			await Promise.all(
				parts.edges.map(async (edge, index) => {
					await wait(index * 170);
					await sparkLine(edge, playback, 760, signal);
					const id = edge.dataset["semanticId"] ?? "";
					const label = parts.labels.get(id);
					if (label) land(id, label, 360);
					await wait(360);
				}),
			);
			return Math.max(0, parts.edges.length - 1) * 170 + 760 + 360;
		}
		if (name === "show") {
			for (const traffic of parts.traffic) setShown(traffic, true, 900);
		}
		return 0;
	};

	let playing = false;
	const play = async () => {
		// The hidden replay button can still receive an already-queued click.
		if (playing || motion.matches || signal.aborted) return;
		playing = true;
		replay.hidden = true;
		replay.classList.remove("is-shown");
		reset();
		try {
			let elapsed = 0;
			// The desktop and mobile docks contain copies of the same lines.
			const byTime = new Map<number, HTMLElement[]>();
			for (const line of lines) {
				const at = Number(line.dataset["at"] ?? 0);
				byTime.set(at, [...(byTime.get(at) ?? []), line]);
			}
			for (const [at, group] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
				await wait(Math.max(0, at - elapsed));
				elapsed = Math.max(at, elapsed);
				const durations = await Promise.all(group.map((line) => typeLine(line, playback, signal)));
				elapsed += Math.max(...durations);
				elapsed += await cue(group[0]?.dataset["cue"]);
			}

			await wait(2200);
			replay.hidden = false;
			replay.classList.add("is-shown");
		} catch (error) {
			if (!signal.aborted) throw error;
		} finally {
			playing = false;
		}
	};

	const showAll = () => {
		if (!motion.matches) return;
		controller.abort();
		frame.removeAttribute("data-claimed");
		for (const part of [
			...parts.nodes,
			...parts.shadows,
			...parts.edges,
			...parts.labels.values(),
			...parts.traffic,
		]) {
			setShown(part, true, 0);
		}
		for (const line of lines) {
			line.classList.remove("is-pending", "is-typing");
			const text = line.querySelector<HTMLElement>(".text");
			if (text) text.textContent = line.dataset["text"] ?? "";
		}
		replay.hidden = true;
		lean();
	};
	motion.addEventListener("change", showAll);
	if (motion.matches) {
		showAll();
		return;
	}

	reset();
	replay.addEventListener("click", () => void play());
	void document.fonts.ready.then(async () => {
		try {
			await wait(350);
			await play();
		} catch (error) {
			if (!signal.aborted) throw error;
		}
	});
}

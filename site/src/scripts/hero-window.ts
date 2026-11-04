// The hero's window: it scales to its column, it lies tilted on the table and stands up as the
// page scrolls, and its drawing builds itself while the agent's commands type out. The cards wait
// as faint outlines, so the window is never empty; they land when the agent maps them, then a
// spark draws each line, then the traffic runs, as the product draws a picture (DESIGN.md, the
// Spark Rule). With reduced motion, everything is there at once.

import { prefersReducedMotion } from "./reveal";
import { sparkLine } from "./spark";

const TILT = 16;
/** How faint a card is before the agent maps it. */
const WAITING = 0.16;

/** Wait a number of milliseconds. */
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

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

/**
 * Type one dock line, character by character.
 * @param line The line.
 * @param still Whether to skip the typing.
 */
async function typeLine(line: HTMLElement, still: boolean): Promise<void> {
	const text = line.querySelector<HTMLElement>(".text");
	const full = line.dataset["text"] ?? "";
	line.classList.remove("is-pending");
	if (!text || still) return;
	if (!line.classList.contains("is-command")) {
		text.textContent = full;
		return;
	}
	line.classList.add("is-typing");
	const step = 14;
	for (let index = 1; index <= full.length; index++) {
		text.textContent = full.slice(0, index);
		await wait(step);
	}
	await wait(180);
	line.classList.remove("is-typing");
}

/** Set up the hero window, if the page has one. */
export function mountHeroWindow(): void {
	const stage = document.querySelector<HTMLElement>("[data-window-stage]");
	const tilt = document.querySelector<HTMLElement>("[data-window-tilt]");
	const frame = document.querySelector<HTMLElement>("[data-window]");
	const svg = frame?.querySelector<SVGSVGElement>("[data-picture] svg");
	const replay = document.querySelector<HTMLButtonElement>("[data-replay]");
	if (!stage || !tilt || !frame || !svg || !replay) return;
	const still = prefersReducedMotion();

	// The window keeps its laid-out width (narrower on a phone, where only the canvas shows) and
	// scales to the stage.
	const fit = () =>
		stage.style.setProperty("--scale", String(stage.clientWidth / frame.offsetWidth));
	new ResizeObserver(fit).observe(stage);
	fit();

	if (!still) {
		const lean = () => {
			const box = stage.getBoundingClientRect();
			const progress = Math.min(1, Math.max(0, 1 - box.top / (window.innerHeight * 0.9)));
			tilt.style.setProperty("--tilt", `${(TILT * (1 - progress)).toFixed(2)}deg`);
		};
		lean();
		window.addEventListener("scroll", lean, { passive: true });
		window.addEventListener("resize", lean);
	}

	const parts = partsOf(svg);
	const lines = [...document.querySelectorAll<HTMLElement>("[data-dock] [data-line]")];

	const reset = () => {
		frame.removeAttribute("data-claimed");
		for (const node of parts.nodes) setWaiting(node);
		for (const shadow of parts.shadows) setShown(shadow, false, 0);
		for (const edge of parts.edges) setShown(edge, false, 0);
		for (const label of parts.labels.values()) setShown(label, false, 0);
		for (const traffic of parts.traffic) setShown(traffic, false, 0);
		for (const line of lines) {
			line.classList.add("is-pending");
			const text = line.querySelector<HTMLElement>(".text");
			if (text) text.textContent = "";
		}
	};

	const cue = async (name: string | undefined) => {
		if (name === "claim") frame.setAttribute("data-claimed", "");
		if (name === "release") frame.removeAttribute("data-claimed");
		// A card or a label lands with the shadow it casts.
		const land = (id: string, part: SVGGElement, ms: number) => {
			setShown(part, true, ms);
			for (const shadow of parts.shadowsOf.get(id) ?? []) setShown(shadow, true, ms);
		};
		if (name === "cards") {
			parts.nodes.forEach((node, index) =>
				setTimeout(() => land(node.dataset["semanticId"] ?? "", node, 520), 200 + index * 150),
			);
		}
		if (name === "lines") {
			parts.edges.forEach((edge, index) =>
				setTimeout(async () => {
					await sparkLine(edge, 760);
					const id = edge.dataset["semanticId"] ?? "";
					const label = parts.labels.get(id);
					if (label) land(id, label, 360);
				}, index * 170),
			);
		}
		if (name === "show") {
			for (const traffic of parts.traffic) setShown(traffic, true, 900);
		}
	};

	let run = 0;
	const play = async () => {
		const mine = ++run;
		replay.hidden = true;
		replay.classList.remove("is-shown");
		reset();
		const start = performance.now();
		const byTime = new Map<number, HTMLElement[]>();
		for (const line of lines) {
			const at = Number(line.dataset["at"] ?? 0);
			byTime.set(at, [...(byTime.get(at) ?? []), line]);
		}
		for (const [at, group] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
			await wait(Math.max(0, at - (performance.now() - start)));
			if (mine !== run) return;
			await Promise.all(group.map((line) => typeLine(line, false)));
			if (mine !== run) return;
			void cue(group[0]?.dataset["cue"]);
		}
		await wait(2200);
		if (mine !== run) return;
		replay.hidden = false;
		requestAnimationFrame(() => replay.classList.add("is-shown"));
	};

	if (still) {
		for (const line of lines) void typeLine(line, true);
		return;
	}

	reset();
	replay.addEventListener("click", () => void play());
	const begin = () => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void play();
			},
			{ threshold: 0 },
		);
		observer.observe(stage);
	};
	void document.fonts.ready.then(() => setTimeout(begin, 350));
}

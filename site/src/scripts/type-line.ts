// A line of an agent's log as it arrives: a command types out a character at a time, on the
// page's visible time, and any other line shows at once. The hero window's dock and the talk
// relay's threads type the same way.

import { animate } from "./reveal";

/** Type one dock line on visible time. */
export async function typeLine(
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

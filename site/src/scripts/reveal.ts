// Sections ease in once as they enter the view. Without script, or with reduced motion,
// everything is simply there.

/** Mark each [data-reveal] element when it first enters the view. */
export function observeReveals(): void {
	const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
	if (!("IntersectionObserver" in window)) {
		items.forEach((item) => item.classList.add("is-in"));
		return;
	}
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add("is-in");
				observer.unobserve(entry.target);
			}
		},
		{ rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
	);
	items.forEach((item) => observer.observe(item));
}

/** Whether the reader asked for less motion. */
export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Run a callback while an element is on screen, and pause it while it is not or while the tab is
 * hidden.
 * @param element The element to watch.
 * @param onChange Called with true when it should run and false when it should pause.
 * @returns Stops watching the element and the tab.
 */
export function whileVisible(element: Element, onChange: (visible: boolean) => void): () => void {
	let onScreen = false;
	let previous: boolean | undefined;
	const update = () => {
		const visible = onScreen && document.visibilityState === "visible";
		if (visible === previous) return;
		previous = visible;
		onChange(visible);
	};
	const observer = new IntersectionObserver((entries) => {
		onScreen = entries.at(-1)?.isIntersecting ?? false;
		update();
	});
	observer.observe(element);
	document.addEventListener("visibilitychange", update);
	update();
	return () => {
		observer.disconnect();
		document.removeEventListener("visibilitychange", update);
	};
}

/** Run a finite animation on visible time, or finish it at once with reduced motion. */
export function animate(
	element: Element,
	ms: number,
	draw: (progress: number) => void,
	signal: AbortSignal,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let frame = 0;
		let elapsed = 0;
		let previous: number | undefined;
		let stopWatching = () => {};
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const cleanup = () => {
			cancelAnimationFrame(frame);
			stopWatching();
			motion.removeEventListener("change", settle);
			signal.removeEventListener("abort", abort);
		};
		const abort = () => {
			cleanup();
			reject(signal.reason);
		};
		const settle = () => {
			if (!motion.matches) return;
			cleanup();
			draw(1);
			resolve();
		};
		const step = (now: number) => {
			elapsed += now - (previous ?? now);
			previous = now;
			const progress = Math.min(1, elapsed / Math.max(1, ms));
			draw(progress);
			if (progress < 1) frame = requestAnimationFrame(step);
			else {
				cleanup();
				resolve();
			}
		};
		if (signal.aborted) {
			abort();
			return;
		}
		if (motion.matches) {
			settle();
			return;
		}
		signal.addEventListener("abort", abort, { once: true });
		motion.addEventListener("change", settle);
		stopWatching = whileVisible(element, (visible) => {
			cancelAnimationFrame(frame);
			previous = undefined;
			if (visible) frame = requestAnimationFrame(step);
		});
	});
}

/** Pause the CSS loops inside each [data-loop] element while it is off screen (global.css). */
export function pauseLoopsOffscreen(): void {
	for (const element of document.querySelectorAll("[data-loop]")) {
		whileVisible(element, (visible) => element.classList.toggle("is-paused", !visible));
	}
}

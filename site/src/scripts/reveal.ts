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
 */
export function whileVisible(element: Element, onChange: (visible: boolean) => void): void {
	let onScreen = false;
	const update = () => onChange(onScreen && document.visibilityState === "visible");
	new IntersectionObserver((entries) => {
		onScreen = entries.some((entry) => entry.isIntersecting);
		update();
	}).observe(element);
	document.addEventListener("visibilitychange", update);
}

import { useLayoutEffect } from "react";

/**
 * Keep floating claims below the title row, including its wrapped text and the narrow outline.
 * @param page The scrolling About page.
 * @param outlined Whether this page shows a section outline.
 */
function useAboutClaimClearance(page: HTMLElement | null, outlined: boolean): void {
	useLayoutEffect(() => {
		if (page === null) return undefined;
		const surface = page.closest<HTMLElement>('[data-slot="model-about"]');
		const title = page.querySelector<HTMLElement>('[data-slot="model-about-head"]');
		if (surface === null || title === null) return undefined;
		/** Measure content coordinates, so scrolling never moves the claim. */
		const measure = (): void => {
			surface.style.setProperty("--claim-top", `${title.offsetTop + title.offsetHeight}px`);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(page);
		observer.observe(title);
		const outline = outlined ? page.querySelector('[data-slot="about-outline"]') : null;
		if (outline !== null) observer.observe(outline);
		return (): void => {
			observer.disconnect();
			surface.style.removeProperty("--claim-top");
		};
	}, [page, outlined]);
}

export { useAboutClaimClearance };

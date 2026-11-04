// A spark draws a line: it leaves the line's start and runs along it, and the line is drawn
// behind it. The arrowhead appears as the spark lands.

import { animate } from "./reveal";

/**
 * Draw one relationship of an inline drawing with a spark.
 * @param edge The relationship's group: its halo, its line and its ports.
 * @param ms How long the spark runs.
 * @param signal Cancels the spark when playback ends.
 * @returns After the line is drawn.
 */
export async function sparkLine(edge: SVGGElement, ms: number, signal: AbortSignal): Promise<void> {
	const path = [...edge.querySelectorAll<SVGPathElement>(":scope > path")].find(
		(candidate) => !candidate.classList.contains("ab-halo"),
	);
	edge.style.transition = "none";
	edge.style.translate = "0 0";
	edge.style.opacity = "1";
	if (!path) return;

	const length = path.getTotalLength();
	const marker = path.getAttribute("marker-end");
	const dash = path.style.strokeDasharray;
	const offset = path.style.strokeDashoffset;
	path.removeAttribute("marker-end");
	path.style.strokeDasharray = `${length} ${length}`;
	path.style.strokeDashoffset = `${length}`;

	const spark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	spark.setAttribute("r", "3.2");
	spark.setAttribute("class", "spark");
	spark.style.fill = "white";
	spark.style.filter = `drop-shadow(0 0 4px ${getComputedStyle(path).stroke}) drop-shadow(0 0 8px white)`;
	edge.append(spark);

	try {
		await animate(
			edge,
			ms,
			(t) => {
				const eased = 1 - Math.pow(1 - t, 3);
				const along = length * eased;
				path.style.strokeDashoffset = `${length - along}`;
				const point = path.getPointAtLength(along);
				spark.setAttribute("cx", String(point.x));
				spark.setAttribute("cy", String(point.y));
			},
			signal,
		);
	} finally {
		spark.remove();
		path.style.strokeDasharray = dash;
		path.style.strokeDashoffset = offset;
		if (marker) path.setAttribute("marker-end", marker);
	}
}

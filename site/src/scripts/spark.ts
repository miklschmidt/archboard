// A spark draws a line: it leaves the line's start and runs along it, and the line is drawn
// behind it. The arrowhead appears as the spark lands.

/**
 * Draw one relationship of an inline drawing with a spark.
 * @param edge The relationship's group: its halo, its line and its ports.
 * @param ms How long the spark runs.
 * @returns After the line is drawn.
 */
export function sparkLine(edge: SVGGElement, ms: number): Promise<void> {
	const path = [...edge.querySelectorAll<SVGPathElement>(":scope > path")].find(
		(candidate) => !candidate.classList.contains("ab-halo"),
	);
	edge.style.transition = "none";
	edge.style.translate = "0 0";
	edge.style.opacity = "1";
	if (!path) return Promise.resolve();

	const length = path.getTotalLength();
	const marker = path.getAttribute("marker-end");
	const dash = path.getAttribute("stroke-dasharray");
	path.removeAttribute("marker-end");
	path.style.strokeDasharray = `${length} ${length}`;
	path.style.strokeDashoffset = `${length}`;

	const spark = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	spark.setAttribute("r", "3.2");
	spark.setAttribute("class", "spark");
	spark.style.fill = "white";
	spark.style.filter = `drop-shadow(0 0 4px ${getComputedStyle(path).stroke}) drop-shadow(0 0 8px white)`;
	edge.append(spark);

	return new Promise((done) => {
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			const eased = 1 - Math.pow(1 - t, 3);
			const along = length * eased;
			path.style.strokeDashoffset = `${length - along}`;
			const point = path.getPointAtLength(along);
			spark.setAttribute("cx", String(point.x));
			spark.setAttribute("cy", String(point.y));
			if (t < 1) {
				requestAnimationFrame(step);
				return;
			}
			spark.remove();
			path.style.strokeDasharray = dash ?? "";
			path.style.strokeDashoffset = "";
			if (marker) path.setAttribute("marker-end", marker);
			done();
		};
		requestAnimationFrame(step);
	});
}

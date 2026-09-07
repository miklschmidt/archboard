import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

async function elementPoint(
	browser: AgentBrowserSession,
	id: string,
): Promise<{ x: number; y: number }> {
	const point = await pollUntil(
		() =>
			browser.eval<{ x?: number; y?: number }>(`(() => {
			for (const node of document.querySelectorAll('.excalidraw')) {
				const key = Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
				let fiber = key ? node[key] : null;
				for (let depth = 0; fiber && depth < 60; depth += 1, fiber = fiber.return) {
					const app = fiber.stateNode;
					if (!app?.scene?.getElementsIncludingDeleted) continue;
					const element = app.scene.getElementsIncludingDeleted().find(candidate => candidate.id === ${JSON.stringify(id)});
					if (!element) break;
					const zoom = app.state.zoom?.value ?? 1;
					return { x: Math.round((element.x + element.width / 2 + app.state.scrollX) * zoom + app.state.offsetLeft),
						y: Math.round((element.y + element.height / 2 + app.state.scrollY) * zoom + app.state.offsetTop) };
				}
			}
			return {};
		})()`),
		(value): value is { x: number; y: number } =>
			Number.isFinite(value.x) && Number.isFinite(value.y),
		`the rendered element ${id}`,
		{ timeoutMs: 3_000 },
	);
	return { x: point.x!, y: point.y! };
}

async function activateLink(browser: AgentBrowserSession, id: string, href: string): Promise<void> {
	const point = await elementPoint(browser, id);
	await browser.run(["mouse", "move", String(point.x), String(point.y)]);
	await browser.run(["mouse", "down"]);
	await browser.run(["mouse", "up"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`Boolean(document.querySelector(${JSON.stringify(`a[href="${href}"]`)}))`,
			),
		Boolean,
		`the rendered link ${href}`,
		{ timeoutMs: 3_000 },
	);
	await browser.run(["click", `a[href="${href}"]`]);
}

export { activateLink, elementPoint };

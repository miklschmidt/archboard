import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import type { AgentBrowserSession } from "./agent-browser.ts";
import { EXCALIDRAW_APP_EXPRESSION } from "./page-scene.ts";
import { PANE_TABS } from "./shell-dom.ts";

const move = (
	browser: AgentBrowserSession,
	id: string,
	dx: number,
	dy: number,
): Promise<{ ok?: boolean; error?: string }> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		if (!app) return { error: "no Excalidraw app instance" };
		const elements = app.scene.getElementsIncludingDeleted().map(element =>
			element.id === ${JSON.stringify(id)}
				? { ...element, x: element.x + ${dx}, y: element.y + ${dy} }
				: element);
		app.updateScene({ elements, captureUpdate: "IMMEDIATELY" });
		return { ok: true };
	})()`);

const pageElement = (browser: AgentBrowserSession, id: string): Promise<ExcalidrawElement | null> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		const element = app?.scene.getElementsIncludingDeleted()
			.find(candidate => candidate.id === ${JSON.stringify(id)});
		return element ? { ...element } : null;
	})()`);

const focusedBoardTitle = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval(`document.querySelector('${PANE_TABS}[aria-pressed="true"]')?.textContent ?? null`);

const pageElements = (browser: AgentBrowserSession): Promise<ExcalidrawElement[]> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return app ? app.scene.getElementsIncludingDeleted().map(element => ({ ...element })) : [];
	})()`);

const pageFileIds = (browser: AgentBrowserSession): Promise<string[]> =>
	browser.eval(`(() => {
		const app = ${EXCALIDRAW_APP_EXPRESSION};
		return Object.keys(app?.files ?? {}).sort();
	})()`);

export { move, pageElement, focusedBoardTitle, pageElements, pageFileIds };

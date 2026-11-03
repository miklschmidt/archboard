import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";

import { AgentAnswer } from "#ui/components/thread/AnswerText.tsx";
import { AnswerFilesContext } from "#ui/hooks/thread/use-answer-files.ts";
import type { AnswerFile } from "#ui/rules/thread/answer-file.ts";

let root: Root;

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});
afterEach(() => {
	act(() => root.unmount());
	document.body.replaceChildren();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

test("a link to a local file opens the file, and a web link still opens a new tab", async () => {
	const opened: AnswerFile[] = [];
	/**
	 * Remember a file the answer asked to open.
	 * @param file The file.
	 */
	const open = (file: AnswerFile): void => {
		opened.push(file);
	};
	const text = [
		"[Observation command](/Users/msc/repo/scripts/command.ts:24) passes the endpoint.",
		"See [the docs](https://example.com/docs).",
	].join("\n\n");
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(
				AnswerFilesContext,
				{ value: open },
				createElement(AgentAnswer, { text, running: false }),
			),
		);
	});

	const file = [...container.querySelectorAll("button")].find(
		(button) => button.textContent === "Observation command",
	);
	expect(file?.title).toBe("/Users/msc/repo/scripts/command.ts:24");
	act(() => file?.click());
	expect(opened).toEqual([{ path: "/Users/msc/repo/scripts/command.ts", line: 24 }]);

	const web = container.querySelector("a");
	expect(web?.getAttribute("href")).toBe("https://example.com/docs");
	expect(web?.getAttribute("target")).toBe("_blank");
});

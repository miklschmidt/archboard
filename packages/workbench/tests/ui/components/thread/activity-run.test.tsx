import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { act, createElement } from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createRoot, type Root } from "react-dom/client";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import type { ActivityItem, ActivityRun as Run } from "#ui/rules/runtime/messages.ts";
import { ActivityRun } from "#ui/components/thread/ActivityRun.tsx";

const { decoder } = createIdentityAuthorities().identity;

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

/**
 * A command step.
 * @param id Its id.
 * @param status Where it stands.
 * @param line The command as Codex sent it.
 * @returns The step.
 */
function command(
	id: string,
	status: "inProgress" | "completed" | "failed",
	line = `run ${id}`,
): ActivityItem {
	return {
		media: "command",
		itemId: decoder.adoptItemId(id),
		command: line,
		status,
		cwd: "/work",
		exitCode: status === "failed" ? 1 : 0,
		durationMs: 10,
		output: `output of ${id}`,
		outputTruncated: false,
	};
}

/**
 * Mount one run.
 * @param run The run.
 */
function mount(run: Run): void {
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	act(() => root.render(createElement(ActivityRun, { run })));
}

/**
 * The rows on screen.
 * @returns Each row's element.
 */
function rows(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('[data-slot="activity-row"]')];
}

test("a finished run of many steps folds to one line and opens on request", () => {
	mount({
		items: ["a", "b", "c", "d"].map((id) => command(id, "completed")),
		ended: true,
		live: false,
	});
	expect(rows()).toHaveLength(0);
	const fold = document.querySelector<HTMLButtonElement>(
		'[data-slot="activity"] > button[aria-expanded]',
	);
	expect(fold?.getAttribute("aria-expanded")).toBe("false");
	act(() => fold?.click());
	expect(fold?.getAttribute("aria-expanded")).toBe("true");
	expect(rows()).toHaveLength(4);
});

test("a failure never folds away, and the failed step opens itself to its evidence", () => {
	mount({
		items: [
			command("a", "completed"),
			command("b", "completed"),
			command("c", "failed"),
			command("d", "completed"),
		],
		ended: true,
		live: false,
	});
	const shown = rows();
	expect(shown).toHaveLength(4);
	const expanded = shown.map((row) => row.querySelector("button")?.getAttribute("aria-expanded"));
	expect(expanded).toEqual(["false", "false", "true", "false"]);
	expect(shown[2]?.querySelector("pre")).not.toBeNull();
});

test("a step that fails while the run is on screen opens then, and the person's choice wins after", () => {
	mount({ items: [command("a", "inProgress")], ended: false, live: true });
	expect(rows()[0]?.dataset["live"]).toBe("true");
	act(() =>
		root.render(
			createElement(ActivityRun, {
				run: { items: [command("a", "failed")], ended: false, live: false },
			}),
		),
	);
	const button = rows()[0]?.querySelector("button");
	expect(rows()[0]?.dataset["live"]).toBeUndefined();
	expect(button?.getAttribute("aria-expanded")).toBe("true");
	act(() => button?.click());
	expect(button?.getAttribute("aria-expanded")).toBe("false");
});

test("a command that one shell call runs reads as its script, and any other command as Codex sent it", () => {
	const sent = [
		String.raw`/nix/store/10dx-bash-5.3p15/bin/bash -lc 'git status --short && echo "it'\''s done"'`,
		"/bin/zsh -c 'ls -la $HOME'",
		"bash -Eec 'echo hi'",
		"cd /work && make",
		"python3 -c 'print(1)'",
	];
	mount({
		items: sent.map((line, index) => command(String(index), "completed", line)),
		ended: false,
		live: false,
	});
	expect(rows().map((row) => row.querySelector("span[title]")?.textContent)).toEqual([
		`git status --short && echo "it's done"`,
		"ls -la $HOME",
		"echo hi",
		"cd /work && make",
		"python3 -c 'print(1)'",
	]);
});

test("a command outside the shell parser's grammar keeps its row", () => {
	const line = "printf '%s\\n' \"$(printf '%s' '${')\"";
	mount({ items: [command("unparsed", "completed", line)], ended: false, live: false });
	expect(rows()[0]?.querySelector("span[title]")?.textContent).toBe(line);
});

test("newlines separate commands only outside the script's quotes", () => {
	const compound = "bash\n-c\n'echo hi'";
	const script = "echo first\necho second";
	mount({
		items: [
			command("compound", "completed", compound),
			command("multiline", "completed", `/bin/bash -c '${script}'`),
		],
		ended: false,
		live: false,
	});
	expect(rows().map((row) => row.querySelector("span[title]")?.textContent)).toEqual([
		compound,
		script,
	]);
});

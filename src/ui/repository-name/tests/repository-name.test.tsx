// How a label names a repository (TASK-477): a repository on GitHub by its
// owner and name beside GitHub's mark, and any other identity, or an untracked
// vault's registry name, whole and with no mark. Every name keeps the whole
// identity on hover and for assistive technology.
//
// What these catch: the host left beside the mark, a host taken from an
// identity on another host, from a name with no host or from a GitHub identity
// that is not an owner and a name, a remote that spells the host with capitals
// keeping it, the mark on a repository that is not on GitHub, and the whole
// identity lost to a hover or to a screen reader.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";

import { RepositoryName } from "@/ui/repository-name";

beforeAll(() => {
	GlobalRegistrator.register();
});

afterEach(() => {
	cleanup();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * The words that a sighted reader sees in a name: its text without the words
 * that only assistive technology reads.
 * @param name The name.
 * @returns The words.
 */
function seenWords(name: Element): string {
	const seen = name.cloneNode(true);
	if (!(seen instanceof Element)) return "";
	for (const hidden of seen.querySelectorAll(".sr-only")) hidden.remove();
	return seen.textContent;
}

test.each([
	["github.com/acme/payments", "acme/payments", true],
	["GitHub.com/acme/payments", "acme/payments", true],
	["gitlab.com/acme/payments", "gitlab.com/acme/payments", false],
	["payments", "payments", false],
	["github.com/acme", "github.com/acme", false],
])("%s is shown as %s", (identity, shown, marked) => {
	const name = render(<RepositoryName identity={identity} />).container.querySelector(
		'[data-slot="repository-name"]',
	);
	if (name === null) throw new Error("no repository name was drawn");
	expect(seenWords(name)).toBe(shown);
	expect(name.querySelectorAll("svg").length).toBe(marked ? 1 : 0);
	expect(name.getAttribute("title")).toBe(identity);
	expect(name.textContent).toBe(identity);
});

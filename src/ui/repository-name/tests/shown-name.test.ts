// What a repository is called on screen (TASK-477): a repository on GitHub by
// its owner and name, and any other identity whole.
//
// What these catch: a GitHub host left in the shown name, a host taken from an
// identity on another host or from a name with no host, and an identity on
// GitHub that is not an owner and a name losing its host anyway.

import { expect, test } from "bun:test";

import { shownRepository } from "@/ui/repository-name/shown-name";

test.each([
	["github.com/acme/payments", { name: "acme/payments", onGitHub: true }],
	["gitlab.com/acme/payments", { name: "gitlab.com/acme/payments", onGitHub: false }],
	["payments", { name: "payments", onGitHub: false }],
	["github.com/acme", { name: "github.com/acme", onGitHub: false }],
])("%s is shown as %o", (identity, shown) => {
	expect(shownRepository(identity)).toEqual(shown);
});

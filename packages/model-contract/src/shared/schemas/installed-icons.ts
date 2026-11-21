// The icon names a vault's vocabulary may use: every RemixIcon component this
// installation carries. Reading them loads every icon, so a browser build takes
// `installed-icons-browser.ts` in its place (the `#installed-icons` entry of
// package.json): no browser reads a vault's configuration.

import * as RemixIcons from "@remixicon/react";

/** The names of the installed RemixIcon components, line and fill. */
const INSTALLED_ICONS: readonly string[] = Object.keys(RemixIcons).filter((name) =>
	/^Ri[A-Za-z0-9]+(?:Line|Fill)$/u.test(name),
);

export { INSTALLED_ICONS };

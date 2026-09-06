// The one class-merge function the shared components use: the registry's own
// `cn` engine, configured so the six Archboard type roles (app.css) merge as
// font sizes. Without this, `cn` reads `text-control` as a text colour and
// drops it whenever a `text-<colour>` sits in the same class list, which is
// how a button's `text-primary` silently threw away its size role. This is
// the `utils` alias in components.json.

import { createCn } from "cn/config";

/**
 * The type roles `app.css` defines under `--text-*`; every one is a font size.
 * The header's board-name role is `board`, not `primary`: Tailwind compiles
 * `text-primary` as the colour utility, so a font-size role of that name would
 * be unreachable and would stop colour conflicts from merging.
 */
const TYPE_ROLES = ["kicker", "technical", "body", "control", "title", "board"] as const;

const cn = createCn({
	extend: {
		classGroups: {
			"font-size": [{ text: [...TYPE_ROLES] }],
		},
	},
});

export { cn, TYPE_ROLES };

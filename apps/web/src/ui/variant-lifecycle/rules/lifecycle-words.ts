// What a state is called by where it stands in its model's life, in the one word the History tab
// and a comparison of interfaces both use. Pure.

import type { Model } from "@archboard/model/content";

/** Where a state stands in its model's life. */
type Lifecycle = NonNullable<Model["selectedState"]>["lifecycle"];

/** The word for each lifecycle. */
const LIFECYCLE_WORD: Readonly<Record<Lifecycle, string>> = {
	draft: "Proposal",
	current: "Current",
	historical: "Earlier",
	shelved: "Shelved",
};

export { LIFECYCLE_WORD, type Lifecycle };

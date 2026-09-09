// The dismissing action of a dialog footer, as the official button variants
// spell it, so a close control inside a dialog matches a ghost button without
// rendering one.

import { buttonVariants } from "@/ui/components/button";

/** The dismissing action of a dialog footer: a 28px ghost button. */
const CANCEL_BUTTON_CLASS = buttonVariants({ variant: "ghost", size: "sm" });

export { CANCEL_BUTTON_CLASS };

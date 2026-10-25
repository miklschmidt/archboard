// The dismissing action of a dialog footer: a close control that looks like a ghost button
// without rendering one inside the close control.

import type { ComponentProps, JSX } from "react";

import { buttonVariants } from "#ui/components/shadcn/button.tsx";
import { DialogClose } from "#ui/components/shadcn/dialog.tsx";

/** The dismissing action of a dialog footer, as the official button variants spell it: a 28px ghost button. */
const CANCEL_BUTTON_CLASS = buttonVariants({ variant: "ghost", size: "sm" });

/** Inputs for the dismissing action: the close control's own, without a class of its own. */
type DialogCancelProps = Omit<ComponentProps<typeof DialogClose>, "className">;

/**
 * The control that closes a dialog without doing what it offers.
 * @param props Whether it is disabled, and its words.
 * @returns The close control, drawn as a ghost button.
 */
function DialogCancel(props: DialogCancelProps): JSX.Element {
	return <DialogClose className={CANCEL_BUTTON_CLASS} {...props} />;
}

export { DialogCancel };

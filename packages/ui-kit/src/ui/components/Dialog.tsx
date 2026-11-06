// A dialog with its parts on it. The official shadcn parts lay it out (`Dialog.Trigger`,
// `Dialog.Content`, `Dialog.Header`, `Dialog.Title`, `Dialog.Description`, `Dialog.Footer`),
// and the parts every settings and model dialog shares say what it is doing:
// `Dialog.Busy` while a request is in flight, `Dialog.Error` for the host's failure and
// `Dialog.Cancel` for the footer's dismissing action, and `Dialog.Technical` sets an identifier,
// path, version or time in the mono face.

import { BusyText } from "#ui/dialog-parts/components/BusyText.tsx";
import { DialogCancel } from "#ui/dialog-parts/components/DialogCancel.tsx";
import { DialogErrorAlert } from "#ui/dialog-parts/components/DialogErrorAlert.tsx";
import { Technical } from "#ui/dialog-parts/components/Technical.tsx";
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	Dialog as DialogRoot,
	DialogTitle,
	DialogTrigger,
} from "#ui/shadcn/components/dialog.tsx";

/** A dialog, with its layout parts and the parts every dialog surface shares. */
const Dialog = Object.assign(DialogRoot, {
	Busy: BusyText,
	Cancel: DialogCancel,
	Content: DialogContent,
	Description: DialogDescription,
	Error: DialogErrorAlert,
	Footer: DialogFooter,
	Header: DialogHeader,
	Technical,
	Title: DialogTitle,
	Trigger: DialogTrigger,
});

export { Dialog };

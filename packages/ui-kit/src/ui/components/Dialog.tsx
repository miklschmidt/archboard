// A dialog with its parts on it. The official shadcn parts lay it out (`Dialog.Trigger`,
// `Dialog.Content`, `Dialog.Header`, `Dialog.Title`, `Dialog.Description`, `Dialog.Footer`),
// and the parts every settings and board dialog shares say what it is doing:
// `Dialog.Busy` while a request is in flight, `Dialog.Error` for the host's failure and
// `Dialog.Cancel` for the footer's dismissing action.

import { BusyText } from "#ui/components/dialog-parts/BusyText.tsx";
import { DialogCancel } from "#ui/components/dialog-parts/DialogCancel.tsx";
import { DialogErrorAlert } from "#ui/components/dialog-parts/DialogErrorAlert.tsx";
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	Dialog as DialogRoot,
	DialogTitle,
	DialogTrigger,
} from "#ui/components/shadcn/dialog.tsx";

/** A dialog, with its layout parts and the parts every dialog surface shares. */
const Dialog = Object.assign(DialogRoot, {
	Busy: BusyText,
	Cancel: DialogCancel,
	Content: DialogContent,
	Description: DialogDescription,
	Error: DialogErrorAlert,
	Footer: DialogFooter,
	Header: DialogHeader,
	Title: DialogTitle,
	Trigger: DialogTrigger,
});

export { Dialog };

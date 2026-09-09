// The dialog pieces every settings and board dialog surface shares: the
// host's failure as an alert, progress text, technical values in the mono
// face, a facts table and a field's validation messages. They are generic
// presentation over the official Base UI primitives; the dialogs that own a
// workflow live in their own feature modules.

export { BusyText, type BusyTextProps } from "@/ui/dialog-parts/components/BusyText";
export {
	DialogErrorAlert,
	type DialogErrorAlertProps,
} from "@/ui/dialog-parts/components/DialogErrorAlert";
export { Facts, type FactRow, type FactsProps } from "@/ui/dialog-parts/components/Facts";
export { FieldIssues, type FieldIssuesProps } from "@/ui/dialog-parts/components/FieldIssues";
export { PathValue, type PathValueProps } from "@/ui/dialog-parts/components/PathValue";
export { Technical, type TechnicalProps } from "@/ui/dialog-parts/components/Technical";
export { CANCEL_BUTTON_CLASS } from "@/ui/dialog-parts/lib/cancel-button-class";
export type { DialogError } from "@/ui/dialog-parts/types/dialog-error";

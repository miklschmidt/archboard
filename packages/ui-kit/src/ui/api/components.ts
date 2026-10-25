// The shared presentation parts, one composite per job: a family's parts sit on its root
// (`Dialog.Content`, `Select.Item`), so a caller imports the one name it draws with. Beside them
// are `cn`, the class merger every component draws with, the button classes for an element that
// is not a button, the platform's command key that shortcuts name, and a repository's shown name.
export { Alert } from "#ui/components/Alert.tsx";
export { Dialog } from "#ui/components/Dialog.tsx";
export { DropdownMenu } from "#ui/components/DropdownMenu.tsx";
export { Field } from "#ui/components/Field.tsx";
export { IconButton } from "#ui/components/IconButton.tsx";
export { InputGroup } from "#ui/components/InputGroup.tsx";
export { RadioGroup } from "#ui/components/RadioGroup.tsx";
export { RepositoryName } from "#ui/components/RepositoryName.tsx";
export { Resizable } from "#ui/components/Resizable.tsx";
export { Select } from "#ui/components/Select.tsx";
export { Tabs } from "#ui/components/Tabs.tsx";
export { ToggleGroup } from "#ui/components/ToggleGroup.tsx";
export { Tooltip } from "#ui/components/Tooltip.tsx";
export { Technical } from "#ui/components/dialog-parts/Technical.tsx";
export { Badge } from "#ui/components/shadcn/badge.tsx";
export { Button, buttonVariants } from "#ui/components/shadcn/button.tsx";
export { Checkbox } from "#ui/components/shadcn/checkbox.tsx";
export { Input } from "#ui/components/shadcn/input.tsx";
export { Separator } from "#ui/components/shadcn/separator.tsx";
export { Skeleton } from "#ui/components/shadcn/skeleton.tsx";
export { cn } from "#ui/rules/class-names.ts";
export { usesCommandKey } from "#ui/rules/command-key.ts";
export type { DialogError } from "#ui/rules/dialog-error.ts";
export { shownRepository } from "#ui/rules/shown-name.ts";

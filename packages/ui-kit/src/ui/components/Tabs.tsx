// Tabs with their parts on them: `Tabs.List` holds `Tabs.Trigger`, and `Tabs.Content` is what a
// tab shows. The parts are the official shadcn ones, so the markup stays the registry's.

import {
	TabsContent,
	TabsList,
	Tabs as TabsRoot,
	TabsTrigger,
} from "#ui/components/shadcn/tabs.tsx";

/** Tabs, with their list, their triggers and their content as their parts. */
const Tabs = Object.assign(TabsRoot, {
	Content: TabsContent,
	List: TabsList,
	Trigger: TabsTrigger,
});

export { Tabs };

---
status: accepted
---

# A registry item with one caller lives beside it

Decided for TASK-653.17, candidate 14 of the archboard-deepen run. It applies
[ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) to `@archboard/ui-kit`.

## Context

`@archboard/ui-kit` exported 43 names. Some of its parts had one caller: two shadcn registry
items, the resizable columns and the fullscreen presentation. The frame clock and time as text
were a second job, and they became `@archboard/ui-clocks`. The rule that kept every shadcn item in
ui-kit lived only in agent guides, which record no decision. `components.json` names ui-kit as the
default home of a registry item, and nothing else reads it.

## Decision

A shadcn registry item that one module draws, and that no other registry file imports, lives
beside that module. `checkbox.tsx` lives beside `SemanticChanges.tsx`, and `radio-group.tsx`
beside `OpenerChoiceGroup.tsx`, which draws its two parts. Each keeps the registry's bytes, with a
short README beside it that holds its digest. Its exact path replaces the old one in the lint
override for registry files. `components.json` still names ui-kit, and the CLI writes a `ui` item
there even with `-p`, so a moved item is compared with `shadcn add <item> --diff` and changed by
hand.

The next component that two modules draw goes into ui-kit, and its width is measured again.

## Considered options

- **Move an item that another registry file imports.** `Command` imports the dialog and
  input-group parts, `InputGroup` is imported by `command.tsx`, and `Separator` by `field.tsx`. A
  move must copy the file or export the parts it uses, so these stay.
- **Move a part that several modules of one app draw into a folder of that app.** `IconButton`,
  `Popover` and `Tabs` are drawn by several modules of apps/web. An app has no interface, so the
  name would leave the count while every module still learns it. These stay.
- **Hang the parts on a composite, or return them as members of an object.** The count does not see
  them, and callers learn the same names. Rejected, as ADR 0058 says.

`shownRepository` stays exported. Its callers need the shown name as a string: in sentences, in a
pane header's name and in the repository search, which marks the query in it. `RepositoryName`
draws a mark and a hidden host, so it cannot stand in for that string.

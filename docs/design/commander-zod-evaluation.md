# Commander and Zod dependency evaluation

## Decision

Archboard pins Commander 15.0.0 as a private token parser. Zod 4.4.3 remains
the only owner of values and command semantics. No public Archboard type
imports or exposes Commander.

Before changing `package.json` or `bun.lock`, TASK-123.01 installed Commander
15.0.0 in `/tmp/archboard-commander-smoke.0dI5mF` and ran it with Bun 1.4.0.
The smoke passed ESM import, `parseAsync`, `exitOverride`, output capture,
required-value greediness for an option-looking value, aliases, repeated value
collection, and disabled help. The package declared `node >=22.12.0`; the Bun
execution, rather than that Node declaration, was the adoption gate.

The repository already had Commander 8.3.0 as a transitive dependency. That
copy was not used as evidence and is not the direct pin.

## Adapter limits

The private adapter may translate token descriptors into Commander arguments
and options, accumulate repeatable occurrences, retain last-wins occurrences,
and normalize Commander diagnostics to Archboard's established wording. It
does not install Zod parsers, defaults, choices, mandatory options, or
cross-field rules into Commander.

Commander normally treats bare `--`, command help, excess arguments, and
version aliases differently from the existing CLI. The adapter and outer
router retain Archboard's behavior, and the independent argv golden checks the
real package binary rather than a second parser implementation.

## zod-commander prior art

The evaluated Zod 4 implementation imports and re-exports Commander types,
returns a Commander `Command`, derives token and value behavior together, and
defines actions as `void | Promise<void>`. It does not describe public result
schemas, output modes, pending artifacts, prerequisites, effects, refusals,
exit mapping, REST relationships, or Archboard's held behavior.

Archboard therefore does not depend on zod-commander. Copying its interface
would make Commander part of the public seam and would leave the main purpose
of TASK-123 unmodeled.

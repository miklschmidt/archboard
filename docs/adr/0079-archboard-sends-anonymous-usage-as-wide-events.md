---
status: accepted
---

# Archboard sends anonymous usage as wide events

The owner decided this on 2026-11-13.

## Context

Archboard runs on the user's machine. The owner cannot see which commands agents run, or which
agents run them. The owner also cannot see whether people use the reader, the workbench and
voice, or where Archboard fails on other machines. Today a failure reaches the owner only as an
issue that someone files.

Most of the use comes from agents, and an agent runs many commands a minute. An event for each
command will pass the free quota of the analytics service as use grows. A network call in each
command will slow the agent. A reader on `127.0.0.1` also works offline.

A wide event is one context-rich event for each unit of work. The work builds it, and the work
sends it once at its end. Wide events answer more questions with fewer events than a stream of
small events.

## Decision

- Archboard sends anonymous usage to PostHog EU Cloud, straight to `https://eu.i.posthog.com`.
  Every event carries `surface: "product"`, so that it stands apart from the events of the
  public site in the same project.
- It is on by default. The first command that records prints a notice once to standard error.
  The notice says what Archboard sends and how to turn it off.
- If any of these is true, it is off, and nothing is recorded or sent:
  - `std-env` detects a CI environment (`isCI`, which counts any value of `CI`),
  - a test runs (`std-env`'s `isTest`),
  - `DO_NOT_TRACK` has a value other than `0` or `false`,
  - `ARCHBOARD_TELEMETRY` is `0`, `false` or `off`,
  - the person ran `archboard telemetry off`.
- The GitHub Actions of this repository never send telemetry. They run in CI, so the rule above
  covers them. No Action can turn it on.
- The CLI never makes a network call for telemetry. It appends one record for each command to a
  file of the day in the state directory. The server is the only sender.
- The server sends two kinds of event:
  - A `daily usage` event for each installation and finished UTC day. It rolls up the records of
    that day: counts by command, agent and exit code, and the counts that later records add.
  - An `$exception` event for each unexpected error of the CLI or the server, within minutes. It
    holds the context of the work that failed and the stack frames of Archboard's own code.
- The distinct id is a random installation id in the state directory. Events create no person
  profile (`$process_person_profile: false`) and no location (`$geoip_disable: true`).
- No event holds a module, file, repository or model name, a path outside Archboard, a prompt,
  or the text of an error message. An error event names the error's class and code only.
- The agent that runs a command comes from `std-env`'s `detectAgent()`. A command that
  Archboard's own workbench runs also says so.
- If a send fails or takes more than five seconds, the server drops it and tries again later.
  The server deletes a record that it cannot send within seven days.

## Consequences

- The owner sees a day of each installation as one event. A question about a single command
  needs the counts of that day, not an event of the command.
- An installation that never starts the server sends nothing until a server starts.
- The owner's own checkout records its use too. Its events say `install: "checkout"`.
- PRODUCT.md no longer says that everything stays local. Usage counts and error reports leave
  the machine unless the person turns them off.

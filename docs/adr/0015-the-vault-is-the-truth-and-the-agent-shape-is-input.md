# The vault is the truth, and the agent-friendly shape is an input format

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces
independent board files with canonical authored inputs. The public model reader
and durable writer remain the single authority.

A board persisted as a note in the vault. While a board was open, the canvas
also kept its own copy of it, in another shape, with a conversion between them.
Each side believed its own. Four bugs came out of this gap, and nothing detected
any of them.

## The decision

The note is the board. The canvas holds no authoritative copy of one.

The agent-friendly shape is an input format and nothing else. It is accepted at
the boundary, converted once on the way in, and never converted on the way out.
An agent that wants something briefer asks for a description, which is a
summary rather than a second shape. There is one implementation of that
conversion, shared by everything that needs it.

Session state is not content. Examples are which panes are open, which pane has
focus, what a person selected, and which browsers are connected. All of it dies
with the tab.

To test the next thing that looks like a copy, ask which question it answers.
Anything that answers "what is on this board" must be the note. A past state
answers "what was on it then", so a change feed or a snapshot is not a second
truth. A record of the past is a copy in full. A history that shares objects
with the live board moves with it, and then the diff reports nothing.

A command that finds no vault refuses
([ADR 0049](0049-one-server-serves-every-vault-and-every-call-names-its-vault.md)).
A fallback outside the vault was rejected, because it makes a second place where
content lives.

## Considered and rejected

One option kept the canvas copy authoritative and flushed it to the vault
periodically. It bounds how much work a crash costs, but it keeps the second
copy and every bug above.

A second option converted on the way out as well, so agents see the friendly
shape everywhere. Two conversions that must agree are what this decision exists
to prevent.

## Consequences

Being the only copy raises the cost of losing it. Writing a note must be atomic,
so a reader sees the old note or the new one and never a partial. One intent
must be one write.

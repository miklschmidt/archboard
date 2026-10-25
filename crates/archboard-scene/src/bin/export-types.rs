//! Print the TypeScript types of the core's contract: a board's words and
//! their measures, the paint request, the scene and the painted document, with every type they name (ADR 0057).
//! `scripts/build-core.ts` writes them beside the WebAssembly build, so the
//! TypeScript side never holds a copy of its own.
//!
//! Every field is read-only, and every optional field may hold `undefined`, as
//! the repository's TypeScript writes its own types.

use std::any::TypeId;
use std::collections::{BTreeMap, HashSet};

use archboard_scene::drawing::{ArchitectureDrawing, EdgeFacts, NodeFacts};
use archboard_scene::measure::{BoardWords, MeasuredWords};
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::{AtlasBox, PaintedDocument, Scene};
use ts_rs::{Config, TS, TypeVisitor};

/// Every declared type reached, each once, by its name.
struct Declarations<'config> {
    config: &'config Config,
    seen: HashSet<TypeId>,
    out: BTreeMap<String, String>,
}

impl TypeVisitor for Declarations<'_> {
    fn visit<T: TS + 'static + ?Sized>(&mut self) {
        if T::output_path().is_none() || !self.seen.insert(TypeId::of::<T>()) {
            return;
        }
        // A generic type is declared once, with its parameters.
        let declaration = <T::WithoutGenerics as TS>::decl(self.config);
        self.out.entry(T::ident(self.config)).or_insert(declaration);
        T::visit_dependencies(self);
        T::visit_generics(self);
    }
}

/// Where a run of a declaration ends: the index of the `,` or closing bracket
/// that closes it at the depth it started at.
fn end_of_type(text: &[char], mut at: usize) -> usize {
    let mut depth = 0usize;
    while at < text.len() {
        match text[at] {
            '{' | '[' | '(' | '<' => depth += 1,
            '>' if at > 0 && text[at - 1] == '=' => {}
            '}' | ']' | ')' | '>' => {
                if depth == 0 {
                    return at;
                }
                depth -= 1;
            }
            ',' | ';' if depth == 0 => return at,
            '"' => {
                at += 1;
                while at < text.len() && text[at] != '"' {
                    at += 1;
                }
            }
            _ => {}
        }
        at += 1;
    }
    at
}

/// A declaration being written read-only: the text read so far and what is
/// written of it, the brackets open at the point reached, and whether a field's
/// name may start there.
struct ReadOnly {
    text: Vec<char>,
    at: usize,
    out: String,
    /// Whether each open bracket is an object's brace.
    objects: Vec<bool>,
    field_start: bool,
}

impl ReadOnly {
    /// Copy a comment that opens here, and say whether there was one.
    fn comment(&mut self) -> bool {
        let text = &self.text;
        if !(text[self.at] == '/' && text.get(self.at + 1) == Some(&'*')) {
            return false;
        }
        let close = (self.at + 2..text.len().saturating_sub(1))
            .find(|&index| text[index] == '*' && text[index + 1] == '/')
            .map_or(text.len(), |index| index + 2);
        self.out.extend(&text[self.at..close]);
        self.at = close;
        true
    }

    /// Where a string that opens here ends, past its closing quote.
    fn string_end(&self) -> Option<usize> {
        (self.text[self.at] == '"').then(|| {
            (self.at + 1..self.text.len())
                .find(|&index| self.text[index] == '"')
                .map_or(self.text.len(), |index| index + 1)
        })
    }

    /// Write a field whose name, or quoted name such as a union's tag, starts
    /// here as read-only, and an optional one open to `undefined`; say whether
    /// there was one.
    fn field(&mut self) -> bool {
        let text = &self.text;
        let character = text[self.at];
        if !(self.field_start
            && (character.is_alphabetic() || character == '_' || character == '"'))
        {
            return false;
        }
        let name_end = self.string_end().unwrap_or_else(|| {
            (self.at..text.len())
                .find(|&index| !(text[index].is_alphanumeric() || text[index] == '_'))
                .unwrap_or(text.len())
        });
        let optional = text.get(name_end) == Some(&'?');
        let colon = name_end + usize::from(optional);
        if text.get(colon) != Some(&':') {
            return false;
        }
        self.out.push_str("readonly ");
        self.out.extend(&text[self.at..=colon]);
        self.at = colon + 1;
        self.field_start = false;
        if optional {
            self.open_to_undefined();
        }
        true
    }

    /// Write the type of an optional field that starts here as a union with `undefined`.
    fn open_to_undefined(&mut self) {
        let end = end_of_type(&self.text, self.at);
        let field_type: String = self.text[self.at..end].iter().collect();
        self.out.push_str(field_type.trim_end());
        self.out.push_str(" | undefined");
        self.out
            .push_str(&field_type[field_type.trim_end().len()..]);
        self.at = end;
    }

    /// Copy a string that opens here, and say whether there was one.
    fn string(&mut self) -> bool {
        let Some(close) = self.string_end() else {
            return false;
        };
        self.out.extend(&self.text[self.at..close]);
        self.at = close;
        true
    }

    /// Copy one character, keeping track of the brackets it opens and closes
    /// and of whether a field's name may follow it.
    fn character(&mut self) {
        let character = self.text[self.at];
        match character {
            '{' => {
                self.objects.push(true);
                self.field_start = true;
            }
            '[' | '(' | '<' => {
                self.objects.push(false);
                self.field_start = false;
            }
            '}' | ']' | ')' => {
                self.objects.pop();
                self.field_start = false;
            }
            '>' if self.at > 0 && self.text[self.at - 1] != '=' => {
                self.objects.pop();
                self.field_start = false;
            }
            ',' => self.field_start = self.objects.last() == Some(&true),
            character if character.is_whitespace() => {}
            _ => self.field_start = false,
        }
        self.out.push(character);
        self.at += 1;
    }
}

/// A declaration with every object field read-only, every optional field
/// open to `undefined`, and every array a read-only one.
fn read_only(declaration: &str) -> String {
    let mut reading = ReadOnly {
        text: declaration
            .replace("Array<", "ReadonlyArray<")
            .chars()
            .collect(),
        at: 0,
        out: String::new(),
        objects: Vec::new(),
        field_start: false,
    };
    while reading.at < reading.text.len() {
        if !(reading.comment() || reading.field() || reading.string()) {
            reading.character();
        }
    }
    reading.out
}

/// Print the declarations in the order of their names, each exported and
/// read-only, under the header that says where they came from: the same file
/// from the same types, whatever order the types are reached in.
#[expect(
    clippy::print_stdout,
    reason = "the binary's output is the TypeScript it prints, which build-core.ts reads"
)]
fn main() {
    let config = Config::new();
    let mut declarations = Declarations {
        config: &config,
        seen: HashSet::new(),
        out: BTreeMap::new(),
    };
    declarations.visit::<PaintRequest>();
    // A board's words, measured before its layout places anything.
    declarations.visit::<BoardWords>();
    declarations.visit::<MeasuredWords>();
    // The drawing a layout answers, before its bridges are spliced in.
    declarations.visit::<ArchitectureDrawing<NodeFacts, EdgeFacts>>();
    declarations.visit::<Scene>();
    declarations.visit::<PaintedDocument>();
    // Named only in the TypeScript written by hand for an atlas's boxes.
    declarations.visit::<AtlasBox>();
    let mut file = String::from(
        "// Generated by crates/archboard-scene/src/bin/export-types.rs from the core's Rust types.\n// `bun run build:core` writes it; do not edit it.\n\n",
    );
    for declaration in declarations.out.values() {
        file.push_str("export ");
        file.push_str(&read_only(declaration));
        file.push_str("\n\n");
    }
    print!("{}", file.trim_end());
    println!();
}

#[cfg(test)]
mod tests {
    use super::read_only;

    #[test]
    fn makes_every_field_read_only_a_union_tag_too() {
        assert_eq!(
            read_only(
                r#"type Item = { "type": "text", text: string, } | { "type": "group" } & Group;"#
            ),
            r#"type Item = { readonly "type": "text", readonly text: string, } | { readonly "type": "group" } & Group;"#
        );
    }

    #[test]
    fn opens_an_optional_field_to_undefined_and_reads_an_array_only() {
        assert_eq!(
            read_only("type A = { title?: string, runs: Array<Run>, };"),
            "type A = { readonly title?: string | undefined, readonly runs: ReadonlyArray<Run>, };"
        );
    }
}

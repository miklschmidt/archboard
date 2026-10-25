//! Print the TypeScript types of the core's contract: the paint request, the
//! scene and the painted document, with every type they name (ADR 0057).
//! `scripts/build-core.ts` writes them beside the WebAssembly build, so the
//! TypeScript side never holds a copy of its own.
//!
//! Every field is read-only, and every optional field may hold `undefined`, as
//! the repository's TypeScript writes its own types.

use std::any::TypeId;
use std::collections::HashSet;

use archboard_scene::drawing::{ArchitectureDrawing, EdgeFacts, NodeFacts};
use archboard_scene::request::PaintRequest;
use archboard_scene::scene::{AtlasBox, PaintedDocument, Scene, Value};
use ts_rs::{Config, TS, TypeVisitor};

/// Every declared type reached, each once, in the order first reached.
struct Declarations<'config> {
    config: &'config Config,
    seen: HashSet<TypeId>,
    names: HashSet<String>,
    out: Vec<String>,
}

impl TypeVisitor for Declarations<'_> {
    fn visit<T: TS + 'static + ?Sized>(&mut self) {
        if T::output_path().is_none() || !self.seen.insert(TypeId::of::<T>()) {
            return;
        }
        // A generic type is declared once, with its parameters.
        let declaration = <T::WithoutGenerics as TS>::decl(self.config);
        if self.names.insert(T::ident(self.config)) {
            self.out.push(declaration);
        }
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

/// A declaration with every object field read-only, every optional field
/// open to `undefined`, and every array a read-only one.
fn read_only(declaration: &str) -> String {
    let text: Vec<char> = declaration
        .replace("Array<", "ReadonlyArray<")
        .chars()
        .collect();
    let mut out = String::new();
    // Whether each open bracket is an object's brace.
    let mut objects: Vec<bool> = Vec::new();
    let mut field_start = false;
    let mut at = 0;
    while at < text.len() {
        let character = text[at];
        if character == '/' && text.get(at + 1) == Some(&'*') {
            let close = (at + 2..text.len().saturating_sub(1))
                .find(|&index| text[index] == '*' && text[index + 1] == '/')
                .map_or(text.len(), |index| index + 2);
            out.extend(&text[at..close]);
            at = close;
            continue;
        }
        // Where a string that opens here ends, past its closing quote.
        let string_end = (character == '"').then(|| {
            (at + 1..text.len())
                .find(|&index| text[index] == '"')
                .map_or(text.len(), |index| index + 1)
        });
        if field_start && (character.is_alphabetic() || character == '_' || character == '"') {
            // A field's name, or a quoted one such as a union's tag.
            let name_end = string_end.unwrap_or_else(|| {
                (at..text.len())
                    .find(|&index| !(text[index].is_alphanumeric() || text[index] == '_'))
                    .unwrap_or(text.len())
            });
            let optional = text.get(name_end) == Some(&'?');
            let colon = name_end + usize::from(optional);
            if text.get(colon) == Some(&':') {
                out.push_str("readonly ");
                out.extend(&text[at..=colon]);
                at = colon + 1;
                field_start = false;
                if optional {
                    let end = end_of_type(&text, at);
                    let field_type: String = text[at..end].iter().collect();
                    out.push_str(field_type.trim_end());
                    out.push_str(" | undefined");
                    out.push_str(&field_type[field_type.trim_end().len()..]);
                    at = end;
                }
                continue;
            }
        }
        if let Some(close) = string_end {
            out.extend(&text[at..close]);
            at = close;
            continue;
        }
        match character {
            '{' => {
                objects.push(true);
                field_start = true;
            }
            '[' | '(' | '<' => {
                objects.push(false);
                field_start = false;
            }
            '}' | ']' | ')' => {
                objects.pop();
                field_start = false;
            }
            '>' if at > 0 && text[at - 1] != '=' => {
                objects.pop();
                field_start = false;
            }
            ',' => field_start = objects.last() == Some(&true),
            character if character.is_whitespace() => {}
            _ => field_start = false,
        }
        out.push(character);
        at += 1;
    }
    out
}

/// Print the declarations, each exported and read-only, under the header that
/// says where they came from.
#[expect(
    clippy::print_stdout,
    reason = "the binary's output is the TypeScript it prints, which build-core.ts reads"
)]
fn main() {
    let config = Config::new();
    let mut declarations = Declarations {
        config: &config,
        seen: HashSet::new(),
        names: HashSet::new(),
        out: Vec::new(),
    };
    declarations.visit::<PaintRequest>();
    // The drawing a layout answers, before its bridges are spliced in.
    declarations.visit::<ArchitectureDrawing<NodeFacts, EdgeFacts>>();
    declarations.visit::<Scene>();
    declarations.visit::<PaintedDocument>();
    // Named only in the TypeScript written by hand for an attribute list and for an atlas's boxes.
    declarations.visit::<Value>();
    declarations.visit::<AtlasBox>();
    let mut file = String::from(
        "// Generated by crates/archboard-scene/src/bin/export-types.rs from the core's Rust types.\n// `bun run build:core` writes it; do not edit it.\n\n",
    );
    for declaration in &declarations.out {
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

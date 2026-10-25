//! JSON spelt as `JSON.stringify` spells it: numbers as ECMAScript writes
//! them, keys in the order they were set. What the layout answers and what it
//! asks Graphviz are compared with what the TypeScript engine wrote.

use crate::ecma;

/// A JSON value, its object keys in the order they were set.
#[derive(Clone, Debug)]
pub enum J {
    Num(f64),
    Str(String),
    Bool(bool),
    Arr(Vec<J>),
    Obj(Vec<(String, J)>),
}

impl J {
    /// An object from its members, in order.
    pub fn obj<const N: usize>(members: [(&str, J); N]) -> J {
        J::Obj(
            members
                .into_iter()
                .map(|(key, value)| (key.to_owned(), value))
                .collect(),
        )
    }

    /// A string.
    pub fn str(value: &str) -> J {
        J::Str(value.to_owned())
    }

    /// The text `JSON.stringify` writes for it.
    pub fn text(&self) -> String {
        let mut out = String::new();
        self.write(&mut out);
        out
    }

    /// Write the text into a string.
    pub fn write(&self, out: &mut String) {
        match self {
            J::Num(value) => number_into(out, *value),
            J::Str(value) => string_into(out, value),
            J::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            J::Arr(values) => {
                out.push('[');
                for (index, value) in values.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    value.write(out);
                }
                out.push(']');
            }
            J::Obj(members) => {
                out.push('{');
                for (index, (key, value)) in members.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    string_into(out, key);
                    out.push(':');
                    value.write(out);
                }
                out.push('}');
            }
        }
    }
}

/// A number, as `JSON.stringify` writes it: `null` when it is not finite.
pub fn number_into(out: &mut String, value: f64) {
    if value.is_finite() {
        out.push_str(&ecma::number(value));
    } else {
        out.push_str("null");
    }
}

/// A string as `JSON.stringify` quotes it.
pub fn string_into(out: &mut String, value: &str) {
    out.push('"');
    for character in value.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            control if (control as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", control as u32));
            }
            other => out.push(other),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spells_as_json_stringify_does() {
        let value = J::obj([
            ("a", J::Num(5.0)),
            ("b", J::Num(-0.0)),
            ("c", J::Arr(vec![J::Num(0.1 + 0.2), J::Bool(true)])),
            ("d", J::str("x\"y\n")),
            ("e", J::Num(f64::NAN)),
        ]);
        assert_eq!(
            value.text(),
            r#"{"a":5,"b":0,"c":[0.30000000000000004,true],"d":"x\"y\n","e":null}"#
        );
    }
}

//! The word the contract spells a value with, read through its own serde
//! rename, so no second table of the same words is written by hand.

use serde::Serialize;
use serde::ser::{self, Impossible};

/// Why a value has no word: it is not a variant without fields.
#[derive(Debug)]
pub struct NoWord;

impl std::fmt::Display for NoWord {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("only a variant without fields has a word")
    }
}

impl std::error::Error for NoWord {}

impl ser::Error for NoWord {
    fn custom<T: std::fmt::Display>(_: T) -> Self {
        NoWord
    }
}

/// A serializer that answers the word of a variant without fields.
struct Word;

/// The methods of a value that has no word.
macro_rules! no_word {
    ($($method:ident($($argument:ty),*)),* $(,)?) => {
        $(fn $method(self, $(_: $argument),*) -> Result<&'static str, NoWord> { Err(NoWord) })*
    };
}

impl ser::Serializer for Word {
    type Ok = &'static str;
    type Error = NoWord;
    type SerializeSeq = Impossible<&'static str, NoWord>;
    type SerializeTuple = Impossible<&'static str, NoWord>;
    type SerializeTupleStruct = Impossible<&'static str, NoWord>;
    type SerializeTupleVariant = Impossible<&'static str, NoWord>;
    type SerializeMap = Impossible<&'static str, NoWord>;
    type SerializeStruct = Impossible<&'static str, NoWord>;
    type SerializeStructVariant = Impossible<&'static str, NoWord>;

    fn serialize_unit_variant(
        self,
        _: &'static str,
        _: u32,
        variant: &'static str,
    ) -> Result<&'static str, NoWord> {
        Ok(variant)
    }

    no_word!(
        serialize_bool(bool),
        serialize_i8(i8),
        serialize_i16(i16),
        serialize_i32(i32),
        serialize_i64(i64),
        serialize_u8(u8),
        serialize_u16(u16),
        serialize_u32(u32),
        serialize_u64(u64),
        serialize_f32(f32),
        serialize_f64(f64),
        serialize_char(char),
        serialize_str(&str),
        serialize_bytes(&[u8]),
        serialize_none(),
        serialize_unit(),
        serialize_unit_struct(&'static str),
    );

    fn serialize_some<T: ?Sized + Serialize>(self, _: &T) -> Result<&'static str, NoWord> {
        Err(NoWord)
    }

    fn serialize_newtype_struct<T: ?Sized + Serialize>(
        self,
        _: &'static str,
        _: &T,
    ) -> Result<&'static str, NoWord> {
        Err(NoWord)
    }

    fn serialize_newtype_variant<T: ?Sized + Serialize>(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: &T,
    ) -> Result<&'static str, NoWord> {
        Err(NoWord)
    }

    fn serialize_seq(self, _: Option<usize>) -> Result<Self::SerializeSeq, NoWord> {
        Err(NoWord)
    }

    fn serialize_tuple(self, _: usize) -> Result<Self::SerializeTuple, NoWord> {
        Err(NoWord)
    }

    fn serialize_tuple_struct(
        self,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeTupleStruct, NoWord> {
        Err(NoWord)
    }

    fn serialize_tuple_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeTupleVariant, NoWord> {
        Err(NoWord)
    }

    fn serialize_map(self, _: Option<usize>) -> Result<Self::SerializeMap, NoWord> {
        Err(NoWord)
    }

    fn serialize_struct(self, _: &'static str, _: usize) -> Result<Self::SerializeStruct, NoWord> {
        Err(NoWord)
    }

    fn serialize_struct_variant(
        self,
        _: &'static str,
        _: u32,
        _: &'static str,
        _: usize,
    ) -> Result<Self::SerializeStructVariant, NoWord> {
        Err(NoWord)
    }
}

/// The word the contract spells a variant without fields with, as its serde
/// rename gives it.
///
/// # Errors
///
/// A value that is not a variant without fields.
pub fn word_of<T: Serialize + ?Sized>(value: &T) -> Result<&'static str, NoWord> {
    value.serialize(Word)
}

/// The word of a value of an enum whose every variant has no fields.
///
/// # Panics
///
/// On a value that is not such a variant: a type with fields has no word.
pub fn word<T: Serialize + ?Sized>(value: &T) -> &'static str {
    word_of(value).expect("a variant without fields has a word")
}

#[cfg(test)]
mod tests {
    use super::word_of;
    use crate::drawing::{Emphasis, FontFamily};
    use crate::request::{PaletteColor, Standing};

    #[test]
    fn spells_a_variant_as_its_rename_does() {
        assert_eq!(word_of(&Standing::Added).ok(), Some("added"));
        assert_eq!(word_of(&PaletteColor::Fuchsia).ok(), Some("fuchsia"));
        assert_eq!(word_of(&Emphasis::Hero).ok(), Some("hero"));
        assert_eq!(word_of(&FontFamily::Mono).ok(), Some("mono"));
        word_of(&1.5).unwrap_err();
    }
}

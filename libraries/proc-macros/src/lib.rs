extern crate static_assertions;

use proc_macro::TokenStream;

mod mem;

/// Use the "aligns" or "size" options to ensure memory and storage safety with state structs or enums.
///
/// *aligns*: Ensure struct can be included in a parent struct that is packed (e.g. anchor's zero_copy)
///           without messing up the parent's alignment
///           *Important*: This does not guarantee alignment within this struct!
///
/// *size: usize*: Enforces that the struct is a specific size
///
/// For example, decorate a struct with any of these attributes:
/// #[assert_size(128, aligns)
/// #[assert_size(128)
/// #[assert_size(aligns)
/// #[assert_size(aligns, 128)
#[proc_macro_attribute]
pub fn assert_size(args: TokenStream, input_struct: TokenStream) -> TokenStream {
    mem::handler(args, input_struct)
}

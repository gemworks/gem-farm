use proc_macro::TokenStream;
use proc_macro2;
use quote::{quote, ToTokens};
use syn::{ItemEnum, ItemStruct};

pub fn handler(args: TokenStream, input: TokenStream) -> TokenStream {
    let (ident, item) = (keep_trying! {
        parse!(input as ItemStruct);
        parse!(input as ItemEnum);
    })
    .expect("Must be an enum or a struct");
    let new_tokens = parse_args(&args)
        .iter()
        .map(|c| to_token(c, &ident))
        .collect::<Vec<_>>();
    let tokens = quote! {
        #(#new_tokens)*
        #item
    };
    TokenStream::from(tokens)
}

macro_rules! parse {
    ($input:ident as $type:ty) => {
        syn::parse::<$type>($input.clone()).map(|s| (s.ident.clone(), s.to_token_stream()))
    };
}
use parse;

macro_rules! keep_trying {
    ($first:expr; $($rest:expr);+;) => {
        match $first {
            Ok(ret) => Some(ret),
            Err(_) => keep_trying! { $($rest);+; },
        }
    };
    ($first:expr;) => {
        match $first {
            Ok(ret) => Some(ret),
            Err(_) => None,
        }
    };
}
use keep_trying;

enum Constraint {
    Aligns,
    Size(usize),
}

fn to_token(constraint: &Constraint, name: &proc_macro2::Ident) -> proc_macro2::TokenStream {
    match constraint {
        Constraint::Aligns => quote! {
            static_assertions::const_assert_eq!(0, std::mem::size_of::<#name>() % 8);
        },
        Constraint::Size(size) => quote! {
            static_assertions::const_assert_eq!(#size, std::mem::size_of::<#name>());
        },
    }
}

fn parse_args(args: &TokenStream) -> Vec<Constraint> {
    args.to_string()
        .split(',')
        .into_iter()
        .map(|arg| {
            let standarg: String = arg
                .to_string()
                .replace("\"", "")
                .chars()
                .filter(|c| !c.is_whitespace())
                .collect();
            if standarg == "aligns" {
                Constraint::Aligns
            } else if let Ok(size) = standarg.parse::<usize>() {
                Constraint::Size(size)
            } else {
                panic!("Invalid argument: {}", arg);
            }
        })
        .collect()
}

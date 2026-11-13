//! LexLean's command line as a WebAssembly library. `run` is `lexlean::cli::run` with the arguments the host
//! supplies; `data` is `lexlean::identity_bytes`. Nothing here decides anything about a spec.
// An exported symbol is the one thing here the compiler calls unsafe: the three names below are this library's whole
// surface, and no other unsafe code is allowed.
#![deny(unsafe_op_in_unsafe_fn)]
#![allow(unsafe_code)]

use std::io::Write;

/// Runs one LexLean command with the host's arguments and returns its documented exit code.
#[export_name = "run"]
pub extern "C" fn run() -> i32 {
    let arguments: Vec<String> = std::env::args().collect();
    let mut stdout = std::io::stdout();
    let mut stderr = std::io::stderr();
    let code = lexlean::cli::run(
        &arguments,
        camino::Utf8Path::new("/"),
        &mut stdout,
        &mut stderr,
    );
    let _ = stdout.flush();
    let _ = stderr.flush();
    code
}

/// Writes the data form of the source named by the one argument to standard output: 0 when the source holds a
/// module in the notation, 1 when it holds none or one that is not well formed, 2 when it cannot be read.
#[export_name = "data"]
pub extern "C" fn data() -> i32 {
    let Some(path) = std::env::args().nth(1) else {
        return 2;
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return 2;
    };
    match lexlean::identity_bytes(&path, &bytes) {
        std::borrow::Cow::Owned(data) => {
            let mut stdout = std::io::stdout();
            let written = stdout.write_all(&data).and_then(|()| stdout.flush());
            i32::from(written.is_err()) * 2
        }
        std::borrow::Cow::Borrowed(_) => 1,
    }
}

/// Computes the compiler-semantics ID of language 1.2 once, so the first check does not wait for it.
#[export_name = "warm"]
pub extern "C" fn warm() -> i32 {
    let _ = lexlean::compiler_semantics_id_for(lexlean::LANGUAGE_1_2);
    0
}

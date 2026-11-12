//! nanoda_lib behind four exports, with no rule of its own. The export is read through nanoda's own standard-input
//! path, so the host answers a handful of WASI calls and no file, thread or socket exists for the module. nanoda reports a refusal by panicking, so a refusal is a trap whose message is left in the
//! result buffer for the host to read.
//!
//! `admitted` is the one decision made here and it is not a typing rule: the first `admitted` declarations of the
//! export are entered into the environment without being checked again. The host may pass a number above zero only
//! for a prefix whose bytes it has matched against an address that a full check (admitted = 0) accepted.

use std::sync::Mutex;

use nanoda_lib::env::Declar;
use nanoda_lib::util::Config;
use serde_json::{json, Value};

static RESULT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

fn set_result(value: &Value) {
    let mut slot = RESULT.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *slot = serde_json::to_vec(value).unwrap_or_default();
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const u8 {
    RESULT.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).as_ptr()
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    RESULT.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).len()
}

/// Check an export. Returns 1 when every declaration was accepted, 0 when the export or the options were refused
/// before checking began; a declaration that does not check traps. The result buffer says which and why.
///
/// # Safety
/// The region must have come from `alloc` with this length and been filled by the host.
#[no_mangle]
pub unsafe extern "C" fn check(options: *mut u8, options_len: usize) -> u32 {
    std::panic::set_hook(Box::new(|info| {
        set_result(&json!({ "ok": false, "stage": "kernel", "refusal": info.to_string() }));
    }));
    let options = Vec::from_raw_parts(options, options_len, options_len);
    match run(&options) {
        Ok(value) => {
            set_result(&value);
            1
        }
        Err(message) => {
            set_result(&json!({ "ok": false, "stage": "input", "refusal": message }));
            0
        }
    }
}

fn run(options: &[u8]) -> Result<Value, String> {
    let options: Value = serde_json::from_slice(options).map_err(|e| format!("options: {e}"))?;
    let admitted = options.get("admitted").and_then(Value::as_u64).unwrap_or(0) as usize;
    let permitted: Vec<String> = match options.get("permitted_axioms") {
        Some(list) => serde_json::from_value(list.clone()).map_err(|e| format!("permitted_axioms: {e}"))?,
        None => Vec::new(),
    };
    // Config has no constructor; it is read from JSON exactly as nanoda's own binary reads its file.
    let config: Config = serde_json::from_value(json!({
        "use_stdin": true,
        "permitted_axioms": permitted,
        // An axiom outside the list is left out of the environment, so a declaration that uses it fails; the
        // prelude declares sorryAx without anything here using it.
        "unpermitted_axiom_hard_error": false,
        "nat_extension": true,
        "string_extension": true,
        "print_success_message": false,
        "print_axioms": false,
    }))
    .map_err(|e| format!("config: {e}"))?;

    let (file, skipped_axioms) = config.to_export_file().map_err(|e| format!("export: {e}"))?;
    if admitted > file.declars.len() {
        return Err(format!("admitted {admitted} exceeds the {} declarations exported", file.declars.len()));
    }

    let mut theorems = Vec::new();
    let mut axioms = Vec::new();
    let mut checked = 0usize;
    for (index, (name, declar)) in file.declars.iter().enumerate() {
        let printed = || file.with_ctx(|ctx| format!("{:?}", ctx.debug_print(*name)));
        if let Declar::Axiom { .. } = declar {
            axioms.push(printed());
        }
        if index < admitted {
            continue;
        }
        file.check_declar(declar);
        checked += 1;
        if let Declar::Theorem { .. } = declar {
            theorems.push(printed());
        }
    }
    Ok(json!({
        "ok": true,
        "declarations": file.declars.len(),
        "admitted": admitted,
        "checked": checked,
        "theorems": theorems,
        "axioms_in_environment": axioms,
        "axioms_left_out": skipped_axioms,
        "checker": concat!("nanoda_lib ", "0.4.32"),
    }))
}

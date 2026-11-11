//! Execute the real Studio authoring checker and its independent mutations.
use std::path::PathBuf;
use std::process::Command;

/// FA-02 checks every projected file without allowing the checker to repair drift.
#[test]
fn authoring_projection_fa_02() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("python3")
        .arg("-B")
        .arg(root.join("studio/tools/test_author.py"))
        .output()
        .expect("the locked SDK provides Python");
    let diagnostics = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "{diagnostics}");
    assert!(
        diagnostics.contains("Ran 8 tests"),
        "incomplete oracle: {diagnostics}"
    );
    assert!(
        !diagnostics.contains("skipped"),
        "omitted oracle: {diagnostics}"
    );
}

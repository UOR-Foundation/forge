//! The Pages export boundary is exercised with inert filesystem fixtures.

use std::path::PathBuf;
use std::process::Command;

#[test]
fn clean_export_pages_release_fr_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let output = Command::new("python3")
        .args(["-I", "-B", "bootstrap/test-pages-export.py"])
        .current_dir(root)
        .output()
        .expect("Python runs the complete release boundary suite");
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "FR-01: 8 tests, no skips, all passed",
        "The complete release boundary suite must execute without skips"
    );
    assert!(
        output.status.success(),
        "Pages release boundary failed:\n{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

//! The `pages-source-binding` suite: one test per scenario in `features/suites/pages-source-binding.feature`.
use std::path::PathBuf;
use std::process::Command;

/// `FA-90`: Kernel adoption and live evidence bind the actual source and deployed bytes
#[test]
fn pages_source_binding_fa_90() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/pages_source_binding.test.mjs"))
        .arg(root.join("studio/tools/pages_live_identity.test.mjs"))
        .arg(root.join("studio/tools/canonical_generation.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for required in [
        "# tests 19",
        "# pass 19",
        "# fail 0",
        "# cancelled 0",
        "# skipped 0",
        "# todo 0",
    ] {
        assert!(
            report.lines().any(|line| line == required),
            "incomplete oracle: {report}"
        );
    }
}

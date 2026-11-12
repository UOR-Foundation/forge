//! Execute the complete release-readiness boundary and its negative controls.
use std::path::PathBuf;
use std::process::Command;

#[test]
fn release_readiness_fa_85() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/release_readiness.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for required in [
        "# tests 84",
        "# pass 84",
        "# fail 0",
        "# cancelled 0",
        "# skipped 0",
        "# todo 0",
    ] {
        assert_eq!(
            report.lines().filter(|line| *line == required).count(),
            1,
            "incomplete oracle: {report}"
        );
    }
}

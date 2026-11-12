//! The `app-covers` suite: one test per scenario in `features/suites/app-covers.feature`.
use std::path::PathBuf;
use std::process::Command;

/// `AC-01`: App covers are captured only from the asked preview, never from a blank frame, and card words are stored only within the sentence and tag rules
///
/// The card rules run here; the capture across the sandbox runs in Chromium in Studio CI
/// (`studio/tools/covers_browser.mjs`), where the renderer's locked html-to-image is installed.
#[test]
fn app_covers_ac_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/covers.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for required in [
        "# tests 8",
        "# pass 8",
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

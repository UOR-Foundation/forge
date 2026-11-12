//! Execute the complete kernel-adoption boundary and its negative controls.
use std::path::PathBuf;
use std::process::Command;

#[test]
fn kernel_adoption_fa_86() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    // A clean SDK acceptance run has no Studio workflow setup or warmed modules.
    // Install only the committed production lock before executing the real verifier.
    let install = Command::new("npm")
        .args([
            "ci",
            "--prefix",
            "studio/tools/kernel-adoption",
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
        ])
        .current_dir(&root)
        .output()
        .expect("the locked SDK supplies npm");
    assert!(
        install.status.success(),
        "locked verifier installation failed:\n{}\n{}",
        String::from_utf8_lossy(&install.stdout),
        String::from_utf8_lossy(&install.stderr)
    );
    let output = Command::new("node")
        .args(["--test", "--test-reporter=tap"])
        .arg(root.join("studio/tools/kernel_adoption.test.mjs"))
        .output()
        .expect("the locked SDK supplies Node");
    let report = String::from_utf8_lossy(&output.stdout);
    assert!(
        output.status.success(),
        "{report}\n{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for required in [
        "# tests 60",
        "# pass 60",
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

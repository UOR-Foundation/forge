//! Proof controls for the pure work ownership model, checked by the locked SDK.
use std::path::PathBuf;

#[test]
fn work_ownership_fa_13() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let source = std::fs::read_to_string(root.join("app/src/WorkOwnership.lex.tex"))
        .expect("ownership model");
    let kernel =
        std::fs::read_to_string(root.join("app/src/ForgeKernel.lex.tex")).expect("library roots");
    for export in ["initialize", "transition"] {
        assert!(kernel.contains(&format!("\"PrismForgeKernel.WorkOwnership.{export}\"")));
    }
    let controls = [
        ("invalidStateRefused", "invalidState"),
        ("wrongOwnerRefused", "wrongOwner"),
        ("staleRevisionRefused", "staleRevision"),
        ("unreservedStartRefused", "reservationMissing"),
        ("reservedStartAdmitted", ""),
        ("runningReserveRefused", "invalidPhase"),
        ("emptyReserveRefused", "invalidAmount"),
        ("excessReserveRefused", "budgetExceeded"),
        ("reserveAdmitted", ""),
        ("progressAdmitted", ""),
        ("emptyProgressRefused", "invalidAmount"),
        ("unreservedProgressRefused", "reservationExceeded"),
        ("excessObligationRefused", "obligationExceeded"),
        ("staleCheckpointRefused", "checkpointNotAdvanced"),
        ("pauseRetainsWork", ""),
        ("pausedProgressRefused", "invalidPhase"),
        ("resumeRetainsWork", ""),
        ("emptyResumeRefused", "reservationMissing"),
        ("unfinishedRefused", "unfinishedWork"),
        ("completionReleasesReservation", ""),
        ("completedResumeRefused", "invalidPhase"),
        ("transferRetainsWork", ""),
        ("runningTransferRefused", "invalidPhase"),
        ("missingOwnerRefused", "invalidOwner"),
        ("initializeAdmitted", ""),
        ("initializeOwnerRefused", "invalidOwner"),
        ("initializeEmptyRefused", "invalidAmount"),
        ("pausedCompletionAdmitted", ""),
    ];
    assert_eq!(source.matches("theorem{").count(), controls.len());
    for (name, error) in controls {
        let marker = format!("theorem{{\n  name: {name},");
        let start = source.find(&marker).expect("named proof control");
        let end = source[start..].find("\n}\n").expect("closed proof");
        let proof = &source[start..start + end];
        assert!(
            proof.contains("statement: ((transition ")
                || proof.contains("statement: ((initialize ")
        );
        assert!(proof.contains("proof: reflexivity{}"), "unproved {name}");
        assert!(proof.contains("axioms: []"), "axiom escape {name}");
        if error.is_empty() {
            assert!(
                proof.contains(" = (ctor Result.ok [Work, WorkError] (record Work {"),
                "weakened result {name}"
            );
        } else {
            assert!(
                proof.contains(&format!(
                    " = (ctor Result.error [Work, WorkError] (ctor WorkError.{error}))),"
                )),
                "wrong error {name}"
            );
        }
    }
}

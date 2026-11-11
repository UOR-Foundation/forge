//! The declared proposal boundary is resolved through authoritative composition.
use std::path::PathBuf;
#[test]
fn proposal_admission_fa_18() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let source = std::fs::read_to_string(root.join("app/src/ProposalAdmission.lex.tex"))
        .expect("proposal model");
    let kernel =
        std::fs::read_to_string(root.join("app/src/ForgeKernel.lex.tex")).expect("export root");
    assert!(kernel.contains("\"PrismForgeKernel.ProposalAdmission.admitProposal\""));
    assert!(source.contains("(FeatureComposition::admitComposition policy features)"));
    let controls = [
        ("zeroConfidenceAdmitted", "", ""),
        ("exactVersionSelected", "", ""),
        ("maximumConfidenceAdmitted", "", ""),
        ("orderedDependenciesAdmitted", "", ""),
        ("duplicateRegistryRefused", "invalidRegistry", ""),
        ("malformedRegistryRefused", "invalidRegistry", ""),
        ("invalidConfidenceRefused", "invalidProposal", ""),
        ("zeroExpectedIntentRefused", "invalidProposal", ""),
        ("zeroExpectedRevisionRefused", "invalidProposal", ""),
        ("staleIntentRefused", "staleIntent", ""),
        ("staleRegistryRefused", "staleRegistry", ""),
        ("ambiguityRefused", "unresolvedAmbiguity", ""),
        ("constraintRefused", "unresolvedConstraint", ""),
        ("unknownFeatureRefused", "unregisteredFeature", ""),
        ("wrongVersionRefused", "unregisteredFeature", ""),
        (
            "emptySelectionRefused",
            "compositionRejected",
            "emptyComposition",
        ),
        (
            "duplicateSelectionRefused",
            "compositionRejected",
            "duplicateFeature",
        ),
        (
            "missingDependencyRefused",
            "compositionRejected",
            "missingDependency",
        ),
        (
            "wrongOrderRefused",
            "compositionRejected",
            "missingDependency",
        ),
        (
            "confidenceCannotGrantPermission",
            "compositionRejected",
            "permissionDenied",
        ),
        (
            "confidenceCannotIncreaseBudget",
            "compositionRejected",
            "budgetExceeded",
        ),
    ];
    assert_eq!(source.matches("theorem{").count(), controls.len());
    for (name, error, composition_error) in controls {
        let marker = format!("theorem{{\n  name: {name},");
        let start = source.find(&marker).expect("named control");
        let end = source[start..].find("\n}\n").expect("closed control");
        let proof = &source[start..start + end];
        assert!(proof.contains("statement: ((admitProposal "));
        assert!(proof.contains("proof: reflexivity{}"));
        assert!(proof.contains("axioms: []"));
        if error.is_empty() {
            assert!(proof.contains(
                " = (ctor Result.ok [(List FeatureComposition::FeatureContract), ProposalError]"
            ));
        } else {
            assert!(
                proof.contains(&format!("(ctor ProposalError.{error}")),
                "wrong refusal {name}"
            );
            if !composition_error.is_empty() {
                assert!(
                    proof.contains(&format!(
                        "(ctor FeatureComposition::CompositionError.{composition_error})"
                    )),
                    "wrong composition refusal {name}"
                );
            }
        }
    }
}

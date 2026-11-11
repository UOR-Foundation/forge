//! Pin composition proof controls and the certified library export boundary.
//! The locked SDK checks the proofs and exports the actual recursive model.
use std::path::PathBuf;

fn declaration<'a>(source: &'a str, name: &str) -> &'a str {
    let start = source
        .find(&format!("\n  name: {name},\n"))
        .expect("named declaration");
    let end = source[start..].find("\n}\n").expect("closed declaration");
    &source[start..start + end]
}

#[test]
fn feature_composition_fa_06() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf();
    let source = std::fs::read_to_string(root.join("app/src/FeatureComposition.lex.tex"))
        .expect("composition model");
    let kernel =
        std::fs::read_to_string(root.join("app/src/ForgeKernel.lex.tex")).expect("kernel export");
    assert!(kernel.contains("\\importmodule{FeatureComposition}"));
    assert!(kernel.contains("\"PrismForgeKernel.FeatureComposition.admitComposition\""));
    let contract = declaration(&source, "FeatureContract");
    for name in [
        "key",
        "version",
        "vocabulary",
        "inputs",
        "outputs",
        "state",
        "events",
        "errors",
        "effects",
        "needs",
        "conflicts",
        "targets",
        "accessibility",
        "quality",
        "cpu",
        "memory",
    ] {
        assert!(
            contract.contains(&format!("name: {name}, type:")),
            "missing contract field {name}"
        );
    }
    for (name, error, required) in [
        ("emptyRefused", "emptyComposition", "(nil FeatureContract)"),
        ("singleAdmitted", "", "key := 1"),
        ("dependencyAdmitted", "", "schema := 7"),
        ("zeroIdentityRefused", "invalidDeclaration", "key := 0"),
        ("zeroVersionRefused", "invalidDeclaration", "version := 0"),
        (
            "emptyVocabularyRefused",
            "invalidDeclaration",
            "vocabulary := (nil Nat)",
        ),
        (
            "duplicateIdentityRefused",
            "duplicateFeature",
            "version := 2",
        ),
        (
            "missingDependencyRefused",
            "missingDependency",
            "needs := (cons",
        ),
        ("wrongVersionRefused", "missingDependency", "version := 2"),
        (
            "forwardDependencyRefused",
            "missingDependency",
            "schema := 7",
        ),
        (
            "incompatibleInputRefused",
            "incompatibleInput",
            "outputs := (cons 8",
        ),
        (
            "priorConflictRefused",
            "featureConflict",
            "conflicts := (cons 2",
        ),
        (
            "newConflictRefused",
            "featureConflict",
            "conflicts := (cons 1",
        ),
        (
            "permissionRefused",
            "permissionDenied",
            "effects := (cons 6",
        ),
        ("targetRefused", "unsupportedTarget", "targets := (cons 2"),
        (
            "evidenceRefused",
            "missingEvidence",
            "evidence := (cons 10 (nil Nat))",
        ),
        ("cpuRefused", "budgetExceeded", "cpu := 3"),
        ("memoryRefused", "budgetExceeded", "memory := 5"),
    ] {
        let proof = declaration(&source, name);
        assert!(
            proof.contains("statement: ((admitComposition "),
            "wrong control: {name}"
        );
        assert!(proof.contains(required), "weakened input: {name}");
        let outcome = if error.is_empty() {
            "(ctor Result.ok [Bool, CompositionError] true)".to_owned()
        } else {
            format!("(ctor Result.error [Bool, CompositionError] (ctor CompositionError.{error}))")
        };
        assert!(
            proof.contains(&format!(" = {outcome}),")),
            "weakened outcome: {name}"
        );
        assert!(proof.contains("proof: reflexivity{}"), "unproved: {name}");
        assert!(proof.contains("axioms: []"), "axiom escape: {name}");
    }
}

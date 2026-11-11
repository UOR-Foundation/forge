//! Event semantics are owned by the compiled model, including its negative controls.
use std::path::PathBuf;
#[test]
fn event_admission_fa_19() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap()
        .to_path_buf();
    let source =
        std::fs::read_to_string(root.join("app/src/EventAdmission.lex.tex")).expect("event model");
    let kernel = std::fs::read_to_string(root.join("app/src/ForgeKernel.lex.tex")).unwrap();
    assert!(kernel.contains("\"PrismForgeKernel.EventAdmission.admitEvent\""));
    assert!(source.contains("(FeatureComposition::admitComposition policy features)"));
    let controls = [
        ("naturalEventAdmitted", ""),
        ("flagEventAdmitted", ""),
        ("bytesEventAdmitted", ""),
        ("emptyBytesAdmitted", ""),
        ("lastSequenceAdmitted", ""),
        ("revokedPermissionRefused", "compositionRejected"),
        ("invalidContractRefused", "invalidEventContract"),
        ("duplicateRouteRefused", "invalidEventContract"),
        ("missingRouteFeatureRefused", "invalidEventContract"),
        ("undeclaredFeatureEventRefused", "invalidEventContract"),
        ("staleGenerationRefused", "staleGeneration"),
        ("replayedSequenceRefused", "staleSequence"),
        ("futureSequenceRefused", "staleSequence"),
        ("wrongEventVersionRefused", "wrongEvent"),
        ("wrongEventKeyRefused", "wrongEvent"),
        ("wrongProducerRefused", "undeclaredRoute"),
        ("wrongConsumerRefused", "undeclaredRoute"),
        ("wrongFeatureVersionRefused", "undeclaredRoute"),
        ("wrongPayloadKindRefused", "invalidPayload"),
        ("invalidByteRefused", "invalidPayload"),
        ("oversizedPayloadRefused", "invalidPayload"),
        ("oversizedNaturalRefused", "invalidPayload"),
        ("exhaustedSequenceRefused", "invalidEventContext"),
        ("zeroGenerationRefused", "invalidEventContext"),
    ];
    assert_eq!(source.matches("theorem{").count(), controls.len());
    for (name, error) in controls {
        let marker = format!("theorem{{\n  name: {name},");
        let start = source.find(&marker).expect("named event control");
        let end = source[start..].find("\n}\n").expect("closed event control");
        let proof = &source[start..start + end];
        assert!(proof.contains("statement: ((admitEvent "));
        assert!(proof.contains("proof: reflexivity{}"));
        assert!(proof.contains("axioms: []"));
        if error.is_empty() {
            assert!(proof.contains(" = (ctor Result.ok [Nat, EventError]"));
        } else {
            assert!(proof.contains(&format!("(ctor EventError.{error}")));
        }
    }
}

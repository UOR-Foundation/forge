//! Pin the authority admission scenarios to their actual LexLean proof statements.
//! Execution and kernel checking belong to the locked SDK's app verification gate.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("repository root")
        .to_path_buf()
}

fn declaration<'a>(source: &'a str, name: &str) -> &'a str {
    let marker = format!("\n  name: {name},\n");
    let start = source.find(&marker).expect("named semantic declaration");
    let end = source[start..].find("\n}\n").expect("closed declaration");
    &source[start..start + end]
}

/// FA-01 binds both admitted and refused declarations to kernel-checked controls.
#[test]
fn application_authority_fa_01() {
    let source = std::fs::read_to_string(root().join("app/src/FoundrySpecification.lex.tex"))
        .expect("authoritative specification");
    let project = std::fs::read_to_string(root().join("app/src/ForgeKernel.lex.tex"))
        .expect("kernel entrypoint");
    assert!(project.contains("\\importmodule{FoundrySpecification}"));
    for (name, input, expected) in [
        (
            "missingProductOwner",
            "(ctor Ownership.product 0)",
            "(ctor Result.error [Bool, AuthorityError] (ctor AuthorityError.missingOwner))",
        ),
        (
            "oneProductOwner",
            "(ctor Ownership.product 1)",
            "(ctor Result.ok [Bool, AuthorityError] true)",
        ),
        (
            "competingProductOwners",
            "(ctor Ownership.product 2)",
            "(ctor Result.error [Bool, AuthorityError] (ctor AuthorityError.competingOwners))",
        ),
        (
            "uncheckedExternalBoundary",
            "(ctor Ownership.external 1 false)",
            "(ctor Result.error [Bool, AuthorityError] (ctor AuthorityError.uncheckedBoundary))",
        ),
        (
            "checkedExternalBoundary",
            "(ctor Ownership.external 1 true)",
            "(ctor Result.ok [Bool, AuthorityError] true)",
        ),
        (
            "missingExternalOwner",
            "(ctor Ownership.external 0 true)",
            "(ctor Result.error [Bool, AuthorityError] (ctor AuthorityError.missingOwner))",
        ),
        (
            "competingExternalOwners",
            "(ctor Ownership.external 2 true)",
            "(ctor Result.error [Bool, AuthorityError] (ctor AuthorityError.competingOwners))",
        ),
    ] {
        let control = declaration(&source, name);
        assert!(
            control.contains(&format!(
                "statement: ((admitAuthority {input}) = {expected}),"
            )),
            "weakened {name}: {control}"
        );
        assert!(
            control.contains("proof: reflexivity{}"),
            "missing proof: {name}"
        );
        assert!(
            control.contains("axioms: []"),
            "changed trust boundary: {name}"
        );
    }
}

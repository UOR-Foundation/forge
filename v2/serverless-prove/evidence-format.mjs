// Panic diagnostics can contain a compiler's build-time home directory. This display-only
// normalization preserves the source suffix, line/column and refusal, and never touches proof data.
export function agreementJSON(evidence) {
  return JSON.stringify(evidence, (key, value) => key === "why" && typeof value === "string"
    ? value.replace(/(\/(?:home|Users)\/)[^/\s]+\//g, "$1<build-user>/")
    : value, 1) + "\n";
}

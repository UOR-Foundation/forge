// FoundrySpecification.canonicalEditBoundary: prepare intent; the host commits it atomically.
const invalid = () => Object.assign(new Error("The canonical model edit is invalid or unsupported"), { code: "invalidCanonicalEdit" });
export const canonicalEditPath = path => path === "prism/spec.json" || path === "src/lib/prism.ts" || (typeof path === "string" && /^prism\/[A-Za-z_]\w*\.lex\.tex$/.test(path));
export function planCanonicalEdit(input, source, { lexlean, prism }) {
  try {
    if (!input || typeof input !== "object" || typeof input.filePath !== "string") throw invalid();
    if (!canonicalEditPath(input.filePath)) return null;
    const files = new Map(source.files), previousText = files.get("prism/spec.json");
    if (input.filePath === "src/lib/prism.ts") {
      if (files.has("prism/spec.json")) throw Object.assign(new Error("Edit the canonical model to change its generated rule runtime"), { code: "canonicalProjectionReadOnly" });
      return null;
    }
    let previous = null, previousPath = null;
    if (previousText !== undefined) {
      try { previous = JSON.parse(previousText); previousPath = `prism/${lexlean.canonicalSource(previous).name}.lex.tex`; }
      catch { if (input.filePath !== "prism/spec.json") throw invalid(); }
    }
    if (input.filePath !== "prism/spec.json" && previousPath && input.filePath !== previousPath) return null;
    if (typeof input.content !== "string" || input.content.length > 1024 * 1024 || new TextEncoder().encode(input.content).length > 1024 * 1024) throw invalid();
    let spec;
    if (input.filePath === "prism/spec.json") spec = JSON.parse(input.content);
    else {
      spec = lexlean.readLexLean(input.content);
      if (!previousPath && input.filePath !== `prism/${lexlean.canonicalSource(spec).name}.lex.tex`) throw invalid();
      for (const field of ["purpose", "view", "meanings"]) if (previous?.[field] !== undefined) spec[field] = structuredClone(previous[field]);
    }
    const checked = prism.checkSpec(spec);
    if (checked.ok !== true) throw invalid();
    lexlean.canonicalSource(checked.spec);
    return Object.freeze({ text: "<dyad-spec>" + JSON.stringify(checked.spec).replaceAll("<", "\\u003c") + "</dyad-spec>", warning: checked.notes?.length ? checked.notes.join("\n").slice(0, 2000) : null });
  } catch (error) {
    if (error?.code === "canonicalProjectionReadOnly") throw error;
    throw invalid();
  }
}

// FoundrySpecification.editorAssetBoundary: the loader is configured before mount.
import { loader } from "@monaco-editor/react";

const applicationBase = new URL(import.meta.env.BASE_URL, window.location.origin);
loader.config({ paths: { vs: new URL("editor/vs", applicationBase).href } });

// The app's own card for its published page: what Forge writes beside templateCommit's files, so the page
// draws what the live preview draws. The template's page (bootstrap/page.mjs) takes three optional files
// from an app and from nowhere else: site/card.html, whose surface slot it moves into the workspace;
// site/card.css, inlined and hashed into its policy; and site/card.mjs, which its app.mjs starts with the
// verified app. They are the app's, not the template's, so no file the template pins changes.
//
// card.html is the view (live-src/src/view.jsx) rendered for the app's default state; card.mjs is the card
// runtime (card-runtime.mjs, verbatim), the interpreter every app ships (for which rule decides, never for
// the answer) and the card's variants; card.css is the frame's sheet kept inside the card
// (tools/live_components.mjs). tools/published_preview.mjs holds the three to the view.
import { project } from "./project.mjs";
import { INTERPRETER, prismAnswer, prismDecide } from "../prism.js";

const interp = { prismAnswer, prismDecide };

/** `load(path)` gives the text of a file under shell/. */
export async function cardFiles(spec, { load }) {
  const [{ renderCard }, runtime, runtimeText, css] = await Promise.all([import("./card-render.mjs"), import("./card-runtime.mjs"), load("live/card-runtime.mjs"), load("live/card.css")]);
  const projection = project(spec);
  const card = renderCard(projection, interp);
  const values = runtime.defaults(card.logic, {});
  // The default state as the page first draws it, before the verified app has answered: as the rules say,
  // which is how the app answers every acceptance vector. card.mjs then asks the app and redraws.
  const guest = { verified: true, answer: prismDecide(card.logic, values), passes: await runtime.examplesPass(card, (request) => prismAnswer(card.logic, request)) };
  const html = `<div data-slot="surface" class="prism-card">${runtime.compose(card, values, guest, interp)}</div>\n`;
  const mjs = `// ${projection.title || spec.name}: this app's card, written by Forge from its spec. The answer shown is the verified app's.\n` +
    `${INTERPRETER}const CARD = ${JSON.stringify(card)};\n${runtimeText.replace(/\r\n/g, "\n")}\nexport default (context) => start(CARD, { prismAnswer, prismDecide }, context);\n`;
  return { card, files: [{ path: "site/card.html", content: html }, { path: "site/card.css", content: css.replace(/\r\n/g, "\n") }, { path: "site/card.mjs", content: mjs }] };
}

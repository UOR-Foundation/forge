// Mechanism 4: compute ahead. While idle, the adapter runs the app's own `dispatch` for every action
// on screen and stores each response by address. On a click the model decides hit or compute;
// a hit is read back through the verified store, a miss runs `dispatch`.
import { addressOf, list, natToHex, hexToNat } from "./model.mjs";

const H = "Ahead::";

// app: { address: Nat, dispatch(stateBytes, eventBytes) -> Uint8Array }; store: from createStore.
export function createAhead(model, app, store) {
  const id = (bytes) => addressOf(model.call("Store::blobPreimage", bytes));
  let table = model.call(H + "build", app.address, 0n, list([]));

  async function prepare(stateBytes, events) {
    const entries = [];
    for (const event of events) {
      const response = await store.put(app.dispatch(stateBytes, event));
      entries.push({ event: id(event), response: hexToNat(response) });
    }
    table = model.call(H + "build", app.address, id(stateBytes), list(entries));
  }

  async function respond(stateBytes, eventBytes) {
    const a = model.call(H + "answer", table, app.address, id(stateBytes), id(eventBytes));
    if (a.c === H + "Answer.hit") return { hit: true, response: await store.get(natToHex(a.a[0])) };
    return { hit: false, response: app.dispatch(stateBytes, eventBytes) };
  }

  return { prepare, respond, get table() { return table; } };
}

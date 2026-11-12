// Every state of the counter probe (count and stride, one byte each) with every event:
// increment, reset, and set-stride with four arguments. 393,216 requests, plus unknown tags.
export function* requests() {
  const h = (n) => n.toString(16).padStart(2, "0");
  for (let count = 0; count < 256; count++) for (let stride = 0; stride < 256; stride++) {
    const state = h(count) + h(stride);
    yield state + "0000"; yield state + "0100";
    for (const arg of [0, 1, 127, 255]) yield state + "02" + h(arg);
  }
  for (let tag = 3; tag < 256; tag += 11) yield "0502" + h(tag) + "00";
}

// Requests for the Payment Approval example that its vectors do not hold: every role, amount and
// limit around the boundaries the model decides on.
export function* requests() {
  const roles = ["clerk", "manager", "auditor", "", "Clerk", "clerk "];
  const numbers = ["0", "1", "2", "9", "10", "999", "1000", "1001", "5000", "9223372036854775806", "9223372036854775807", "9223372036854775808", "-1", "-0", "+1", "01", "1.0", "1e3", "", " 1", "1 ", "١"];
  for (const role of roles) for (const amount of numbers) for (const limit of numbers) yield `${role}\t${amount}\t${limit}`;
  for (let amount = 0; amount <= 1200; amount += 7) for (const limit of [0, 1, 500, 1000, 1199, 1200]) { yield `clerk\t${amount}\t${limit}`; yield `manager\t${amount}\t${limit}`; }
}

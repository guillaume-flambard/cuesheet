// The oracle. Plain node, no framework, no dependencies.
import { add } from "./add.mjs";

const cases = [
  [2, 3, 5],
  [10, -4, 6],
  [0, 0, 0],
];

let failed = 0;
for (const [a, b, want] of cases) {
  const got = add(a, b);
  if (got !== want) {
    console.log(`FAIL add(${a}, ${b}) = ${got}, want ${want}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.log(`${failed} failing`);
  process.exit(1);
}
console.log("all passing");

#!/usr/bin/env node
// Verifies every contract a forge broadcast created, against a Blockscout
// explorer. Useful when `forge script --verify` never ran (aborted script)
// or the chain's explorer is not Etherscan-compatible (Auto EVM / Chronos).
//
// Usage (from contracts/evm):
//   node script/verify-broadcast.mjs \
//     broadcast/Deploy.s.sol/8700/run-latest.json \
//     https://explorer.auto-evm.chronos.autonomys.xyz/api
//
// Constructor args are recovered by stripping the compiled creation code
// from each CREATE transaction's input — no per-contract encoding needed.
// Contracts the explorer already verified are reported as OK by forge, so
// re-runs are harmless.

import {readFileSync, readdirSync, statSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";

const [broadcastPath, verifierUrl] = process.argv.slice(2);
if (!broadcastPath || !verifierUrl) {
  console.error("usage: node verify-broadcast.mjs <run-latest.json> <blockscout-api-url>");
  process.exit(1);
}

function findArtifact(name) {
  const stack = ["out"];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      if (entry === "build-info") continue;
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) stack.push(p);
      else if (entry === `${name}.json`) return p;
    }
  }
  return null;
}

const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const creates = broadcast.transactions.filter((tx) => tx.transactionType === "CREATE");
if (creates.length === 0) {
  console.error("no CREATE transactions in broadcast file");
  process.exit(1);
}

const failures = [];
for (const tx of creates) {
  const name = tx.contractName;
  const address = tx.contractAddress;
  const artifactPath = findArtifact(name);
  if (!artifactPath) {
    console.error(`SKIP ${name} @ ${address}: no artifact under out/ (run forge build)`);
    failures.push(name);
    continue;
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const [sourcePath, contractName] = Object.entries(
    artifact.metadata.settings.compilationTarget
  )[0];
  const creationCode = artifact.bytecode.object;
  const input = tx.transaction.input;
  if (!input.startsWith(creationCode)) {
    console.error(
      `SKIP ${name} @ ${address}: creation input does not match the compiled ` +
        `bytecode — rebuild with the same compiler settings as the deploy`
    );
    failures.push(name);
    continue;
  }
  const constructorArgs = input.slice(creationCode.length);

  const args = [
    "verify-contract",
    address,
    `${sourcePath}:${contractName}`,
    "--verifier",
    "blockscout",
    "--verifier-url",
    verifierUrl,
    "--watch",
  ];
  if (constructorArgs.length > 0) args.push("--constructor-args", `0x${constructorArgs}`);

  console.log(`\n=== ${name} @ ${address}`);
  const result = spawnSync("forge", args, {stdio: "inherit"});
  if (result.status !== 0) failures.push(`${name} @ ${address}`);
}

console.log(`\n${creates.length - failures.length}/${creates.length} verified`);
if (failures.length > 0) {
  console.error(`failed: ${failures.join(", ")}`);
  process.exit(1);
}

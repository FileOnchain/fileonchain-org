/**
 * Regenerate src/abis/*.ts from the Foundry build output.
 * Run `forge build` in contracts/evm/ first, then: node scripts/extract-abis.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsOut = resolve(sdkRoot, "../../contracts/evm/out");

const CONTRACTS = [
  ["FileRegistry", "fileRegistryAbi"],
  ["FileOnChainToken", "fileOnChainTokenAbi"],
  ["ValidatorStaking", "validatorStakingAbi"],
  ["PlatformRegistry", "platformRegistryAbi"],
  ["FileOnChainGovernor", "fileOnChainGovernorAbi"],
  ["CachePayments", "cachePaymentsAbi"],
  ["DonationEscrow", "donationEscrowAbi"],
];

for (const [name, exportName] of CONTRACTS) {
  const artifact = JSON.parse(
    readFileSync(resolve(contractsOut, `${name}.sol/${name}.json`), "utf8")
  );
  const moduleName = name[0].toLowerCase() + name.slice(1);
  const source = `/**
 * ABI for contracts/evm/src/${name}.sol — generated from the Foundry build
 * output (contracts/evm/out). Regenerate after changing the contract:
 * cd contracts/evm && forge build, then re-run the extraction (see packages/sdk-evm/scripts/extract-abis.mjs).
 */
export const ${exportName} = ${JSON.stringify(artifact.abi, null, 2)} as const;
`;
  writeFileSync(resolve(sdkRoot, `src/abis/${moduleName}.ts`), source);
  console.log(`${name}: ${artifact.abi.length} ABI entries -> src/abis/${moduleName}.ts`);
}

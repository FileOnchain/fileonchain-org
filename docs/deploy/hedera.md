# Provision: Hedera (HCS topic)

Hedera anchors are **Hedera Consensus Service messages** — no contract to
deploy. Provisioning means creating one HCS topic per network and recording
its id; `isChainProvisioned` flips on from `hcsTopicId`. Create the
`hedera:testnet` topic first, QA, then `hedera:mainnet`.

## Prerequisites

- A Hedera operator account (`0.0.x`) with its private key. Testnet
  accounts come pre-funded from https://portal.hedera.com; mainnet needs a
  funded account.

## Create the topic

With the Hedera CLI (`npm i -g @hashgraph/hedera-cli`, `hcli setup init`):

```bash
hcli topic create --memo "fileonchain anchors"
```

Or a one-off script with `@hashgraph/sdk`:

```js
// node create-topic.mjs
import { Client, TopicCreateTransaction } from "@hashgraph/sdk";

const client = Client.forTestnet() // Client.forMainnet() for hedera:mainnet
  .setOperator(process.env.ANCHOR_HEDERA_OPERATOR_ID, process.env.ANCHOR_HEDERA_PRIVATE_KEY);

const receipt = await (await new TopicCreateTransaction()
  .setTopicMemo("fileonchain anchors")
  .execute(client)).getReceipt(client);
console.log("topic id:", receipt.topicId.toString());
client.close();
```

Capture the topic id (`0.0.x`). Leave the topic **without a submit key** so
anchoring stays permissionless, matching the other registries.

Smoke-test by submitting one anchor message and checking it at
`https://hashscan.io/testnet/topic/<topicId>`. Repeat on mainnet once QA
passes — each network gets its own topic.

Record the result in `packages/utils/src/chains.ts`: set `hcsTopicId` to the
topic id on the `hedera:testnet` entry first, then `hedera:mainnet`.
`isChainProvisioned` flips on from `hcsTopicId`.

Fund the server signer: `ANCHOR_HEDERA_OPERATOR_ID` (the `0.0.x` operator
account) and `ANCHOR_HEDERA_PRIVATE_KEY` are both required; the operator
pays the per-message HCS fee in HBAR on each network it serves.

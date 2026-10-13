---
title: From quote to entitlement: a PayXor checkout
description: A PayXor checkout from a backend-signed quote through a stablecoin payment to the entitlement check that unlocks access.
date: 2026-10-13
author: PayXor Team
tags: payxor, payments
---

PayXor already covers [why prices are signed on your backend](https://payxor.xyz/blog/backend-authoritative-pricing) and [how the four payment modes differ](https://payxor.xyz/blog/understanding-payment-modes). This post is the path those pieces take in an app: you define a product, your server signs a quote, the user pays in a stablecoin, and your app checks the entitlement on-chain.

![A signed quote document between an application server and a wallet, connected to a short chain of nodes.](/blog/images/checkout-quote-to-chain.jpg)

## What you set up once

A checkout needs three records before any wallet is involved.

- An **app**, with a payee address that receives the payment after the platform fee
- A **product**, with a payment mode and a price in USD
- A server-side **API key** for admin calls, stored as an environment variable and kept off the browser

PayXor charges a 1% platform fee on each payment. The rest goes to the payee you configured. Create the app from the dashboard, or with the admin API, then add the product. [Sign up](https://payxor.xyz/signup) and the [documentation](https://payxor.xyz/docs) walk through both.

## Choose the mode with the product

Set the mode on the product. The quote refers to that product id, so the mode travels with the price.

![Four icons for PayXor payment modes: a clock for sessions, a key for features, a receipt for purchases, and a card for memberships.](/blog/images/four-payment-modes.jpg)

- **Session** for access that expires, such as a day or a month of a tool
- **Feature** for a permanent unlock
- **Receipt** for a unique on-chain proof of a purchase, including products that accept a custom amount
- **Pass** for a membership that stays until you revoke it

## The quote is the price

Your backend asks PayXor for a quote. The response includes the quote and `sigBackend`, an EIP-712 signature over that quote. The wallet submits both. The contract checks the signature before it moves funds, so the amount the user pays is the amount your server signed.

```ts
import { PayXorClient } from "@payxor/sdk";

const client = new PayXorClient({
  walletClient: yourWagmiWalletClient,
});

const { quote, sigBackend } = await client.getQuote({
  appId: "0x...",
  productId: "0x...",
  chainId: 8453, // Base
  payer: "0x...",
  tokenAddress: "0x...", // optional stablecoin
});
```

Amounts are USD with 6 decimal places, which matches the stablecoins PayXor is built for. `chainId` is the network the user will pay on. The snippet uses Base (`8453`), one of the eight supported networks: Ethereum, Optimism, BNB Chain, Polygon, zkSync, Base, Arbitrum, and Avalanche.

Keep quote creation on the server. The signing key and the API key stay there. Pass the quote and `sigBackend` to the page that shows the pay button, and give each quote a short lifetime so an old price cannot be submitted later.

## The wallet pays a stablecoin

On the client, the user approves the stablecoin if the contract does not already have allowance, then pays. `@payxor/react` packages that sequence: `useTokenPayment` tracks the selected stablecoin and the approval, and `usePayment` sends the transaction. The lower-level SDK calls are the same two steps.

![A stablecoin moving from a wallet to a confirmed block.](/blog/images/stablecoin-payment-flow.jpg)

```ts
const txHash = await client.pay(quote, sigBackend, account, 8453);
await client.confirmTransaction(txHash, quote.quoteId);
```

`pay` submits the on-chain payment. `confirmTransaction` tells PayXor which transaction settled which quote, so the payment shows up against that quote in your app. The same calls work on each supported network. The user pays on the network named in the quote.

## Check the entitlement, then unlock the product

A confirmed transaction is the payment. The entitlement is what your app reads before it opens the feature. Use the check that matches the product mode.

![A closed gate opening onto an application window after an entitlement check.](/blog/images/entitlement-unlock.jpg)

- `isSessionActive(payer, appId, productId, chainId)` for a session that is still inside its duration
- `isFeatureUnlocked(payer, appId, entitlementId, chainId)` for a permanent feature
- `hasPass(payer, appId, passId, chainId)` for a membership pass
- `verifyReceipt(txHash, quoteId, chainId)` for a receipt-mode purchase

```ts
const active = await client.isSessionActive(payer, appId, productId, 8453);
if (active) {
  // open the paid part of the product
}
```

That check reads the on-chain record for the mode you sold and tells the app whether this wallet holds that access. Delivery of a file, and any dispute about what was sold, stay in your application. The chain records the payment and the entitlement.

## Where to go next

A single-product button is `DropdownBuyButton` from `@payxor/react`, wired to the same app id and product id. The docs include that component, the REST quote endpoint, and the entitlement methods side by side.

Start with one product, one chain, and one mode. Add the others once that quote, payment, and entitlement check all agree.

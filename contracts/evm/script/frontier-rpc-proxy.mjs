#!/usr/bin/env node
// Foundry cannot fork Substrate Frontier chains (Auto EVM 870, Chronos 8700):
// their block headers omit `mixHash` entirely, and forge's post-merge header
// validation fails with "`prevrandao` not set". foundry-rs/foundry#9489 only
// covers chains that return a zero mixHash, not a missing one. This proxy
// forwards JSON-RPC to the upstream and injects a zero mixHash into block
// responses; everything else (including eth_sendRawTransaction) passes
// through untouched.
//
// Usage: node script/frontier-rpc-proxy.mjs <upstream-url> [port=8546]
// Then:  forge script ... --rpc-url http://127.0.0.1:8546

import http from "node:http";

const upstream = process.argv[2];
const port = Number(process.argv[3] ?? 8546);
if (!upstream) {
  console.error("usage: node frontier-rpc-proxy.mjs <upstream-url> [port]");
  process.exit(1);
}

const ZERO_HASH = `0x${"0".repeat(64)}`;

function patch(value) {
  if (Array.isArray(value)) return value.map(patch);
  if (value && typeof value === "object") {
    // A block object: parentHash + number present, mixHash absent (Frontier).
    if (value.parentHash && value.number !== undefined && value.mixHash === undefined) {
      value.mixHash = ZERO_HASH;
    }
    if (value.result) value.result = patch(value.result);
  }
  return value;
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: Buffer.concat(chunks),
    });
    const body = patch(await response.json());
    res.writeHead(response.status, {"content-type": "application/json"});
    res.end(JSON.stringify(body));
  } catch (error) {
    res.writeHead(502, {"content-type": "application/json"});
    res.end(
      JSON.stringify({jsonrpc: "2.0", id: null, error: {code: -32000, message: String(error)}})
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Frontier RPC proxy: http://127.0.0.1:${port} -> ${upstream}`);
});

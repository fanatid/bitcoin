# bitcoind RPC perf

Script:

  - ask about block (with tx hashes)
  - ask about every tx in block

### How to use?

```bash
node index.js --bitcoind http://bitcoinrpc:password@127.0.0.1:8332 --concurrency 10 --from 500000 --full-block true
```

Options:

  - `concurrency` -- number of requests at one time
  - `from` -- number of block from with we start
  - `full-block` -- ask about block with txs in JSON

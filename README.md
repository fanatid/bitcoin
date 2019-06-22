# bitcoind getblock perf tools

### fetch blocks

```bash
node fetch.js --bitcoind http://bitcoinrpc:password@127.0.0.1:8332 --concurrency 10 --from 509359 --loop --method rest
```

Options:

  - `bitcoind` -- url to bitcoind with user:pass
  - `concurrency` -- number of requests at one time
  - `from` -- number of block from with we start
  - `method` -- rest or rpc
  - `loop` -- request same block by hash over and over

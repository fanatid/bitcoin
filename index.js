const http = require('http')
const https = require('https')
const url = require('url')
const yargs = require('yargs')

function getArgs () {
  return yargs
    .usage('$0 [args]')
    .options({
      bitcoind: {
        demandOption: true,
        describe: 'RPC url to Bitcoind',
        type: 'string'
      },
      concurrency: {
        default: 10,
        describe: 'Number of parallel requests',
        type: 'number'
      },
      from: {
        default: 0,
        describe: 'Start perf from specified block',
        type: 'number'
      },
      'full-block': {
        default: false,
        describe: 'Ask about block with txs in JSON',
        type: 'boolean'
      }
    })
    .help('help').alias('help', 'h')
    .argv
}

function createMakeRequest (bitcoindURL) {
  const urlOpts = url.parse(bitcoindURL)
  const options = {
    protocol: urlOpts.protocol,
    hostname: urlOpts.hostname,
    port: urlOpts.port !== '' && parseInt(urlOpts.port, 10),
    method: 'POST',
    path: urlOpts.pathname,
    headers: { 'Content-Type': 'application/json' },
    agent: { http, https }[urlOpts.protocol.slice(0, -1)].globalAgent
  }
  options.hostport = `${options.hostname}:${options.port}`

  let auth = urlOpts.auth
  if (!auth && (urlOpts.username || urlOpts.password)) auth = `${urlOpts.username}:${urlOpts.password}`
  if (auth) options.headers.Authorization = 'Basic ' + Buffer.from(auth).toString('base64')

  return (method, params = []) => {
    return new Promise((resolve, reject) => {
      const req = new http.ClientRequest(options)
      req.on('error', reject)
      req.on('response', (resp) => {
        if (resp.statusCode !== 200) return reject(new Error(`"${resp.statusMessage}" is not OK.`))

        const chunks = []
        resp.on('data', (chunk) => chunks.push(chunk))
        resp.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8')
            const obj = JSON.parse(body)
            obj.status === 'error' ? reject(new Error(obj.error)) : resolve(obj.result)
          } catch (err) {
            reject(err)
          }
        })
      })

      req.end(JSON.stringify({ id: 0, method, params: params }))
    })
  }
}

function diffTime (time) {
  if (time === undefined) return process.hrtime()

  const diff = process.hrtime(time)
  return diff[0] + diff[1] / 1e9
}

;(async () => {
  const args = getArgs()
  const makeRequest = createMakeRequest(args.bitcoind)

  let state = {}
  const resetState = () => { state = { blks: 0, txs: 0, ts: diffTime() } }
  resetState()

  setInterval(() => {
    const ts = diffTime(state.ts)
    console.log(`${(state.blks / ts).toFixed(2)} blk/s, ${(state.txs / ts).toFixed(2)} tx/s`)
    resetState()
  }, 1000)

  const txs = []
  await Promise.all(new Array(args.concurrency).fill(null).map(async () => {
    while (true) {
      const txid = txs.pop()
      if (txid) {
        await makeRequest('getrawtransaction', [txid, true])
        state.txs += 1
      } else {
        const blockhash = await makeRequest('getblockhash', [args.from++])
        const block = await makeRequest('getblock', [blockhash, args.fullBlock ? 2 : 1])
        if (args.fullBlock) state.txs += block.tx.length
        else txs.push(...block.tx)
        state.blks += 1
      }
    }
  }))
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})

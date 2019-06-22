const yargs = require('yargs')
const util = require('./util')

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
      method: {
        choices: [
          'rest',
          'rpc'
        ],
        default: 'rpc',
        describe: 'Method for block extraction'
      },
      loop: {
        default: false,
        describe: 'Request same block by hash in loop',
        type: 'boolean'
      }
    })
    .help('help').alias('help', 'h')
    .argv
}

function createRPC (bitcoindURL) {
  const options = util.createRPCRequestOptions(bitcoindURL)

  return async (height) => {
    let blockhash = height
    if (typeof blockhash === 'number') {
      const ret = await util.makeRPCRequest(options, 'getblockhash', [height], { parse: true })
      blockhash = ret.result
    }

    await util.makeRPCRequest(options, 'getblock', [blockhash, 2], { parse: false })
  }
}

function createREST (bitcoindURL) {
  const options = util.createRESTRequestOptions(bitcoindURL)

  return async (height) => {
    let blockhash = height
    if (typeof blockhash === 'number') {
      const result = await util.makeRESTRequest(options, `/rest/blockhashbyheight/${height}.json`, { parse: true })
      blockhash = result.blockhash
    }

    await util.makeRESTRequest(options, `/rest/block/${blockhash}.json`, { parse: false })
  }
}

;(async () => {
  const args = getArgs()
  const createMakeRequest = args.method === 'rpc' ? createRPC : createREST
  const makeRequest = createMakeRequest(args.bitcoind)

  let getNext = () => args.from++
  if (args.loop) {
    const options = util.createRPCRequestOptions(args.bitcoind)
    const blockhash = await util.makeHTTPRequest(options, JSON.stringify({ id: 0, method: 'getblockhash', params: [args.from] }), { parse: true })
    getNext = () => blockhash
  }

  let state = {}
  const resetState = () => { state = { req: 0, ts: util.diffTime() } }
  resetState()

  setInterval(() => {
    const ts = util.diffTime(state.ts, 'seconds')
    console.log(`${(state.req / ts).toFixed(6)} req/s`)
    resetState()
  }, 1000)

  await Promise.all(new Array(args.concurrency).fill(null).map(async () => {
    while (true) {
      await makeRequest(getNext())
      state.req += 1
    }
  }))
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})

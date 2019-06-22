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
      method: {
        choices: [
          'rest',
          'rpc'
        ],
        default: 'rpc',
        describe: 'Method for block extraction'
      }
    })
    .help('help').alias('help', 'h')
    .argv
}

async function getBestBlockNumber (bitcoindURL) {
  const options = util.createRPCRequestOptions(bitcoindURL)
  const ret = await util.makeRPCRequest(options, 'getblockchaininfo', [], { parse: true })
  return ret.blocks
}

function createRPC (bitcoindURL) {
  const options = util.createRPCRequestOptions(bitcoindURL)

  return {
    async getBlockHash (height) {
      try {
        const ret = await util.makeRPCRequest(options, 'getblockhash', [height], { parse: true })
        return ret
      } catch (err) {
        if (err.code === -8) return null
        throw err
      }
    },

    async getBlock (hash, callbacks = {}) {
      await util.makeRPCRequest(options, 'getblock', [hash, 2], { parse: true, ...callbacks })
    }
  }
}

function createREST (bitcoindURL) {
  const options = util.createRESTRequestOptions(bitcoindURL)

  return {
    async getBlockHash (height) {
      const ret = await util.makeRESTRequest(options, `/rest/blockhashbyheight/${height}.json`, { parse: true })
      if (typeof ret === 'number') return ret.blockhash

      return null
    },

    async getBlock (hash, callbacks = {}) {
      await util.makeRESTRequest(options, `/rest/block/${hash}.json`, { parse: true, ...callbacks })
    }
  }
}

function log (msg) {
  console.log(`${new Date().toISOString()} X ${msg}`)
}

;(async () => {
  const args = getArgs()
  const createRequests = args.method === 'rpc' ? createRPC : createREST
  const requests = createRequests(args.bitcoind)

  let latest = await getBestBlockNumber(args.bitcoind)
  while (true) {
    let [ts1, ts2] = [util.diffTime(), util.diffTime()]
    const logSpentTime = (msg) => {
      log(`${msg}: ${util.diffTimePretty(ts1)} (+${util.diffTimePretty(ts2)})`)
      ts2 = util.diffTime()
    }

    const hash = await requests.getBlockHash(latest + 1)
    if (hash === null) {
      await util.delay(10)
      continue
    }

    logSpentTime(`new block ${latest + 1}`)
    await requests.getBlock(hash, {
      onResponseCallback () {
        logSpentTime('block response received')
      },
      onEndCallback () {
        logSpentTime('block fully received')
      }
    })
    logSpentTime('block parsed')
    log('-----')

    latest += 1
  }
})().catch((err) => {
  console.error(err.stack || err)
  process.exit(1)
})

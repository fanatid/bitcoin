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

function makeHTTPRequest (reqOptions, body, { parse = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.ClientRequest(reqOptions)
    req.on('error', reject)
    req.on('response', (resp) => {
      if (resp.statusCode !== 200) return reject(new Error(`"${resp.statusMessage}" is not OK.`))

      if (!parse) {
        resp.on('data', () => {})
        resp.on('end', () => resolve())
        return
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8')
          const obj = JSON.parse(body)

          // rest
          if (!obj.status) return resolve(obj)

          // rpc
          obj.status === 'error' ? reject(new Error(obj.error)) : resolve(obj.result)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.end(body)
  })
}

function createRPCRequestOptions (bitcoindURL) {
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

  return options
}

function createRPCRequest (bitcoindURL) {
  const options = createRPCRequestOptions(bitcoindURL)

  return async (height) => {
    let blockhash = height
    if (typeof blockhash === 'number') {
      const ret = await makeHTTPRequest(options, JSON.stringify({ id: 0, method: 'getblockhash', params: [height] }), { parse: true })
      blockhash = ret.result
    }

    await makeHTTPRequest(options, JSON.stringify({ id: 0, method: 'getblock', params: [blockhash, 2] }), { parse: false })
  }
}

function createRESTRequest (bitcoindURL) {
  const urlOpts = url.parse(bitcoindURL)
  const options = {
    protocol: urlOpts.protocol,
    hostname: urlOpts.hostname,
    port: urlOpts.port !== '' && parseInt(urlOpts.port, 10),
    method: 'GET',
    agent: { http, https }[urlOpts.protocol.slice(0, -1)].globalAgent
  }
  options.hostport = `${options.hostname}:${options.port}`

  return async (height) => {
    let blockhash = height
    if (typeof blockhash === 'number') {
      options.path = `/rest/blockhashbyheight/${height}.json`
      const result = await makeHTTPRequest(options, '', { parse: true })
      blockhash = result.blockhash
    }

    options.path = `/rest/block/${blockhash}.json`
    await makeHTTPRequest(options, '', { parse: false })
  }
}

function diffTime (time) {
  if (time === undefined) return process.hrtime()

  const diff = process.hrtime(time)
  return diff[0] + diff[1] / 1e9
}

;(async () => {
  const args = getArgs()
  const createMakeRequest = args.method === 'rpc' ? createRPCRequest : createRESTRequest
  const makeRequest = createMakeRequest(args.bitcoind)

  let getNext = () => args.from++
  if (args.loop) {
    const options = createRPCRequestOptions(args.bitcoind)
    const { result: blockhash } = await makeHTTPRequest(options, JSON.stringify({ id: 0, method: 'getblockhash', params: [args.from] }), { parse: true })
    getNext = () => blockhash
  }

  let state = {}
  const resetState = () => { state = { req: 0, ts: diffTime() } }
  resetState()

  setInterval(() => {
    const ts = diffTime(state.ts)
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

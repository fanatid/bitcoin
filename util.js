const http = require('http')
const https = require('https')
const url = require('url')
const prettyMs = require('pretty-ms')

function makeHTTPRequest (reqOptions, body, { parse = true, onResponseCallback = () => {}, onEndCallback = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new http.ClientRequest(reqOptions)
    req.on('error', reject)
    req.on('response', (resp) => {
      onResponseCallback()
      // if (resp.statusCode !== 200) return reject(new Error(`"${resp.statusMessage}" is not OK.`))

      if (!parse) {
        resp.on('data', () => {})
        resp.on('end', () => {
          onEndCallback()
          resolve()
        })
        return
      }

      const chunks = []
      resp.on('data', (chunk) => chunks.push(chunk))
      resp.on('end', () => {
        onEndCallback()

        try {
          const body = Buffer.concat(chunks).toString('utf8')
          const obj = resp.headers['content-type'] === 'application/json' ? JSON.parse(body) : body.trim()

          // rest
          if (obj.error === undefined) return resolve(obj)

          // rpc
          if (!obj.error) return resolve(obj.result)
          reject(Object.assign(new Error(obj.error.message || obj.error.code), { code: obj.error.code }))
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

function makeRPCRequest (options, method, params, reqOptions) {
  return makeHTTPRequest(options, JSON.stringify({ id: 0, method, params }), reqOptions)
}

function createRESTRequestOptions (bitcoindURL) {
  const urlOpts = url.parse(bitcoindURL)
  const options = {
    protocol: urlOpts.protocol,
    hostname: urlOpts.hostname,
    port: urlOpts.port !== '' && parseInt(urlOpts.port, 10),
    method: 'GET',
    agent: { http, https }[urlOpts.protocol.slice(0, -1)].globalAgent
  }
  options.hostport = `${options.hostname}:${options.port}`

  return options
}

function makeRESTRequest (options, path, reqOptions) {
  return makeHTTPRequest({ ...options, path }, '', reqOptions)
}

function diffTime (time, resolution = 'milliseconds') {
  if (time === undefined) return process.hrtime()

  const diff = process.hrtime(time)
  switch (resolution) {
    case 'milliseconds': return diff[0] * 1e3 + diff[1] / 1e6
    case 'seconds': return diff[0] + diff[1] / 1e9
    default: throw new RangeError(`unknow resolution: ${resolution}`)
  }
}

function diffTimePretty (time) {
  return prettyMs(diffTime(time))
}

async function delay (timeout) {
  await new Promise((resolve) => setTimeout(resolve, timeout))
}

module.exports = {
  makeHTTPRequest,
  createRPCRequestOptions,
  makeRPCRequest,
  createRESTRequestOptions,
  makeRESTRequest,
  diffTime,
  diffTimePretty,
  delay
}

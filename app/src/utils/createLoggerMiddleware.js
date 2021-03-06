const log = require('loglevel')

module.exports = createLoggerMiddleware

/**
 * Returns a middleware that logs RPC activity
 * @param {{ origin: string }} opts - The middleware options
 * @returns {Function}
 */
function createLoggerMiddleware(options) {
  return function loggerMiddleware(/** @type {any} */ request, /** @type {any} */ response, /** @type {Function} */ next) {
    next((callback) => {
      if (response.error) {
        log.error('Error in RPC response:\n', response)
      }
      if (request.isMetamaskInternal) return
      log.info(`RPC (${options.origin}):`, request, '->', response)
      callback()
    })
  }
}

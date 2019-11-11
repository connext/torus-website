// import pre-cache manifest

// workbox port
var precacheController
var listenerAdded = false
var _cacheNameDetails = {
  precache: 'precache-v2',
  prefix: 'workbox',
  suffix: registration.scope
}

function precacheAndRoute(entries, opts) {
  precache(entries)
  addRoute(opts)
}

function addRoute(opts) {
  if (!listenerAdded) {
    addFetchListener(opts)
    listenerAdded = true
  }
}
function addFetchListener(opts) {
  var ignoreURLParametersMatching = opts.ignoreURLParametersMatching || [/^utm_/]
  var directoryIndex = opts.directoryIndex || 'index.html'
  var cleanURLs = opts.cleanURLs === undefined ? true : opts.cleanURLs
  var urlManipulation = opts.urlManipulation
  var cacheName = _createCacheName(_cacheNameDetails.precache)
  addEventListener('fetch', function(event) {
    var precachedURL = getCacheKeyForURL(event.request.url, {
      cleanURLs: cleanURLs,
      directoryIndex: directoryIndex,
      ignoreURLParametersMatching: ignoreURLParametersMatching,
      urlManipulation: urlManipulation
    })
    if (!precachedURL) {
      // console.log('Precacher did not find a match for', event.request.url)
      return
    }
    var responsePromise = caches
      .open(cacheName)
      .then(function(cache) {
        return cache.match(precachedURL)
      })
      .then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse
        }
        console.warn('Precached response not found ', precachedURL)
        return fetch(precachedURL)
      })
    event.respondWith(responsePromise)
  })
}

function _createCacheName(cacheName) {
  return [_cacheNameDetails.prefix, cacheName, _cacheNameDetails.suffix].filter(value => value && value.length > 0).join('-')
}

function getCacheKeyForURL(url, opts) {
  var precacheController = getOrCreatePrecacheController()
  var urlsToCacheKeys = precacheController.getURLsToCacheKeys()
  var variations = generateURLVariations(url, opts)
  for (var i = 0; i < variations.length; i++) {
    var variation = variations[i]
    if (urlsToCacheKeys[variation]) {
      return urlsToCacheKeys[variation]
    }
  }
}

function generateURLVariations(url, opts) {
  var variations = []
  var ignoreURLParametersMatching = opts.ignoreURLParametersMatching
  var directoryIndex = opts.directoryIndex
  var cleanURLs = opts.cleanURLs
  var urlManipulation = opts.urlManipulation
  var urlObject = new URL(url, location.href)
  urlObject.hash = ''
  variations.push(urlObject.href)
  var urlWithoutIgnoredParams = removeIgnoredSearchParams(urlObject)
  variations.push(urlWithoutIgnoredParams.href)
  if (directoryIndex && urlWithoutIgnoredParams.pathname.endsWith('/')) {
    var directoryURL = new URL(urlWithoutIgnoredParams.href)
    directoryURL.pathname += directoryIndex
    variations.push(directoryURL.href)
  }
  if (cleanURLs) {
    var cleanURL = new URL(urlWithoutIgnoredParams.href)
    cleanURL.pathname += '.html'
    variations.push(cleanURL.href)
  }
  if (urlManipulation) {
    var additionalURLs = urlManipulation({ url: urlObject })
    additionalURLs.map(function(item) {
      variations.push(item)
    })
  }
  return variations
}

function removeIgnoredSearchParams(urlObject, ignoreURLParametersMatching) {
  Object.keys(urlObject.searchParams).map(function(paramName) {
    if (
      ignoreURLParametersMatching.some(function(regExp) {
        regExp.test(paramName)
      })
    ) {
      urlObject.searchParams.delete(paramName)
    }
  })
  return urlObject
}

function precache(entries) {
  var precacheController = getOrCreatePrecacheController()
  precacheController.addToCacheList(entries)
  if (entries.length > 0) {
    addEventListener('install', function(event) {
      var precacheController = getOrCreatePrecacheController()
      event.waitUntil(
        precacheController.install({ event: event }).catch(function(err) {
          console.error(err)
          throw err
        })
      )
    })
    addEventListener('activate', function(event) {
      var precacheController = getOrCreatePrecacheController()
      event.waitUntil(precacheController.activate())
    })
  }
}

function createCacheKey(entry) {
  if (!entry) {
    throw new Error('entry undefined')
  }
  if (typeof entry === 'string') {
    var urlObject = new URL(entry, location.href)
    return {
      cacheKey: urlObject.href,
      url: urlObject.href
    }
  }
  var revision = entry.revision
  var url = entry.url
  if (!url) {
    throw new Error('No url')
  }
  if (!revision) {
    var urlObject = new URL(url, location.href)
    return {
      cacheKey: urlObject.href,
      url: urlObject.href
    }
  }
  var cacheKeyURL = new URL(url, location.href)
  var originalURL = new URL(url, location.href)
  cacheKeyURL.searchParams.set('__WB_REVISION__', revision)
  return {
    cacheKey: cacheKeyURL.href,
    url: originalURL.href
  }
}

function PrecacheController() {
  this._cacheName = _createCacheName(_cacheNameDetails.precache)
  this._urlsToCacheKeys = {}
  this._urlsToCacheModes = {}
  this._cacheKeysToIntegrities = {}
}

PrecacheController.prototype.constructor = PrecacheController

PrecacheController.prototype.addToCacheList = function(entries) {
  var context = this
  try {
    entries.map(function(entry) {
      var obj = createCacheKey(entry)
      var cacheKey = obj.cacheKey
      var url = obj.url
      var cacheMode = typeof entry !== 'string' && entry.revision ? 'reload' : 'default'
      if (context._urlsToCacheKeys[url] && context._urlsToCacheKeys[url] !== cacheKey) {
        throw new Error('Conflicting cache key entries ', context._urlsToCacheKeys[url], cacheKey)
      }
      if (typeof entry !== 'string' && entry.integrity) {
        if (context._cacheKeysToIntegrities[cacheKey] && context._cacheKeysToIntegrities[cacheKey] !== entry.integrity) {
          throw new Error('Conflicting integrities ', context._cacheKeysToIntegrities[cacheKey], entry.integrity, url)
        }
        context._cacheKeysToIntegrities[cacheKey] = entry.integrity
      }
      context._urlsToCacheKeys[url] = cacheKey
      context._urlsToCacheModes[url] = cacheMode
    })
  } catch (e) {
    console.error(e)
  }
}

PrecacheController.prototype.install = function(opts) {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var context = this
  var event = opts.event
  var toBePrecached = []
  var alreadyPrecached = []
  caches
    .open(context._cacheName)
    .then(function(cache) {
      return cache.keys()
    })
    .then(function(alreadyCachedRequests) {
      var existingCacheKeys = alreadyCachedRequests.map(function(req) {
        return req.url
      })
      for (var url in context._urlsToCacheKeys) {
        var cacheKey = context._urlsToCacheKeys[url]
        if (existingCacheKeys[cacheKey]) {
          alreadyPrecached.push(url)
        } else {
          toBePrecached.push({ cacheKey: cacheKey, url: url })
        }
      }
      var precacheRequests = toBePrecached.map(function(obj) {
        var cacheKey = obj.cacheKey
        var url = obj.url
        var integrity = context._cacheKeysToIntegrities[cacheKey]
        var cacheMode = context._urlsToCacheModes[url]
        return context._addURLToCache({
          cacheKey: cacheKey,
          cacheMode: cacheMode,
          event: event,
          integrity: integrity,
          url: url
        })
      })

      Promise.all(precacheRequests).then(function() {
        var updatedURLs = toBePrecached.map(function(item) {
          return item.url
        })
        resolve({
          updatedURLs: updatedURLs,
          notUpdatedURLs: alreadyPrecached
        })
      })
    })

  return promise
}

PrecacheController.prototype.activate = function() {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var context = this
  var c
  var deletedURLs = []
  caches
    .open(context._cacheName)
    .then(function(cache) {
      c = cache
      return cache.keys()
    })
    .then(function(currentlyCachedRequests) {
      var promises = []
      for (var req in currentlyCachedRequests) {
        if (!context._urlsToCacheKeys[req.url]) {
          promises.push(c.delete(req))
          deletedURLs.push(req.url)
        }
      }
      return Promise.all(promises)
    })
    .then(function() {
      resolve(deletedURLs)
    })

  return promise
}

PrecacheController.prototype._addURLToCache = function(opts) {
  var cacheKey = opts.cacheKey
  var url = opts.url
  var cacheMode = opts.cacheMode
  var event = opts.event
  var integrity = opts.integrity
  var context = this

  var request = new Request(url, {
    integrity: integrity,
    cache: cacheMode,
    credentials: 'same-origin'
  })

  wrappedFetch({
    event: event,
    request: request
  })
    .then(function(response) {
      if (response.status >= 400) {
        throw new Error('Invalid response', url, response.status)
      }
      if (response.redirected) {
        return copyResponse(response)
      }
      return Promise.resolve(response)
    })
    .then(function(response) {
      putWrapper({
        event: event,
        response: response,
        request: cacheKey === url ? request : new Request(cacheKey),
        cacheName: context._cacheName,
        matchOptions: {
          ignoreSearch: true
        }
      })
    })
}

PrecacheController.prototype.getURLsToCacheKeys = function() {
  return this._urlsToCacheKeys
}

PrecacheController.prototype.getCachedURLs = function() {
  return Object.keys(this._urlsToCacheKeys)
}

PrecacheController.prototype.getCacheKeyForURL = function(url) {
  var urlObject = new URL(url, location.href)
  return this._urlsToCacheKeys[urlObject.href]
}

PrecacheController.prototype.createHandlerForURL = function(url) {
  var resolve, reject
  var promies = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var context = this
  var cacheKey = context.getCacheKeyForURL(url)
  if (!cacheKey) {
    throw new Error('Non-precached URL', url)
  }
  caches
    .open(context._cacheName)
    .then(function(cache) {
      return cache.match(cacheKey)
    })
    .then(function(response) {
      if (response) {
        resolve(response)
      } else {
        reject(new Error('The cache did not have this entry for cacheKey', cacheKey))
      }
    })
    .catch(function(err) {
      console.error('Failed to respond with cached response', err)
      fetch(cacheKey)
        .then(resolve)
        .catch(reject)
    })
  return promise
}

function wrappedFetch(opts) {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var request = opts.request
  var fetchOptions = opts.fetchOptions
  var event = opts.event
  if (typeof request === 'string') {
    request = new Request(request)
  }
  try {
    var fetchResponse
    if (request.mode === 'navigate') {
      fetch(request)
        .then(resolve)
        .catch(reject)
    } else {
      fetch(request, fetchOptions)
        .then(resolve)
        .catch(reject)
    }
  } catch (e) {
    throw e
  }
  return promise
}

function copyResponse(response) {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var supportStatus
  function canConstructResponseFromBodyStream() {
    if (supportStatus === undefined) {
      const testResponse = new Response('')
      if ('body' in testResponse) {
        try {
          new Response(testResponse.body)
          supportStatus = true
        } catch (error) {
          supportStatus = false
        }
      }
      supportStatus = false
    }
    return supportStatus
  }
  var clonedResponse = response.clone()
  var responseInit = {
    headers: new Headers(clonedResponse.headers),
    status: clonedResponse.status,
    statusText: clonedResponse.statusText
  }
  var body
  if (canConstructResponseFromBodyStream()) {
    body = clonedResponse.body
    resolve(new Response(body, responseInit))
  } else {
    clonedResponse
      .blob()
      .then(function(b) {
        body = b
        resolve(new Response(body, responseInit))
      })
      .catch(reject)
  }
  return promise
}

function putWrapper(opts) {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var cacheName = opts.cacheName
  var request = opts.request
  var response = opts.response
  if (response.status !== 200) {
    console.warn('Request not cached')
    resolve()
  }
  caches
    .open(cacheName)
    .then(function(cache) {
      cache.put(request, response).then(resolve)
    })
    .catch(reject)
  return promise
}

function matchWrapper(opts) {
  var resolve, reject
  var promise = new Promise(function(res, rej) {
    resolve = res
    reject = rej
  })
  var cacheName = opts.cacheName
  var request = opts.request
  var event = opts.event
  var matchOptions = opts.matchOptions
  caches
    .open(cacheName)
    .then(function(cache) {
      return cache.match(request, matchOptions)
    })
    .then(function(cachedResponse) {
      resolve(cachedResponse)
    })
    .catch(reject)
  return promise
}

function getOrCreatePrecacheController() {
  if (!precacheController) {
    precacheController = new PrecacheController()
  }
  return precacheController
}

// service worker logic

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', function(event) {
  if (event.request.url.indexOf('redirect') > -1) {
    event.respondWith(
      new Response(
        new Blob([
          `
<html>
  <head></head>
  <body>
    <div> Redirecting you back to Torus app... </div>
    <script>
    // broadcast-channel
/* eslint no-param-reassign: 0 */
var broadcastChannelLib = {}
;(function() {
  function r(e, n, t) {
    function o(i, f) {
      if (!n[i]) {
        if (!e[i]) {
          var c = 'function' == typeof require && require
          if (!f && c) return c(i, !0)
          if (u) return u(i, !0)
          var a = new Error('Cannot find module ' + i)
          throw ((a.code = 'MODULE_NOT_FOUND'), a)
        }
        var p = (n[i] = { exports: {} })
        e[i][0].call(
          p.exports,
          function(r) {
            var n = e[i][1][r]
            return o(n || r)
          },
          p,
          p.exports,
          r,
          e,
          n,
          t
        )
      }
      return n[i].exports
    }
    for (var u = 'function' == typeof require && require, i = 0; i < t.length; i++) o(t[i])
    return o
  }
  return r
})()(
  {
    '/torus/embed.js': [
      function(require, module, exports) {
        broadcastChannelLib.BroadcastChannel = require('broadcast-channel')
      },
      { 'broadcast-channel': '/torus/node_modules/broadcast-channel/dist/lib/index.es5.js' }
    ],
    '/torus/node_modules/@babel/runtime/helpers/interopRequireDefault.js': [
      function(require, module, exports) {
        function _interopRequireDefault(obj) {
          return obj && obj.__esModule
            ? obj
            : {
                default: obj
              }
        }

        module.exports = _interopRequireDefault
      },
      {}
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/index.es5.js': [
      function(require, module, exports) {
        'use strict'

        var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault')

        var _index = _interopRequireDefault(require('./index.js'))

        /**
         * because babel can only export on default-attribute,
         * we use this for the non-module-build
         * this ensures that users do not have to use
         * var BroadcastChannel = require('broadcast-channel').default;
         * but
         * var BroadcastChannel = require('broadcast-channel');
         */
        module.exports = _index['default']
      },
      {
        './index.js': '/torus/node_modules/broadcast-channel/dist/lib/index.js',
        '@babel/runtime/helpers/interopRequireDefault': '/torus/node_modules/@babel/runtime/helpers/interopRequireDefault.js'
      }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/index.js': [
      function(require, module, exports) {
        'use strict'

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports['default'] = void 0

        var _util = require('./util.js')

        var _methodChooser = require('./method-chooser.js')

        var _options = require('./options.js')

        var BroadcastChannel = function BroadcastChannel(name, options) {
          this.name = name

          if (ENFORCED_OPTIONS) {
            options = ENFORCED_OPTIONS
          }

          this.options = (0, _options.fillOptionsWithDefaults)(options)
          this.method = (0, _methodChooser.chooseMethod)(this.options) // isListening

          this._iL = false
          /**
           * _onMessageListener
           * setting onmessage twice,
           * will overwrite the first listener
           */

          this._onML = null
          /**
           * _addEventListeners
           */

          this._addEL = {
            message: [],
            internal: []
          }
          /**
           * _beforeClose
           * array of promises that will be awaited
           * before the channel is closed
           */

          this._befC = []
          /**
           * _preparePromise
           */

          this._prepP = null

          _prepareChannel(this)
        } // STATICS

        /**
         * used to identify if someone overwrites
         * window.BroadcastChannel with this
         * See methods/native.js
         */

        BroadcastChannel._pubkey = true
        /**
         * clears the tmp-folder if is node
         * @return {Promise<boolean>} true if has run, false if not node
         */

        BroadcastChannel.clearNodeFolder = function(options) {
          options = (0, _options.fillOptionsWithDefaults)(options)
          var method = (0, _methodChooser.chooseMethod)(options)

          if (method.type === 'node') {
            return method.clearNodeFolder().then(function() {
              return true
            })
          } else {
            return Promise.resolve(false)
          }
        }
        /**
         * if set, this method is enforced,
         * no mather what the options are
         */

        var ENFORCED_OPTIONS

        BroadcastChannel.enforceOptions = function(options) {
          ENFORCED_OPTIONS = options
        } // PROTOTYPE

        BroadcastChannel.prototype = {
          postMessage: function postMessage(msg) {
            if (this.closed) {
              throw new Error('BroadcastChannel.postMessage(): ' + 'Cannot post message after channel has closed')
            }

            return _post(this, 'message', msg)
          },
          postInternal: function postInternal(msg) {
            return _post(this, 'internal', msg)
          },

          set onmessage(fn) {
            var time = this.method.microSeconds()
            var listenObj = {
              time: time,
              fn: fn
            }

            _removeListenerObject(this, 'message', this._onML)

            if (fn && typeof fn === 'function') {
              this._onML = listenObj

              _addListenerObject(this, 'message', listenObj)
            } else {
              this._onML = null
            }
          },

          addEventListener: function addEventListener(type, fn) {
            var time = this.method.microSeconds()
            var listenObj = {
              time: time,
              fn: fn
            }

            _addListenerObject(this, type, listenObj)
          },
          removeEventListener: function removeEventListener(type, fn) {
            var obj = this._addEL[type].find(function(obj) {
              return obj.fn === fn
            })

            _removeListenerObject(this, type, obj)
          },
          close: function close() {
            var _this = this

            if (this.closed) return
            this.closed = true
            var awaitPrepare = this._prepP ? this._prepP : Promise.resolve()
            this._onML = null
            this._addEL.message = []
            return awaitPrepare
              .then(function() {
                return Promise.all(
                  _this._befC.map(function(fn) {
                    return fn()
                  })
                )
              })
              .then(function() {
                return _this.method.close(_this._state)
              })
          },

          get type() {
            return this.method.type
          }
        }

        function _post(broadcastChannel, type, msg) {
          var time = broadcastChannel.method.microSeconds()
          var msgObj = {
            time: time,
            type: type,
            data: msg
          }
          var awaitPrepare = broadcastChannel._prepP ? broadcastChannel._prepP : Promise.resolve()
          return awaitPrepare.then(function() {
            return broadcastChannel.method.postMessage(broadcastChannel._state, msgObj)
          })
        }

        function _prepareChannel(channel) {
          var maybePromise = channel.method.create(channel.name, channel.options)

          if ((0, _util.isPromise)(maybePromise)) {
            channel._prepP = maybePromise
            maybePromise.then(function(s) {
              // used in tests to simulate slow runtime

              /*if (channel.options.prepareDelay) {
             await new Promise(res => setTimeout(res, this.options.prepareDelay));
        }*/
              channel._state = s
            })
          } else {
            channel._state = maybePromise
          }
        }

        function _hasMessageListeners(channel) {
          if (channel._addEL.message.length > 0) return true
          if (channel._addEL.internal.length > 0) return true
          return false
        }

        function _addListenerObject(channel, type, obj) {
          channel._addEL[type].push(obj)

          _startListening(channel)
        }

        function _removeListenerObject(channel, type, obj) {
          channel._addEL[type] = channel._addEL[type].filter(function(o) {
            return o !== obj
          })

          _stopListening(channel)
        }

        function _startListening(channel) {
          if (!channel._iL && _hasMessageListeners(channel)) {
            // someone is listening, start subscribing
            var listenerFn = function listenerFn(msgObj) {
              channel._addEL[msgObj.type].forEach(function(obj) {
                if (msgObj.time >= obj.time) {
                  obj.fn(msgObj.data)
                }
              })
            }

            var time = channel.method.microSeconds()

            if (channel._prepP) {
              channel._prepP.then(function() {
                channel._iL = true
                channel.method.onMessage(channel._state, listenerFn, time)
              })
            } else {
              channel._iL = true
              channel.method.onMessage(channel._state, listenerFn, time)
            }
          }
        }

        function _stopListening(channel) {
          if (channel._iL && !_hasMessageListeners(channel)) {
            // noone is listening, stop subscribing
            channel._iL = false
            var time = channel.method.microSeconds()
            channel.method.onMessage(channel._state, null, time)
          }
        }

        var _default = BroadcastChannel
        exports['default'] = _default
      },
      {
        './method-chooser.js': '/torus/node_modules/broadcast-channel/dist/lib/method-chooser.js',
        './options.js': '/torus/node_modules/broadcast-channel/dist/lib/options.js',
        './util.js': '/torus/node_modules/broadcast-channel/dist/lib/util.js'
      }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/method-chooser.js': [
      function(require, module, exports) {
        'use strict'
        var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault')

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.chooseMethod = chooseMethod

        var _native = _interopRequireDefault(require('./methods/native.js'))

        var _indexedDb = _interopRequireDefault(require('./methods/indexed-db.js'))

        var _localstorage = _interopRequireDefault(require('./methods/localstorage.js'))

        var _simulate = _interopRequireDefault(require('./methods/simulate.js'))

        var _util = require('./util')

        // order is important
        var METHODS = [
          _native['default'], // fastest
          _indexedDb['default'],
          _localstorage['default']
        ]
        /**
         * The NodeMethod is loaded lazy
         * so it will not get bundled in browser-builds
         */

        if (_util.isNode) {
          /**
           * we use the non-transpiled code for nodejs
           * because it runs faster
           */
          var NodeMethod = require('../../src/methods/' + // use this hack so that browserify and others
            // do not import the node-method by default
            // when bundling.
            'node.js')
          /**
           * this will be false for webpackbuilds
           * which will shim the node-method with an empty object {}
           */

          if (typeof NodeMethod.canBeUsed === 'function') {
            METHODS.push(NodeMethod)
          }
        }

        function chooseMethod(options) {
          // directly chosen
          if (options.type) {
            if (options.type === 'simulate') {
              // only use simulate-method if directly chosen
              return _simulate['default']
            }

            var ret = METHODS.find(function(m) {
              return m.type === options.type
            })
            if (!ret) throw new Error('method-type ' + options.type + ' not found')
            else return ret
          }
          /**
           * if no webworker support is needed,
           * remove idb from the list so that localstorage is been chosen
           */

          var chooseMethods = METHODS

          if (!options.webWorkerSupport && !_util.isNode) {
            chooseMethods = METHODS.filter(function(m) {
              return m.type !== 'idb'
            })
          }

          var useMethod = chooseMethods.find(function(method) {
            return method.canBeUsed()
          })
          if (!useMethod)
            throw new Error(
              'No useable methode found:' +
                JSON.stringify(
                  METHODS.map(function(m) {
                    return m.type
                  })
                )
            )
          else return useMethod
        }
      },
      {
        './methods/indexed-db.js': '/torus/node_modules/broadcast-channel/dist/lib/methods/indexed-db.js',
        './methods/localstorage.js': '/torus/node_modules/broadcast-channel/dist/lib/methods/localstorage.js',
        './methods/native.js': '/torus/node_modules/broadcast-channel/dist/lib/methods/native.js',
        './methods/simulate.js': '/torus/node_modules/broadcast-channel/dist/lib/methods/simulate.js',
        './util': '/torus/node_modules/broadcast-channel/dist/lib/util.js',
        '@babel/runtime/helpers/interopRequireDefault': '/torus/node_modules/@babel/runtime/helpers/interopRequireDefault.js'
      }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/methods/indexed-db.js': [
      function(require, module, exports) {
        'use strict'
        var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault')

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.getIdb = getIdb
        exports.createDatabase = createDatabase
        exports.writeMessage = writeMessage
        exports.getAllMessages = getAllMessages
        exports.getMessagesHigherThen = getMessagesHigherThen
        exports.removeMessageById = removeMessageById
        exports.getOldMessages = getOldMessages
        exports.cleanOldMessages = cleanOldMessages
        exports.create = create
        exports.close = close
        exports.postMessage = postMessage
        exports.onMessage = onMessage
        exports.canBeUsed = canBeUsed
        exports.averageResponseTime = averageResponseTime
        exports['default'] = exports.type = exports.microSeconds = void 0

        var _util = require('../util.js')

        var _obliviousSet = _interopRequireDefault(require('../oblivious-set'))

        var _options = require('../options')

        /**
         * this method uses indexeddb to store the messages
         * There is currently no observerAPI for idb
         * @link https://github.com/w3c/IndexedDB/issues/51
         */
        var microSeconds = _util.microSeconds
        exports.microSeconds = microSeconds
        var DB_PREFIX = 'pubkey.broadcast-channel-0-'
        var OBJECT_STORE_ID = 'messages'
        var type = 'idb'
        exports.type = type

        function getIdb() {
          if (typeof indexedDB !== 'undefined') return indexedDB
          if (typeof window.mozIndexedDB !== 'undefined') return window.mozIndexedDB
          if (typeof window.webkitIndexedDB !== 'undefined') return window.webkitIndexedDB
          if (typeof window.msIndexedDB !== 'undefined') return window.msIndexedDB
          return false
        }

        function createDatabase(channelName) {
          var IndexedDB = getIdb() // create table

          var dbName = DB_PREFIX + channelName
          var openRequest = IndexedDB.open(dbName, 1)

          openRequest.onupgradeneeded = function(ev) {
            var db = ev.target.result
            db.createObjectStore(OBJECT_STORE_ID, {
              keyPath: 'id',
              autoIncrement: true
            })
          }

          var dbPromise = new Promise(function(res, rej) {
            openRequest.onerror = function(ev) {
              return rej(ev)
            }

            openRequest.onsuccess = function() {
              res(openRequest.result)
            }
          })
          return dbPromise
        }
        /**
         * writes the new message to the database
         * so other readers can find it
         */

        function writeMessage(db, readerUuid, messageJson) {
          var time = new Date().getTime()
          var writeObject = {
            uuid: readerUuid,
            time: time,
            data: messageJson
          }
          var transaction = db.transaction([OBJECT_STORE_ID], 'readwrite')
          return new Promise(function(res, rej) {
            transaction.oncomplete = function() {
              return res()
            }

            transaction.onerror = function(ev) {
              return rej(ev)
            }

            var objectStore = transaction.objectStore(OBJECT_STORE_ID)
            objectStore.add(writeObject)
          })
        }

        function getAllMessages(db) {
          var objectStore = db.transaction(OBJECT_STORE_ID).objectStore(OBJECT_STORE_ID)
          var ret = []
          return new Promise(function(res) {
            objectStore.openCursor().onsuccess = function(ev) {
              var cursor = ev.target.result

              if (cursor) {
                ret.push(cursor.value) //alert("Name for SSN " + cursor.key + " is " + cursor.value.name);

                cursor['continue']()
              } else {
                res(ret)
              }
            }
          })
        }

        function getMessagesHigherThen(db, lastCursorId) {
          var objectStore = db.transaction(OBJECT_STORE_ID).objectStore(OBJECT_STORE_ID)
          var ret = []
          var keyRangeValue = IDBKeyRange.bound(lastCursorId + 1, Infinity)
          return new Promise(function(res) {
            objectStore.openCursor(keyRangeValue).onsuccess = function(ev) {
              var cursor = ev.target.result

              if (cursor) {
                ret.push(cursor.value)
                cursor['continue']()
              } else {
                res(ret)
              }
            }
          })
        }

        function removeMessageById(db, id) {
          var request = db
            .transaction([OBJECT_STORE_ID], 'readwrite')
            .objectStore(OBJECT_STORE_ID)
            ['delete'](id)
          return new Promise(function(res) {
            request.onsuccess = function() {
              return res()
            }
          })
        }

        function getOldMessages(db, ttl) {
          var olderThen = new Date().getTime() - ttl
          var objectStore = db.transaction(OBJECT_STORE_ID).objectStore(OBJECT_STORE_ID)
          var ret = []
          return new Promise(function(res) {
            objectStore.openCursor().onsuccess = function(ev) {
              var cursor = ev.target.result

              if (cursor) {
                var msgObk = cursor.value

                if (msgObk.time < olderThen) {
                  ret.push(msgObk) //alert("Name for SSN " + cursor.key + " is " + cursor.value.name);

                  cursor['continue']()
                } else {
                  // no more old messages,
                  res(ret)
                  return
                }
              } else {
                res(ret)
              }
            }
          })
        }

        function cleanOldMessages(db, ttl) {
          return getOldMessages(db, ttl).then(function(tooOld) {
            return Promise.all(
              tooOld.map(function(msgObj) {
                return removeMessageById(db, msgObj.id)
              })
            )
          })
        }

        function create(channelName, options) {
          options = (0, _options.fillOptionsWithDefaults)(options)
          return createDatabase(channelName).then(function(db) {
            var state = {
              closed: false,
              lastCursorId: 0,
              channelName: channelName,
              options: options,
              uuid: (0, _util.randomToken)(10),

              /**
               * emittedMessagesIds
               * contains all messages that have been emitted before
               * @type {ObliviousSet}
               */
              eMIs: new _obliviousSet['default'](options.idb.ttl * 2),
              // ensures we do not read messages in parrallel
              writeBlockPromise: Promise.resolve(),
              messagesCallback: null,
              readQueuePromises: [],
              db: db
            }
            /**
             * if service-workers are used,
             * we have no 'storage'-event if they post a message,
             * therefore we also have to set an interval
             */

            _readLoop(state)

            return state
          })
        }

        function _readLoop(state) {
          if (state.closed) return
          return readNewMessages(state)
            .then(function() {
              return (0, _util.sleep)(state.options.idb.fallbackInterval)
            })
            .then(function() {
              return _readLoop(state)
            })
        }

        function _filterMessage(msgObj, state) {
          if (msgObj.uuid === state.uuid) return false // send by own

          if (state.eMIs.has(msgObj.id)) return false // already emitted

          if (msgObj.data.time < state.messagesCallbackTime) return false // older then onMessageCallback

          return true
        }
        /**
         * reads all new messages from the database and emits them
         */

        function readNewMessages(state) {
          // channel already closed
          if (state.closed) return Promise.resolve() // if no one is listening, we do not need to scan for new messages

          if (!state.messagesCallback) return Promise.resolve()
          return getMessagesHigherThen(state.db, state.lastCursorId).then(function(newerMessages) {
            var useMessages = newerMessages
              /**
               * there is a bug in iOS where the msgObj can be undefined some times
               * so we filter them out
               * @link https://github.com/pubkey/broadcast-channel/issues/19
               */
              .filter(function(msgObj) {
                return !!msgObj
              })
              .map(function(msgObj) {
                if (msgObj.id > state.lastCursorId) {
                  state.lastCursorId = msgObj.id
                }

                return msgObj
              })
              .filter(function(msgObj) {
                return _filterMessage(msgObj, state)
              })
              .sort(function(msgObjA, msgObjB) {
                return msgObjA.time - msgObjB.time
              }) // sort by time

            useMessages.forEach(function(msgObj) {
              if (state.messagesCallback) {
                state.eMIs.add(msgObj.id)
                state.messagesCallback(msgObj.data)
              }
            })
            return Promise.resolve()
          })
        }

        function close(channelState) {
          channelState.closed = true
          channelState.db.close()
        }

        function postMessage(channelState, messageJson) {
          channelState.writeBlockPromise = channelState.writeBlockPromise
            .then(function() {
              return writeMessage(channelState.db, channelState.uuid, messageJson)
            })
            .then(function() {
              if ((0, _util.randomInt)(0, 10) === 0) {
                /* await (do not await) */
                cleanOldMessages(channelState.db, channelState.options.idb.ttl)
              }
            })
          return channelState.writeBlockPromise
        }

        function onMessage(channelState, fn, time) {
          channelState.messagesCallbackTime = time
          channelState.messagesCallback = fn
          readNewMessages(channelState)
        }

        function canBeUsed() {
          if (_util.isNode) return false
          var idb = getIdb()
          if (!idb) return false
          return true
        }

        function averageResponseTime(options) {
          return options.idb.fallbackInterval * 2
        }

        var _default = {
          create: create,
          close: close,
          onMessage: onMessage,
          postMessage: postMessage,
          canBeUsed: canBeUsed,
          type: type,
          averageResponseTime: averageResponseTime,
          microSeconds: microSeconds
        }
        exports['default'] = _default
      },
      {
        '../oblivious-set': '/torus/node_modules/broadcast-channel/dist/lib/oblivious-set.js',
        '../options': '/torus/node_modules/broadcast-channel/dist/lib/options.js',
        '../util.js': '/torus/node_modules/broadcast-channel/dist/lib/util.js',
        '@babel/runtime/helpers/interopRequireDefault': '/torus/node_modules/@babel/runtime/helpers/interopRequireDefault.js'
      }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/methods/localstorage.js': [
      function(require, module, exports) {
        'use strict'
        var _interopRequireDefault = require('@babel/runtime/helpers/interopRequireDefault')

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.getLocalStorage = getLocalStorage
        exports.storageKey = storageKey
        exports.postMessage = postMessage
        exports.addStorageEventListener = addStorageEventListener
        exports.removeStorageEventListener = removeStorageEventListener
        exports.create = create
        exports.close = close
        exports.onMessage = onMessage
        exports.canBeUsed = canBeUsed
        exports.averageResponseTime = averageResponseTime
        exports['default'] = exports.type = exports.microSeconds = void 0

        var _obliviousSet = _interopRequireDefault(require('../oblivious-set'))

        var _options = require('../options')

        var _util = require('../util')

        /**
         * A localStorage-only method which uses localstorage and its 'storage'-event
         * This does not work inside of webworkers because they have no access to locastorage
         * This is basically implemented to support IE9 or your grandmothers toaster.
         * @link https://caniuse.com/#feat=namevalue-storage
         * @link https://caniuse.com/#feat=indexeddb
         */
        var microSeconds = _util.microSeconds
        exports.microSeconds = microSeconds
        var KEY_PREFIX = 'pubkey.broadcastChannel-'
        var type = 'localstorage'
        /**
         * copied from crosstab
         * @link https://github.com/tejacques/crosstab/blob/master/src/crosstab.js#L32
         */

        exports.type = type

        function getLocalStorage() {
          var localStorage
          if (typeof window === 'undefined') return null

          try {
            localStorage = window.localStorage
            localStorage = window['ie8-eventlistener/storage'] || window.localStorage
          } catch (e) {
            // New versions of Firefox throw a Security exception
            // if cookies are disabled. See
            // https://bugzilla.mozilla.org/show_bug.cgi?id=1028153
          }

          return localStorage
        }

        function storageKey(channelName) {
          return KEY_PREFIX + channelName
        }
        /**
         * writes the new message to the storage
         * and fires the storage-event so other readers can find it
         */

        function postMessage(channelState, messageJson) {
          return new Promise(function(res) {
            ;(0, _util.sleep)().then(function() {
              var key = storageKey(channelState.channelName)
              var writeObj = {
                token: (0, _util.randomToken)(10),
                time: new Date().getTime(),
                data: messageJson,
                uuid: channelState.uuid
              }
              var value = JSON.stringify(writeObj)
              getLocalStorage().setItem(key, value)
              /**
               * StorageEvent does not fire the 'storage' event
               * in the window that changes the state of the local storage.
               * So we fire it manually
               */

              var ev = document.createEvent('Event')
              ev.initEvent('storage', true, true)
              ev.key = key
              ev.newValue = value
              window.dispatchEvent(ev)
              res()
            })
          })
        }

        function addStorageEventListener(channelName, fn) {
          var key = storageKey(channelName)

          var listener = function listener(ev) {
            if (ev.key === key) {
              fn(JSON.parse(ev.newValue))
            }
          }

          window.addEventListener('storage', listener)
          return listener
        }

        function removeStorageEventListener(listener) {
          window.removeEventListener('storage', listener)
        }

        function create(channelName, options) {
          options = (0, _options.fillOptionsWithDefaults)(options)

          if (!canBeUsed()) {
            throw new Error('BroadcastChannel: localstorage cannot be used')
          }

          var uuid = (0, _util.randomToken)(10)
          /**
           * eMIs
           * contains all messages that have been emitted before
           * @type {ObliviousSet}
           */

          var eMIs = new _obliviousSet['default'](options.localstorage.removeTimeout)
          var state = {
            channelName: channelName,
            uuid: uuid,
            eMIs: eMIs // emittedMessagesIds
          }
          state.listener = addStorageEventListener(channelName, function(msgObj) {
            if (!state.messagesCallback) return // no listener

            if (msgObj.uuid === uuid) return // own message

            if (!msgObj.token || eMIs.has(msgObj.token)) return // already emitted

            if (msgObj.data.time && msgObj.data.time < state.messagesCallbackTime) return // too old

            eMIs.add(msgObj.token)
            state.messagesCallback(msgObj.data)
          })
          return state
        }

        function close(channelState) {
          removeStorageEventListener(channelState.listener)
        }

        function onMessage(channelState, fn, time) {
          channelState.messagesCallbackTime = time
          channelState.messagesCallback = fn
        }

        function canBeUsed() {
          if (_util.isNode) return false
          var ls = getLocalStorage()
          if (!ls) return false

          try {
            var key = '__broadcastchannel_check'
            ls.setItem(key, 'works')
            ls.removeItem(key)
          } catch (e) {
            // Safari 10 in private mode will not allow write access to local
            // storage and fail with a QuotaExceededError. See
            // https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API#Private_Browsing_Incognito_modes
            return false
          }

          return true
        }

        function averageResponseTime() {
          return 120
        }

        var _default = {
          create: create,
          close: close,
          onMessage: onMessage,
          postMessage: postMessage,
          canBeUsed: canBeUsed,
          type: type,
          averageResponseTime: averageResponseTime,
          microSeconds: microSeconds
        }
        exports['default'] = _default
      },
      {
        '../oblivious-set': '/torus/node_modules/broadcast-channel/dist/lib/oblivious-set.js',
        '../options': '/torus/node_modules/broadcast-channel/dist/lib/options.js',
        '../util': '/torus/node_modules/broadcast-channel/dist/lib/util.js',
        '@babel/runtime/helpers/interopRequireDefault': '/torus/node_modules/@babel/runtime/helpers/interopRequireDefault.js'
      }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/methods/native.js': [
      function(require, module, exports) {
        'use strict'

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.create = create
        exports.close = close
        exports.postMessage = postMessage
        exports.onMessage = onMessage
        exports.canBeUsed = canBeUsed
        exports.averageResponseTime = averageResponseTime
        exports['default'] = exports.type = exports.microSeconds = void 0

        var _util = require('../util')

        var microSeconds = _util.microSeconds
        exports.microSeconds = microSeconds
        var type = 'native'
        exports.type = type

        function create(channelName) {
          var state = {
            messagesCallback: null,
            bc: new BroadcastChannel(channelName),
            subFns: [] // subscriberFunctions
          }

          state.bc.onmessage = function(msg) {
            if (state.messagesCallback) {
              state.messagesCallback(msg.data)
            }
          }

          return state
        }

        function close(channelState) {
          channelState.bc.close()
          channelState.subFns = []
        }

        function postMessage(channelState, messageJson) {
          channelState.bc.postMessage(messageJson, false)
        }

        function onMessage(channelState, fn) {
          channelState.messagesCallback = fn
        }

        function canBeUsed() {
          /**
           * in the electron-renderer, isNode will be true even if we are in browser-context
           * so we also check if window is undefined
           */
          if (_util.isNode && typeof window === 'undefined') return false

          if (typeof BroadcastChannel === 'function') {
            if (BroadcastChannel._pubkey) {
              throw new Error('BroadcastChannel: Do not overwrite window.BroadcastChannel with this module, this is not a polyfill')
            }

            return true
          } else return false
        }

        function averageResponseTime() {
          return 100
        }

        var _default = {
          create: create,
          close: close,
          onMessage: onMessage,
          postMessage: postMessage,
          canBeUsed: canBeUsed,
          type: type,
          averageResponseTime: averageResponseTime,
          microSeconds: microSeconds
        }
        exports['default'] = _default
      },
      { '../util': '/torus/node_modules/broadcast-channel/dist/lib/util.js' }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/methods/simulate.js': [
      function(require, module, exports) {
        'use strict'
        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.create = create
        exports.close = close
        exports.postMessage = postMessage
        exports.onMessage = onMessage
        exports.canBeUsed = canBeUsed
        exports.averageResponseTime = averageResponseTime
        exports['default'] = exports.type = exports.microSeconds = void 0

        var _util = require('../util')

        var microSeconds = _util.microSeconds
        exports.microSeconds = microSeconds
        var type = 'simulate'
        exports.type = type
        var SIMULATE_CHANNELS = new Set()

        function create(channelName) {
          var state = {
            name: channelName,
            messagesCallback: null
          }
          SIMULATE_CHANNELS.add(state)
          return state
        }

        function close(channelState) {
          SIMULATE_CHANNELS['delete'](channelState)
        }

        function postMessage(channelState, messageJson) {
          return new Promise(function(res) {
            return setTimeout(function() {
              var channelArray = Array.from(SIMULATE_CHANNELS)
              channelArray
                .filter(function(channel) {
                  return channel.name === channelState.name
                })
                .filter(function(channel) {
                  return channel !== channelState
                })
                .filter(function(channel) {
                  return !!channel.messagesCallback
                })
                .forEach(function(channel) {
                  return channel.messagesCallback(messageJson)
                })
              res()
            }, 5)
          })
        }

        function onMessage(channelState, fn) {
          channelState.messagesCallback = fn
        }

        function canBeUsed() {
          return true
        }

        function averageResponseTime() {
          return 5
        }

        var _default = {
          create: create,
          close: close,
          onMessage: onMessage,
          postMessage: postMessage,
          canBeUsed: canBeUsed,
          type: type,
          averageResponseTime: averageResponseTime,
          microSeconds: microSeconds
        }
        exports['default'] = _default
      },
      { '../util': '/torus/node_modules/broadcast-channel/dist/lib/util.js' }
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/oblivious-set.js': [
      function(require, module, exports) {
        'use strict'

        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports['default'] = void 0

        /**
         * this is a set which automatically forgets
         * a given entry when a new entry is set and the ttl
         * of the old one is over
         * @constructor
         */
        var ObliviousSet = function ObliviousSet(ttl) {
          var set = new Set()
          var timeMap = new Map()
          this.has = set.has.bind(set)

          this.add = function(value) {
            timeMap.set(value, now())
            set.add(value)

            _removeTooOldValues()
          }

          this.clear = function() {
            set.clear()
            timeMap.clear()
          }

          function _removeTooOldValues() {
            var olderThen = now() - ttl
            var iterator = set[Symbol.iterator]()

            while (true) {
              var value = iterator.next().value
              if (!value) return // no more elements

              var time = timeMap.get(value)

              if (time < olderThen) {
                timeMap['delete'](value)
                set['delete'](value)
              } else {
                // we reached a value that is not old enough
                return
              }
            }
          }
        }

        function now() {
          return new Date().getTime()
        }

        var _default = ObliviousSet
        exports['default'] = _default
      },
      {}
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/options.js': [
      function(require, module, exports) {
        'use strict'
        Object.defineProperty(exports, '__esModule', {
          value: true
        })
        exports.fillOptionsWithDefaults = fillOptionsWithDefaults

        function fillOptionsWithDefaults(options) {
          if (!options) options = {}
          options = JSON.parse(JSON.stringify(options)) // main

          if (typeof options.webWorkerSupport === 'undefined') options.webWorkerSupport = true // indexed-db

          if (!options.idb) options.idb = {} //  after this time the messages get deleted

          if (!options.idb.ttl) options.idb.ttl = 1000 * 45
          if (!options.idb.fallbackInterval) options.idb.fallbackInterval = 150 // localstorage

          if (!options.localstorage) options.localstorage = {}
          if (!options.localstorage.removeTimeout) options.localstorage.removeTimeout = 1000 * 60 // node

          if (!options.node) options.node = {}
          if (!options.node.ttl) options.node.ttl = 1000 * 60 * 2 // 2 minutes;

          if (typeof options.node.useFastPath === 'undefined') options.node.useFastPath = true
          return options
        }
      },
      {}
    ],
    '/torus/node_modules/broadcast-channel/dist/lib/util.js': [
      function(require, module, exports) {
        ;(function(process) {
          'use strict'
          Object.defineProperty(exports, '__esModule', {
            value: true
          })
          exports.isPromise = isPromise
          exports.sleep = sleep
          exports.randomInt = randomInt
          exports.randomToken = randomToken
          exports.microSeconds = microSeconds
          exports.isNode = void 0

          /**
           * returns true if the given object is a promise
           */
          function isPromise(obj) {
            if (obj && typeof obj.then === 'function') {
              return true
            } else {
              return false
            }
          }

          function sleep(time) {
            if (!time) time = 0
            return new Promise(function(res) {
              return setTimeout(res, time)
            })
          }

          function randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min)
          }
          /**
           * https://stackoverflow.com/a/1349426/3443137
           */

          function randomToken(length) {
            if (!length) length = 5
            var text = ''
            var possible = 'abcdefghijklmnopqrstuvwxzy0123456789'

            for (var i = 0; i < length; i++) {
              text += possible.charAt(Math.floor(Math.random() * possible.length))
            }

            return text
          }

          var lastMs = 0
          var additional = 0
          /**
           * returns the current time in micro-seconds,
           * WARNING: This is a pseudo-function
           * Performance.now is not reliable in webworkers, so we just make sure to never return the same time.
           * This is enough in browsers, and this function will not be used in nodejs.
           * The main reason for this hack is to ensure that BroadcastChannel behaves equal to production when it is used in fast-running unit tests.
           */

          function microSeconds() {
            var ms = new Date().getTime()

            if (ms === lastMs) {
              additional++
              return ms * 1000 + additional
            } else {
              lastMs = ms
              additional = 0
              return ms * 1000
            }
          }
          /**
           * copied from the 'detect-node' npm module
           * We cannot use the module directly because it causes problems with rollup
           * @link https://github.com/iliakan/detect-node/blob/master/index.js
           */

          var isNode = Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]'
          exports.isNode = isNode
        }.call(this, require('_process')))
      },
      { _process: '/torus/node_modules/process/browser.js' }
    ],
    '/torus/node_modules/process/browser.js': [
      function(require, module, exports) {
        // shim for using process in browser
        var process = (module.exports = {})

        // cached from whatever global is present so that test runners that stub it
        // don't break things.  But we need to wrap it in a try catch in case it is
        // wrapped in strict mode code which doesn't define any globals.  It's inside a
        // function because try/catches deoptimize in certain engines.

        var cachedSetTimeout
        var cachedClearTimeout

        function defaultSetTimout() {
          throw new Error('setTimeout has not been defined')
        }
        function defaultClearTimeout() {
          throw new Error('clearTimeout has not been defined')
        }
        ;(function() {
          try {
            if (typeof setTimeout === 'function') {
              cachedSetTimeout = setTimeout
            } else {
              cachedSetTimeout = defaultSetTimout
            }
          } catch (e) {
            cachedSetTimeout = defaultSetTimout
          }
          try {
            if (typeof clearTimeout === 'function') {
              cachedClearTimeout = clearTimeout
            } else {
              cachedClearTimeout = defaultClearTimeout
            }
          } catch (e) {
            cachedClearTimeout = defaultClearTimeout
          }
        })()
        function runTimeout(fun) {
          if (cachedSetTimeout === setTimeout) {
            //normal enviroments in sane situations
            return setTimeout(fun, 0)
          }
          // if setTimeout wasn't available but was latter defined
          if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
            cachedSetTimeout = setTimeout
            return setTimeout(fun, 0)
          }
          try {
            // when when somebody has screwed with setTimeout but no I.E. maddness
            return cachedSetTimeout(fun, 0)
          } catch (e) {
            try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
              return cachedSetTimeout.call(null, fun, 0)
            } catch (e) {
              // same as above but when it's a version of I.E. that must have the global object for 'this',
              // hopefully our context correct otherwise it will throw a global error
              return cachedSetTimeout.call(this, fun, 0)
            }
          }
        }
        function runClearTimeout(marker) {
          if (cachedClearTimeout === clearTimeout) {
            //normal enviroments in sane situations
            return clearTimeout(marker)
          }
          // if clearTimeout wasn't available but was latter defined
          if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
            cachedClearTimeout = clearTimeout
            return clearTimeout(marker)
          }
          try {
            // when when somebody has screwed with setTimeout but no I.E. maddness
            return cachedClearTimeout(marker)
          } catch (e) {
            try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
              return cachedClearTimeout.call(null, marker)
            } catch (e) {
              // same as above but when it's a version of I.E. that must have the global object for 'this',
              // hopefully our context correct otherwise it will throw a global error.
              // Some versions of I.E. have different rules for clearTimeout vs setTimeout
              return cachedClearTimeout.call(this, marker)
            }
          }
        }
        var queue = []
        var draining = false
        var currentQueue
        var queueIndex = -1

        function cleanUpNextTick() {
          if (!draining || !currentQueue) {
            return
          }
          draining = false
          if (currentQueue.length) {
            queue = currentQueue.concat(queue)
          } else {
            queueIndex = -1
          }
          if (queue.length) {
            drainQueue()
          }
        }

        function drainQueue() {
          if (draining) {
            return
          }
          var timeout = runTimeout(cleanUpNextTick)
          draining = true

          var len = queue.length
          while (len) {
            currentQueue = queue
            queue = []
            while (++queueIndex < len) {
              if (currentQueue) {
                currentQueue[queueIndex].run()
              }
            }
            queueIndex = -1
            len = queue.length
          }
          currentQueue = null
          draining = false
          runClearTimeout(timeout)
        }

        process.nextTick = function(fun) {
          var args = new Array(arguments.length - 1)
          if (arguments.length > 1) {
            for (var i = 1; i < arguments.length; i++) {
              args[i - 1] = arguments[i]
            }
          }
          queue.push(new Item(fun, args))
          if (queue.length === 1 && !draining) {
            runTimeout(drainQueue)
          }
        }

        // v8 likes predictible objects
        function Item(fun, array) {
          this.fun = fun
          this.array = array
        }
        Item.prototype.run = function() {
          this.fun.apply(null, this.array)
        }
        process.title = 'browser'
        process.browser = true
        process.env = {}
        process.argv = []
        process.version = '' // empty string to avoid regexp issues
        process.versions = {}

        function noop() {}

        process.on = noop
        process.addListener = noop
        process.once = noop
        process.off = noop
        process.removeListener = noop
        process.removeAllListeners = noop
        process.emit = noop
        process.prependListener = noop
        process.prependOnceListener = noop

        process.listeners = function(name) {
          return []
        }

        process.binding = function(name) {
          throw new Error('process.binding is not supported')
        }

        process.cwd = function() {
          return '/'
        }
        process.chdir = function(dir) {
          throw new Error('process.chdir is not supported')
        }
        process.umask = function() {
          return 0
        }
      },
      {}
    ]
  },
  {},
  ['/torus/embed.js']
)
      var bc
      var broadcastChannelOptions = {
        // type: 'localstorage', // (optional) enforce a type, oneOf['native', 'idb', 'localstorage', 'node'
        webWorkerSupport: false // (optional) set this to false if you know that your channel will never be used in a WebWorker (increase performance)
      }
      try {

        var url = new URL(location.href)
        var hash = url.hash.substr(1)
        var hashParams = hash.split('&').reduce(function(result, item) {
          const parts = item.split('=')
          result[parts[0]] = parts[1]
          return result
        }, {})
        var queryParams = {}
        for (var entry of url.searchParams.entries()) {
          queryParams[entry[0]] = entry[1]
        }
        var instanceParams = {}
        var error = ''
        if (Object.keys(hashParams).length > 0 && hashParams.state) {
          instanceParams = JSON.parse(window.atob(decodeURIComponent(decodeURIComponent(hashParams.state)))) || {}
          if (hashParams.error) error = hashParams.error
        } else if (Object.keys(queryParams).length > 0 && queryParams.state) {
          instanceParams = JSON.parse(window.atob(decodeURIComponent(decodeURIComponent(queryParams.state)))) || {}
          if (queryParams.error) error = queryParams.error
        }
        bc = new broadcastChannelLib.BroadcastChannel('redirect_channel_' + instanceParams.instanceId, broadcastChannelOptions)
        bc.postMessage({
          data: {
            verifier: instanceParams.verifier,
            verifierParams: hashParams
          },
          error: error
        }).then(function() {
          bc.close()
        })
      } catch (err) {
        console.error(err, 'something went wrong')
        bc && bc.close()
        window.close()
      }
    </script>
  </body>
</html>${''}
`
        ])
      )
    )
  }
})

self.__precacheManifest = [
  {
    url: '/js/app.js'
  }
].concat(self.__precacheManifest || [])
precacheAndRoute(self.__precacheManifest, {})
import randomId from '@chaitanyapotti/random-id'
import { BroadcastChannel } from 'broadcast-channel'
import log from 'loglevel'

import torus from '../torus'
import { broadcastChannelOptions, fakeStream, getIFrameOrigin } from './utils'

const windowStream = (torus && torus.communicationMux && torus.communicationMux.getStream('window')) || fakeStream

class StreamWindow {
  constructor(preopenInstanceId, url) {
    this.preopenInstanceId = preopenInstanceId
    this.closed = false
    if (!preopenInstanceId) {
      this.preopenInstanceId = randomId()
      if (windowStream.on) {
        windowStream.on('data', (chunk) => {
          if (chunk.name === 'opened_window' && this.preopenInstanceId === chunk.data.preopenInstanceId) {
            this.open(url)
          }
        })
      }
      windowStream.write({
        name: 'create_window',
        data: {
          preopenInstanceId: this.preopenInstanceId,
        },
      })
    }
  }

  open(url) {
    return new Promise((resolve, reject) => {
      const bc = new BroadcastChannel(`preopen_channel_${this.preopenInstanceId}`, broadcastChannelOptions)
      log.info('setting up bc', this.preopenInstanceId)
      this.url = url
      bc.addEventListener('message', (ev) => {
        const { preopenInstanceId: openedId, message } = ev.data
        if (this.preopenInstanceId === openedId && message === 'popup_loaded') {
          if (this.writeInterval) clearInterval(this.writeInterval)
          log.info(ev.data, getIFrameOrigin())
          bc.postMessage({
            data: {
              origin: getIFrameOrigin(),
              payload: { url: this.url },
              preopenInstanceId: this.preopenInstanceId,
            },
          })
            .then(() => {
              bc.close()
              resolve()
            })
            .catch((error) => {
              log.error('Failed to communicate via preopen_channel', error)
              bc.close()
              reject(error)
            })
        }
      })
      this.writeInterval = setInterval(() => {
        bc.postMessage({
          data: {
            preopenInstanceId: this.preopenInstanceId,
            message: 'setup_complete',
          },
        })
      }, 200)
      const preopenHandler = (chunk) => {
        const { preopenInstanceId, closed } = chunk.data
        if (preopenInstanceId === this.preopenInstanceId && closed) {
          this.closed = true
          windowStream.removeListener('data', preopenHandler)
        }
      }
      if (windowStream.on) windowStream.on('data', preopenHandler)
    })
  }

  close() {
    windowStream.write({
      preopenInstanceId: this.preopenInstanceId,
      close: true,
    })
  }
}

export default StreamWindow

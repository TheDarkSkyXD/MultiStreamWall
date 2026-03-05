import TOML from '@iarna/toml'
import {
  BrowserWindow,
  MessageChannelMain,
  app,
  session,
  utilityProcess,
} from 'electron'
import started from 'electron-squirrel-startup'
import fs from 'fs'
import path from 'path'
import 'source-map-support/register'
import { ControlCommand, StreamwallState } from 'streamwall-shared'
import { updateElectronApp } from 'update-electron-app'
import yargs from 'yargs'
import * as Y from 'yjs'
import { ensureValidURL } from '../util'
import ControlWindow from './ControlWindow'
import {
  LocalStreamData,
  StreamIDGenerator,
  combineDataSources,
  markDataSource,
  pollDataURL,
  watchDataFile,
} from './data'
import { createDiscoveryBridge } from './discovery/bridge'
import {
  discoveryStore,
  getDiscoverySettings,
  getSearchQuery,
  setApiKey,
  setSearchQuery,
} from './discovery/settings'
import StreamdelayClient from './StreamdelayClient'
import StreamWindow from './StreamWindow'

export interface StreamwallConfig {
  help: boolean
  grid: {
    count: number
  }
  window: {
    x?: number
    y?: number
    width: number
    height: number
    frameless: boolean
    'background-color': string
    'active-color': string
  }
  data: {
    interval: number
    'json-url': string[]
    'toml-file': string[]
  }
  streamdelay: {
    endpoint: string
    key: string | null
  }
  'discovery-query': string
  'youtube-api-key': string
}

function parseArgs(): StreamwallConfig {
  return (
    yargs()
      .config('config', (configPath) => {
        return TOML.parse(fs.readFileSync(configPath, 'utf-8'))
      })
      .group(['grid.count'], 'Grid dimensions')
      .option('grid.count', {
        number: true,
        default: 3,
      })
      .group(
        [
          'window.width',
          'window.height',
          'window.x',
          'window.y',
          'window.frameless',
          'window.background-color',
          'window.active-color',
        ],
        'Window settings',
      )
      .option('window.x', {
        number: true,
      })
      .option('window.y', {
        number: true,
      })
      .option('window.width', {
        number: true,
        default: 1920,
      })
      .option('window.height', {
        number: true,
        default: 1080,
      })
      .option('window.frameless', {
        boolean: true,
        default: false,
      })
      .option('window.background-color', {
        describe: 'Background color of wall (useful for chroma-keying)',
        default: '#000',
      })
      .option('window.active-color', {
        describe: 'Active (highlight) color of wall',
        default: '#fff',
      })
      .group(
        ['data.interval', 'data.json-url', 'data.toml-file'],
        'Datasources',
      )
      .option('data.interval', {
        describe: 'Interval (in seconds) for refreshing polled data sources',
        number: true,
        default: 30,
      })
      .option('data.json-url', {
        describe: 'Fetch streams from the specified URL(s)',
        array: true,
        string: true,
        default: [],
      })
      .option('data.toml-file', {
        describe: 'Fetch streams from the specified file(s)',
        normalize: true,
        array: true,
        default: [],
      })
      /*
    .group(
      [
        'control.username',
        'control.password',
        'control.address',
        'control.hostname',
        'control.port',
        'control.open',
      ],
      'Control Webserver',
    )
    .option('control.username', {
      describe: 'Web control server username',
    })
    .option('control.password', {
      describe: 'Web control server password',
    })
    .option('control.open', {
      describe: 'After launching, open the control website in a browser',
      boolean: true,
      default: true,
    })
    .option('control.address', {
      describe: 'Enable control webserver and specify the URL',
      implies: ['control.username', 'control.password'],
      string: true,
    })
    .option('control.hostname', {
      describe: 'Override hostname the control server listens on',
    })
    .option('control.port', {
      describe: 'Override port the control server listens on',
      number: true,
    })
    .group(
      ['cert.dir', 'cert.production', 'cert.email'],
      'Automatic SSL Certificate',
    )
    .option('cert.dir', {
      describe: 'Private directory to store SSL certificate in',
      implies: ['email'],
      default: null,
    })
    .option('cert.production', {
      describe: 'Obtain a real SSL certificate using production servers',
    })
    .option('cert.email', {
      describe: 'Email for owner of SSL certificate',
    })
    */
      .group(
        ['discovery-query', 'youtube-api-key'],
        'Discovery',
      )
      .option('discovery-query', {
        describe: 'Comma-separated keywords for stream discovery',
        string: true,
        default: '',
      })
      .option('youtube-api-key', {
        describe: 'YouTube Data API v3 key (enables higher rate limits)',
        string: true,
        default: '',
      })
      .group(['streamdelay.endpoint', 'streamdelay.key'], 'Streamdelay')
      .option('streamdelay.endpoint', {
        describe: 'URL of Streamdelay endpoint',
        default: 'http://localhost:8404',
      })
      .option('streamdelay.key', {
        describe: 'Streamdelay API key',
        default: null,
      })
      .help()
      // https://github.com/yargs/yargs/issues/2137
      .parseSync() as unknown as StreamwallConfig
  )
}

async function main(argv: ReturnType<typeof parseArgs>) {
  if (app.isPackaged) {
    updateElectronApp()
  }

  // Reject all permission requests from web content.
  session
    .fromPartition('persist:session')
    .setPermissionRequestHandler((webContents, permission, callback) => {
      callback(false)
    })

  console.debug('Creating StreamWindow...')
  const idGen = new StreamIDGenerator()
  const localStreamData = new LocalStreamData()
  const overlayStreamData = new LocalStreamData()

  const streamWindowConfig = {
    gridCount: argv.grid.count,
    width: argv.window.width,
    height: argv.window.height,
    x: argv.window.x,
    y: argv.window.y,
    frameless: argv.window.frameless,
    activeColor: argv.window['active-color'],
    backgroundColor: argv.window['background-color'],
  }
  const streamWindow = new StreamWindow(streamWindowConfig)
  const controlWindow = new ControlWindow()

  let browseWindow: BrowserWindow | null = null
  let streamdelayClient: StreamdelayClient | null = null

  console.debug('Creating initial state...')
  let clientState: StreamwallState = {
    config: streamWindowConfig,
    streams: [],
    views: [],
    streamdelay: null,
  }

  const stateDoc = new Y.Doc()
  const viewsState = stateDoc.getMap<Y.Map<string | undefined>>('views')
  stateDoc.transact(() => {
    for (let i = 0; i < argv.grid.count ** 2; i++) {
      const data = new Y.Map<string | undefined>()
      data.set('streamId', undefined)
      viewsState.set(String(i), data)
    }
  })
  viewsState.observeDeep(() => {
    try {
      const viewContentMap = new Map()
      for (const [key, viewData] of viewsState) {
        const streamId = viewData.get('streamId')
        const stream = clientState.streams.find((s) => s._id === streamId)
        if (!stream) {
          continue
        }
        viewContentMap.set(key, {
          url: stream.link,
          kind: stream.kind || 'video',
        })
      }
      streamWindow.setViews(viewContentMap, clientState.streams)
    } catch (err) {
      console.error('Error updating views', err)
    }
  })

  const onCommand = async (msg: ControlCommand) => {
    console.debug('Received message:', msg)
    if (msg.type === 'set-listening-view') {
      console.debug('Setting listening view:', msg.viewIdx)
      streamWindow.setListeningView(msg.viewIdx)
    } else if (msg.type === 'set-view-background-listening') {
      console.debug(
        'Setting view background listening:',
        msg.viewIdx,
        msg.listening,
      )
      streamWindow.setViewBackgroundListening(msg.viewIdx, msg.listening)
    } else if (msg.type === 'set-view-blurred') {
      console.debug('Setting view blurred:', msg.viewIdx, msg.blurred)
      streamWindow.setViewBlurred(msg.viewIdx, msg.blurred)
    } else if (msg.type === 'rotate-stream') {
      console.debug('Rotating stream:', msg.url, msg.rotation)
      overlayStreamData.update(msg.url, {
        rotation: msg.rotation,
      })
    } else if (msg.type === 'update-custom-stream') {
      console.debug('Updating custom stream:', msg.url)
      localStreamData.update(msg.url, msg.data)
    } else if (msg.type === 'delete-custom-stream') {
      console.debug('Deleting custom stream:', msg.url)
      localStreamData.delete(msg.url)
    } else if (msg.type === 'reload-view') {
      console.debug('Reloading view:', msg.viewIdx)
      streamWindow.reloadView(msg.viewIdx)
    } else if (msg.type === 'browse' || msg.type === 'dev-tools') {
      if (
        msg.type === 'dev-tools' &&
        browseWindow &&
        !browseWindow.isDestroyed()
      ) {
        // DevTools needs a fresh webContents to work. Close any existing window.
        browseWindow.destroy()
        browseWindow = null
      }
      if (!browseWindow || browseWindow.isDestroyed()) {
        browseWindow = new BrowserWindow({
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:session',
            sandbox: true,
          },
        })
      }
      if (msg.type === 'browse') {
        console.debug('Attempting to browse URL:', msg.url)
        try {
          ensureValidURL(msg.url)
          browseWindow.loadURL(msg.url)
        } catch (error) {
          console.error('Invalid URL:', msg.url)
          console.error('Error:', error)
        }
      } else if (msg.type === 'dev-tools') {
        console.debug('Opening DevTools for view:', msg.viewIdx)
        streamWindow.openDevTools(msg.viewIdx, browseWindow.webContents)
      }
    } else if (msg.type === 'set-stream-censored' && streamdelayClient) {
      console.debug('Setting stream censored:', msg.isCensored)
      streamdelayClient.setCensored(msg.isCensored)
    } else if (msg.type === 'set-stream-running' && streamdelayClient) {
      console.debug('Setting stream running:', msg.isStreamRunning)
      streamdelayClient.setStreamRunning(msg.isStreamRunning)
      // TODO: Move to control server
      /*} else if (msg.type === 'create-invite') {
      console.debug('Creating invite for role:', msg.role)
      const { secret } = await auth.createToken({
        kind: 'invite',
        role: msg.role,
        name: msg.name,
      })
      respond({ name: msg.name, secret })
    } else if (msg.type === 'delete-token') {
      console.debug('Deleting token:', msg.tokenId)
      auth.deleteToken(msg.tokenId)
      */
    }
  }

  function updateState(newState: Partial<StreamwallState>) {
    clientState = { ...clientState, ...newState }
    streamWindow.onState(clientState)
    controlWindow.onState(clientState)
  }

  // Wire up IPC:

  // StreamWindow view updates -> main
  streamWindow.on('state', (viewStates) => {
    updateState({ views: viewStates })
  })

  // StreamWindow <- main init state
  streamWindow.on('load', () => {
    streamWindow.onState(clientState)
  })

  // Control <- main collab updates
  stateDoc.on('update', (update) => {
    controlWindow.onYDocUpdate(update)
  })

  // Control <- main init state
  controlWindow.on('load', () => {
    controlWindow.onState(clientState)
    controlWindow.onYDocUpdate(Y.encodeStateAsUpdate(stateDoc))
  })

  // Control -> main
  controlWindow.on('ydoc', (update) => Y.applyUpdate(stateDoc, update))
  controlWindow.on('command', (command) => onCommand(command))

  // TODO: Hide on macOS, allow reopening from dock
  streamWindow.on('close', () => {
    process.exit(0)
  })

  if (argv.streamdelay.key) {
    console.debug('Setting up Streamdelay client...')
    streamdelayClient = new StreamdelayClient({
      endpoint: argv.streamdelay.endpoint,
      key: argv.streamdelay.key,
    })
    streamdelayClient.on('state', (state) => {
      updateState({ streamdelay: state })
    })
    streamdelayClient.connect()
  }

  /*
  if (argv.control.address) {
    console.debug('Initializing web server...')
    const webDistPath = path.join(app.getAppPath(), 'web')
    await initWebServer({
      certDir: argv.cert.dir,
      certProduction: argv.cert.production,
      email: argv.cert.email,
      url: argv.control.address,
      hostname: argv.control.hostname,
      port: argv.control.port,
      logEnabled: true,
      webDistPath,
      auth,
      clientState,
      onMessage,
      stateDoc,
    })
    if (argv.control.open) {
      shell.openExternal(argv.control.address)
    }
  }
    */

  // --- Discovery settings from CLI ---
  if (argv['discovery-query']) {
    setSearchQuery(argv['discovery-query'])
  }
  if (argv['youtube-api-key']) {
    setApiKey('youtube', argv['youtube-api-key'])
  }

  // --- Discovery utility process ---
  const { port1, port2 } = new MessageChannelMain()

  function forkDiscoveryProcess() {
    const child = utilityProcess.fork(
      path.join(__dirname, 'discovery-worker.js'),
    )
    child.postMessage({ type: 'init' }, [port1])
    return child
  }

  let discoveryProcess = forkDiscoveryProcess()
  port2.start()
  port2.postMessage({
    type: 'configure',
    settings: getDiscoverySettings(),
  })

  // Propagate settings changes to utility process in real time
  discoveryStore.onDidAnyChange(() => {
    port2.postMessage({
      type: 'configure',
      settings: getDiscoverySettings(),
    })
  })

  // Auto-restart with exponential backoff on crash (1s, 2s, 4s, cap 5 retries)
  let restartCount = 0
  const onDiscoveryExit = (code: number) => {
    if (code !== 0 && restartCount < 5) {
      const delay = Math.min(1000 * Math.pow(2, restartCount), 4000)
      restartCount++
      console.warn(
        `Discovery process exited with code ${code}, restarting in ${delay}ms (attempt ${restartCount}/5)`,
      )
      setTimeout(() => {
        discoveryProcess = forkDiscoveryProcess()
        discoveryProcess.on('exit', onDiscoveryExit)
      }, delay)
    } else if (code !== 0) {
      console.error(
        'Discovery process crashed too many times, giving up',
      )
    }
  }
  discoveryProcess.on('exit', onDiscoveryExit)

  // If there's a persisted search query, trigger discovery
  const searchQuery = getSearchQuery()
  if (searchQuery) {
    port2.postMessage({ type: 'search', query: searchQuery })
  }

  const discoveryBridge = createDiscoveryBridge(port2)

  const dataSources = [
    ...argv.data['json-url'].map((url) => {
      console.debug('Setting data source from json-url:', url)
      return markDataSource(pollDataURL(url, argv.data.interval), 'json-url')
    }),
    ...argv.data['toml-file'].map((path) => {
      console.debug('Setting data source from toml-file:', path)
      return markDataSource(watchDataFile(path), 'toml-file')
    }),
    markDataSource(localStreamData.gen(), 'custom'),
    overlayStreamData.gen(),
    markDataSource(discoveryBridge, 'discovery'),
  ]

  for await (const rawStreams of combineDataSources(dataSources)) {
    console.debug('Processing streams:', rawStreams)
    const streams = idGen.process(rawStreams)
    updateState({ streams })
  }
}

function init() {
  console.debug('Parsing command line arguments...')
  const argv = parseArgs()
  if (argv.help) {
    return
  }

  console.debug('Setting up Electron...')
  app.commandLine.appendSwitch('high-dpi-support', '1')
  app.commandLine.appendSwitch('force-device-scale-factor', '1')

  console.debug('Enabling Electron sandbox...')
  app.enableSandbox()

  app
    .whenReady()
    .then(() => main(argv))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit()
}

console.debug('Starting Streamwall...')
init()

import Color from 'color'
import { patch as patchJSON } from 'jsondiffpatch'
import { range, sortBy, truncate } from 'lodash-es'
import { DateTime } from 'luxon'
import { JSX } from 'preact'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  FaExchangeAlt,
  FaRedoAlt,
  FaRegLifeRing,
  FaRegWindowMaximize,
  FaSyncAlt,
  FaVideoSlash,
  FaVolumeUp,
} from 'react-icons/fa'
import ReconnectingWebSocket from 'reconnecting-websocket'
import {
  ContentKind,
  ControlCommand,
  idColor,
  idxInBox,
  LocalStreamData,
  roleCan,
  StreamData,
  StreamDelayStatus,
  StreamwallRole,
  StreamwallState,
  StreamWindowConfig,
  ViewState,
} from 'streamwall-shared'
import { matchesState } from 'xstate'
import * as Y from 'yjs'

export interface ViewInfo {
  state: ViewState
  isListening: boolean
  isBackgroundListening: boolean
  isBlurred: boolean
  spaces: number[]
}

interface Invite {
  name: string
  secret: string
}

const hotkeyTriggers = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
  'q',
  'w',
  'e',
  'r',
  't',
  'y',
  'u',
  'i',
  'o',
  'p',
]

export function GlobalStyle() {
  return null
}

const normalStreamKinds = new Set(['video', 'audio', 'web'])
function filterStreams(streams: StreamData[]) {
  const liveStreams = []
  const otherStreams = []
  for (const stream of streams) {
    const { kind, status } = stream
    if (kind && !normalStreamKinds.has(kind)) {
      continue
    }
    if ((kind && kind !== 'video') || status === 'Live') {
      liveStreams.push(stream)
    } else {
      otherStreams.push(stream)
    }
  }
  return [liveStreams, otherStreams]
}

export function useYDoc<T>(keys: string[]): {
  docValue: T | undefined
  doc: Y.Doc
  setDoc: (doc: Y.Doc) => void
} {
  const [doc, setDoc] = useState(new Y.Doc())
  const [docValue, setDocValue] = useState<T>()
  useEffect(() => {
    function updateDocValue() {
      const valueCopy = Object.fromEntries(
        keys.map((k) => [k, doc.getMap(k).toJSON()]),
      )
      // TODO: validate using zod
      setDocValue(valueCopy as T)
    }
    updateDocValue()
    doc.on('update', updateDocValue)
    return () => {
      doc.off('update', updateDocValue)
    }
  }, [doc])
  return { docValue, doc, setDoc }
}

export interface CollabData {
  views: { [viewIdx: string]: { streamId: string | undefined } }
}

export interface StreamwallConnection {
  isConnected: boolean
  role: StreamwallRole | null
  send: (msg: ControlCommand, cb?: (msg: unknown) => void) => void
  sharedState: CollabData | undefined
  stateDoc: Y.Doc
  config: StreamWindowConfig | undefined
  streams: StreamData[]
  customStreams: StreamData[]
  views: ViewInfo[]
  stateIdxMap: Map<number, ViewInfo>
  delayState: StreamDelayStatus | null | undefined
  //authState?: ...
}

export function useStreamwallState(state: StreamwallState | undefined) {
  const [config, setConfig] = useState<StreamWindowConfig>()
  const [streams, setStreams] = useState<StreamData[]>([])
  const [customStreams, setCustomStreams] = useState<StreamData[]>([])
  const [views, setViews] = useState<ViewInfo[]>([])
  const [stateIdxMap, setStateIdxMap] = useState(new Map<number, ViewInfo>())
  const [delayState, setDelayState] = useState<StreamDelayStatus | null>()
  //const [authState, setAuthState] = useState()

  useEffect(() => {
    if (state == null) {
      return
    }

    const {
      config: newConfig,
      streams: newStreams,
      views: incomingViews,
      streamdelay,
      //auth,
    } = state
    const newStateIdxMap = new Map()
    const newViews = []
    for (const viewState of incomingViews) {
      const { pos } = viewState.context
      const isListening = matchesState(
        'displaying.running.audio.listening',
        viewState.state,
      )
      const isBackgroundListening = matchesState(
        'displaying.running.audio.background',
        viewState.state,
      )
      const isBlurred = matchesState(
        'displaying.running.video.blurred',
        viewState.state,
      )
      const spaces = pos?.spaces ?? []
      const viewInfo = {
        state: viewState,
        isListening,
        isBackgroundListening,
        isBlurred,
        spaces,
      }
      newViews.push(viewInfo)
      for (const space of spaces) {
        if (!newStateIdxMap.has(space)) {
          newStateIdxMap.set(space, {})
        }
        Object.assign(newStateIdxMap.get(space), viewInfo)
      }
    }
    setConfig(newConfig)
    setStateIdxMap(newStateIdxMap)
    setStreams(sortBy(newStreams, ['_id']))
    setViews(newViews)
    setCustomStreams(newStreams.filter((s) => s._dataSource === 'custom'))
    setDelayState(streamdelay)
    //setAuthState(auth)
  }, [state])

  return { views, config, streams, customStreams, stateIdxMap, delayState }
}

function useStreamwallWebsocketConnection(
  wsEndpoint: string,
  role: StreamwallRole,
): StreamwallConnection {
  const wsRef = useRef<{
    ws: ReconnectingWebSocket
    msgId: number
    responseMap: Map<number, (msg: object) => void>
  }>()
  const [isConnected, setIsConnected] = useState(false)
  const {
    docValue: sharedState,
    doc: stateDoc,
    setDoc: setStateDoc,
  } = useYDoc<CollabData>(['views'])
  const [streamwallState, setStreamwallState] = useState<StreamwallState>()
  const appState = useStreamwallState(streamwallState)

  useEffect(() => {
    let lastStateData: StreamwallState | undefined
    const ws = new ReconnectingWebSocket(wsEndpoint, [], {
      maxReconnectionDelay: 5000,
      minReconnectionDelay: 1000 + Math.random() * 500,
      reconnectionDelayGrowFactor: 1.1,
    })
    ws.binaryType = 'arraybuffer'
    ws.addEventListener('open', () => setIsConnected(true))
    ws.addEventListener('close', () => {
      setStateDoc(new Y.Doc())
      setIsConnected(false)
    })
    ws.addEventListener('message', (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        return
      }
      const msg = JSON.parse(ev.data)
      if (msg.response && wsRef.current != null) {
        const { responseMap } = wsRef.current
        const responseCb = responseMap.get(msg.id)
        if (responseCb) {
          responseMap.delete(msg.id)
          responseCb(msg)
        }
      } else if (msg.type === 'state' || msg.type === 'state-delta') {
        let state: StreamwallState
        if (msg.type === 'state') {
          state = msg.state
        } else {
          state = patchJSON(lastStateData, msg.delta) as StreamwallState
        }
        lastStateData = state
        setStreamwallState(state)
      } else {
        console.warn('unexpected ws message', msg)
      }
    })
    wsRef.current = { ws, msgId: 0, responseMap: new Map() }
  }, [])

  const send = useCallback(
    (msg: ControlCommand, cb?: (msg: unknown) => void) => {
      if (!wsRef.current) {
        throw new Error('Websocket not initialized')
      }
      const { ws, msgId, responseMap } = wsRef.current
      ws.send(
        JSON.stringify({
          ...msg,
          id: msgId,
        }),
      )
      if (cb) {
        responseMap.set(msgId, cb)
      }
      wsRef.current.msgId++
    },
    [],
  )

  useEffect(() => {
    if (!wsRef.current) {
      throw new Error('Websocket not initialized')
    }
    const { ws } = wsRef.current

    function sendUpdate(update: Uint8Array, origin: string) {
      if (origin === 'server') {
        return
      }
      wsRef.current?.ws.send(update)
    }

    function receiveUpdate(ev: MessageEvent) {
      if (!(ev.data instanceof ArrayBuffer)) {
        return
      }
      Y.applyUpdate(stateDoc, new Uint8Array(ev.data), 'server')
    }

    stateDoc.on('update', sendUpdate)
    ws.addEventListener('message', receiveUpdate)
    return () => {
      stateDoc.off('update', sendUpdate)
      ws.removeEventListener('message', receiveUpdate)
    }
  }, [stateDoc])

  return {
    ...appState,
    isConnected,
    role,
    send,
    sharedState,
    stateDoc,
  }
}

export function ControlUI({
  connection,
}: {
  connection: StreamwallConnection
}) {
  const {
    isConnected,
    role,
    send,
    sharedState,
    stateDoc,
    config,
    streams,
    customStreams,
    views,
    stateIdxMap,
    delayState,
    //authState,
  } = connection
  const {
    gridCount,
    width: windowWidth,
    height: windowHeight,
  } = config ?? { gridCount: null, width: null, height: null }

  const [showDebug, setShowDebug] = useState(false)
  const handleChangeShowDebug = useCallback<
    JSX.InputEventHandler<HTMLInputElement>
  >((ev) => {
    setShowDebug(ev.currentTarget.checked)
  }, [])

  const [swapStartIdx, setSwapStartIdx] = useState<number | undefined>()
  const handleSwapView = useCallback(
    (idx: number) => {
      if (!stateIdxMap.has(idx)) {
        return
      }
      // Deselect the input so the contents aren't persisted by GridInput's `editingValue`
      const { activeElement } = document
      if (activeElement && activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
      setSwapStartIdx(idx)
    },
    [stateIdxMap],
  )
  const handleSwap = useCallback(
    (toIdx: number) => {
      if (swapStartIdx === undefined) {
        return
      }
      stateDoc.transact(() => {
        const viewsState = stateDoc.getMap<Y.Map<string | undefined>>('views')
        const startStreamId = viewsState
          ?.get(String(swapStartIdx))
          ?.get('streamId')
        const toStreamId = viewsState.get(String(toIdx))?.get('streamId')
        const startSpaces = stateIdxMap.get(swapStartIdx)?.spaces ?? []
        const toSpaces = stateIdxMap.get(toIdx)?.spaces ?? []
        for (const startSpaceIdx of startSpaces) {
          viewsState.get(String(startSpaceIdx))?.set('streamId', toStreamId)
        }
        for (const toSpaceIdx of toSpaces) {
          viewsState.get(String(toSpaceIdx))?.set('streamId', startStreamId)
        }
      })
      setSwapStartIdx(undefined)
    },
    [stateDoc, stateIdxMap, swapStartIdx],
  )

  const [hoveringIdx, setHoveringIdx] = useState<number>()
  const updateHoveringIdx = useCallback(
    (ev: MouseEvent) => {
      if (gridCount == null || !(ev.currentTarget instanceof HTMLElement)) {
        return
      }
      const { width, height, left, top } =
        ev.currentTarget.getBoundingClientRect()
      const x = Math.floor(ev.clientX - left)
      const y = Math.floor(ev.clientY - top)
      const spaceWidth = width / gridCount
      const spaceHeight = height / gridCount
      const idx =
        Math.floor(y / spaceHeight) * gridCount + Math.floor(x / spaceWidth)
      setHoveringIdx(idx)
    },
    [setHoveringIdx, gridCount],
  )
  const [dragStart, setDragStart] = useState<number | undefined>()
  const handleDragStart = useCallback(
    (ev: MouseEvent) => {
      if (hoveringIdx == null) {
        return
      }
      ev.preventDefault()
      if (swapStartIdx !== undefined) {
        handleSwap(hoveringIdx)
      } else {
        setDragStart(hoveringIdx)
        // Select the text (if it is an input element)
        if (ev.target instanceof HTMLInputElement) {
          ev.target.select()
        }
      }
    },
    [handleSwap, swapStartIdx, hoveringIdx],
  )
  useLayoutEffect(() => {
    function endDrag() {
      if (dragStart == null || gridCount == null || hoveringIdx == null) {
        return
      }
      stateDoc.transact(() => {
        const viewsState = stateDoc.getMap<Y.Map<string | undefined>>('views')
        const streamId = viewsState.get(String(dragStart))?.get('streamId')
        for (let idx = 0; idx < gridCount ** 2; idx++) {
          if (idxInBox(gridCount, dragStart, hoveringIdx, idx)) {
            viewsState.get(String(idx))?.set('streamId', streamId)
          }
        }
      })
      setDragStart(undefined)
    }
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [stateDoc, dragStart, hoveringIdx])

  const [focusedInputIdx, setFocusedInputIdx] = useState<number | undefined>()
  const handleBlurInput = useCallback(() => setFocusedInputIdx(undefined), [])

  const handleSetView = useCallback(
    (idx: number, streamId: string) => {
      const stream = streams.find((d) => d._id === streamId)
      stateDoc
        .getMap<Y.Map<string | undefined>>('views')
        .get(String(idx))
        ?.set('streamId', stream ? streamId : '')
    },
    [stateDoc, streams],
  )

  const handleSetListening = useCallback(
    (idx: number, listening: boolean) => {
      send({
        type: 'set-listening-view',
        viewIdx: listening ? idx : null,
      })
    },
    [send],
  )

  const handleSetBackgroundListening = useCallback(
    (viewIdx: number, listening: boolean) => {
      send({
        type: 'set-view-background-listening',
        viewIdx,
        listening,
      })
    },
    [send],
  )

  const handleSetBlurred = useCallback(
    (viewIdx: number, blurred: boolean) => {
      send({
        type: 'set-view-blurred',
        viewIdx,
        blurred,
      })
    },
    [send],
  )

  const handleReloadView = useCallback(
    (viewIdx: number) => {
      send({
        type: 'reload-view',
        viewIdx,
      })
    },
    [send],
  )

  const handleRotateStream = useCallback(
    (streamId: string) => {
      const stream = streams.find((d) => d._id === streamId)
      if (!stream) {
        return
      }
      send({
        type: 'rotate-stream',
        url: stream.link,
        rotation: ((stream.rotation || 0) + 90) % 360,
      })
    },
    [streams],
  )

  const handleBrowse = useCallback(
    (streamId: string) => {
      const stream = streams.find((d) => d._id === streamId)
      if (!stream) {
        return
      }
      send({
        type: 'browse',
        url: stream.link,
      })
    },
    [streams],
  )

  const handleDevTools = useCallback(
    (viewIdx: number) => {
      send({
        type: 'dev-tools',
        viewIdx,
      })
    },
    [send],
  )

  const handleClickId = useCallback(
    (streamId: string) => {
      if (gridCount == null || sharedState == null) {
        return
      }

      try {
        navigator.clipboard.writeText(streamId)
      } catch (err) {
        console.warn('Unable to copy stream id to clipboard:', err)
      }

      if (focusedInputIdx !== undefined) {
        handleSetView(focusedInputIdx, streamId)
        return
      }

      const availableIdx = range(gridCount * gridCount).find(
        (i) => !sharedState.views[i].streamId,
      )
      if (availableIdx === undefined) {
        return
      }
      handleSetView(availableIdx, streamId)
    },
    [gridCount, sharedState, focusedInputIdx],
  )

  const handleChangeCustomStream = useCallback(
    (url: string, customStream: LocalStreamData) => {
      send({
        type: 'update-custom-stream',
        url,
        data: customStream,
      })
    },
    [send],
  )

  const handleDeleteCustomStream = useCallback(
    (url: string) => {
      send({
        type: 'delete-custom-stream',
        url,
      })
      return
    },
    [send],
  )

  const setStreamCensored = useCallback(
    (isCensored: boolean) => {
      send({
        type: 'set-stream-censored',
        isCensored,
      })
    },
    [send],
  )

  const setStreamRunning = useCallback(
    (isStreamRunning: boolean) => {
      send({
        type: 'set-stream-running',
        isStreamRunning,
      })
    },
    [send],
  )

  // Set up keyboard shortcuts.
  useHotkeys(
    hotkeyTriggers.map((k) => `alt+${k}`).join(','),
    (ev, { hotkey }) => {
      ev.preventDefault()
      const idx = hotkeyTriggers.indexOf(hotkey[hotkey.length - 1])
      const isListening = stateIdxMap.get(idx)?.isListening ?? false
      handleSetListening(idx, !isListening)
    },
    // This enables hotkeys when input elements are focused, and affects all hotkeys, not just this one.
    { filter: () => true },
    [stateIdxMap],
  )
  useHotkeys(
    hotkeyTriggers.map((k) => `alt+shift+${k}`).join(','),
    (ev, { hotkey }) => {
      ev.preventDefault()
      const idx = hotkeyTriggers.indexOf(hotkey[hotkey.length - 1])
      const isBlurred = stateIdxMap.get(idx)?.isBlurred ?? false
      handleSetBlurred(idx, !isBlurred)
    },
    [stateIdxMap],
  )
  useHotkeys(
    `alt+c`,
    () => {
      setStreamCensored(true)
    },
    [setStreamCensored],
  )
  useHotkeys(
    `alt+shift+c`,
    () => {
      setStreamCensored(false)
    },
    [setStreamCensored],
  )
  useHotkeys(
    `alt+s`,
    () => {
      if (focusedInputIdx != null) {
        handleSwapView(focusedInputIdx)
      }
    },
    [handleSwapView, focusedInputIdx],
  )

  const [liveStreams, otherStreams] = filterStreams(streams)
  function StreamList({ rows }: { rows: StreamData[] }) {
    return rows.map((row) => (
      <StreamLine
        id={row._id}
        row={row}
        disabled={!roleCan(role, 'mutate-state-doc')}
        onClickId={handleClickId}
      />
    ))
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <div className="flex flex-col shrink min-h-0 overflow-auto">
        {role !== 'local' && (
          <header className="flex items-center gap-8 px-3 py-2 bg-surface-raised border-b border-border-default">
            <h1 className="text-text-primary text-lg font-semibold m-0">
              Streamwall ({location.host})
            </h1>
            <div className="text-text-muted">
              connection status:{' '}
              {isConnected ? 'connected' : 'connecting...'}
            </div>
            <div className="text-text-muted">role: {role}</div>
          </header>
        )}
        {delayState && (
          <StreamDelayBox
            role={role}
            delayState={delayState}
            setStreamCensored={setStreamCensored}
            setStreamRunning={setStreamRunning}
          />
        )}
        <div
          className={`px-3 py-2 ${isConnected ? 'opacity-100' : 'opacity-50'}`}
        >
          {gridCount && (
            <div
              className="relative border-2 border-border-default rounded-lg bg-[#0e0e0e] overflow-hidden group w-full"
              style={{
                maxWidth: windowWidth * 0.75,
                maxHeight: windowHeight * 0.75,
                aspectRatio: `${windowWidth} / ${windowHeight}`,
              }}
              onMouseMove={updateHoveringIdx}
            >
              {/* Grid input layer */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-35 transition-opacity duration-100 overflow-hidden z-[100]">
                {range(0, gridCount).map((y) =>
                  range(0, gridCount).map((x) => {
                    const idx = gridCount * y + x
                    const { streamId } = sharedState?.views?.[idx] ?? {}
                    const isDragHighlighted =
                      dragStart != null &&
                      hoveringIdx != null &&
                      idxInBox(gridCount, dragStart, hoveringIdx, idx)
                    return (
                      <GridInput
                        style={{
                          width: `${100 / gridCount}%`,
                          height: `${100 / gridCount}%`,
                          left: `${(100 * x) / gridCount}%`,
                          top: `${(100 * y) / gridCount}%`,
                        }}
                        idx={idx}
                        spaceValue={streamId ?? ''}
                        onChangeSpace={handleSetView}
                        isHighlighted={isDragHighlighted}
                        role={role}
                        onMouseDown={handleDragStart}
                        onFocus={setFocusedInputIdx}
                        onBlur={handleBlurInput}
                      />
                    )
                  }),
                )}
              </div>
              {/* Grid preview layer */}
              <div className="absolute inset-0">
                {views.map(({ state, isListening }) => {
                  const { pos } = state.context
                  if (pos == null) {
                    return null
                  }

                  const { streamId } = sharedState?.views[pos.spaces[0]] ?? {}
                  const data = streams.find((d) => d._id === streamId)
                  if (streamId == null || !data == null) {
                    return null
                  }

                  return (
                    <GridPreviewBox
                      color={idColor(streamId)}
                      style={{
                        left: `${(100 * pos.x) / windowWidth}%`,
                        top: `${(100 * pos.y) / windowHeight}%`,
                        width: `${(100 * pos.width) / windowWidth}%`,
                        height: `${(100 * pos.height) / windowHeight}%`,
                      }}
                      pos={pos}
                      windowWidth={windowWidth}
                      windowHeight={windowHeight}
                      isListening={isListening}
                      isError={matchesState('displaying.error', state.state)}
                    >
                      <div className="text-center text-text-muted">
                        <div className="text-[30px] text-text-primary font-medium">
                          {streamId}
                        </div>
                        <div>{data?.source}</div>
                      </div>
                    </GridPreviewBox>
                  )
                })}
              </div>
              {/* Grid controls layer */}
              {views.map(
                ({
                  state,
                  isListening,
                  isBackgroundListening,
                  isBlurred,
                }) => {
                  const { pos } = state.context
                  if (!pos) {
                    return null
                  }
                  const { streamId } = sharedState?.views[pos.spaces[0]] ?? {}
                  if (!streamId) {
                    return null
                  }
                  return (
                    <GridControls
                      idx={pos.spaces[0]}
                      streamId={streamId}
                      style={{
                        left: `${(100 * pos.x) / windowWidth}%`,
                        top: `${(100 * pos.y) / windowHeight}%`,
                        width: `${(100 * pos.width) / windowWidth}%`,
                        height: `${(100 * pos.height) / windowHeight}%`,
                      }}
                      isDisplaying={matchesState('displaying', state.state)}
                      isListening={isListening}
                      isBackgroundListening={isBackgroundListening}
                      isBlurred={isBlurred}
                      isSwapping={
                        swapStartIdx != null &&
                        pos.spaces.includes(swapStartIdx)
                      }
                      showDebug={showDebug}
                      role={role}
                      onSetListening={handleSetListening}
                      onSetBackgroundListening={handleSetBackgroundListening}
                      onSetBlurred={handleSetBlurred}
                      onReloadView={handleReloadView}
                      onSwapView={handleSwapView}
                      onRotateView={handleRotateStream}
                      onBrowse={handleBrowse}
                      onDevTools={handleDevTools}
                      onMouseDown={handleDragStart}
                    />
                  )
                },
              )}
            </div>
          )}
          {(roleCan(role, 'dev-tools') || roleCan(role, 'browse')) && (
            <label className="flex items-center gap-2 mt-2 text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDebug}
                onChange={handleChangeShowDebug}
                className="accent-accent-blue"
              />
              Show stream debug tools
            </label>
          )}
        </div>
      </div>
      <div
        className={`flex flex-col flex-1 overflow-y-auto min-h-0 px-3 py-2 ${isConnected ? 'opacity-100' : 'opacity-50'}`}
      >
        {isConnected ? (
          <div>
            <h3 className="text-text-primary font-semibold mt-4 mb-2">Live</h3>
            <StreamList rows={liveStreams} />
            <h3 className="text-text-primary font-semibold mt-4 mb-2">
              Offline / Unknown
            </h3>
            <StreamList rows={otherStreams} />
          </div>
        ) : (
          <div className="text-text-muted">loading...</div>
        )}
        {roleCan(role, 'update-custom-stream') &&
          roleCan(role, 'delete-custom-stream') && (
            <>
              <h2 className="text-text-primary font-semibold text-lg mt-6 mb-3">
                Custom Streams
              </h2>
              <div className="space-y-3">
                {customStreams.map(({ link, label, kind }, idx) => (
                  <CustomStreamInput
                    key={idx}
                    link={link}
                    label={label}
                    kind={kind}
                    onChange={handleChangeCustomStream}
                    onDelete={handleDeleteCustomStream}
                  />
                ))}
                <CreateCustomStreamInput onCreate={handleChangeCustomStream} />
              </div>
            </>
          )}
      </div>
    </div>
  )
}

function StreamDurationClock({ startTime }: { startTime: number }) {
  const [now, setNow] = useState(() => DateTime.now())
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(DateTime.now())
    }, 500)
    return () => {
      clearInterval(interval)
    }
  }, [startTime])
  return (
    <span>
      {now.diff(DateTime.fromMillis(startTime)).toFormat('hh:mm:ss')}
    </span>
  )
}

function StreamDelayBox({
  role,
  delayState,
  setStreamCensored,
  setStreamRunning,
}: {
  role: StreamwallRole | null
  delayState: StreamDelayStatus
  setStreamCensored: (isCensored: boolean) => void
  setStreamRunning: (isStreamRunning: boolean) => void
}) {
  const handleToggleStreamCensored = useCallback(() => {
    setStreamCensored(!delayState.isCensored)
  }, [delayState.isCensored, setStreamCensored])
  const handleToggleStreamRunning = useCallback(() => {
    if (!delayState.isStreamRunning || confirm('End stream?')) {
      setStreamRunning(!delayState.isStreamRunning)
    }
  }, [delayState.isStreamRunning, setStreamRunning])
  let buttonText
  if (delayState.isConnected) {
    if (matchesState('censorship.censored.deactivating', delayState.state)) {
      buttonText = 'Deactivating...'
    } else if (delayState.isCensored) {
      buttonText = 'Uncensor stream'
    } else {
      buttonText = 'Censor stream'
    }
  }
  return (
    <div className="px-3 py-2">
      <div className="inline-flex items-center gap-4 px-4 py-3 bg-danger-bg border border-danger-border rounded-lg text-danger-text">
        <strong className="text-[#f8d0d0]">Streamdelay</strong>
        {!delayState.isConnected && <span>connecting...</span>}
        {!delayState.isStreamRunning && <span>stream stopped</span>}
        {delayState.isConnected && (
          <>
            {delayState.startTime !== null && (
              <StreamDurationClock startTime={delayState.startTime} />
            )}
            <span>delay: {delayState.delaySeconds}s</span>
            {delayState.isStreamRunning && (
              <ActionButton
                isActive={delayState.isCensored}
                onClick={handleToggleStreamCensored}
                tabIndex={1}
              >
                {buttonText}
              </ActionButton>
            )}
            {roleCan(role, 'set-stream-running') && (
              <ActionButton onClick={handleToggleStreamRunning} tabIndex={1}>
                {delayState.isStreamRunning ? 'End stream' : 'Start stream'}
              </ActionButton>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ActionButton({
  isActive,
  activeColor = 'red',
  className = '',
  children,
  ...props
}: {
  isActive?: boolean
  activeColor?: string
  children: preact.ComponentChildren
} & JSX.HTMLAttributes<HTMLButtonElement>) {
  const activeStyle = isActive
    ? {
        borderColor: Color(activeColor).hsl().string(),
        background: Color(activeColor)
          .desaturate(0.5)
          .darken(0.4)
          .hsl()
          .string(),
      }
    : {}
  return (
    <button
      className={`flex items-center border-2 border-border-active bg-surface-card rounded-[5px] text-text-muted cursor-pointer transition-[background,border-color] duration-150 hover:bg-surface-overlay hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-accent-blue/40 [&_svg]:w-5 [&_svg]:h-5 ${className}`}
      style={activeStyle}
      {...props}
    >
      {children}
    </button>
  )
}

function SmallActionButton(
  props: Parameters<typeof ActionButton>[0],
) {
  return (
    <ActionButton
      {...props}
      className={`[&_svg]:!w-3.5 [&_svg]:!h-3.5 ${props.className ?? ''}`}
    />
  )
}

function StreamLine({
  id,
  row: { label, source, link, notes },
  disabled,
  onClickId,
}: {
  id: string
  row: StreamData
  disabled: boolean
  onClickId: (id: string) => void
}) {
  // Use mousedown instead of click event so a potential destination grid input stays focused.
  const handleMouseDownId = useCallback(() => {
    onClickId(id)
  }, [onClickId, id])
  const color = idColor(id)
  return (
    <div className="flex items-center my-2 text-text-muted">
      <div
        className={`shrink-0 mr-2 px-2 py-1 rounded-[5px] w-[3em] text-center text-text-primary font-medium transition-colors duration-150 ${disabled ? 'cursor-default' : 'cursor-pointer hover:brightness-125'}`}
        style={{
          background: Color(color).lightness(35).saturationl(50).hsl().string(),
        }}
        onMouseDown={disabled ? undefined : handleMouseDownId}
      >
        {id}
      </div>
      <div>
        {label ? (
          label
        ) : (
          <>
            <strong className="text-text-secondary">{source}</strong>{' '}
            <a
              href={link}
              target="_blank"
              className="text-accent-blue hover:underline"
            >
              {truncate(link, { length: 55 })}
            </a>{' '}
            {notes}
          </>
        )}
      </div>
    </div>
  )
}

// An input that maintains local edits and fires onChange after blur (like a non-React input does), or optionally on every edit if isEager is set.
function LazyChangeInput({
  value = '',
  onChange,
  isEager = false,
  ...props
}: {
  value: string
  isEager?: boolean
  onChange: (value: string) => void
} & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [editingValue, setEditingValue] = useState<string>()
  const handleFocus = useCallback<JSX.FocusEventHandler<HTMLInputElement>>(
    (ev) => {
      if (ev.target instanceof HTMLInputElement) {
        setEditingValue(ev.target.value)
      }
    },
    [],
  )

  const handleBlur = useCallback(() => {
    if (!isEager && editingValue !== undefined) {
      onChange(editingValue)
    }
    setEditingValue(undefined)
  }, [editingValue])

  const handleKeyDown = useCallback<JSX.KeyboardEventHandler<HTMLInputElement>>(
    (ev) => {
      if (ev.key === 'Enter') {
        handleBlur()
      }
    },
    [],
  )

  const handleChange = useCallback<JSX.InputEventHandler<HTMLInputElement>>(
    (ev) => {
      const { value } = ev.currentTarget
      setEditingValue(value)
      if (isEager) {
        onChange(value)
      }
    },
    [onChange, isEager],
  )

  return (
    <input
      value={editingValue !== undefined ? editingValue : value}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      {...props}
    />
  )
}

function GridInput({
  style,
  idx,
  onChangeSpace,
  spaceValue,
  isHighlighted,
  role,
  onMouseDown,
  onFocus,
  onBlur,
}: {
  style: JSX.HTMLAttributes['style']
  onMouseDown: JSX.MouseEventHandler<HTMLInputElement>
  idx: number
  onChangeSpace: (idx: number, value: string) => void
  spaceValue: string
  isHighlighted: boolean
  role: StreamwallRole | null
  onFocus: (idx: number) => void
  onBlur: (idx: number) => void
}) {
  const handleFocus = useCallback(() => {
    onFocus(idx)
  }, [onFocus, idx])
  const handleBlur = useCallback(() => {
    onBlur(idx)
  }, [onBlur, idx])
  const handleChange = useCallback(
    (value: string) => {
      onChangeSpace(idx, value)
    },
    [idx, onChangeSpace],
  )
  const color = idColor(spaceValue)
  return (
    <div className="absolute" style={style}>
      <LazyChangeInput
        className="w-full h-full outline outline-1 outline-border-default border-none p-0 rounded-none text-xl text-center text-text-secondary focus:outline-accent-blue focus:shadow-[inset_0_0_8px_rgba(96,165,250,0.3)] focus:z-[100]"
        style={{
          background: isHighlighted
            ? Color(color).lightness(25).saturationl(30).hsl().string()
            : Color(color).lightness(18).saturationl(25).hsl().string(),
        }}
        value={spaceValue}
        disabled={!roleCan(role, 'mutate-state-doc')}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseDown={onMouseDown}
        onChange={handleChange}
        isEager
      />
    </div>
  )
}

function GridPreviewBox({
  color,
  style,
  pos,
  windowWidth,
  windowHeight,
  isListening,
  isError,
  children,
}: {
  color: string
  style: JSX.HTMLAttributes['style']
  pos: { x: number; y: number; width: number; height: number }
  windowWidth: number
  windowHeight: number
  isListening: boolean
  isError: boolean
  children: preact.ComponentChildren
}) {
  const borderWidth = 2
  return (
    <div
      className="flex items-center justify-center absolute overflow-hidden select-none"
      style={{
        ...style,
        background:
          Color(color).lightness(30).saturationl(40).hsl().string() ||
          '#222222',
        borderStyle: 'solid',
        borderColor: isError
          ? Color('red').lightness(45).hsl().string()
          : '#333333',
        borderLeftWidth: pos.x === 0 ? 0 : borderWidth,
        borderRightWidth:
          pos.x + pos.width === windowWidth ? 0 : borderWidth,
        borderTopWidth: pos.y === 0 ? 0 : borderWidth,
        borderBottomWidth:
          pos.y + pos.height === windowHeight ? 0 : borderWidth,
        boxShadow: isListening ? '0 0 0 3px #ef4444 inset' : 'none',
        boxSizing: 'border-box',
        color: '#e0e0e0',
      }}
    >
      {children}
    </div>
  )
}

function GridControls({
  idx,
  streamId,
  style,
  isDisplaying,
  isListening,
  isBackgroundListening,
  isBlurred,
  isSwapping,
  showDebug,
  role,
  onSetListening,
  onSetBackgroundListening,
  onSetBlurred,
  onReloadView,
  onSwapView,
  onRotateView,
  onBrowse,
  onDevTools,
  onMouseDown,
}: {
  idx: number
  streamId: string
  style: JSX.HTMLAttributes['style']
  isDisplaying: boolean
  isListening: boolean
  isBackgroundListening: boolean
  isBlurred: boolean
  isSwapping: boolean
  showDebug: boolean
  role: StreamwallRole | null
  onSetListening: (idx: number, isListening: boolean) => void
  onSetBackgroundListening: (
    idx: number,
    isBackgroundListening: boolean,
  ) => void
  onSetBlurred: (idx: number, isBlurred: boolean) => void
  onReloadView: (idx: number) => void
  onSwapView: (idx: number) => void
  onRotateView: (streamId: string) => void
  onBrowse: (streamId: string) => void
  onDevTools: (idx: number) => void
  onMouseDown: JSX.MouseEventHandler<HTMLDivElement>
}) {
  // TODO: Refactor callbacks to use streamID instead of idx.
  const handleListeningClick = useCallback<
    JSX.MouseEventHandler<HTMLButtonElement>
  >(
    (ev) =>
      ev.shiftKey || isBackgroundListening
        ? onSetBackgroundListening(idx, !isBackgroundListening)
        : onSetListening(idx, !isListening),
    [
      idx,
      onSetListening,
      onSetBackgroundListening,
      isListening,
      isBackgroundListening,
    ],
  )
  const handleBlurClick = useCallback(
    () => onSetBlurred(idx, !isBlurred),
    [idx, onSetBlurred, isBlurred],
  )
  const handleReloadClick = useCallback(
    () => onReloadView(idx),
    [idx, onReloadView],
  )
  const handleSwapClick = useCallback(() => onSwapView(idx), [idx, onSwapView])
  const handleRotateClick = useCallback(
    () => onRotateView(streamId),
    [streamId, onRotateView],
  )
  const handleBrowseClick = useCallback(
    () => onBrowse(streamId),
    [streamId, onBrowse],
  )
  const handleDevToolsClick = useCallback(
    () => onDevTools(idx),
    [idx, onDevTools],
  )
  return (
    <div
      className="absolute select-none [&>*]:z-[200]"
      style={style}
      onMouseDown={onMouseDown}
    >
      {isDisplaying && (
        <div className="flex absolute top-0 left-0 [&_button]:m-[5px] [&_button]:mr-0">
          {showDebug ? (
            <>
              {roleCan(role, 'browse') && (
                <SmallActionButton onClick={handleBrowseClick} tabIndex={1}>
                  <FaRegWindowMaximize />
                </SmallActionButton>
              )}
              {roleCan(role, 'dev-tools') && (
                <SmallActionButton onClick={handleDevToolsClick} tabIndex={1}>
                  <FaRegLifeRing />
                </SmallActionButton>
              )}
            </>
          ) : (
            <>
              {roleCan(role, 'reload-view') && (
                <SmallActionButton onClick={handleReloadClick} tabIndex={1}>
                  <FaSyncAlt />
                </SmallActionButton>
              )}
              {roleCan(role, 'mutate-state-doc') && (
                <SmallActionButton
                  isActive={isSwapping}
                  onClick={handleSwapClick}
                  tabIndex={1}
                >
                  <FaExchangeAlt />
                </SmallActionButton>
              )}
              {roleCan(role, 'rotate-stream') && (
                <SmallActionButton onClick={handleRotateClick} tabIndex={1}>
                  <FaRedoAlt />
                </SmallActionButton>
              )}
            </>
          )}
        </div>
      )}
      <div className="flex absolute bottom-0 right-0 [&_button]:m-[5px] [&_button]:ml-0">
        {roleCan(role, 'set-view-blurred') && (
          <ActionButton
            isActive={isBlurred}
            onClick={handleBlurClick}
            tabIndex={1}
          >
            <FaVideoSlash />
          </ActionButton>
        )}
        {roleCan(role, 'set-listening-view') && (
          <ActionButton
            isActive={isListening || isBackgroundListening}
            activeColor={
              isListening ? 'red' : Color('red').desaturate(0.5).hsl().string()
            }
            onClick={handleListeningClick}
            tabIndex={1}
          >
            <FaVolumeUp />
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function CustomStreamInput({
  onChange,
  onDelete,
  ...props
}: {
  onChange: (link: string, data: LocalStreamData) => void
  onDelete: (link: string) => void
} & LocalStreamData) {
  const handleChangeLabel = useCallback(
    (value: string) => {
      onChange(props.link, { ...props, label: value })
    },
    [onChange, props],
  )

  const handleDeleteClick = useCallback(() => {
    onDelete(props.link)
  }, [onDelete, props.link])

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-surface-overlay border border-border-default rounded-lg">
      <LazyChangeInput
        className="flex-1 min-w-[120px] px-2 py-1.5 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary placeholder:text-text-dimmed focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/25"
        value={props.label}
        onChange={handleChangeLabel}
        placeholder="Label (optional)"
      />
      <a
        href={props.link}
        target="_blank"
        className="text-accent-blue hover:underline text-sm truncate max-w-[200px] min-w-0"
      >
        {props.link}
      </a>
      <span className="text-text-dimmed text-xs px-1.5 py-0.5 bg-surface-card rounded">
        {props.kind}
      </span>
      <button
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-surface-card border border-border-default text-text-muted hover:bg-danger/20 hover:border-danger hover:text-danger transition-colors duration-150"
        onClick={handleDeleteClick}
      >
        x
      </button>
    </div>
  )
}

function CreateCustomStreamInput({
  onCreate,
}: {
  onCreate: (link: string, data: LocalStreamData) => void
}) {
  const [link, setLink] = useState('')
  const [kind, setKind] = useState<ContentKind>('video')
  const [label, setLabel] = useState('')
  const handleSubmit = useCallback<JSX.SubmitEventHandler<HTMLFormElement>>(
    (ev) => {
      ev.preventDefault()
      onCreate(link, { link, kind, label })
      setLink('')
      setKind('video')
      setLabel('')
    },
    [onCreate, link, kind, label],
  )
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 p-2 bg-surface-overlay border border-border-default border-dashed rounded-lg"
    >
      <input
        className="min-w-[140px] max-w-[300px] flex-1 px-2 py-1.5 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary placeholder:text-text-dimmed focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/25"
        value={link}
        onChange={(ev) => setLink(ev.currentTarget.value)}
        placeholder="https://..."
      />
      <select
        className="px-2 py-1.5 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/25"
        onChange={(ev) => setKind(ev.currentTarget.value as ContentKind)}
        value={kind}
      >
        <option value="video">video</option>
        <option value="audio">audio</option>
        <option value="web">web</option>
        <option value="overlay">overlay</option>
        <option value="background">background</option>
      </select>
      <input
        className="flex-1 min-w-[100px] max-w-[160px] px-2 py-1.5 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary placeholder:text-text-dimmed focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/25"
        value={label}
        onChange={(ev) => setLabel(ev.currentTarget.value)}
        placeholder="Label (optional)"
      />
      <button
        type="submit"
        className="shrink-0 px-3 py-1.5 bg-accent-blue/20 border border-accent-blue/40 rounded-md text-sm text-accent-blue font-medium hover:bg-accent-blue/30 transition-colors duration-150"
      >
        Add stream
      </button>
    </form>
  )
}

function CreateInviteInput({
  onCreateInvite,
}: {
  onCreateInvite: (invite: { name: string; role: StreamwallRole }) => void
}) {
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('operator')
  const handleChangeName = useCallback<JSX.InputEventHandler<HTMLInputElement>>(
    (ev) => {
      setInviteName(ev.currentTarget.value)
    },
    [setInviteName],
  )
  const handleChangeRole = useCallback<
    JSX.InputEventHandler<HTMLSelectElement>
  >(
    (ev) => {
      setInviteRole(ev.currentTarget.value)
    },
    [setInviteRole],
  )
  const handleSubmit = useCallback<JSX.SubmitEventHandler<HTMLFormElement>>(
    (ev) => {
      ev.preventDefault()
      setInviteName('')
      setInviteRole('operator')
      onCreateInvite({ name: inviteName, role: inviteRole as StreamwallRole }) // TODO: validate
    },
    [onCreateInvite, inviteName, inviteRole],
  )
  return (
    <div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          className="px-3 py-2 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary"
          onChange={handleChangeName}
          placeholder="Name"
          value={inviteName}
        />
        <select
          className="px-3 py-2 bg-surface-base border border-border-default rounded-md text-sm text-text-secondary"
          onChange={handleChangeRole}
          value={inviteRole}
        >
          <option value="operator">operator</option>
          <option value="monitor">monitor</option>
        </select>
        <button
          type="submit"
          className="px-3 py-2 bg-surface-card border border-border-default rounded-md text-sm text-text-muted hover:bg-surface-overlay"
        >
          create invite
        </button>
      </form>
    </div>
  )
}

function AuthTokenLine({
  id,
  role,
  name,
  onDelete,
}: {
  id: string
  role: StreamwallRole
  name: string
  onDelete: (id: string) => void
}) {
  const handleDeleteClick = useCallback(() => {
    onDelete(id)
  }, [id])
  return (
    <div className="text-text-muted">
      <strong className="text-text-secondary">{name}</strong>: {role}{' '}
      <button
        className="px-2 py-1 bg-surface-card border border-border-default rounded text-sm text-text-muted hover:bg-danger/20 hover:text-danger"
        onClick={handleDeleteClick}
      >
        revoke
      </button>
    </div>
  )
}

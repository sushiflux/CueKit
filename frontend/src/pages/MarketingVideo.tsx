import { useEffect, useState, useMemo, useCallback } from 'react'
import { DeckKey } from '../components/DeckKey'
import { loadIconSet } from '../lib/icons'
import type { SystemMonitorSnapshot } from '../api/types'
import { Icon } from '@iconify/react'

// Featured actions for Section 1, Scene 2 (Deck Building)
const featuredActions = [
  {
    id: 'mute',
    label: 'Mute / Unmute',
    sublabel: 'Mic & Desktop Audio Control',
    icon: 'tabler:volume',
    color: '#10b981', // Emerald
    category: 'AUDIO',
    active: true,
    mute: true,
    level: 0.82,
    targetRow: 0,
    targetCol: 0,
  },
  {
    id: 'browser',
    label: 'Open Browser',
    sublabel: 'One-Touch Stream Dashboard',
    icon: 'tabler:world',
    color: '#06b6d4', // Cyan
    category: 'APP',
    active: false,
    mute: false,
    targetRow: 0,
    targetCol: 1,
  },
  {
    id: 'cpu',
    label: 'CPU Load',
    sublabel: 'Live Hardware Telemetry',
    icon: 'tabler:activity',
    color: '#6366f1', // Indigo
    category: 'MONITOR',
    monitorMetric: 'cpuLoad',
    raw: 28,
    targetRow: 0,
    targetCol: 2,
  },
  {
    id: 'multi',
    label: 'Multi-Action',
    sublabel: 'Automated Scene & Sound Macro',
    icon: 'tabler:layers-intersect',
    color: '#f59e0b', // Amber
    category: 'MACRO',
    active: false,
    mute: false,
    targetRow: 1,
    targetCol: 0,
  },
  {
    id: 'folder',
    label: 'Folder',
    sublabel: 'Nested Soundboard & Presets',
    icon: 'tabler:folder',
    color: '#3b82f6', // Royal Blue
    category: 'NAV',
    active: false,
    mute: false,
    targetRow: 1,
    targetCol: 1,
  },
]

// =========================================================================
// SZENE 1: Szenentitel "CREATE YOUR OWN CUEDECK" mit 45°-Mirror-Effekt
// =========================================================================
function MirrorTitle({ text, progress }: { text: string; progress: number }) {
  // progress: 0 -> 1 during Scene 1 (0 to 3500ms)
  // 0.0 - 0.12: Outline blendet sauber ein (ohne Füllung, nur Kontur)
  // 0.12 - 0.72: Mirror-Outlines spreizen sich im 45°-Winkel diagonal auseinander und schnappen zusammen
  // 0.68 - 0.82: Weißer Schriftzug füllt sich harmonisch mit solidem Licht (Fill blendet ein), Snap-Flash
  // 0.85 - 1.00: Solider, kraftvoller Stand vor Übergang zu Szene 2

  let mirrorSpread = 0
  let mirrorOpacity = 0

  if (progress > 0.12 && progress < 0.72) {
    const subP = (progress - 0.12) / 0.60
    mirrorSpread = Math.sin(subP * Math.PI) * 260
    mirrorOpacity = Math.sin(subP * Math.PI) * 0.95
  }

  // 45-degree diagonal movement: cos(45°) = sin(45°) ≈ 0.7071
  const diagX = mirrorSpread * 0.7071
  const diagY = mirrorSpread * 0.7071

  // Text fill: starts empty (outline only, 0 fill), fills in smoothly on snap
  const fillProgress = progress < 0.68 ? 0 : Math.min(1, (progress - 0.68) / 0.14)

  // Snap flash pulse on completion
  const snapFlash = progress >= 0.70 && progress <= 0.82
    ? 1 - Math.abs((progress - 0.76) / 0.06)
    : 0

  const initialFade = Math.min(1, progress / 0.08)

  return (
    <div
      className="relative flex flex-col items-center justify-center w-full"
      style={{ opacity: initialFade }}
    >
      {/* 
        SVG Morphological Dilate Filters:
        Erzeugt 100% geschlossene, nahtlose Außen- und Innenkonturen "in einem Guss",
        völlig ohne die internen Glyphen-Überlappungsstriche von variablen Schriften (wie z. B. im 'D').
      */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="outline-white" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="4.5" result="dilated" />
            <feComposite in="dilated" in2="SourceAlpha" operator="out" result="strokeMask" />
            <feFlood floodColor="#ffffff" result="color" />
            <feComposite in="color" in2="strokeMask" operator="in" result="stroke" />
            <feDropShadow dx="0" dy="15" stdDeviation="30" floodColor="#000000" floodOpacity="0.9" />
          </filter>

          <filter id="outline-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="dilated" />
            <feComposite in="dilated" in2="SourceAlpha" operator="out" result="strokeMask" />
            <feFlood floodColor="#00f0ff" result="color" />
            <feComposite in="color" in2="strokeMask" operator="in" result="stroke" />
            <feDropShadow dx="0" dy="0" stdDeviation="25" floodColor="#00f0ff" floodOpacity="0.9" />
          </filter>

          <filter id="outline-pink" x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology in="SourceAlpha" operator="dilate" radius="5" result="dilated" />
            <feComposite in="dilated" in2="SourceAlpha" operator="out" result="strokeMask" />
            <feFlood floodColor="#ff007f" result="color" />
            <feComposite in="color" in2="strokeMask" operator="in" result="stroke" />
            <feDropShadow dx="0" dy="0" stdDeviation="25" floodColor="#ff007f" floodOpacity="0.9" />
          </filter>
        </defs>
      </svg>

      {/* 
        Central Main Text:
        - Starts purely as hollow contour (filter: url(#outline-white))
        - Fills dynamically with solid gradient on snap
      */}
      <div className="relative z-30 flex items-center justify-center">
        {/* Crisp Base Outline (always razor sharp, seamless, in einem Guss) */}
        <h1
          className="text-[13.5rem] font-black tracking-tight uppercase text-center select-none leading-none m-0 text-white"
          style={{
            filter: `url(#outline-white) ${
              snapFlash > 0 ? `drop-shadow(0 0 ${45 * snapFlash}px rgba(255,255,255,${snapFlash}))` : ''
            }`,
          }}
        >
          {text}
        </h1>

        {/* Solid Fusion Gradient Fill Layer (fades in seamlessly on snap) */}
        {fillProgress > 0.01 && (
          <h1
            className="absolute inset-0 text-[13.5rem] font-black tracking-tight uppercase text-center select-none leading-none pointer-events-none m-0"
            style={{
              opacity: fillProgress,
            }}
          >
            <span
              style={{
                background: 'linear-gradient(135deg, #00f0ff 0%, #a5f3fc 20%, #ffffff 50%, #f472b6 80%, #ff007f 100%)',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 20px 45px rgba(0,0,0,0.95)) drop-shadow(0 0 35px rgba(0,240,255,0.4)) drop-shadow(0 0 35px rgba(255,0,127,0.4))',
              }}
            >
              {text}
            </span>
          </h1>
        )}
      </div>

      {/* Layer 1: 45° Top-Right Mirror Outline (Electric Cyan) */}
      {mirrorOpacity > 0.01 && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            transform: `translate(${diagX}px, ${-diagY}px)`,
            opacity: mirrorOpacity,
          }}
        >
          <h1
            className="text-[13.5rem] font-black tracking-tight uppercase text-center select-none leading-none m-0 text-white"
            style={{
              filter: 'url(#outline-cyan)',
            }}
          >
            {text}
          </h1>
        </div>
      )}

      {/* Layer 2: 45° Bottom-Left Mirror Outline (Neon Fuchsia / Pink) */}
      {mirrorOpacity > 0.01 && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            transform: `translate(${-diagX}px, ${diagY}px)`,
            opacity: mirrorOpacity,
          }}
        >
          <h1
            className="text-[13.5rem] font-black tracking-tight uppercase text-center select-none leading-none m-0 text-white"
            style={{
              filter: 'url(#outline-pink)',
            }}
          >
            {text}
          </h1>
        </div>
      )}
    </div>
  )
}


export function MarketingVideo() {
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0)

  // Preload tabler icon set
  useEffect(() => {
    void loadIconSet('tabler')
  }, [])

  // Expose deterministic seek function to window
  const seekVideo = useCallback((timeMs: number) => {
    setCurrentTimeMs(timeMs)
  }, [])

  useEffect(() => {
    ;(window as any).videoReady = true
    ;(window as any).seekVideo = seekVideo

    // Real-time playback helper for interactive preview
    ;(window as any).playVideo = () => {
      const startTime = performance.now()
      const duration = 14500

      const frame = (now: number) => {
        const elapsed = now - startTime
        if (elapsed <= duration) {
          setCurrentTimeMs(elapsed)
          requestAnimationFrame(frame)
        } else {
          setCurrentTimeMs(duration)
          ;(window as any).videoFinished = true
        }
      }
      requestAnimationFrame(frame)
    }
  }, [seekVideo])

  // Derive scene and step from currentTimeMs
  const scene = currentTimeMs < 3500 ? 1 : 2

  // Scene 1 Progress (0 -> 1)
  const scene1Progress = Math.min(1, Math.max(0, currentTimeMs / 3500))

  // Scene 2 Deck Build Step (0 -> 5)
  const deckBuildStep = useMemo(() => {
    if (currentTimeMs < 3500) return 0
    if (currentTimeMs < 4800) return 0
    if (currentTimeMs < 6400) return 1 // Mute / Unmute
    if (currentTimeMs < 8000) return 2 // Open Browser
    if (currentTimeMs < 9600) return 3 // CPU Load
    if (currentTimeMs < 11200) return 4 // Multi-Action
    return 5 // Folder
  }, [currentTimeMs])

  // Dynamic CPU load calculation
  const cpuLoadValue = useMemo(() => {
    return Math.round(28 + Math.sin(currentTimeMs / 300) * 12)
  }, [currentTimeMs])

  // Build key map for 3x5 CueDeck grid
  const installedButtons = useMemo(() => {
    const map = new Map<string, any>()
    featuredActions.forEach((act, idx) => {
      if (deckBuildStep >= idx + 1) {
        map.set(`${act.targetRow}-${act.targetCol}`, {
          ...act,
          model: {
            id: idx + 1,
            pageId: 1,
            row: act.targetRow,
            column: act.targetCol,
            label: act.label,
            icon: act.icon,
            color: act.color,
            actions: [],
          },
        })
      }
    })
    return map
  }, [deckBuildStep])

  return (
    <div className="relative w-[3840px] h-[2160px] bg-[#0c0d18] font-sans text-white overflow-hidden flex items-center justify-center select-none">
      {/* 
        -------------------------------------------------------------
        CLEAN, RAZOR-SHARP 4K UHD BACKGROUND
        - NO heavy 280px blur filters (which create fuzzy splotches/Schlieren)
        - NO repeating 1.5px dot noise (which causes video encoder macroblocking)
        - Pure, rich, smooth gradient with crisp ambient structure
        -------------------------------------------------------------
      */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 120% 100% at 50% 0%, #171630 0%, #0d0f20 60%, #070812 100%)',
        }}
      />

      {/* CueKit Brand Header (Crisp Logo + Brand Name, no subtitle) */}
      <div className="absolute top-[80px] left-[100px] flex items-center gap-[24px] z-50">
        <img src="/logo.svg" alt="CueKit" className="w-[84px] h-[84px] drop-shadow-[0_0_24px_rgba(99,102,241,0.85)]" />
        <span className="text-[3.2rem] font-black tracking-wider text-white select-none">CueKit</span>
      </div>

      {/* ============================================================== */}
      {/* SZENE 1: Szenentitel "Create your own CueDeck" mit Mirror-Effekt */}
      {/* ============================================================== */}
      {scene === 1 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 px-[200px]">
          <MirrorTitle text="Create your own CueDeck" progress={scene1Progress} />
        </div>
      )}

      {/* ============================================================== */}
      {/* SZENE 2: Content (Deck Building & Action Selection)            */}
      {/* ============================================================== */}
      {scene === 2 && (
        <div className="absolute inset-0 flex items-center justify-between px-[140px] py-[80px] z-30">
          {/* ----------------- LEFT: CueDeck Hardware ----------------- */}
          <div className="flex flex-col items-center justify-center flex-1 pr-[60px]">
            {/* CueDeck Hardware Enclosure */}
            <div className="relative p-[56px] rounded-[60px] bg-gradient-to-b from-[#1b1e30] via-[#121422] to-[#0a0c16] border-[4px] border-white/15 shadow-[0_35px_120px_rgba(0,0,0,0.95)]">
              {/* Chamfer Top Highlight */}
              <div className="absolute inset-x-12 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

              {/* Metallic Corner Screws */}
              <div className="absolute top-[22px] left-[26px] w-[16px] h-[16px] rounded-full bg-slate-600 border border-slate-400 shadow-inner" />
              <div className="absolute top-[22px] right-[26px] w-[16px] h-[16px] rounded-full bg-slate-600 border border-slate-400 shadow-inner" />
              <div className="absolute bottom-[22px] left-[26px] w-[16px] h-[16px] rounded-full bg-slate-600 border border-slate-400 shadow-inner" />
              <div className="absolute bottom-[22px] right-[26px] w-[16px] h-[16px] rounded-full bg-slate-600 border border-slate-400 shadow-inner" />

              {/* Hardware Header Label */}
              <div className="flex items-center justify-between px-[20px] mb-[40px]">
                <div className="flex items-center gap-[18px]">
                  <div className="w-[16px] h-[16px] rounded-full bg-emerald-400 animate-pulse shadow-[0_0_14px_#34d399]" />
                  <span className="text-[2.2rem] font-extrabold tracking-widest text-slate-200 uppercase">
                    CueDeck · 15 Keys
                  </span>
                </div>
                <div className="text-[1.8rem] font-bold text-slate-400 tracking-wider">
                  PROFILE: <span className="text-cyan-400 font-black">STREAMING</span>
                </div>
              </div>

              {/* 3x5 Keys Grid (Massive, crisp 310px keys for 4K UHD) */}
              <div
                className="grid gap-[28px]"
                style={{
                  gridTemplateColumns: 'repeat(5, 310px)',
                  gridTemplateRows: 'repeat(3, 310px)',
                }}
              >
                {Array.from({ length: 15 }, (_, i) => {
                  const row = Math.floor(i / 5)
                  const col = i % 5
                  const installed = installedButtons.get(`${row}-${col}`)

                  return (
                    <div
                      key={`slot-${row}-${col}`}
                      className="relative w-[310px] h-[310px] rounded-[36px] bg-black/55 border-[2px] border-white/5 flex items-center justify-center overflow-hidden shadow-inner"
                    >
                      {/* Empty Slot Placeholder */}
                      {!installed && (
                        <div className="flex flex-col items-center justify-center text-slate-600/70">
                          <span className="w-[56px] h-[56px] rounded-2xl border border-white/10 flex items-center justify-center text-[2.2rem] font-light text-slate-600">
                            +
                          </span>
                          <span className="text-[1.3rem] font-mono text-slate-600 mt-2">
                            {row},{col}
                          </span>
                        </div>
                      )}

                      {/* Populated Key */}
                      {installed && (
                        <div className="w-full h-full p-1 animate-in fade-in zoom-in-75 duration-300">
                          <DeckKey
                            button={installed.model}
                            size={302}
                            active={installed.active}
                            level={installed.level}
                            showHotkey={false}
                            flash={false}
                            error={false}
                            pressBehavior="spring"
                            volumeIndicator="level"
                            stateStyle="fill"
                            unavailable={false}
                            monitorMetric={installed.monitorMetric}
                            systemMonitor={
                              installed.monitorMetric
                                ? ({
                                    available: true,
                                    cpuLoad: cpuLoadValue,
                                    gpuLoad: null,
                                    ramLoad: null,
                                    cpuTemp: null,
                                    gpuTemp: null,
                                    volumePercent: null,
                                    volumeMuted: null,
                                    error: null,
                                  } as SystemMonitorSnapshot)
                                : null
                            }
                            style={{ borderRadius: 32 }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Hardware Bottom Underglow LED Strip */}
              <div className="mt-[36px] h-[8px] rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 shadow-[0_0_25px_rgba(6,182,212,0.85)]" />
            </div>
          </div>

          {/* ----------------- RIGHT: Action Picker Sidebar ----------------- */}
          <div className="w-[1150px] flex flex-col">
            {/* Glassmorphic Container for Actions */}
            <div className="p-[52px] rounded-[56px] bg-[#121424]/90 border-[3px] border-white/12 shadow-[0_25px_90px_rgba(0,0,0,0.8)] flex flex-col gap-[32px]">
              {/* Header */}
              <div className="flex items-center justify-between pb-[28px] border-b border-white/10">
                <div className="flex items-center gap-[20px]">
                  <div className="w-[70px] h-[70px] rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center">
                    <Icon icon="tabler:plus" className="text-cyan-400 w-[42px] h-[42px]" />
                  </div>
                  <div>
                    <h2 className="text-[3.6rem] font-black tracking-tight text-white leading-tight">
                      Action Library
                    </h2>
                    <p className="text-[1.6rem] text-slate-400 font-medium">
                      Instant 1-Click Assignment into your CueDeck
                    </p>
                  </div>
                </div>
                <span className="px-[24px] py-[10px] rounded-full bg-violet-600/30 border border-violet-400/40 text-[1.4rem] font-bold text-violet-300 uppercase tracking-widest">
                  150+ Actions
                </span>
              </div>

              {/* Action Cards List */}
              <div className="flex flex-col gap-[22px]">
                {featuredActions.map((action, index) => {
                  const isSelected = deckBuildStep === index + 1
                  const isAdded = deckBuildStep > index + 1

                  return (
                    <div
                      key={action.id}
                      style={{
                        borderColor: isSelected
                          ? action.color
                          : isAdded
                            ? 'rgba(255, 255, 255, 0.12)'
                            : 'rgba(255, 255, 255, 0.16)',
                        backgroundColor: isSelected
                          ? 'rgba(255, 255, 255, 0.10)'
                          : isAdded
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'rgba(255, 255, 255, 0.05)',
                        transform: isSelected ? 'scale(1.03)' : 'scale(1)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      className="px-[40px] py-[30px] rounded-[36px] border-[2px] flex items-center justify-between shadow-lg relative overflow-hidden"
                    >
                      {/* Glow accent when active */}
                      {isSelected && (
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: `radial-gradient(circle at 10% 50%, ${action.color}35, transparent 65%)`,
                          }}
                        />
                      )}

                      {/* Action Details */}
                      <div className="flex items-center gap-[30px] relative z-10">
                        {/* Icon Box */}
                        <div
                          className="w-[92px] h-[92px] rounded-[26px] flex items-center justify-center shadow-xl"
                          style={{
                            backgroundColor: `${action.color}25`,
                            border: `2px solid ${action.color}`,
                          }}
                        >
                          <Icon
                            icon={action.icon}
                            className="w-[52px] h-[52px]"
                            style={{ color: action.color }}
                          />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-[16px]">
                            <span className={`text-[2.8rem] font-bold tracking-tight ${isAdded ? 'text-slate-200' : 'text-white'}`}>
                              {action.label}
                            </span>
                            <span
                              className="px-[16px] py-[4px] rounded-lg text-[1.2rem] font-bold tracking-wider"
                              style={{
                                backgroundColor: `${action.color}22`,
                                color: action.color,
                              }}
                            >
                              {action.category}
                            </span>
                          </div>
                          <span className="text-[1.5rem] text-slate-400 font-medium">
                            {action.sublabel}
                          </span>
                        </div>
                      </div>

                      {/* Status Icon Indicator */}
                      <div className="relative z-10">
                        {isAdded ? (
                          <div className="w-[68px] h-[68px] rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 shadow-md">
                            <Icon icon="tabler:check" className="w-[40px] h-[40px]" />
                          </div>
                        ) : isSelected ? (
                          <div
                            className="w-[68px] h-[68px] rounded-full flex items-center justify-center text-white shadow-[0_0_25px_rgba(255,255,255,0.4)]"
                            style={{ backgroundColor: action.color }}
                          >
                            <Icon icon="tabler:arrow-left" className="w-[40px] h-[40px]" />
                          </div>
                        ) : (
                          <div className="w-[68px] h-[68px] rounded-full bg-white/10 flex items-center justify-center text-white text-[2.2rem] font-bold">
                            +
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

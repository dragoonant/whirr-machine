// The life spiral (81 G): six radial branches, outermost box on the outer ring, boxes tinted by aspect, filled boxes solid,
// crippled aspects banner with the effect in our words. Test ids: card-spiral-<modelId>, spiral-box-<branch>-<i>
// (data-filled, data-aspect), spiral-aspect-<modelId>-<aspect> (data-crippled).
import { useMemo } from 'react'
import type { GameState, ModelState } from '../../../engine/index'
import { useEventFeed } from '../../contract'
import { lastDamageKey } from '../gridView'
import './fury.css'
import { ASPECT_WORD, aspectLetter, spiralModel, type SpiralModel } from './furyView'

const SIZE = 240
const C = SIZE / 2
const R_OUT = 96
const R_IN = 24

/** Angle of a branch: 1 at the top, then clockwise (the engine counts a spill as the next branch clockwise). */
const angleOf = (branch: number): number => ((branch - 1) * 60 - 90) * (Math.PI / 180)

export function SpiralSvg({ model, id }: { model: SpiralModel; id: string }) {
  const longest = Math.max(1, ...model.branches.map((b) => b.boxes.length))
  const step = longest > 1 ? (R_OUT - R_IN) / (longest - 1) : 0
  const r = Math.max(3.2, Math.min(9, step / 2 - 0.6))
  return (
    <svg className="spiral" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Life spiral: ${model.filled} of ${model.total} boxes marked`} data-testid={`spiral-svg-${id}`}>
      {model.branches.map((b) => {
        const a = angleOf(b.branch)
        return (
          <g key={b.branch} data-branch={b.branch}>
            <line className="spiral-ray" x1={C + Math.cos(a) * (R_IN - 6)} y1={C + Math.sin(a) * (R_IN - 6)} x2={C + Math.cos(a) * (R_OUT + 6)} y2={C + Math.sin(a) * (R_OUT + 6)} />
            <text className="spiral-num" x={C + Math.cos(a) * (R_OUT + 17)} y={C + Math.sin(a) * (R_OUT + 17)} textAnchor="middle" dominantBaseline="central">{b.branch}</text>
            {b.boxes.map((x) => {
              const rad = R_OUT - x.i * step
              const cx = C + Math.cos(a) * rad
              const cy = C + Math.sin(a) * rad
              return (
                <g
                  key={x.i}
                  className={`spiral-box spiral-${x.aspect ?? 'none'}${x.filled ? ' spiral-filled' : ''}${x.flash ? ' spiral-flash' : ''}`}
                  data-testid={`spiral-box-${x.branch}-${x.i}`} data-filled={x.filled ? 'true' : 'false'} data-aspect={x.aspect ?? ''} data-model={id}
                >
                  <circle cx={cx} cy={cy} r={r} />
                  {x.aspect && r >= 5 && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.15}>{aspectLetter(x.aspect)}</text>}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

/** Damage card body for a warbeast: the spiral, the three aspect meters and a banner for each crippled aspect. */
export function SpiralCard({ state, model }: { state: GameState; model: ModelState }) {
  const feed = useEventFeed()
  const flash = useMemo(() => lastDamageKey(state, feed, model.id), [state, feed, model.id])
  const sv = useMemo(() => spiralModel(state, model.id, flash?.keys), [state, model.id, flash])
  if (!sv) return null
  const crippled = sv.aspects.filter((a) => a.crippled)
  return (
    <div className="card-damage spiral-wrap" data-testid={`card-spiral-${model.id}`} data-track="spiral" data-filled={sv.filled} data-total={sv.total}>
      <SpiralSvg model={sv} id={model.id} />
      <ul className="aspects">
        {sv.aspects.map((a) => (
          <li key={a.aspect} className={`aspect aspect-${a.aspect}${a.crippled ? ' aspect-crippled' : ''}`} data-testid={`spiral-aspect-${model.id}-${a.aspect}`} data-crippled={a.crippled ? 'true' : 'false'} data-filled={a.filled} data-total={a.total}>
            <span className="aspect-swatch" aria-hidden="true">{aspectLetter(a.aspect)}</span>
            <span className="aspect-name">{ASPECT_WORD[a.aspect]}</span>
            <span className="aspect-n">{a.filled}/{a.total}</span>
          </li>
        ))}
      </ul>
      {crippled.map((a) => (
        <p key={a.aspect} className={`aspect-banner aspect-banner-${a.aspect}`} data-testid={`spiral-banner-${model.id}-${a.aspect}`}>
          <b>{ASPECT_WORD[a.aspect]} crippled.</b> {a.effect}
        </p>
      ))}
      <div className="hud-dim card-count">{sv.filled}/{sv.total} boxes</div>
    </div>
  )
}

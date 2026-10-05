// Title treatment: a gold gear with steam wisps above the wordmark, on the charcoal start screen. Original line art, inline SVG.
const TEETH = 12

function gearPath(cx: number, cy: number, rOut: number, rIn: number): string {
  const pts: string[] = []
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * Math.PI * 2
    const w = Math.PI / TEETH
    const at = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`
    pts.push(at(a - w * 0.9, rIn), at(a - w * 0.5, rOut), at(a + w * 0.5, rOut), at(a + w * 0.9, rIn))
  }
  return `M${pts.join('L')}Z`
}

export function TitleArt() {
  return (
    <svg className="title-art" viewBox="0 0 240 96" role="img" aria-label="A gear with steam rising from it" focusable="false">
      <defs>
        <linearGradient id="ta-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d36a" /><stop offset="1" stopColor="#b88a1e" />
        </linearGradient>
      </defs>
      <g className="ta-steam" fill="none" stroke="#a9a699" strokeWidth="2.4" strokeLinecap="round" opacity="0.7">
        <path d="M96 40c-8-8 8-14 0-22s6-12 2-16" />
        <path d="M144 40c8-8-8-14 0-22s-6-12-2-16" />
        <path d="M120 34c-6-7 6-12 0-19" strokeWidth="2" opacity="0.7" />
      </g>
      <g className="ta-gear-big">
        <path d={gearPath(120, 66, 26, 20)} fill="url(#ta-gold)" stroke="#6b4f0c" strokeWidth="1.2" />
        <circle cx="120" cy="66" r="8" fill="#14161a" stroke="#6b4f0c" strokeWidth="1.2" />
      </g>
      <g className="ta-gear-small">
        <path d={gearPath(70, 76, 14, 10.5)} fill="#b87333" stroke="#5a3515" strokeWidth="1" />
        <circle cx="70" cy="76" r="4" fill="#14161a" />
      </g>
      <g className="ta-gear-small ta-gear-r">
        <path d={gearPath(170, 76, 14, 10.5)} fill="#b87333" stroke="#5a3515" strokeWidth="1" />
        <circle cx="170" cy="76" r="4" fill="#14161a" />
      </g>
      <path d="M20 90h200" stroke="url(#ta-gold)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

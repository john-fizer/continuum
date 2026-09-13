export function Emblem() {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="metal" x2="1" y2="1">
          <stop stopColor="#edfbff" />
          <stop offset=".48" stopColor="#64899e" />
          <stop offset=".7" stopColor="#d4e7ed" />
          <stop offset="1" stopColor="#527389" />
        </linearGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="47"
        stroke="#355463"
        strokeDasharray="60 8 2 8"
      />
      <path
        d="M50 10 85 30v40L50 90 15 70V30Z"
        stroke="url(#metal)"
        strokeWidth="5"
      />
      <path
        d="m50 27 20 12v23L50 74 30 62V39Z M50 10v17m35 3L70 39M85 70 70 62M50 90V74M15 70l15-8M15 30l15 9"
        stroke="url(#metal)"
        strokeWidth="4"
      />
      <path
        d="m50 39 11 6v12l-11 6-11-6V45Z"
        stroke="#eabc78"
        strokeWidth="2"
      />
    </svg>
  );
}
export function Masthead({ connected }: { connected: boolean }) {
  const letters = [
    { x: 0, d: 'M30 0H7Q0 0 0 7V17Q0 24 7 24H30V20H8Q4 20 4 16V8Q4 4 8 4H30Z' },
    {
      x: 49,
      d: 'M7 0H25Q32 0 32 7V17Q32 24 25 24H7Q0 24 0 17V7Q0 0 7 0ZM8 4Q4 4 4 8V16Q4 20 8 20H24Q28 20 28 16V8Q28 4 24 4Z',
    },
    { x: 101, d: 'M0 24V0H5L28 18V0H32V24H27L4 6V24Z' },
    { x: 153, d: 'M0 0H32V4H18V24H14V4H0Z' },
    { x: 206, d: 'M0 0H4V24H0Z' },
    { x: 232, d: 'M0 24V0H5L28 18V0H32V24H27L4 6V24Z' },
    {
      x: 284,
      d: 'M0 0H4V16Q4 20 8 20H24Q28 20 28 16V0H32V17Q32 24 25 24H7Q0 24 0 17Z',
    },
    {
      x: 336,
      d: 'M0 0H4V16Q4 20 8 20H24Q28 20 28 16V0H32V17Q32 24 25 24H7Q0 24 0 17Z',
    },
    { x: 388, d: 'M0 24V0H5L18 15L31 0H36V24H32V6L18 22L4 6V24Z' },
  ];
  return (
    <div className="flight-header">
      <div className="flight-identity">
        <Emblem />
        <div>
          <svg
            className="wordmark"
            viewBox="-1 -2 426 28"
            aria-label="Continuum"
          >
            <defs>
              <linearGradient id="wordmark-silver" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#f0f5f7" />
                <stop offset=".42" stopColor="#afc4cf" />
                <stop offset=".52" stopColor="#819ba9" />
                <stop offset="1" stopColor="#d5e3e9" />
              </linearGradient>
            </defs>
            <g fill="url(#wordmark-silver)" fillRule="evenodd">
              {letters.map(({ d, x }, i) => (
                <path key={i} d={d} transform={`translate(${x} 0)`} />
              ))}
            </g>
          </svg>
          <p>Knowledge compounds.</p>
        </div>
      </div>
      <div className="flight-motto">
        Think <span>/</span> Connect <span>/</span> Evolve
      </div>
      <div className="signal-state">
        <svg viewBox="0 0 140 34" aria-hidden="true">
          <path
            d="M0 17h25m3-4v8m5-13v18m5-23v28m5-19v14m5-8v-7m5 6h10m4-12v24m5-19v14m5-9v4m5-10v17m5-13v8m5-4h45"
            fill="none"
            stroke="currentColor"
          />
        </svg>
        <span>{connected ? 'Memory connected' : 'Awaiting connection'}</span>
      </div>
    </div>
  );
}
export function MindBeacon() {
  return (
    <div className="mind-beacon">
      <svg viewBox="0 0 180 180" aria-hidden="true">
        <defs>
          <radialGradient id="beacon-space">
            <stop stopColor="#123c53" />
            <stop offset="1" stopColor="#020a11" />
          </radialGradient>
          <linearGradient id="beacon-skin" x1="0" y1="0" x2="1" y2=".6">
            <stop stopColor="#071a29" />
            <stop offset=".55" stopColor="#164c65" />
            <stop offset="1" stopColor="#62bad1" />
          </linearGradient>
          <filter id="beacon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <clipPath id="beacon-clip">
            <circle cx="90" cy="90" r="65" />
          </clipPath>
        </defs>
        <circle
          cx="90"
          cy="90"
          r="79"
          fill="url(#beacon-space)"
          stroke="#28617a"
        />
        <circle
          cx="90"
          cy="90"
          r="73"
          fill="none"
          stroke="#5891a6"
          strokeDasharray="38 5 3 5"
        />
        <circle cx="90" cy="90" r="66" fill="none" stroke="#204450" />
        <g clipPath="url(#beacon-clip)">
          <path
            d="M38 161 Q43 145 66 139 L70 119 C58 109 53 95 53 77 C53 50 69 37 91 37 C113 37 125 51 124 68 L122 79 Q122 85 129 94 Q132 98 122 100 L122 107 Q128 111 120 114 C124 125 113 128 104 126 L103 139 Q122 146 136 161Z"
            fill="url(#beacon-skin)"
            stroke="#73cce5"
            strokeWidth="1.2"
          />
          <path
            d="M68 139 Q82 148 103 139 M70 119 Q80 130 97 131 M62 58 Q83 40 111 52 M59 65 Q74 49 100 52 M57 76 Q73 58 91 61 M58 89 Q65 96 71 101 M77 111 Q85 119 99 120"
            fill="none"
            stroke="#76c9df"
            strokeOpacity=".35"
          />
          <ellipse
            cx="70"
            cy="87"
            rx="9"
            ry="12"
            fill="#071d2c"
            stroke="#64b5d0"
          />
          <ellipse cx="70" cy="87" rx="5" ry="8" fill="none" stroke="#326b83" />
          <path
            d="M100 78 Q110 73 120 78 L115 82 L102 82Z"
            fill="#9cf4ff"
            filter="url(#beacon-glow)"
          />
          <path d="M101 79 Q111 76 119 79 L114 81Z" fill="#d0fcff" />
          <path
            d="M102 72 Q112 68 121 73 M109 87 L119 91 M112 109 L122 109"
            fill="none"
            stroke="#7cd7e8"
            strokeWidth=".9"
          />
          {Array.from({ length: 18 }, (_, i) => (
            <path
              key={i}
              d={`M32 ${44 + i * 6}H146`}
              stroke="#82d8f2"
              strokeOpacity=".065"
              strokeWidth=".7"
            />
          ))}
        </g>
        <path
          d="M18 95 A72 72 0 0 1 67 21 M116 158 A72 72 0 0 0 161 102"
          fill="none"
          stroke="#91e5f7"
          strokeWidth="1.5"
        />
      </svg>
      <p>
        Information becomes insight.
        <br />
        Insight becomes possibility.
      </p>
    </div>
  );
}

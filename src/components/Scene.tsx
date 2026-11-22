import { useId, type ReactNode } from 'react';
import { LOGO_BOLT } from './Logo';
import { LOAD_STEPS, STYLE_STEPS, SUN_STEPS, TEMPERATURE_STEPS, TYRE_STEPS, type LandingSliders, type Step } from '../landing/scenario';

/**
 * The fun-sized landing page's picture: a friendly electric car seen from the front, with a thermometer, a sun, tyres,
 * people and luggage that change with the five sliders. Colours come from the --car-* tokens in styles.css, so it
 * follows light and dark mode. The sliders are HTML (accessible, big thumbs) laid over the drawing on wide screens
 * and under it on phones.
 */

const W = 900;
const H = 440;
/** The car (drawn in a 480 × 360 box) sits in the middle of the scene. */
const CAR_X = 210;
const CAR_Y = 40;

// ---------------------------------------------------------------------------------------------------- sun and moon
function Sun({ index }: { index: number }) {
  const value = SUN_STEPS[index].value;
  const cx = 830;
  const cy = 80;
  const rays = (count: number, r1: number, r2: number, width: number) =>
    Array.from({ length: count }, (_, k) => {
      const t = (k / count) * Math.PI * 2;
      return <line key={k} x1={cx + Math.cos(t) * r1} y1={cy + Math.sin(t) * r1} x2={cx + Math.cos(t) * r2} y2={cy + Math.sin(t) * r2} stroke="var(--car-sun)" strokeWidth={width} strokeLinecap="round" />;
    });
  const cloud = (x: number, y: number, k: number) => (
    <g transform={`translate(${x} ${y}) scale(${k})`} fill="var(--car-cloud)">
      <circle cx="0" cy="0" r="20" />
      <circle cx="26" cy="-10" r="26" />
      <circle cx="56" cy="2" r="20" />
      <rect x="-12" y="0" width="82" height="22" rx="11" />
    </g>
  );
  return (
    <g className="scene-sun" aria-hidden="true">
      {value >= 1100 && (
        <>
          <g className="sun-spin">{rays(16, 40, 60, 5)}</g>
          <circle cx={cx} cy={cy} r="30" fill="var(--car-sun)" />
        </>
      )}
      {value === 800 && (
        <>
          {rays(8, 38, 52, 5)}
          <circle cx={cx} cy={cy} r="28" fill="var(--car-sun)" />
        </>
      )}
      {value === 500 && (
        <>
          <circle cx={cx - 14} cy={cy - 10} r="26" fill="var(--car-sun)" />
          {rays(8, 34, 44, 4).slice(0, 5)}
          {cloud(cx - 36, cy + 12, 1)}
        </>
      )}
      {value === 0 && (
        <>
          <path d={`M ${cx + 10} ${cy - 36} A 36 36 0 1 0 ${cx + 30} ${cy + 22} A 28 28 0 1 1 ${cx + 10} ${cy - 36} Z`} fill="var(--car-moon)" />
          <circle cx={cx - 46} cy={cy - 30} r="3" fill="var(--car-moon)" />
          <circle cx={cx + 40} cy={cy + 38} r="2.5" fill="var(--car-moon)" />
          <circle cx={cx - 30} cy={cy + 40} r="2" fill="var(--car-moon)" />
        </>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------- thermometer
const THERMO_COLORS = ['#4aa3e8', '#7fc4f0', '#4caf7a', '#f2a03d', '#e5493a'];
function Thermometer({ index }: { index: number }) {
  const x = 60;
  const top = 30;
  const bottom = 128;
  const level = bottom - ((index + 0.6) / (TEMPERATURE_STEPS.length - 0.4)) * (bottom - top - 8);
  const color = THERMO_COLORS[index];
  return (
    <g className="scene-thermo" aria-hidden="true">
      <rect x={x - 9} y={top - 8} width="18" height={bottom - top + 14} rx="9" fill="var(--car-trim)" stroke="var(--car-body-shade)" strokeWidth="3" />
      <circle cx={x} cy={bottom + 14} r="17" fill="var(--car-trim)" stroke="var(--car-body-shade)" strokeWidth="3" />
      <rect x={x - 5} y={level} width="10" height={bottom + 14 - level} rx="5" fill={color} style={{ transition: 'y 0.3s ease, height 0.3s ease, fill 0.3s ease' }} />
      <circle cx={x} cy={bottom + 14} r="11" fill={color} style={{ transition: 'fill 0.3s ease' }} />
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={k} x1={x + 13} x2={x + 22} y1={bottom - 6 - (k * (bottom - top - 18)) / 4} y2={bottom - 6 - (k * (bottom - top - 18)) / 4} stroke="var(--car-body-shade)" strokeWidth="2.5" strokeLinecap="round" />
      ))}
      {index <= 1 && (
        <g stroke="#7fc4f0" strokeWidth="3" strokeLinecap="round">
          <path d={`M ${x + 40} 70 v 20 M ${x + 30} 80 h 20 M ${x + 33} 73 l 14 14 M ${x + 47} 73 l -14 14`} />
        </g>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------- people
/** A round, genderless cartoon person seen through the windscreen, shoulders at y = 172 (the glass's bottom). */
function Person({ cx, shirt, style }: { cx: number; shirt: string; style?: number }) {
  const helmet = style === 2;
  const shades = style === 0;
  return (
    <g>
      <path d={`M ${cx - 30} 176 q 0 -30 30 -30 q 30 0 30 30 z`} fill={shirt} />
      <circle cx={cx} cy={128} r="17" fill="var(--car-skin)" />
      {helmet ? (
        <>
          <path d={`M ${cx - 20} 130 a 20 20 0 0 1 40 0 z`} fill="#d8453a" />
          <path d={`M ${cx - 19} 126 h 38`} stroke="#fff" strokeWidth="4" />
          <rect x={cx - 15} y="124" width="30" height="12" rx="5" fill="#1b2a38" />
          <path d={`M ${cx - 11} 128 l 8 0`} stroke="#9ecbe8" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : shades ? (
        <>
          <rect x={cx - 15} y="122" width="13" height="9" rx="4" fill="#15202b" />
          <rect x={cx + 2} y="122" width="13" height="9" rx="4" fill="#15202b" />
          <path d={`M ${cx - 3} 126 h 6`} stroke="#15202b" strokeWidth="2" />
          <path d={`M ${cx - 7} 138 q 7 5 14 0`} fill="none" stroke="#7a3b2e" strokeWidth="2.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={cx - 6} cy="126" r="2.4" fill="#2a2018" />
          <circle cx={cx + 6} cy="126" r="2.4" fill="#2a2018" />
          <path d={`M ${cx - 6} 135 q 6 5 12 0`} fill="none" stroke="#7a3b2e" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

function Baby({ cx }: { cx: number }) {
  return (
    <g>
      <rect x={cx - 17} y="146" width="34" height="30" rx="12" fill="var(--car-seat)" />
      <circle cx={cx} cy="145" r="12" fill="var(--car-skin)" />
      <path d={`M ${cx - 12} 142 a 12 12 0 0 1 24 0 q -12 -5 -24 0 z`} fill="#f3a73b" />
      <circle cx={cx - 4} cy="146" r="1.8" fill="#2a2018" />
      <circle cx={cx + 4} cy="146" r="1.8" fill="#2a2018" />
      <circle cx={cx} cy="152" r="3" fill="#e86d8f" />
    </g>
  );
}

function Luggage() {
  // Stacked cases behind the people, filling the car to the brim.
  return (
    <g>
      <rect x="150" y="108" width="52" height="64" rx="6" fill="#c9783a" />
      <rect x="150" y="124" width="52" height="5" fill="#8d4f22" />
      <rect x="276" y="104" width="56" height="70" rx="6" fill="#4d78c9" />
      <rect x="276" y="120" width="56" height="5" fill="#2f4f91" />
      <rect x="222" y="96" width="46" height="44" rx="6" fill="#8fb55a" />
      <rect x="226" y="86" width="38" height="16" rx="5" fill="#e0b43a" />
      <circle cx="170" cy="100" r="9" fill="#f3d23a" />
      <path d="M 176 98 l 8 2 l -8 3 z" fill="#f08a2a" />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------- the car
function Car({ sliders, driverRight }: { sliders: LandingSliders; driverRight: boolean }) {
  const id = useId().replace(/:/g, '');
  const glass = `car-glass-${id}`;
  const glow = `car-glow-${id}`;
  const load = sliders.load;
  const soft = sliders.tyres === 1;
  const driverX = driverRight ? 282 : 198;
  const otherX = driverRight ? 198 : 282;
  const night = SUN_STEPS[sliders.sun].value === 0;
  // A good tyre is a plain rounded block. A bad (80 % inflated) one keeps its width on top and only bulges out at the
  // bottom, where it is squashed flat against the road; the car sits a little lower on it.
  const tyre = (x: number) => (
    <path
      className="car-tyre"
      transform={`translate(${x} 246)`}
      d={
        soft
          ? 'M18 0H46Q64 0 64 18V36C64 54 80 60 80 73Q80 82 70 82H-6Q-16 82 -16 73C-16 60 0 54 0 36V18Q0 0 18 0Z'
          : 'M18 0H46Q64 0 64 18V64Q64 82 46 82H18Q0 82 0 64V18Q0 0 18 0Z'
      }
      fill="var(--car-tyre)"
    />
  );
  return (
    <g transform={`translate(${CAR_X} ${CAR_Y})`}>
      <defs>
        <clipPath id={glass}>
          <path d="M146 170 170 100q4-12 18-12h104q14 0 18 12l24 70z" />
        </clipPath>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="var(--car-lamp)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--car-lamp)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="car-shadow" cx="240" cy="328" rx="196" ry="14" fill="var(--car-shadow)" />
      {tyre(76)}
      {tyre(340)}
      <g className="car-body">
        <g className="car-load" style={{ transform: `translateY(${(load === 2 ? 7 : 0) + (soft ? 6 : 0)}px)` }}>
          {/* Roof luggage of the full car */}
          {load === 2 && (
            <g>
              <rect x="176" y="44" width="128" height="30" rx="14" fill="#33415c" />
              <rect x="190" y="30" width="46" height="22" rx="7" fill="#c9783a" />
              <rect x="244" y="26" width="38" height="26" rx="7" fill="#4d78c9" />
              <path d="M 160 78 q 80 6 160 0" stroke="var(--car-dark)" strokeWidth="3" fill="none" />
              <circle cx="262" cy="18" r="9" fill="#f3d23a" />
              <path d="M 268 16 l 8 2 l -8 3 z" fill="#f08a2a" />
            </g>
          )}
          <path d="M142 150h-20" stroke="var(--car-body-shade)" strokeWidth="8" strokeLinecap="round" />
          <path d="M338 150h20" stroke="var(--car-body-shade)" strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="108" cy="146" rx="22" ry="14" fill="var(--car-body-shade)" />
          <ellipse cx="372" cy="146" rx="22" ry="14" fill="var(--car-body-shade)" />
          <path d="M126 178 156 92q6-20 28-20h112q22 0 28 20l30 86z" fill="var(--car-body-shade)" />
          <path d="M146 170 170 100q4-12 18-12h104q14 0 18 12l24 70z" fill="var(--car-glass)" />
          <g clipPath={`url(#${glass})`}>
            {load === 2 && <Luggage />}
            {load === 2 && <Baby cx={240} />}
            <Person cx={driverX} shirt="var(--car-shirt)" style={sliders.style} />
            {load >= 1 && <Person cx={otherX} shirt="var(--car-shirt-2)" />}
            <g fill="var(--car-shine)">
              <path d="M200 84h30l-44 92h-30z" />
              <path d="M240 84h12l-44 92h-12z" />
            </g>
          </g>
          <path d="M100 172q140-24 280 0 40 6 44 48l4 48q2 32-30 34H82q-32-2-30-34l4-48q4-42 44-48z" fill="var(--car-body)" />
          <path d="M118 184q122-18 244 0" fill="none" stroke="var(--car-shine)" strokeWidth="5" strokeLinecap="round" />
          <circle className="car-glow" cx="130" cy="216" r="64" fill={`url(#${glow})`} style={{ opacity: night ? 0.9 : undefined }} />
          <circle className="car-glow" cx="350" cy="216" r="64" fill={`url(#${glow})`} style={{ opacity: night ? 0.9 : undefined }} />
          <circle cx="130" cy="216" r="33" fill="var(--car-trim)" />
          <circle cx="350" cy="216" r="33" fill="var(--car-trim)" />
          <g className="car-lamp">
            <circle cx="130" cy="216" r="25" fill="var(--car-lamp)" />
            <circle cx="121" cy="206" r="7" fill="#fff" />
          </g>
          <g className="car-lamp">
            <circle cx="350" cy="216" r="25" fill="var(--car-lamp)" />
            <circle cx="341" cy="206" r="7" fill="#fff" />
          </g>
          <rect x="98" y="256" width="34" height="11" rx="5.5" fill="var(--car-indicator)" />
          <rect x="348" y="256" width="34" height="11" rx="5.5" fill="var(--car-indicator)" />
          <path d={LOGO_BOLT} transform="translate(240 214) scale(1.5) translate(-10 -16)" fill="var(--car-lamp)" />
          <path d="M196 256q44 26 88 0" fill="none" stroke="var(--car-dark)" strokeWidth="9" strokeLinecap="round" />
          <rect x="74" y="284" width="332" height="18" rx="9" fill="var(--car-body-shade)" />
        </g>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------------------------------- sliders
const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="scene-ctl-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const TyreIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21" />
  </Icon>
);
const WeightIcon = () => (
  <Icon>
    <path d="M7 8h10l3 12H4z" />
    <circle cx="12" cy="5" r="2.5" />
  </Icon>
);
const WheelIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2" />
    <path d="M3.5 10.5 10 12M20.5 10.5 14 12M12 14v7" />
  </Icon>
);
const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
  </Icon>
);
const ThermoIcon = () => (
  <Icon>
    <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
  </Icon>
);

function SceneSlider({
  className,
  name,
  steps,
  value,
  onChange,
  icon,
  valueText,
  reversed = false,
}: {
  className: string;
  name: string;
  steps: Step[];
  value: number;
  onChange: (i: number) => void;
  icon: ReactNode;
  valueText: string;
  /** The first step sits at the right end of the slider (the saved index stays the step's index). */
  reversed?: boolean;
}) {
  const id = useId();
  const last = steps.length - 1;
  const pos = (i: number) => (reversed ? last - i : i);
  return (
    <div className={`scene-ctl ${className}`}>
      <label htmlFor={id} className="scene-ctl-head">
        {icon}
        <span className="scene-ctl-name">{name}</span>
        <b className="scene-ctl-value">{valueText}</b>
      </label>
      <input id={id} type="range" min={0} max={last} step={1} value={pos(value)} onChange={(e) => onChange(pos(Number(e.target.value)))} aria-valuetext={valueText} />
    </div>
  );
}

export function Scene({ sliders, onSlider, driverRight }: { sliders: LandingSliders; onSlider: <K extends keyof LandingSliders>(key: K, i: number) => void; driverRight: boolean }) {
  // The style slider sits on the driver's side, the load slider on the other side.
  const styleSide = driverRight ? 'right' : 'left';
  const loadSide = driverRight ? 'left' : 'right';
  const driverAnchor = driverRight ? CAR_X + 282 : CAR_X + 198;
  const otherAnchor = driverRight ? CAR_X + 198 : CAR_X + 282;
  const boxEdge = (side: string) => (side === 'left' ? 232 : W - 232);
  return (
    <div className="scene">
      <svg className="scene-art" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A cartoon electric car with its driver, seen from the front">
        <Thermometer index={sliders.temperature} />
        <Sun index={sliders.sun} />
        <Car sliders={sliders} driverRight={driverRight} />
        <g className="scene-callouts" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round">
          <path d={`M ${boxEdge(styleSide)} 214 L ${driverAnchor + (styleSide === 'left' ? -12 : 12)} ${CAR_Y + 130}`} />
          <circle cx={driverAnchor + (styleSide === 'left' ? -12 : 12)} cy={CAR_Y + 130} r="4" fill="var(--ink-3)" stroke="none" />
          <path d={`M ${boxEdge(loadSide)} 214 L ${otherAnchor + (loadSide === 'left' ? -12 : 12)} ${CAR_Y + 136}`} />
          <circle cx={otherAnchor + (loadSide === 'left' ? -12 : 12)} cy={CAR_Y + 136} r="4" fill="var(--ink-3)" stroke="none" />
          <path d={`M 236 372 L ${CAR_X + 80} ${CAR_Y + 292}`} />
        </g>
      </svg>
      <SceneSlider className="ctl-temp" name="Weather" steps={TEMPERATURE_STEPS} value={sliders.temperature} onChange={(i) => onSlider('temperature', i)} icon={<ThermoIcon />} valueText={TEMPERATURE_STEPS[sliders.temperature].label} />
      <SceneSlider className="ctl-sun" name="Sun" steps={SUN_STEPS} value={sliders.sun} onChange={(i) => onSlider('sun', i)} icon={<SunIcon />} valueText={SUN_STEPS[sliders.sun].label} reversed />
      <SceneSlider className={`ctl-style ctl-${styleSide}`} name="Driving" steps={STYLE_STEPS} value={sliders.style} onChange={(i) => onSlider('style', i)} icon={<WheelIcon />} valueText={STYLE_STEPS[sliders.style].label} />
      <SceneSlider className={`ctl-load ctl-${loadSide}`} name="Load" steps={LOAD_STEPS} value={sliders.load} onChange={(i) => onSlider('load', i)} icon={<WeightIcon />} valueText={LOAD_STEPS[sliders.load].label} />
      <SceneSlider className="ctl-tyres" name="Tyres" steps={TYRE_STEPS} value={sliders.tyres} onChange={(i) => onSlider('tyres', i)} icon={<TyreIcon />} valueText={TYRE_STEPS[sliders.tyres].label} />
    </div>
  );
}

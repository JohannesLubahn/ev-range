import { useId } from 'react';
import { LOGO_BOLT } from './Logo';

/**
 * The fun-sized landing page's only picture: a friendly electric car seen from the front. Colours come from the
 * --car-* tokens in styles.css, so it follows light and dark mode (its headlights glow in the dark).
 */
export function CartoonCar() {
  const id = useId().replace(/:/g, '');
  const glass = `car-glass-${id}`;
  const glow = `car-glow-${id}`;
  return (
    <svg className="cartoon-car" viewBox="0 0 480 360" role="img" aria-label="A cartoon electric car, seen from the front">
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
      {/* Tyres, behind the body */}
      <rect x="76" y="246" width="64" height="82" rx="18" fill="var(--car-tyre)" />
      <rect x="340" y="246" width="64" height="82" rx="18" fill="var(--car-tyre)" />

      <g className="car-body">
        {/* Mirrors */}
        <path d="M142 150h-20" stroke="var(--car-body-shade)" strokeWidth="8" strokeLinecap="round" />
        <path d="M338 150h20" stroke="var(--car-body-shade)" strokeWidth="8" strokeLinecap="round" />
        <ellipse cx="108" cy="146" rx="22" ry="14" fill="var(--car-body-shade)" />
        <ellipse cx="372" cy="146" rx="22" ry="14" fill="var(--car-body-shade)" />

        {/* Cabin and windscreen */}
        <path d="M126 178 156 92q6-20 28-20h112q22 0 28 20l30 86z" fill="var(--car-body-shade)" />
        <path d="M146 170 170 100q4-12 18-12h104q14 0 18 12l24 70z" fill="var(--car-glass)" />
        <g clipPath={`url(#${glass})`} fill="var(--car-shine)">
          <path d="M200 84h30l-44 92h-30z" />
          <path d="M240 84h12l-44 92h-12z" />
        </g>

        {/* Body */}
        <path
          d="M100 172q140-24 280 0 40 6 44 48l4 48q2 32-30 34H82q-32-2-30-34l4-48q4-42 44-48z"
          fill="var(--car-body)"
        />
        <path d="M118 184q122-18 244 0" fill="none" stroke="var(--car-shine)" strokeWidth="5" strokeLinecap="round" />

        {/* Headlights */}
        <circle className="car-glow" cx="130" cy="216" r="64" fill={`url(#${glow})`} />
        <circle className="car-glow" cx="350" cy="216" r="64" fill={`url(#${glow})`} />
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

        {/* Indicators, badge, smile and bumper */}
        <rect x="98" y="256" width="34" height="11" rx="5.5" fill="var(--car-indicator)" />
        <rect x="348" y="256" width="34" height="11" rx="5.5" fill="var(--car-indicator)" />
        <path d={LOGO_BOLT} transform="translate(240 214) scale(1.5) translate(-10 -16)" fill="var(--car-lamp)" />
        <path d="M196 256q44 26 88 0" fill="none" stroke="var(--car-dark)" strokeWidth="9" strokeLinecap="round" />
        <rect x="74" y="284" width="332" height="18" rx="9" fill="var(--car-body-shade)" />
      </g>
    </svg>
  );
}

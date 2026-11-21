import { useId, type SVGProps } from 'react';

/**
 * The EV Compare mark: a lightning bolt in front of a tyre. The tyre (a plain ring, in the text colour) sits
 * behind and to the right; the bolt (accent colour) cuts a gap into it where they overlap. The master copy is
 * docs/logo/logo.svg; the favicon in index.html is the same drawing. Keep the three in step.
 */
export const LOGO_BOLT = 'M12.6 2 2.1 17h7.2L7.1 30l11-16.5h-7.4z';
/** The bolt's outline without its notch: the gap in the tyre follows this, so no sliver of tyre shows in the notch. */
export const LOGO_BOLT_HULL = 'M12.6 2 18.1 13.5 7.1 30 2.1 17z';
export const LOGO_TYRE = { cx: 17.6, cy: 16, r: 10, width: 4.6 };
/** Width of the gap between bolt and tyre, in the 32-unit drawing. */
export const LOGO_GAP = 3.4;

type P = SVGProps<SVGSVGElement> & { size?: number; title?: string };

export function Logo({ size = 24, title, ...rest }: P) {
  const mask = `logo-gap-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...rest}>
      {title && <title>{title}</title>}
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={LOGO_BOLT_HULL} fill="#000" stroke="#000" strokeWidth={LOGO_GAP} strokeLinejoin="round" />
      </mask>
      <circle cx={LOGO_TYRE.cx} cy={LOGO_TYRE.cy} r={LOGO_TYRE.r} stroke="currentColor" strokeWidth={LOGO_TYRE.width} mask={`url(#${mask})`} />
      <path d={LOGO_BOLT} fill="var(--accent)" />
    </svg>
  );
}

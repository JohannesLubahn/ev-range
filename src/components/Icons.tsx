import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: P) {
  return { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, ...rest } as SVGProps<SVGSVGElement>;
}

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M4.8 8.2l2.1 2.1 4.3-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCross = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconWarning = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 1.6l6.6 12H1.4z" fill="var(--warn)" />
    <path d="M8 6v3.4" stroke="#0b0b0b" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="11.6" r="0.9" fill="#0b0b0b" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" />
  </svg>
);

export const IconBolt = (p: P) => (
  <svg {...base(p)} viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="var(--accent)" />
    <path d="M18 5L8 18h7l-2 9 10-13h-7z" fill="var(--accent-ink)" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M13.2 10.2A5.6 5.6 0 015.8 2.8a5.6 5.6 0 107.4 7.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const IconMonitor = (p: P) => (
  <svg {...base(p)}>
    <rect x="1.8" y="2.6" width="12.4" height="8.4" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 13.6h5M8 11v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.6 9.4a2.6 2.6 0 003.7 0l2.2-2.2a2.6 2.6 0 00-3.7-3.7l-.8.8M9.4 6.6a2.6 2.6 0 00-3.7 0L3.5 8.8a2.6 2.6 0 003.7 3.7l.8-.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 2v8M4.8 7l3.2 3.2L11.2 7M2.5 13.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 10.5V2.5M4.8 5.5L8 2.3l3.2 3.2M2.5 13.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

import { signedPct } from '../format';
import { IconCheck, IconCross } from './Icons';

/** Pass/fail with icon + label: colour never carries the meaning alone. */
export function PassFail({ pass, margin, text }: { pass: boolean | null; margin: number | null; text?: string }) {
  if (pass === null) return <span className="faint">–</span>;
  return (
    <span className={`status ${pass ? 'good' : 'bad'}`}>
      {pass ? <IconCheck size={14} /> : <IconCross size={14} />}
      <span>{text ?? signedPct(margin)}</span>
      <span className="sr-only">{pass ? 'enough' : 'not enough'}</span>
    </span>
  );
}

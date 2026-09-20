import { PanelSectionRow } from '@decky/ui';

import type { Change } from '../apply/plan';

/**
 * One line of the diff: what a setting is now, and what it would become.
 *
 * Three states have to read differently at a glance, because they mean very
 * different things:
 *   - a normal change
 *   - a clamped change (we are not applying the number the report gave)
 *   - a blocked change (we cannot apply it at all)
 */
export function DiffRow({ change, supported }: { change: Change; supported: boolean }) {
  const dimmed = !!change.blocked || !supported;

  return (
    <PanelSectionRow>
      <div style={{ fontSize: '0.85em', opacity: dimmed ? 0.5 : 1, padding: '2px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
          <span>{change.label}</span>
          <span style={{ textAlign: 'right' }}>
            {change.from !== null ? (
              <span style={{ opacity: 0.6 }}>{change.from} → </span>
            ) : (
              <span style={{ opacity: 0.6 }}>unset → </span>
            )}
            <strong>{change.to}</strong>
          </span>
        </div>

        {change.clamped && (
          <div style={{ fontSize: '0.9em', opacity: 0.75, marginTop: '2px' }}>
            Report said {change.clamped.requested} — {change.clamped.reason}.
          </div>
        )}

        {change.blocked && (
          <div style={{ fontSize: '0.9em', opacity: 0.9, marginTop: '2px' }}>{change.blocked}</div>
        )}

        {!change.blocked && !supported && (
          <div style={{ fontSize: '0.9em', opacity: 0.75, marginTop: '2px' }}>
            Not supported yet — this one needs Steam&apos;s performance API.
          </div>
        )}
      </div>
    </PanelSectionRow>
  );
}

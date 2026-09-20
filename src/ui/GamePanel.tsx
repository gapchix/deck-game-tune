import { ButtonItem, PanelSection, PanelSectionRow } from '@decky/ui';
import { useCallback, useEffect, useState } from 'react';

import { fetchReportsForApp, type GameDetails } from '../api/deckVerified';
import { applicableChanges, buildPlan, type ApplyPlan, type CurrentSettings } from '../apply/plan';
import { executeChanges, revert, type Snapshot } from '../apply/execute';
import { pythonSnapshotStore } from '../apply/snapshotStore';
import { TIER_C_AVAILABLE } from '../config';
import type { Device } from '../data/device';
import {
  bestTierGroup,
  hasMeaningfulSpread,
  rankReports,
  toIntentOptions,
  type IntentOption,
  type RankedReport,
} from '../data/reports';
import { getAvailableCompatTools, steamWriter } from '../steam/apps';
import { readCurrentSettings } from '../steam/currentSettings';
import { DiffRow } from './DiffRow';

type Phase =
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'empty'; game: GameDetails; hadReports: number }
  | {
      kind: 'ready';
      game: GameDetails;
      group: RankedReport[];
      options: IntentOption[];
      current: CurrentSettings;
      plans: ApplyPlan[];
    };

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

const INTENT_LABEL = { battery: 'Battery', balanced: 'Balanced', performance: 'Performance' };

const TIER_NOTE: Record<RankedReport['tier'], string | null> = {
  exact: null,
  sibling: 'From the other Steam Deck model',
  other: 'From a different handheld',
};

function Note({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <PanelSectionRow>
      <div style={{ fontSize: '0.82em', opacity: strong ? 0.95 : 0.7, padding: '2px 0' }}>
        {children}
      </div>
    </PanelSectionRow>
  );
}

export function GamePanel({ appId, device }: { appId: number; device: Device }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [selected, setSelected] = useState(0);
  const [applyState, setApplyState] = useState<ApplyState>({ kind: 'idle' });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    setApplyState({ kind: 'idle' });
    setSelected(0);

    const [game, current, tools, existing] = await Promise.all([
      fetchReportsForApp(appId),
      readCurrentSettings(appId),
      getAvailableCompatTools(appId),
      pythonSnapshotStore.get(appId),
    ]);

    setSnapshot(existing);

    if (!game) {
      setPhase({ kind: 'unreachable' });
      return;
    }

    const ranked = rankReports(game.reports ?? [], device);
    if (ranked.length === 0) {
      setPhase({ kind: 'empty', game, hadReports: (game.reports ?? []).length });
      return;
    }

    const group = bestTierGroup(ranked);
    const options = toIntentOptions(group);
    const chosen = options.length > 0 ? options.map((o) => o.ranked) : [group[0]];
    const plans = chosen.map((r) =>
      buildPlan({
        appId,
        report: r.report,
        device,
        current,
        // Until the spike lands we cannot read the device's real limits, so we
        // do not clamp against invented ones — better an unclamped tier C row
        // the user cannot apply than a wrong number shown as fact.
        limits: { tdpMin: null, tdpMax: null, fpsOptions: null, gpuMinMhz: null, gpuMaxMhz: null },
        availableCompatTools: tools,
      }),
    );

    setPhase({ kind: 'ready', game, group, options, current, plans });
  }, [appId, device.model]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApply = useCallback(async () => {
    if (phase.kind !== 'ready') return;
    const plan = phase.plans[selected];
    const changes = applicableChanges(plan, TIER_C_AVAILABLE);
    if (changes.length === 0) return;

    setApplyState({ kind: 'working' });
    const result = await executeChanges(
      appId,
      changes,
      phase.current,
      steamWriter,
      pythonSnapshotStore,
    );

    if (result.ok) {
      setApplyState({ kind: 'done', count: result.applied.length });
      setSnapshot(await pythonSnapshotStore.get(appId));
      return;
    }
    setApplyState({
      kind: 'error',
      message:
        result.abortedReason ??
        `${result.failure?.change.label ?? 'A setting'} failed: ${result.failure?.error ?? 'unknown error'}`,
    });
  }, [phase, selected, appId]);

  const onRevert = useCallback(async () => {
    if (!snapshot) return;
    setApplyState({ kind: 'working' });
    const result = await revert(snapshot, steamWriter, pythonSnapshotStore);
    if (result.ok) {
      setSnapshot(null);
      setApplyState({ kind: 'idle' });
      void load();
      return;
    }
    setApplyState({ kind: 'error', message: 'Could not put everything back. Nothing was lost.' });
  }, [snapshot, load]);

  if (phase.kind === 'loading') {
    return (
      <PanelSection title="Deck Game Tune">
        <Note>Looking up community reports…</Note>
      </PanelSection>
    );
  }

  if (phase.kind === 'unreachable') {
    return (
      <PanelSection title="Deck Game Tune">
        <Note strong>Could not reach Deck Verified. It may be down, or you may be offline.</Note>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => void load()}>
            Try again
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (phase.kind === 'empty') {
    return (
      <PanelSection title={phase.game.gameName}>
        <Note strong>
          {phase.hadReports === 0
            ? 'No community reports for this game yet. If you tune it yourself, consider writing one.'
            : `${phase.hadReports} report${phase.hadReports === 1 ? '' : 's'}, but none of them change anything we can set for you.`}
        </Note>
      </PanelSection>
    );
  }

  const plan = phase.plans[selected];
  const changes = plan.changes;
  const doable = applicableChanges(plan, TIER_C_AVAILABLE);
  const tierNote = TIER_NOTE[phase.group[0].tier];
  const showPicker = phase.options.length > 0 && hasMeaningfulSpread(phase.group);

  return (
    <PanelSection title={phase.game.gameName}>
      {showPicker && (
        <>
          <Note>These reports disagree — pick what you want:</Note>
          {phase.options.map((option, i) => (
            <PanelSectionRow key={option.intent}>
              <ButtonItem
                layout="below"
                onClick={() => {
                  setSelected(i);
                  setApplyState({ kind: 'idle' });
                }}
              >
                {i === selected ? `▸ ${INTENT_LABEL[option.intent]}` : INTENT_LABEL[option.intent]}
              </ButtonItem>
            </PanelSectionRow>
          ))}
        </>
      )}

      <Note>
        {phase.group.length} report{phase.group.length === 1 ? '' : 's'}
        {tierNote ? ` · ${tierNote}` : ''}
        {plan.tier === 'exact' ? ` · ${device.label}` : ''}
      </Note>

      {plan.warnings.map((w) => (
        <Note key={w} strong>
          {w}
        </Note>
      ))}

      {changes.length === 0 ? (
        <Note strong>Your settings already match this report.</Note>
      ) : (
        changes.map((c) => (
          <DiffRow key={c.key} change={c} supported={c.tier === 'A' || TIER_C_AVAILABLE} />
        ))
      )}

      {(plan.inGame.graphics || plan.inGame.display) && (
        <Note>
          This report also lists in-game graphics settings. Those live inside the game and have to
          be set by hand — open the full report on Deck Verified to see them.
        </Note>
      )}

      {doable.length > 0 && applyState.kind !== 'done' && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={applyState.kind === 'working'}
            onClick={() => void onApply()}
          >
            {applyState.kind === 'working'
              ? 'Applying…'
              : `Apply ${doable.length} setting${doable.length === 1 ? '' : 's'}`}
          </ButtonItem>
        </PanelSectionRow>
      )}

      {applyState.kind === 'done' && (
        <Note strong>
          Applied {applyState.count} setting{applyState.count === 1 ? '' : 's'}. Restart the game
          for them to take effect.
        </Note>
      )}

      {applyState.kind === 'error' && <Note strong>{applyState.message}</Note>}

      {snapshot && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={applyState.kind === 'working'}
            onClick={() => void onRevert()}
          >
            Undo — put my settings back
          </ButtonItem>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}

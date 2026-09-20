import { PanelSection, PanelSectionRow, staticClasses } from '@decky/ui';
import { callable, definePlugin } from '@decky/api';
import { useEffect, useState } from 'react';
import { FaSlidersH } from 'react-icons/fa';

import { subscribeToRunningApp, type RunningApp } from './steam/session';
import { identifyDevice, type Device, type DeviceDmi } from './data/device';
import { fetchReportsForApp, type GameDetails } from './api/deckVerified';
import { bestTierGroup, hasMeaningfulSpread, rankReports, type RankedReport } from './data/reports';

const getDeviceDmi = callable<[], DeviceDmi>('get_device_dmi');

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'unreachable' }
  | { kind: 'loaded'; game: GameDetails; ranked: RankedReport[] };

const TIER_NOTE: Record<RankedReport['tier'], string> = {
  exact: '',
  sibling: 'from the other Steam Deck model',
  other: 'from a different handheld — values will be clamped',
};

function Row({ children }: { children: React.ReactNode }) {
  return (
    <PanelSectionRow>
      <div style={{ fontSize: '0.9em' }}>{children}</div>
    </PanelSectionRow>
  );
}

function Content() {
  const [device, setDevice] = useState<Device | null>(null);
  const [running, setRunning] = useState<RunningApp | null>(null);
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    getDeviceDmi()
      .then((dmi) => {
        if (!cancelled) setDevice(identifyDevice(dmi));
      })
      .catch((err) => console.error('[deck-game-tune] device detection failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeToRunningApp(setRunning), []);

  useEffect(() => {
    if (!running || !device) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchReportsForApp(running.appId)
      .then((game) => {
        if (cancelled) return;
        if (!game) {
          setState({ kind: 'unreachable' });
          return;
        }
        setState({ kind: 'loaded', game, ranked: rankReports(game.reports ?? [], device) });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unreachable' });
      });
    return () => {
      cancelled = true;
    };
  }, [running?.appId, device?.model]);

  return (
    <PanelSection title="Deck Game Tune">
      <Row>
        <span style={{ opacity: 0.7 }}>{device ? device.label : 'Identifying device…'}</span>
      </Row>

      {!running && <Row>Start a game to see its community settings.</Row>}

      {running && state.kind === 'loading' && <Row>Looking up reports…</Row>}

      {running && state.kind === 'unreachable' && (
        <Row>Could not reach Deck Verified. It may be down, or you may be offline.</Row>
      )}

      {running && state.kind === 'loaded' && <Loaded state={state} />}
    </PanelSection>
  );
}

function Loaded({ state }: { state: Extract<LoadState, { kind: 'loaded' }> }) {
  const { game, ranked } = state;

  if (ranked.length === 0) {
    // Distinguish "nobody has covered this game" from "the reports that exist
    // have nothing we could apply" — they call for different responses.
    const had = (game.reports ?? []).length;
    return (
      <Row>
        <strong>{game.gameName}</strong>
        <br />
        {had === 0
          ? 'No community reports yet. Consider writing one.'
          : `${had} report${had === 1 ? '' : 's'}, but nothing here can be applied automatically.`}
      </Row>
    );
  }

  const best = ranked[0];
  const group = bestTierGroup(ranked);
  const note = TIER_NOTE[best.tier];

  return (
    <>
      <Row>
        <strong>{game.gameName}</strong>
      </Row>
      <Row>
        {ranked.length} usable report{ranked.length === 1 ? '' : 's'}
        {note ? ` · ${note}` : ''}
      </Row>
      <Row>
        Best match: {best.actionable} setting{best.actionable === 1 ? '' : 's'} to apply
        {best.rating !== null ? ` · rated ${best.rating}/5` : ' · unrated'}
      </Row>
      {hasMeaningfulSpread(group) && (
        <Row>
          <span style={{ opacity: 0.7 }}>
            {group.length} reports here disagree meaningfully — you&apos;ll get a choice.
          </span>
        </Row>
      )}
    </>
  );
}

export default definePlugin(() => ({
  name: 'Deck Game Tune',
  titleView: <div className={staticClasses.Title}>Deck Game Tune</div>,
  content: <Content />,
  icon: <FaSlidersH />,
  onDismount() {
    // The running-app subscription tears down with its useEffect.
  },
}));

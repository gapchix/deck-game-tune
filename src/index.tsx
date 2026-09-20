import { PanelSection, PanelSectionRow, staticClasses } from '@decky/ui';
import { callable, definePlugin } from '@decky/api';
import { useEffect, useState } from 'react';
import { FaSlidersH } from 'react-icons/fa';

import { identifyDevice, type Device, type DeviceDmi } from './data/device';
import { subscribeToRunningApp, type RunningApp } from './steam/session';
import { GamePanel } from './ui/GamePanel';

const getDeviceDmi = callable<[], DeviceDmi>('get_device_dmi');

function Content() {
  const [device, setDevice] = useState<Device | null>(null);
  const [running, setRunning] = useState<RunningApp | null>(null);

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

  if (!device) {
    return (
      <PanelSection title="Deck Game Tune">
        <PanelSectionRow>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>Identifying device…</div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (!running) {
    return (
      <PanelSection title="Deck Game Tune">
        <PanelSectionRow>
          <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
            Start a game and open this panel to see the settings the community
            found for it.
          </div>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return <GamePanel appId={running.appId} device={device} />;
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

import { PanelSection, PanelSectionRow, staticClasses } from '@decky/ui';
import { callable, definePlugin } from '@decky/api';
import { useEffect, useState } from 'react';
import { FaSlidersH } from 'react-icons/fa';

import { subscribeToRunningApp, type RunningApp } from './steam/session';
import { identifyDevice, type Device, type DeviceDmi } from './data/device';

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

  return (
    <PanelSection title="Deck Game Tune">
      <PanelSectionRow>
        <div style={{ fontSize: '0.8em', opacity: 0.8 }}>
          {device ? device.label : 'Identifying device…'}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div>
          {running ? `Running: app ${running.appId}` : 'No game running'}
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => ({
  name: 'Deck Game Tune',
  titleView: <div className={staticClasses.Title}>Deck Game Tune</div>,
  content: <Content />,
  icon: <FaSlidersH />,
  onDismount() {
    // subscribeToRunningApp cleans itself up via the useEffect teardown.
  },
}));

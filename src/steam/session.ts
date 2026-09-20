/**
 * Tracking which game is running.
 *
 * `unAppID` is 0 for non-Steam shortcuts — Steam simply does not set it for
 * them. We treat that as "no game we can help with" rather than guessing,
 * because every Deck Verified report is keyed by Steam app id.
 */

export interface RunningApp {
  appId: number;
}

type Listener = (app: RunningApp | null) => void;

interface AppLifetimeNotification {
  unAppID: number;
  nInstanceID: number;
  bRunning: boolean;
}

interface Unregisterable {
  unregister: () => void;
}

// SteamClient is injected into the Steam UI; @decky/ui ships the typings but
// this narrow shape is all we need and keeps the module testable.
declare const SteamClient: {
  GameSessions: {
    RegisterForAppLifetimeNotifications: (
      cb: (n: AppLifetimeNotification) => void,
    ) => Unregisterable;
  };
};

/**
 * Calls `listener` whenever the running game changes, and returns an
 * unsubscribe function. Emits `null` when nothing (usable) is running.
 */
export function subscribeToRunningApp(listener: Listener): () => void {
  let current: number | null = null;

  const registration = SteamClient.GameSessions.RegisterForAppLifetimeNotifications((n) => {
    if (n.bRunning) {
      // A non-Steam shortcut reports appId 0 and has no reports to look up.
      if (!n.unAppID) return;
      if (current === n.unAppID) return;
      current = n.unAppID;
      listener({ appId: n.unAppID });
      return;
    }

    // Only clear if the app that stopped is the one we were tracking —
    // a background app exiting must not wipe the foreground game.
    if (current !== null && current === n.unAppID) {
      current = null;
      listener(null);
    }
  });

  return () => registration.unregister();
}

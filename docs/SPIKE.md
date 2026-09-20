# Spike: can we serialize `CMsgSystemPerfUpdateSettings`?

**This is the only open feasibility question.** Everything else is confirmed in the type
definitions. Do this before writing any product code — the answer changes the shape of the
plugin.

## Why it matters

`SteamClient.System.Perf.UpdateSettings(base64)` is the single call behind the four highest-value
settings:

| Setting | Share of Deck reports |
|---|---:|
| Frame limit | 54% |
| TDP limit | 36% |
| Manual GPU clock | 12% |
| Scaling filter | 11% |

If this works, Deck Game Tune covers ~85% of reports. If it doesn't, we fall back to `SteamClient.Apps`
only (Proton 28%, resolution 27%, launch options 13%) — still a plugin, but roughly half of one,
and we'd have to decide whether sysfs-with-an-enforcement-loop is worth the mess.

## Prerequisites

- A Steam Deck with Decky Loader installed, Developer mode on, reachable over SSH
  (`deck@<ip>`; set a password in Desktop Mode first)
- CEF debugging enabled so the Steam UI console is reachable

## Steps

1. **Confirm the API exists at runtime.** In the Steam UI console:

   ```js
   typeof SteamClient.System.Perf.UpdateSettings
   typeof SteamClient.System.Perf.RegisterForStateChanges
   ```

2. **Capture a real message.** Register for state changes, change the TDP slider by hand in the
   QAM, and dump the `ArrayBuffer` that arrives. This gives a known-good `CMsgSystemPerfState`
   to study — field numbers, wire types, and what Steam itself sends.

   ```js
   SteamClient.System.Perf.RegisterForStateChanges(b =>
     console.log(btoa(String.fromCharCode(...new Uint8Array(b)))));
   ```

3. **Find Valve's own protobuf class** in the Steam UI webpack bundle, using
   `findModuleExport` / `findModuleByExport` from `@decky/ui`. Search for an export whose name or
   shape matches `CMsgSystemPerfUpdateSettings`. If found, building and serializing a message is
   a few lines and the spike is done.

4. **If step 3 fails**, reconstruct the `.proto` for that one message from the captured bytes in
   step 2 and serialize with `protobufjs`. Heavier, and field numbers must be inferred — but the
   message is small and the capture gives ground truth.

5. **Prove a round trip.** Set `fps_limit` to a value via `UpdateSettings`, then confirm the QAM
   UI reflects it and it survives a game relaunch. Frame limit is the right test case — highest
   share, and visibly verifiable.

## Success criteria

- [ ] `UpdateSettings` accepts a message we built and Steam's UI reflects the change
- [ ] The change persists across a game relaunch (it's a real per-game profile, not a transient)
- [ ] We can read current per-app settings back via `RegisterForStateChanges` — required for the
      diff and the revert snapshot
- [ ] `SystemPerfLimits` is readable, so recommendations can be clamped per device

## Record the answer

Write the outcome into [ARCHITECTURE.md](ARCHITECTURE.md) — replace "the one unsolved problem"
with what actually happened, including the failed approaches. The next person (or the next
session) should not have to rediscover this.

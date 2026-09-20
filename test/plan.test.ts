import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { GameDetails, Report, ReportData } from '../src/api/deckVerified';
import type { Device } from '../src/data/device';
import {
  applicableChanges,
  buildPlan,
  isEmpty,
  matchCompatTool,
  SCALING_FILTER,
  type Change,
  type CompatTool,
  type CurrentSettings,
  type DeviceLimits,
  type PlanInput,
} from '../src/apply/plan';

const OLED: Device = { model: 'oled', label: 'Steam Deck OLED', isSteamDeck: true };

/** Realistic Steam Deck OLED limits. */
const DECK_LIMITS: DeviceLimits = {
  tdpMin: 3,
  tdpMax: 15,
  fpsOptions: [15, 30, 45, 60, 90],
  gpuMinMhz: 200,
  gpuMaxMhz: 1600,
};

const NOTHING_SET: CurrentSettings = {
  launchOptions: null,
  compatTool: null,
  resolution: null,
  tdpLimit: null,
  isTdpLimitEnabled: false,
  frameLimit: null,
  isFrameLimitEnabled: false,
  gpuClock: null,
  scalingFilter: null,
};

function makeInput(
  data: Partial<ReportData>,
  overrides: Partial<PlanInput> = {},
): PlanInput {
  const report = {
    id: 1,
    number: 1,
    data: { device: 'Steam Deck OLED', ...data } as ReportData,
  } as Report;
  return {
    appId: 1,
    report,
    device: OLED,
    current: NOTHING_SET,
    limits: DECK_LIMITS,
    availableCompatTools: [],
    ...overrides,
  };
}

const byKey = (changes: Change[], key: Change['key']) => changes.find((c) => c.key === key);

describe('clamping to the device', () => {
  it('clamps a Legion Go TDP down to what a Deck can do', () => {
    const plan = buildPlan(
      makeInput({ device: 'Lenovo Legion Go', tdp_limit: '30' }),
    );
    const c = byKey(plan.changes, 'tdpLimit')!;
    expect(c.value).toBe(15);
    expect(c.to).toBe('15W');
    expect(c.clamped).toEqual({
      requested: 30,
      applied: 15,
      reason: "above this device's maximum of 15W",
    });
  });

  it('clamps below the floor too', () => {
    const plan = buildPlan(makeInput({ tdp_limit: '1' }));
    expect(byKey(plan.changes, 'tdpLimit')!.value).toBe(3);
  });

  it('snaps a frame cap to an option the device actually offers', () => {
    // 40fps is a common report value but is not in the OLED's option list.
    const plan = buildPlan(makeInput({ frame_limit: '40' }));
    const c = byKey(plan.changes, 'frameLimit')!;
    expect(c.value).toBe(45);
    expect(c.clamped?.requested).toBe(40);
  });

  it('leaves an exact frame cap alone', () => {
    const plan = buildPlan(makeInput({ frame_limit: '60' }));
    const c = byKey(plan.changes, 'frameLimit')!;
    expect(c.value).toBe(60);
    expect(c.clamped).toBeUndefined();
  });

  it('does not clamp when limits are unknown', () => {
    const plan = buildPlan(
      makeInput(
        { tdp_limit: '30' },
        { limits: { tdpMin: null, tdpMax: null, fpsOptions: null, gpuMinMhz: null, gpuMaxMhz: null } },
      ),
    );
    expect(byKey(plan.changes, 'tdpLimit')!.value).toBe(30);
  });

  it('clamps GPU clock', () => {
    const plan = buildPlan(makeInput({ manual_gpu_clock: '2400' }));
    expect(byKey(plan.changes, 'gpuClock')!.value).toBe(1600);
  });
});

describe('no-op elimination', () => {
  it('drops a setting that already has the recommended value', () => {
    const plan = buildPlan(
      makeInput(
        { tdp_limit: '12', frame_limit: '60' },
        { current: { ...NOTHING_SET, tdpLimit: 12, isTdpLimitEnabled: true, frameLimit: 60, isFrameLimitEnabled: true } },
      ),
    );
    expect(plan.changes).toHaveLength(0);
  });

  it('still proposes a limit that matches but is switched off', () => {
    // A disabled 12W limit is not a 12W limit. Skipping this would leave the
    // user with the toggle off and no indication why nothing changed.
    const plan = buildPlan(
      makeInput(
        { tdp_limit: '12' },
        { current: { ...NOTHING_SET, tdpLimit: 12, isTdpLimitEnabled: false } },
      ),
    );
    expect(byKey(plan.changes, 'tdpLimit')).toBeDefined();
  });

  it('ignores the template defaults that mean no change', () => {
    const plan = buildPlan(
      makeInput({
        custom_launch_options: '%command%',
        game_resolution: 'Default',
        scaling_filter: 'Linear',
        steam_play_compatibility_tool_used: 'Steam Proton',
        compatibility_tool_version: 'default',
      }),
    );
    expect(plan.changes).toHaveLength(0);
  });

  it('skips the frame limit when the report says it was disabled', () => {
    const plan = buildPlan(makeInput({ frame_limit: '60', disable_frame_limit: 'On' }));
    expect(byKey(plan.changes, 'frameLimit')).toBeUndefined();
  });
});

describe('Proton selection', () => {
  const GE: CompatTool = { strToolName: 'GE-Proton10-30', strDisplayName: 'GE-Proton10-30' };

  it('matches an installed build despite punctuation differences', () => {
    const { tool } = matchCompatTool(
      {
        steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
        compatibility_tool_version: 'GE-proton10-30',
      } as ReportData,
      [GE],
    );
    expect(tool?.strToolName).toBe('GE-Proton10-30');
  });

  it('blocks rather than silently skipping when the build is missing', () => {
    const plan = buildPlan(
      makeInput({
        steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
        compatibility_tool_version: 'GE-proton10-30',
      }),
    );
    const c = byKey(plan.changes, 'protonTool')!;
    expect(c.blocked).toContain("isn't installed");
    expect(applicableChanges(plan, true)).toHaveLength(0);
  });

  it('applies an installed build using its internal tool name', () => {
    const plan = buildPlan(
      makeInput(
        {
          steam_play_compatibility_tool_used: 'Glorious Eggroll Proton (GE)',
          compatibility_tool_version: 'GE-proton10-30',
        },
        { availableCompatTools: [GE] },
      ),
    );
    const c = byKey(plan.changes, 'protonTool')!;
    expect(c.blocked).toBeUndefined();
    expect(c.value).toBe('GE-Proton10-30');
  });

  it('treats stock Proton at its default version as no change', () => {
    const { tool, wanted } = matchCompatTool(
      {
        steam_play_compatibility_tool_used: 'Steam Proton',
        compatibility_tool_version: 'default',
      } as ReportData,
      [GE],
    );
    expect(wanted).toBeNull();
    expect(tool).toBeNull();
  });

  it('picks up a pinned version even under the stock tool name', () => {
    const { wanted } = matchCompatTool(
      {
        steam_play_compatibility_tool_used: 'Steam Proton',
        compatibility_tool_version: 'Proton 7.0.6',
      } as ReportData,
      [],
    );
    expect(wanted).toBe('Proton 7.0.6');
  });
});

describe('scaling filter', () => {
  it('maps names to the Steam enum', () => {
    expect(byKey(buildPlan(makeInput({ scaling_filter: 'FSR' })).changes, 'scalingFilter')!.value).toBe(
      SCALING_FILTER.FSR,
    );
    expect(
      byKey(buildPlan(makeInput({ scaling_filter: 'Nearest' })).changes, 'scalingFilter')!.value,
    ).toBe(SCALING_FILTER.Nearest);
  });

  it('treats Linear as the default, not a change', () => {
    expect(buildPlan(makeInput({ scaling_filter: 'Linear' })).changes).toHaveLength(0);
  });
});

describe('honesty', () => {
  it('warns when the report came from other hardware', () => {
    const plan = buildPlan(makeInput({ device: 'Lenovo Legion Go S', tdp_limit: '25' }));
    expect(plan.tier).toBe('other');
    expect(plan.warnings[0]).toContain('not a Steam Deck');
  });

  it('warns when the report came from the other Deck revision', () => {
    const plan = buildPlan(makeInput({ device: 'Steam Deck LCD (64GB)', tdp_limit: '12' }));
    expect(plan.tier).toBe('sibling');
    expect(plan.warnings[0]).toContain('other Steam Deck model');
  });

  it('says nothing extra when the report matches your hardware', () => {
    expect(buildPlan(makeInput({ tdp_limit: '12' })).warnings).toHaveLength(0);
  });

  it('carries the in-game settings through without pretending to apply them', () => {
    const plan = buildPlan(
      makeInput({ game_graphics_settings: '#### QUICK PRESET\n- TEXTURES: High' }),
    );
    expect(plan.inGame.graphics).toContain('QUICK PRESET');
    expect(plan.changes).toHaveLength(0);
  });
});

describe('tier gating', () => {
  const plan = () =>
    buildPlan(
      makeInput({
        tdp_limit: '12',
        frame_limit: '60',
        custom_launch_options: 'WINEDLLOVERRIDES="dsound=n,b" %command%',
      }),
    );

  it('hides tier C changes until the spike lands', () => {
    const p = plan();
    expect(p.changes).toHaveLength(3);
    const a = applicableChanges(p, false);
    expect(a).toHaveLength(1);
    expect(a[0].key).toBe('launchOptions');
  });

  it('includes everything once tier C is available', () => {
    expect(applicableChanges(plan(), true)).toHaveLength(3);
  });

  it('reports emptiness per tier', () => {
    const p = buildPlan(makeInput({ tdp_limit: '12' }));
    expect(isEmpty(p, false)).toBe(true);
    expect(isEmpty(p, true)).toBe(false);
  });
});

describe('real fixture: Hollow Knight: Silksong', () => {
  function fixture(name: string): GameDetails {
    const url = new URL(`../fixtures/${name}.json`, import.meta.url);
    return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as GameDetails;
  }

  it('produces a sane plan from a real OLED report', () => {
    const game = fixture('hollow-knight-silksong');
    // The 8W / 90fps report. Note the API hands these back as numbers even
    // though the underlying report form stores strings — coerceNumber takes
    // either, which is why buildPlan doesn't care.
    const report = game.reports.find((r) => Number(r.data.tdp_limit) === 8)!;
    const plan = buildPlan({
      appId: game.appId,
      report,
      device: OLED,
      current: NOTHING_SET,
      limits: DECK_LIMITS,
      availableCompatTools: [],
    });

    expect(plan.tier).toBe('exact');
    expect(plan.warnings).toHaveLength(0);
    expect(byKey(plan.changes, 'tdpLimit')!.to).toBe('8W');
    expect(byKey(plan.changes, 'frameLimit')!.to).toBe('90 fps');
    // 8W and 90fps are both within Deck limits, so nothing should be clamped.
    expect(plan.changes.every((c) => c.clamped === undefined)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import {
  identifyDevice,
  isSameModel,
  normaliseReportDevice,
  type Device,
} from '../src/data/device';

describe('identifyDevice', () => {
  it('maps Valve DMI codenames to models', () => {
    expect(identifyDevice({ vendor: 'Valve', product: 'Jupiter' }).model).toBe('lcd');
    expect(identifyDevice({ vendor: 'Valve', product: 'Galileo' }).model).toBe('oled');
  });

  it('is tolerant of case and stray whitespace from sysfs', () => {
    expect(identifyDevice({ vendor: 'Valve', product: '  galileo\n' }).model).toBe('oled');
  });

  it('does not guess on unknown hardware', () => {
    const d = identifyDevice({ vendor: 'LENOVO', product: '83L3' });
    expect(d.model).toBe('unknown');
    expect(d.isSteamDeck).toBe(false);
  });

  it('degrades gracefully when DMI is unreadable', () => {
    expect(identifyDevice({ vendor: '', product: '' }).model).toBe('unknown');
  });
});

describe('normaliseReportDevice', () => {
  // These are the exact strings the community corpus uses. The same device is
  // labelled several ways; matching raw strings loses most of the data.
  it('collapses the duplicate OLED labels', () => {
    expect(normaliseReportDevice('Valve Steam Deck OLED')).toBe('oled');
    expect(normaliseReportDevice('Steam Deck OLED')).toBe('oled');
  });

  it('collapses every LCD variant', () => {
    expect(normaliseReportDevice('Valve Steam Deck LCD (256GB/512GB)')).toBe('lcd');
    expect(normaliseReportDevice('Steam Deck LCD (256GB/512GB)')).toBe('lcd');
    expect(normaliseReportDevice('Valve Steam Deck LCD (64GB)')).toBe('lcd');
    expect(normaliseReportDevice('Steam Deck')).toBe('lcd');
  });

  it('treats other handhelds as unknown, not as a Deck', () => {
    expect(normaliseReportDevice('Lenovo Legion Go S')).toBe('unknown');
    expect(normaliseReportDevice('ASUS ROG Ally Z1 Extreme')).toBe('unknown');
    expect(normaliseReportDevice('Lenovo Legion Go')).toBe('unknown');
  });

  it('handles missing values', () => {
    expect(normaliseReportDevice(null)).toBe('unknown');
    expect(normaliseReportDevice(undefined)).toBe('unknown');
    expect(normaliseReportDevice('')).toBe('unknown');
  });
});

describe('isSameModel', () => {
  const oled: Device = { model: 'oled', label: 'Steam Deck OLED', isSteamDeck: true };
  const lcd: Device = { model: 'lcd', label: 'Steam Deck LCD', isSteamDeck: true };
  const unknown: Device = { model: 'unknown', label: 'Unknown device', isSteamDeck: false };

  it('matches across the duplicate labels', () => {
    expect(isSameModel(oled, 'Valve Steam Deck OLED')).toBe(true);
    expect(isSameModel(oled, 'Steam Deck OLED')).toBe(true);
  });

  it('never mixes LCD and OLED', () => {
    expect(isSameModel(oled, 'Steam Deck LCD (256GB/512GB)')).toBe(false);
    expect(isSameModel(lcd, 'Valve Steam Deck OLED')).toBe(false);
  });

  it('never claims a match on unidentified hardware', () => {
    expect(isSameModel(unknown, 'Steam Deck OLED')).toBe(false);
  });
});

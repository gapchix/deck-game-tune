import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Everything under test/ is pure logic — no Steam UI, no DOM, no network.
    // Anything that needs SteamClient belongs on the Deck, not here.
    environment: 'node',
  },
});

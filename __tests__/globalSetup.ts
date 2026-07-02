// Vitest globalSetup — runs BEFORE any modules are loaded
// Sets globals that Expo's node_modules expect at module load time
export function setup() {
  (globalThis as any).__DEV__ = true;
}
export function teardown() {}
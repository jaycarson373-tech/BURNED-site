const mode = process.env.SERVICE_MODE?.trim().toLowerCase();

if (mode === 'index') {
  await import('./start-index.mjs');
} else if (mode === 'rewards') {
  await import('./start-rewards.mjs');
} else {
  throw new Error('SERVICE_MODE must be set to "index" or "rewards"');
}

/**
 * Runs once when the Next.js server starts. On the Node runtime it schedules
 * the daily subscription sweep (see instrumentation-node.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}

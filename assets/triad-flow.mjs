import { getOriginalIds, getReplacementIds, setComparison } from './triad-core.mjs';

/**
 * Quotes A and B independently against one immutable session snapshot.
 * A new run (or cancel) invalidates every older task, including its callbacks.
 * Selection, writing and rendering remain the caller's responsibility.
 */
export function createQuoteCoordinator({
  quote, onStart = () => {}, onResult = () => {},
  onError = () => {}, onSettled = () => {}
}) {
  if (typeof quote !== 'function') throw new TypeError('quote 必须是函数');
  let generation = 0;

  async function run(snapshot) {
    const ownGeneration = ++generation;
    const isCurrent = () => ownGeneration === generation;
    try {
      onStart(snapshot);
      if (!isCurrent()) return { status: 'stale' };
      const sessionId = snapshot.context.sessionId;
      const originalIds = getOriginalIds(snapshot);
      const replacementIds = getReplacementIds(snapshot);
      const originalQuote = await quote({ sessionId, itemIds: originalIds });
      if (!isCurrent()) return { status: 'stale' };
      const replacementQuote = await quote({ sessionId, itemIds: replacementIds });
      if (!isCurrent()) return { status: 'stale' };
      const session = setComparison(snapshot, originalQuote, replacementQuote);
      onResult(session, snapshot);
      return { status: 'applied', session };
    } catch (error) {
      if (!isCurrent()) return { status: 'stale' };
      onError(error, snapshot);
      return { status: 'error' };
    } finally {
      if (isCurrent()) onSettled(snapshot);
    }
  }

  return { run, cancel() { generation += 1; } };
}

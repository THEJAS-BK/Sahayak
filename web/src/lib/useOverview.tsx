import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchPoliceOverview } from '../api/client';
import type { PoliceOverview } from '../api/types';
import { localDayWindow } from './format';

/**
 * One poller for the situation summary.
 *
 * The header fetched `/police/overview` for the bell badge on every page, and
 * the Dashboard fetched the same endpoint again for its own tiles — two requests,
 * two sources, and two numbers that could disagree on screen. Both read this
 * instead.
 *
 * `generated_at` comes from the server, so the "as of" stamp in the header is
 * the moment the counts were true rather than the moment they arrived.
 */

const REFRESH_MS = 30_000;

interface OverviewState {
  overview: PoliceOverview | null;
  /** When the counts were computed server-side, for the freshness stamp. */
  generatedAt: Date | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const OverviewContext = createContext<OverviewState | null>(null);

export const OverviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [overview, setOverview] = useState<PoliceOverview | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      // The console's own day, always. Omitting the window lets the API use the
      // server's UTC midnight for `completed_today`, which is wrong for every
      // station that is not on UTC.
      const result = await fetchPoliceOverview(localDayWindow());
      if (!mounted.current) return;
      setOverview(result);
      setGeneratedAt(new Date(result.generated_at));
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      // Keep the last good counts. A board that empties because one request
      // timed out reads as "nothing is wrong", which is the one conclusion an
      // officer must never draw by accident.
      setError(err instanceof Error ? err.message : 'Could not refresh the summary');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <OverviewContext.Provider value={{ overview, generatedAt, loading, error, reload: load }}>
      {children}
    </OverviewContext.Provider>
  );
};

export const useOverview = (): OverviewState => {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error('useOverview must be used inside <OverviewProvider>');
  return ctx;
};

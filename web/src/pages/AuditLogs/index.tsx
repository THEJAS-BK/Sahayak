import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/Table';
import { fetchAuditLogs } from '../../api/client';
import type { AuditLog } from '../../api/types';
import { RefreshCw } from 'lucide-react';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

const PAGE_SIZE = 50;

const ENTITY_TYPES = ['', 'help_request', 'user', 'user_verification', 'emergency_event'];

/** P-02: the dedicated audit trail, with the filters the endpoint already supports. */
export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [systemOnly, setSystemOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (reset: boolean, nextCursor?: string | null) => {
    setError(null);
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const result = await fetchAuditLogs({
        limit: PAGE_SIZE,
        ...(entityType ? { entity_type: entityType } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
        // P-02 spells "no actor" as the literal string 'null'; the service
        // translates it to SQL NULL.
        ...(systemOnly ? { actor_id: 'null' } : {}),
        ...(nextCursor ? { cursor: nextCursor } : {}),
      });
      setLogs((prev) => (reset ? result.logs : [...prev, ...result.logs]));
      setCursor(result.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      if (reset) setLogs([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setCursor(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, systemOnly]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Audit Logs</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Every recorded change, newest first. Entries with no actor were made by a background job.
        </p>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'rgba(220,38,38,0.08)', color: 'var(--color-status-error)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <Card>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Entity type
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              style={inputStyle}
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === '' ? 'All' : type}
                </option>
              ))}
            </select>
          </label>

          <form
            style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
            onSubmit={(e) => {
              e.preventDefault();
              setCursor(null);
              void load(true);
            }}
          >
            Action
            <input
              type="text"
              placeholder="e.g. request.assign"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              style={{ ...inputStyle, width: '220px' }}
            />
          </form>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', paddingBottom: '0.5rem' }}>
            <input
              type="checkbox"
              checked={systemOnly}
              onChange={(e) => setSystemOnly(e.target.checked)}
            />
            System-generated only
          </label>

          <button
            type="button"
            onClick={() => {
              setCursor(null);
              void load(true);
            }}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--color-border)',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            Loading audit logs…
          </div>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>When</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Entity</TableHeader>
                  <TableHeader>Actor</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</TableCell>
                    <TableCell>
                      <code style={{ fontSize: '0.8125rem' }}>{log.action}</code>
                    </TableCell>
                    <TableCell>
                      {log.entity_type}
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                        {log.entity_id?.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.actor_id ? (
                        <span style={{ fontSize: '0.8125rem' }}>{log.actor_id.slice(0, 8)}</span>
                      ) : (
                        <Badge variant="default">System</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell>
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        No audit entries match these filters.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {cursor && (
              <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void load(false, cursor)}
                  style={{
                    padding: '0.375rem 0.875rem',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--color-border)',
                    background: 'none',
                    cursor: loadingMore ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-white)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  color: 'var(--color-text)',
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field } from '../../components/ui/Field';
import { Section } from '../../components/ui/Section';
import { SkeletonTable } from '../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/Table';
import { fetchAuditLogs } from '../../api/client';
import type { AuditLog } from '../../api/types';
import { RefreshCw } from 'lucide-react';
import { formatDateTime, shortId } from '../../lib/format';
import { toneText } from '../../lib/tone';
import { controlInteractive, pageStack } from '../../lib/styles';

const PAGE_SIZE = 50;

const ENTITY_TYPES = ['', 'help_request', 'user', 'user_verification', 'emergency_event'];

/** P-02: the dedicated audit trail, with the filters the endpoint already supports. */
export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [appliedAction, setAppliedAction] = useState('');
  const [systemOnly, setSystemOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursorRef = useRef<string | null>(null);

  const load = useCallback(
    async (reset: boolean, nextCursor?: string | null) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const result = await fetchAuditLogs({
          limit: PAGE_SIZE,
          ...(entityType ? { entity_type: entityType } : {}),
          ...(appliedAction ? { action: appliedAction } : {}),
          // P-02 spells "no actor" as the literal string 'null'; the service
          // translates it to SQL NULL.
          ...(systemOnly ? { actor_id: 'null' } : {}),
          ...(nextCursor ? { cursor: nextCursor } : {}),
        });
        setLogs((prev) => (reset ? result.logs : [...prev, ...result.logs]));
        cursorRef.current = result.next_cursor;
        setCursor(result.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load the audit trail');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entityType, appliedAction, systemOnly],
  );

  useEffect(() => {
    cursorRef.current = null;
    setCursor(null);
    void load(true);
  }, [load]);

  const hasFilters = entityType !== '' || appliedAction !== '' || systemOnly;

  return (
    <div style={pageStack}>
      {error && <Alert onRetry={() => void load(logs.length === 0)}>{error}</Alert>}

      <Card flush>
        {/* The 0.625rem gutter is the dense table cell padding, so the title,
            the filters and the first column of the table share one left edge. */}
        <div style={{ padding: '0.875rem 0.625rem', borderBottom: '1px solid var(--color-rule)' }}>
          <Section
            title="Recorded changes"
            description="Every recorded change, newest first. Entries with no actor were made by a background job."
            unbordered
            actions={
              <Button
                size="sm"
                variant="outline"
                icon={<RefreshCw size={14} />}
                onClick={() => void load(true)}
              >
                Refresh
              </Button>
            }
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAppliedAction(action.trim());
              }}
              style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
            >
              {/* `Field` pairs the label with the control by id; the old markup
                  had a visible label and an unlabelled select. */}
              <Field label="Entity type">
                {({ id }) => (
                  <select
                    id={id}
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                    style={{ ...controlInteractive, minWidth: '13rem' }}
                  >
                    {ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === '' ? 'All' : type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Action">
                {({ id, style }) => (
                  <input
                    id={id}
                    type="text"
                    placeholder="e.g. request.assign"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    style={{ ...style, width: '220px' }}
                  />
                )}
              </Field>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: 'var(--text-meta)',
                  // Aligns the checkbox with the controls above it rather than
                  // floating beside the label row.
                  marginBottom: '0.375rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={systemOnly}
                  onChange={(e) => setSystemOnly(e.target.checked)}
                />
                System-generated only
              </label>

              <Button type="submit" size="sm">
                Apply
              </Button>
            </form>
          </Section>
        </div>

        {loading && logs.length === 0 ? (
          <SkeletonTable columns={4} rows={12} />
        ) : (
          <>
            <Table density="dense" stickyHeader>
              <TableCaption>
                Audit trail entries, newest first. An entry with no actor was written by a background
                job.
              </TableCaption>
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
                    <TableCell style={{ ...toneText.neutral, whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.created_at)}
                    </TableCell>
                    <TableCell>
                      {/* Monospace: these are dotted API action names, and
                          aligning them in a column is what makes them scannable. */}
                      <span className="mono" style={{ fontSize: 'var(--text-meta)' }}>
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.entity_type.replace(/_/g, ' ')}
                      {log.entity_id && (
                        <div className="mono" style={{ ...toneText.neutral, fontSize: 'var(--text-label)' }}>
                          {shortId(log.entity_id)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.actor_id ? (
                        <span className="mono" style={{ fontSize: 'var(--text-meta)' }}>
                          {shortId(log.actor_id)}
                        </span>
                      ) : (
                        <Badge tone="neutral">System</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <EmptyState
                        title={hasFilters ? 'No entry matches these filters' : 'The audit trail is empty'}
                        description={
                          hasFilters
                            ? 'Nothing was recorded under this combination of entity, action and actor.'
                            : 'Recorded changes appear here as soon as anything is written.'
                        }
                        action={
                          hasFilters ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEntityType('');
                                setAction('');
                                setAppliedAction('');
                                setSystemOnly(false);
                              }}
                            >
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {cursor && (
              <div
                style={{
                  padding: '0.875rem',
                  display: 'flex',
                  justifyContent: 'center',
                  borderTop: '1px solid var(--color-rule)',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(false, cursorRef.current)}
                >
                  {loadingMore ? 'Loading…' : `Load more (${logs.length} shown)`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

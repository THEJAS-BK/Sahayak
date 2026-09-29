import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  fetchVerificationDetail,
  reviewVerification,
} from '../../api/client';
import type {
  VerificationDetail,
  VerificationStatus,
} from '../../api/types';

const statusVariant: Record<
  VerificationStatus,
  'success' | 'warning' | 'error'
> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

const formatLabel = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const isSensitiveField = (key: string) => {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('fcm') ||
    normalized.includes('token') ||
    normalized.includes('password') ||
    normalized.includes('aadhaar')
  );
};

export const VerificationDetails: React.FC = () => {
  const { verificationId } = useParams<{ verificationId: string }>();
  const navigate = useNavigate();

  const [verification, setVerification] =
    useState<VerificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!verificationId) return;

    setLoading(true);
    setError(null);

    fetchVerificationDetail(verificationId)
      .then((result) => setVerification(result.verification))
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load verification details',
        );
      })
      .finally(() => setLoading(false));
  }, [verificationId]);

  const handleReview = async (status: 'APPROVED' | 'REJECTED') => {
    if (!verificationId) return;

    if (status === 'REJECTED' && !rejectReason.trim()) {
      setError('Please enter a reason before rejecting this verification.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await reviewVerification(
        verificationId,
        status,
        status === 'REJECTED' ? rejectReason.trim() : undefined,
      );

      setVerification((current) =>
  current
    ? {
        ...current,
        status,
        reviewed_at: new Date().toISOString(),
        review_reason:
          status === 'REJECTED' ? rejectReason.trim() : null,
      }
    : current,
);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update verification',
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Loading verification details…
        </p>
      </div>
    );
  }

  if (!verification) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.875rem' }}>
          Verification Details
        </h1>

        <Card style={{ padding: '1.5rem' }}>
          <p style={{ color: 'var(--color-status-error)', margin: 0 }}>
            {error ?? 'Verification not found.'}
          </p>
        </Card>

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/verification')}
          style={{ alignSelf: 'flex-start' }}
        >
          Back to Verification
        </Button>
      </div>
    );
  }

  const submittedFields = Object.entries(verification.form_data).filter(
    ([key, value]) =>
      !isSensitiveField(key) &&
      value !== null &&
      value !== undefined &&
      value !== '',
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <button
            type="button"
            onClick={() => navigate('/verification')}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              color: 'var(--color-primary-navy)',
              cursor: 'pointer',
              fontWeight: 600,
              marginBottom: '0.5rem',
            }}
          >
            ← Back to Verification
          </button>

          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 700 }}>
            Verification Details
          </h1>
        </div>

        <Badge variant={statusVariant[verification.status]}>
          {verification.status}
        </Badge>
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            backgroundColor: 'rgba(220,38,38,0.08)',
            color: 'var(--color-status-error)',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            Applicant Information
          </h2>
        </div>

        <div
          style={{
            padding: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Name
            </div>
            <div style={{ marginTop: '0.25rem', fontWeight: 600 }}>
              {String(
                verification.form_data.full_name ??
                  verification.user.email ??
                  '—',
              )}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Email
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              {verification.user.email}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Role
            </div>
            <div style={{ marginTop: '0.25rem', textTransform: 'capitalize' }}>
              {verification.role}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Verification ID
            </div>
            <div
              style={{
                marginTop: '0.25rem',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}
            >
              {verification.id}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            Submitted Information
          </h2>
        </div>

        <div
          style={{
            padding: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '1rem',
          }}
        >
          {submittedFields.map(([key, value]) => (
            <div key={key}>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {formatLabel(key)}
              </div>

              <div style={{ marginTop: '0.25rem', wordBreak: 'break-word' }}>
                {typeof value === 'object'
                  ? JSON.stringify(value, null, 2)
                  : String(value)}
              </div>
            </div>
          ))}

          {submittedFields.length === 0 && (
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              No additional submitted information is available.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            Review Information
          </h2>
        </div>

        <div
          style={{
            padding: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Submitted
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              {formatDate(verification.created_at)}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Reviewed
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              {formatDate(verification.reviewed_at)}
            </div>
          </div>

          {verification.review_reason && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Review Reason
              </div>
              <div style={{ marginTop: '0.25rem' }}>
                {verification.review_reason}
              </div>
            </div>
          )}
        </div>
      </Card>

      {verification.status === 'PENDING' && (
        <Card>
          <div style={{ padding: '1.25rem' }}>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>
              Review Action
            </h2>

            <label
              htmlFor="reject-reason"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                marginBottom: '0.4rem',
              }}
            >
              Rejection reason
            </label>

            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Required only when rejecting"
              maxLength={500}
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.75rem',
                border: '1px solid var(--color-border)',
                borderRadius: '0.375rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => handleReview('APPROVED')}
              >
                {busy ? 'Saving…' : 'Approve Verification'}
              </Button>

              <Button
                variant="outline"
                disabled={busy}
                onClick={() => handleReview('REJECTED')}
                style={{ color: 'var(--color-status-error)' }}
              >
                Reject Verification
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Field } from '../../components/ui/Field';
import { FilterChip } from '../../components/ui/FilterChip';
import { requestOtp, setSession, verifyOtp } from '../../api/client';
import { ShieldCheck } from 'lucide-react';
import { control } from '../../lib/styles';
import { toneText } from '../../lib/tone';

/**
 * `OTP_DEV_CODE` is a backend escape hatch for local work, not a credential.
 * The previous build hardcoded `123456`, pre-filled it into the box and printed
 * it on the sign-in card, so any deployment of this bundle could be signed into
 * with a guess. It now comes from the build's own env and is only surfaced when
 * the bundle is a dev build.
 */
const DEV_OTP_CODE: string | undefined = import.meta.env.DEV
  ? import.meta.env.VITE_OTP_DEV_CODE
  : undefined;

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'otp' | 'token'>('otp');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [refreshValue, setRefreshValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => navigate('/', { replace: true });

  const handleRequestCode = async () => {
    if (!email.trim()) {
      setError('Enter the email address your police account was created with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setCodeSent(true);
      if (DEV_OTP_CODE) setCode(DEV_OTP_CODE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request a code');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!email.trim() || code.trim().length !== 6) {
      setError('The verification code is six digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(email.trim(), code.trim());
      setSession(result);
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveToken = async () => {
    const token = tokenValue.trim();
    if (!token) return;
    if (token.split('.').length !== 3) {
      setError('That does not look like a JWT — it should have three dot-separated parts.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSession({ access_token: token, refresh_token: refreshValue.trim() || null });
      goHome();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="auth-screen"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Navy field, single raised card. The rest of the console is a light
        // workspace; signing in is the one moment that is not.
        background: 'var(--color-navy)',
        padding: '1.5rem',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--color-raised)',
          borderRadius: 'var(--radius-panel)',
          boxShadow: 'var(--shadow-overlay)',
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <ShieldCheck size={26} color="var(--color-ink-inverse)" aria-hidden="true" />
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>
            Sahayak Admin
          </h1>
        </div>
        <p style={{ ...toneText.neutral, fontSize: 'var(--text-body)', margin: '0.375rem 0 1.5rem 0' }}>
          Police verification portal
        </p>

        {/* These are two sign-in methods, not a filter. Announced as a group so
            the choice is clear rather than two anonymous buttons. */}
        <div role="group" aria-label="Sign-in method" style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.5rem' }}>
          <FilterChip label="OTP sign-in" active={mode === 'otp'} onClick={() => setMode('otp')} />
          <FilterChip label="Paste token" active={mode === 'token'} onClick={() => setMode('token')} />
        </div>

        {error && (
          <div style={{ marginBottom: '1rem' }}>
            <Alert>{error}</Alert>
          </div>
        )}

        {mode === 'otp' ? (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              void (codeSent ? handleVerify() : handleRequestCode());
            }}
          >
            <Field label="Officer email">
              {({ id, style }) => (
                <input
                  id={id}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ ...style, width: '100%' }}
                />
              )}
            </Field>

            {codeSent && (
              <Field label="Verification code" hint="Six digits, sent to your police email.">
                {({ id, style }) => (
                  <input
                    id={id}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    // Letter-spacing makes a six-digit code legible as six
                    // separate digits rather than one smeared number.
                    style={{ ...style, width: '100%', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
                  />
                )}
              </Field>
            )}

            <Button type="submit" disabled={busy || !email.trim()} style={{ width: '100%' }}>
              {busy ? 'Working…' : codeSent ? 'Sign in' : 'Request code'}
            </Button>

            {codeSent && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                  setError(null);
                }}
                style={{ alignSelf: 'flex-start', padding: 0, textDecoration: 'underline' }}
              >
                Use a different email
              </Button>
            )}

            {DEV_OTP_CODE && (
              <p style={{ ...toneText.neutral, fontSize: 'var(--text-label)', margin: 0 }}>
                Dev build — the local OTP is <span className="mono">{DEV_OTP_CODE}</span>.
              </p>
            )}
          </form>
        ) : (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveToken();
            }}
          >
            <Field label="Access token (JWT)">
              {({ id, style }) => (
                <textarea
                  id={id}
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  rows={5}
                  placeholder="Paste a police access token…"
                  style={{ ...control, ...style, width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)' }}
                />
              )}
            </Field>
            <Field label="Refresh token (optional)">
              {({ id, style }) => (
                <input
                  id={id}
                  value={refreshValue}
                  onChange={(e) => setRefreshValue(e.target.value)}
                  style={{ ...style, width: '100%' }}
                />
              )}
            </Field>
            <Button type="submit" disabled={busy || !tokenValue.trim()} style={{ width: '100%' }}>
              Save token
            </Button>
            <p style={{ ...toneText.neutral, fontSize: 'var(--text-label)', margin: 0 }}>
              For local testing only. Anyone with a police token already has console access, so this
              never bypasses a check.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

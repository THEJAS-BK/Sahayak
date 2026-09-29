import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { requestOtp, setSession, verifyOtp } from '../../api/client';
import { ShieldCheck } from 'lucide-react';

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.375rem',
  border: '1px solid var(--color-border)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  marginBottom: '0.375rem',
};

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
      setError(err instanceof Error ? err.message : 'Failed to request code');
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
        backgroundColor: 'var(--color-primary-navy)',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--color-surface-white)',
          borderRadius: '0.75rem',
          boxShadow: 'var(--shadow-md)',
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <ShieldCheck size={28} color="var(--color-primary-navy)" />
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0 }}>Sahayak Admin</h1>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: '0 0 1.5rem 0' }}>
          Police verification portal
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <Button
            variant={mode === 'otp' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setMode('otp')}
          >
            OTP sign-in
          </Button>
          <Button
            variant={mode === 'token' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setMode('token')}
          >
            Paste token
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '0.75rem',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--color-status-error-bg)',
              color: 'var(--color-status-error)',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
            }}
          >
            {error}
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
            <div>
              <label htmlFor="officer-email" style={labelStyle}>
                Officer email
              </label>
              <input
                id="officer-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>

            {codeSent && (
              <div>
                <label htmlFor="otp-code" style={labelStyle}>
                  Verification code
                </label>
                <input
                  id="otp-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  style={inputStyle}
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={busy || !email.trim()}
              style={{ width: '100%' }}
            >
              {busy ? 'Working…' : codeSent ? 'Sign in' : 'Request code'}
            </Button>

            {codeSent && (
              <button
                type="button"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'inherit',
                  fontSize: '0.8125rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            )}

            {DEV_OTP_CODE && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                Dev build — the local OTP is <code>{DEV_OTP_CODE}</code>.
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
            <div>
              <label htmlFor="access-token" style={labelStyle}>
                Access token (JWT)
              </label>
              <textarea
                id="access-token"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                rows={5}
                placeholder="Paste a police access token…"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label htmlFor="refresh-token" style={labelStyle}>
                Refresh token (optional)
              </label>
              <input
                id="refresh-token"
                value={refreshValue}
                onChange={(e) => setRefreshValue(e.target.value)}
                style={inputStyle}
              />
            </div>
            <Button type="submit" disabled={busy || !tokenValue.trim()} style={{ width: '100%' }}>
              Save token
            </Button>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              For local testing only. Anyone with a police token already has console access, so this
              never bypasses a check.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

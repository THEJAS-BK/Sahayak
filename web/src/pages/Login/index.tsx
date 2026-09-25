import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { requestOtp, setSession, verifyOtp } from '../../api/client';
import { ShieldCheck } from 'lucide-react';

const DEV_POLICE_EMAIL = 'ashok.kini@example.com';
const DEV_OTP_CODE = '123456';

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

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'otp' | 'token'>('otp');
  const [email, setEmail] = useState(DEV_POLICE_EMAIL);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [refreshValue, setRefreshValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => navigate('/', { replace: true });

  const handleRequestCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setCodeSent(true);
      setCode(DEV_OTP_CODE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request code');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!email.trim() || !code.trim()) return;
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
    if (!tokenValue.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setSession({ access_token: tokenValue.trim(), refresh_token: refreshValue.trim() || null });
      goHome();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-primary-navy)',
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: 'var(--color-surface-white)',
        borderRadius: '0.75rem',
        boxShadow: 'var(--shadow-md)',
        padding: '2rem',
      }}>
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
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.375rem',
            backgroundColor: 'rgba(220,38,38,0.08)',
            color: 'var(--color-status-error)',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
          }}>
            {error}
          </div>
        )}

        {mode === 'otp' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Officer email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </div>
            {codeSent && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Verification code
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  style={inputStyle}
                />
              </div>
            )}
            {!codeSent ? (
              <Button onClick={handleRequestCode} disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Sending…' : 'Request code'}
              </Button>
            ) : (
              <Button onClick={handleVerify} disabled={busy} style={{ width: '100%' }}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Dev OTP code (OTP_DEV_CODE) is <code>{DEV_OTP_CODE}</code>. Default police account: {DEV_POLICE_EMAIL}.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Access token (JWT)
              </label>
              <textarea
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                rows={5}
                placeholder="Paste a police access token…"
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Refresh token (optional)
              </label>
              <input value={refreshValue} onChange={(e) => setRefreshValue(e.target.value)} style={inputStyle} />
            </div>
            <Button onClick={handleSaveToken} disabled={busy} style={{ width: '100%' }}>
              Save token
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
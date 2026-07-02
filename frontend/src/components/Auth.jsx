import { useState, useEffect } from 'react';
import { authAPI } from '../utils';

export default function Auth({ onLoginSuccess, verifyToken }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // If a verification token was passed in (e.g. from routing /verify?token=...), verify it immediately
  useEffect(() => {
    if (verifyToken) {
      handleVerification(verifyToken);
    }
  }, [verifyToken]);

  const handleVerification = async (token) => {
    setLoading(true);
    setError('');
    try {
      const user = await authAPI.verifyMagicLink(token);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || 'Failed to verify magic link. The token may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLink = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await authAPI.requestMagicLink(email);
      setMessage(res.message || 'Magic link sent! Please check your email inbox.');
    } catch (err) {
      setError(err.message || 'Failed to send magic link.');
    } finally {
      setLoading(false);
    }
  };

  if (verifyToken) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2 className="auth-title">Verifying Session...</h2>
          {loading && <p style={{ textAlign: 'center', color: 'var(--accent)' }}>Connecting to server...</p>}
          {error && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</p>
              <button className="btn-cancel" onClick={() => window.location.href = '/'}>
                Back to Home
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2 className="auth-title">Sign In / Join PitchUp</h2>
        <p className="auth-subtitle">No passwords needed. We'll email you a one-time sign-in link.</p>
        
        {message ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: '6px', fontSize: '13px' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '8px' }}>✓ Link Generated</p>
              <p style={{ color: 'var(--text-secondary)' }}>
                For local testing: Check the backend terminal console output to copy and click the magic link!
              </p>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              Check spam if you don't receive an email within 2 minutes.
            </p>
            <button className="btn-cancel" onClick={() => setMessage('')} style={{ width: '100%' }}>
              Use different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendLink} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && <p style={{ color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
            <button type="submit" className="btn-submit" disabled={loading} style={{ width: '100%', height: '44px' }}>
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

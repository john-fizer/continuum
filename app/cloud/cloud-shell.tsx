import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Cloud, LockKeyhole, LogOut, X } from 'lucide-react';
import { cloudClient } from './client';
import Home from '../page';
import './cloud.css';

export function CloudShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [schema, setSchema] = useState<
    'checking' | 'ready' | 'missing' | 'error'
  >('checking');
  const [revision, setRevision] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const accountId = session?.user.id;
  useEffect(() => {
    let active = true;
    const open = () => setAuthOpen(true);
    window.addEventListener('continuum-sign-in', open);
    let cleanup = () => {};
    try {
      const client = cloudClient();
      const { data } = client.auth.onAuthStateChange((_event, next) => {
        if (!active) return;
        setSession(next);
        setLoading(false);
        if (next) setAuthOpen(false);
      });
      cleanup = () => data.subscription.unsubscribe();
      void client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setError(error.message);
        setSession(data.session);
        setLoading(false);
      });
    } catch (e) {
      queueMicrotask(() => {
        if (active) {
          setError(
            e instanceof Error ? e.message : 'Cloud connection unavailable.',
          );
          setLoading(false);
        }
      });
    }
    return () => {
      active = false;
      cleanup();
      window.removeEventListener('continuum-sign-in', open);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (active) {
          setSchema('checking');
          setError('');
        }
        return cloudClient().rpc('continuum_schema_status');
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSchema(error.code === 'PGRST202' ? 'missing' : 'error');
          if (error.code !== 'PGRST202') setError(error.message);
        } else if (data?.version !== 1) {
          setSchema('missing');
        } else setSchema('ready');
      })
      .catch((e) => {
        if (active) {
          setSchema('error');
          setError(e instanceof Error ? e.message : 'Cloud connection failed.');
        }
      });
    return () => {
      active = false;
    };
  }, [accountId, revision]);
  async function signOut() {
    setSigningOut(true);
    const { error } = await cloudClient().auth.signOut({ scope: 'local' });
    if (error) setError(error.message);
    else {
      setSession(null);
      setSchema('checking');
    }
    setSigningOut(false);
  }
  return (
    <>
      <div className="cloud-account-bar">
        <div>
          <Cloud size={16} />
          <span>
            {loading
              ? 'Opening memory…'
              : session
                ? schema === 'ready'
                  ? 'Private cloud memory'
                  : 'Cloud setup pending'
                : 'Explore Continuum · sign in to save'}
          </span>
        </div>
        <div>
          <button onClick={() => setSetupOpen((v) => !v)}>Cloud setup</button>
          {session ? (
            <>
              <span className="cloud-email">{session.user.email}</span>
              <button onClick={() => void signOut()} disabled={signingOut}>
                <LogOut size={14} />
                Sign out
              </button>
            </>
          ) : (
            <button onClick={() => setAuthOpen(true)}>
              <LockKeyhole size={14} />
              Sign in / create account
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="cloud-notice" role="alert">
          {error}
        </p>
      )}
      {loading || signingOut ? (
        <p className="cloud-loading">Opening your workspace…</p>
      ) : setupOpen || (session && schema !== 'ready') ? (
        <section className="cloud-setup" aria-labelledby="cloud-setup-title">
          <Cloud size={32} />
          <p className="cloud-eyebrow">CONTINUUM / CLOUD MEMORY</p>
          <h1 id="cloud-setup-title">
            {schema === 'checking'
              ? 'Checking your memory connection…'
              : schema === 'ready'
                ? 'Cloud memory is connected.'
                : 'The database needs its one-time setup.'}
          </h1>
          {schema === 'ready' ? (
            <>
              <p>
                The private memory tables are ready. Sign in, create a brain,
                and import your notes.
              </p>
              <button onClick={() => setSetupOpen(false)}>
                Open workspace
              </button>
            </>
          ) : (
            schema !== 'checking' && (
              <>
                <p>
                  This is a one-time step for the owner of the Supabase project.
                  It creates the brain and source tables and the rules that keep
                  each account private.
                </p>
                <ol>
                  <li>
                    <a href="/setup/continuum.sql" download>
                      Download the database setup file.
                    </a>
                  </li>
                  <li>
                    Open your project’s{' '}
                    <a
                      href="https://supabase.com/dashboard/project/strytppbpkvlkfmyeidu/sql/new"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Supabase SQL Editor
                    </a>
                    , paste that file, and run it.
                  </li>
                  <li>Return here and check the connection.</li>
                </ol>
                <button onClick={() => setRevision((v) => v + 1)}>
                  Check connection again
                </button>
                {!session && (
                  <button onClick={() => setSetupOpen(false)}>
                    Back to preview
                  </button>
                )}
                <p className="cloud-footnote">
                  After setup: create a brain → import notes → open their nodes.
                  Source analysis runs after import; evidence stays scoped to this brain.
                </p>
              </>
            )
          )}
        </section>
      ) : (
        <Home key={accountId || 'preview'} />
      )}
      {authOpen && <AuthDialog close={() => setAuthOpen(false)} />}
    </>
  );
}

function AuthDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const client = cloudClient();
      if (mode === 'signin') {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        close();
      } else {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setPassword('');
        if (data.session) close();
        else
          setMessage(
            'Check your email for a confirmation link, then return here and sign in.',
          );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="cloud-auth"
      onCancel={close}
      aria-labelledby="auth-title"
    >
      <div className="cloud-auth-heading">
        <LockKeyhole size={24} />
        <button type="button" onClick={close} aria-label="Close sign in">
          <X size={20} />
        </button>
      </div>
      <p className="cloud-eyebrow">YOUR KNOWLEDGE. YOUR SPACE.</p>
      <h2 id="auth-title">
        {mode === 'signin'
          ? 'Open your second brain.'
          : 'Give your ideas a home.'}
      </h2>
      <p>
        Your account holds independent brains. Sign in on your phone or computer
        to reach the same saved sources.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={mode === 'signup' ? 12 : 1}
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {mode === 'signup' && <small>Use at least 12 characters.</small>}
        <button className="cloud-primary" type="submit" disabled={busy}>
          {busy
            ? 'Connecting…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
      {error && (
        <p role="alert" className="cloud-auth-error">
          {error}
        </p>
      )}
      {message && <output>{message}</output>}
      <button
        className="cloud-switch"
        disabled={busy}
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setMessage('');
          setError('');
        }}
      >
        {mode === 'signin'
          ? 'New here? Create an account'
          : 'Already registered? Sign in'}
      </button>
      <p className="cloud-footnote">
        Local notes stay on your computer until you choose to import them.
      </p>
    </dialog>
  );
}

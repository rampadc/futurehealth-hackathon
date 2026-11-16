import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { ACCESS_GENERATION_KEY, accessGeneration, clearAccessGeneration, renewAccessGeneration } from './accessGeneration';

type Access = { required: boolean; role: 'viewer' | 'presenter' | null };

export function AccessBoundary({ children }: { children: (lock?: () => void) => ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState(window.location.pathname);
  const load = async () => {
    try {
      const response = await fetch('/api/access', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Unable to check workspace access. Please retry.');
      const result = await response.json() as Access;
      if (result.required && !result.role) clearAccessGeneration(); else accessGeneration();
      setAccess(result); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to connect'); }
  };
  useEffect(() => {
    void load();
    const expired = () => { void load(); };
    const changed = () => setPath(window.location.pathname);
    const sharedAccess = (event: StorageEvent) => { if (event.key === ACCESS_GENERATION_KEY) void load(); };
    window.addEventListener('heat-access-expired', expired);
    window.addEventListener('popstate', changed);
    window.addEventListener('storage', sharedAccess);
    return () => { window.removeEventListener('heat-access-expired', expired); window.removeEventListener('popstate', changed); window.removeEventListener('storage', sharedAccess); };
  }, []);
  const presenter = path.replace(/\/$/, '') === '/demo-control';
  const allowed = access && (!access.required || access.role === 'presenter' || access.role === 'viewer' && !presenter);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/access', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Unable to unlock workspace');
      renewAccessGeneration();
      setAccess(result); setCode('');
      if (presenter && result.role !== 'presenter') setError('Use the presenter access code for these controls.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to unlock workspace'); }
    finally { setBusy(false); }
  };
  const lock = async () => {
    const response = await fetch('/api/access', { method: 'DELETE', credentials: 'same-origin' });
    if (response.ok) { clearAccessGeneration(); setAccess({ required: true, role: null }); }
    else { setAccess(null); setError('Unable to lock access. Please retry.'); }
  };
  if (allowed) return <>{children(access.required ? () => { void lock(); } : undefined)}</>;
  if (!access && !error) return <Box role="status" sx={{ p: 4 }}><CircularProgress size={24} /> Checking workspace access…</Box>;
  return <Container maxWidth="sm" sx={{ py: 8 }}><Paper variant="outlined" sx={{ p: 4 }}>
    <Typography color="primary" variant="h6" sx={{ mb: 3 }}>Heat-Safe Crew</Typography>
    <Typography variant="h4" component="h1">{presenter ? 'Presenter access' : 'Open your workspace'}</Typography>
    <Typography color="text.secondary" sx={{ my: 2 }}>{presenter ? 'Enter the presenter code to manage the site case and inspect executions.' : 'Enter the access code shared by your host, then choose your named workspace.'}</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {!access ? <Button onClick={() => { void load(); }}>Retry connection</Button> : <Stack component="form" onSubmit={login} spacing={2}>
      <TextField label="Access code" type="password" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoFocus required disabled={busy} />
      <Button variant="contained" type="submit" disabled={busy || !code}>{busy ? 'Checking…' : 'Continue'}</Button>
    </Stack>}
  </Paper></Container>;
}

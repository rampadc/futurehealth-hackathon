import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessBoundary } from './AccessBoundary';

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('keeps the product unmounted until a code succeeds', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ required: true, role: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Wrong code' }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ required: true, role: 'viewer' })));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<AccessBoundary>{() => <p>Private workspace</p>}</AccessBoundary>);
  expect(screen.queryByText('Private workspace')).toBeNull();
  await user.type(await screen.findByLabelText(/Access code/), 'invalid');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Wrong code')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Private workspace')).toBeTruthy();
});

it('requires presenter access before mounting presenter controls', async () => {
  window.history.replaceState(null, '', '/demo-control');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ required: true, role: 'viewer' }))));
  render(<AccessBoundary>{() => <p>Private controls</p>}</AccessBoundary>);
  expect(await screen.findByRole('heading', { name: 'Presenter access' })).toBeTruthy();
  expect(screen.queryByText('Private controls')).toBeNull();
});

it('leaves local development open when the backend disables the code gate', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ required: false, role: 'presenter' }))));
  render(<AccessBoundary>{lock => <p>{lock ? 'Hosted' : 'Local workspace'}</p>}</AccessBoundary>);
  expect(await screen.findByText('Local workspace')).toBeTruthy();
});

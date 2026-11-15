import { useEffect, useState } from 'react';
import type { BrandPalette } from '../contract';
import { langOf, tr, useWorkerLanguage } from '../i18n';
import { live } from '../live';
import { BrandMark } from '../screens/web/branding';
import { navigate } from '../router';
import { useCaseSession } from '../session';
import { ADMIN, PERSONAS } from '../story';
import { DEVICE_INFO, findScreen, screensFor, type Device, type ScreenDef } from '../screens/registry';
import { Placeholder } from '../screens/Placeholder';
import { Avatar } from '../screens/kit';
import { usePhotoSync } from '../people';
import './fonts';
import './shell.css';

type Props = { device: Device; screen?: string; onLockAccess?: () => void };

/**
 * Shell for the wireframe screens (`/web`, `/site`, `/worker`, `/kiosk`). Styled with the
 * Issued Sheet tokens only; it does not use MUI so it matches `ui_design_system/`.
 */
export function DeviceShell({ device, screen: screenId, onLockAccess }: Props) {
  const session = useCaseSession();
  const info = DEVICE_INFO[device];
  const screens = screensFor(device);
  const screen = findScreen(device, screenId);
  const go = (target: ScreenDef) => navigate(`/${device}/${target.id}`);
  const phone = device === 'site' || device === 'worker';
  const [workerLang] = useWorkerLanguage(device === 'worker' ? session.person?.id : undefined);
  const lang = device === 'worker' ? workerLang ?? 'en' : 'en';
  const brand = usePublishedBrand(!!session.person, device === 'web' ? 'platform' : 'mobile');
  usePhotoSync(!!session.person, session.caseView?.version);
  const account = screens.find(s => s.id === 'account');
  // Stop-work and emergency screens drop the brand entirely.
  const showBrand = brand && !['stop-work', 'alert'].includes(screen.id);

  if (session.initialising) return <div className="hs-shell" data-theme={info.theme} data-device={device}><p role="status" className="hs-pad">Loading case…</p></div>;

  if (!session.person) {
    const users = new Set(screens.flatMap(s => s.personas));
    const people = [...PERSONAS, ADMIN].filter(p => users.has(p.id));
    return <div className="hs-shell" data-theme={info.theme} data-device={device}>
      <main className="hs-signin">
        <p className="hs-label">Heat-Safe Crew · {info.name}</p>
        <h1>Choose who is using this {phone ? 'phone' : device === 'kiosk' ? 'kiosk' : 'workspace'}</h1>
        <p className="hs-muted">Named sign-in is demo persona selection, not authentication.</p>
        <ul className="hs-people">{people.map(p => <li key={p.id}><button type="button" className="hs-btn" disabled={session.busy} onClick={() => void session.signIn(p)}><Avatar id={p.id} size="md" /><span><b>{p.name}</b><span>{p.role} · {p.organisation}</span></span></button></li>)}</ul>
        {session.error && <p role="alert" className="hs-error">{session.error}</p>}
        <DeviceSwitch current={device} />
      </main>
    </div>;
  }

  const railButton = (s: ScreenDef) => <button key={s.id} type="button" aria-current={s.id === screen.id ? 'page' : undefined} onClick={() => go(s)}>{s.name}{!s.component && <small> · planned</small>}</button>;
  const Screen = screen.component;
  const tabs = info.tabs;
  return <div className="hs-shell" data-theme={info.theme} data-device={device}>
    <a href="#hs-main" className="skip-link">Skip to screen</a>
    <header className="hs-bar">
      {showBrand && <BrandMark palette={brand} />}
      <strong>Heat-Safe Crew</strong>
      <span className="hs-muted">{info.name}</span>
      <span className="hs-grow" />
      {account
        ? <button type="button" className="hs-me" aria-current={screen.id === 'account' ? 'page' : undefined} aria-label={`My account: ${session.person.name}`} onClick={() => go(account)}><Avatar id={session.person.id} size={phone ? 'md' : undefined} /><span>{session.person.name}</span></button>
        : <span className="hs-person"><Avatar id={session.person.id} /><span>{session.person.name}</span></span>}
      <button type="button" className="hs-link" disabled={session.busy} onClick={() => void session.signOut()}>Sign out</button>
      {onLockAccess && <button type="button" className="hs-link" onClick={onLockAccess}>Lock access</button>}
    </header>
    <div className="hs-body">
      <nav className="hs-rail" aria-label={`${info.name} screens`} style={showBrand && brand.rail_tint ? { borderInlineStart: `4px solid ${brand.primary}` } : undefined}>
        {screens.filter(s => !s.group).map(railButton)}
        {screens.some(s => s.group === 'admin') && <p className="hs-rail-group">Admin</p>}
        {screens.filter(s => s.group === 'admin').map(railButton)}
        <DeviceSwitch current={device} />
      </nav>
      <main id="hs-main" tabIndex={-1} className="hs-main">
        {session.error && <p role="alert" className="hs-error">{session.error} <button type="button" className="hs-link" onClick={() => void session.refreshCase()}>Retry</button></p>}
        {session.feedback && <p role="status" className="hs-ok">{session.feedback}</p>}
        {Screen ? <Screen session={session} /> : <Placeholder screen={screen} session={session} />}
      </main>
    </div>
    {tabs && <nav className="hs-tabs" aria-label="Sections" lang={lang} dir={langOf(lang).dir}>
      {tabs.map(([id, label]) => {
        const first = screens.find(s => s.tab === id);
        return <button key={id} type="button" disabled={!first} aria-current={screen.tab === id ? 'page' : undefined} onClick={() => first && go(first)}>{device === 'worker' ? tr(`tab.${id}`, lang).text : label}</button>;
      })}
    </nav>}
  </div>;
}

function DeviceSwitch({ current }: { current: Device }) {
  return <p className="hs-switch">
    {(Object.keys(DEVICE_INFO) as Device[]).filter(d => d !== current).map(d => <button key={d} type="button" className="hs-link" onClick={() => navigate(`/${d}`)}>{DEVICE_INFO[d].name}</button>)}
    <button type="button" className="hs-link" onClick={() => navigate('/classic')}>Classic desktop app</button>
  </p>;
}

/** The published company palette for this surface, refreshed when branding publishes a new one. */
function usePublishedBrand(signedIn: boolean, surface: 'platform' | 'mobile') {
  const [brand, setBrand] = useState<BrandPalette | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    const load = () => live.brand().then(b => { if (current) setBrand(b[surface]); }).catch(() => { if (current) setBrand(null); });
    load();
    window.addEventListener('hs-brand-change', load);
    return () => { current = false; window.removeEventListener('hs-brand-change', load); };
  }, [signedIn, surface]);
  return brand;
}

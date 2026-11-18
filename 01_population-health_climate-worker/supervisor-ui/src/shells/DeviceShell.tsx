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
import { LiveClock } from '../LiveClock';
import heatSafeLogo from '../assets/heatsafe_logo.jpg';
import { Icon, type IconName } from '../shared/icons';

/** Rail icon per screen id; the screen name is always written beside it. */
const NAV_ICON: Record<string, IconName> = {
  monitoring: 'gauge', 'heat-rest': 'clock', 'heat-controls': 'sensor', response: 'stop', crew: 'people',
  'work-rest': 'calendar', 'restart-review': 'play', ask: 'message', trust: 'lock', 'site-setup': 'pin', settings: 'settings',
};

type Props = { device: Device; screen?: string; onLockAccess?: () => void };

/**
 * Shell for the wireframe screens (`/web`, `/site`, `/worker`, `/kiosk`). Styled with the
 * Issued Sheet tokens only; it does not use MUI so it matches `ui_design_system/`.
 */
export function DeviceShell({ device, screen: screenId, onLockAccess }: Props) {
  const session = useCaseSession();
  const info = DEVICE_INFO[device];
  const screens = screensFor(device);
  const screen = !screenId && session.person ? screens.find(s => !s.group && s.personas.includes(session.person!.id)) ?? findScreen(device) : findScreen(device, screenId);
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
        <p className="hs-muted">Choose your named role to see its site actions and records.</p>
        <ul className="hs-people">{people.map(p => <li key={p.id}><button type="button" className="hs-btn" disabled={session.busy} onClick={() => void session.signIn(p)}><Avatar id={p.id} size="md" /><span><b>{p.name}</b><span>{p.role} · {p.organisation}</span></span></button></li>)}</ul>
        {session.error && <p role="alert" className="hs-error">{session.error}</p>}
        <DeviceSwitch current={device} />
      </main>
    </div>;
  }

  const allowed = screens.filter(s => !s.personas.length || s.personas.includes(session.person!.id));
  const ownScreen = allowed.find(s => !s.group) ?? allowed[0];
  const permitted = allowed.includes(screen);
  const railButton = (s: ScreenDef) => <button key={s.id} type="button" aria-current={s.id === screen.id ? 'page' : undefined} onClick={() => go(s)}>{NAV_ICON[s.id] && <Icon name={NAV_ICON[s.id]} />}<span>{s.name}{!s.component && <small> · planned</small>}</span></button>;
  const Screen = permitted ? screen.component : undefined;
  const tabs = info.tabs;
  // Supervisor web: the side panel runs to the top-left corner and carries the product and company.
  const side = device === 'web';
  // Phone apps: the section tabs sit at the top; sub-screens open from their parent screen.
  const topTabs = phone;
  const parent = screen.parent ? allowed.find(s => s.id === screen.parent) : undefined;
  const railTint = showBrand && brand.rail_tint ? { borderInlineStart: `4px solid ${brand.primary}` } : undefined;
  const rail = <nav className="hs-rail" aria-label={`${info.name} screens`} style={side ? undefined : railTint}>
    {allowed.filter(s => !s.group).map(railButton)}
    {allowed.some(s => s.group === 'admin') && <p className="hs-rail-group">Admin</p>}
    {allowed.filter(s => s.group === 'admin').map(railButton)}
    <DeviceSwitch current={device} personId={session.person.id} />
  </nav>;
  const tabBar = tabs && <nav className="hs-tabs" data-place={topTabs ? 'top' : undefined} aria-label="Sections" lang={lang} dir={langOf(lang).dir}>
    {tabs.map(([id, label]) => {
      const first = allowed.find(s => s.tab === id);
      return <button key={id} type="button" disabled={!first} aria-current={screen.tab === id ? 'page' : undefined} onClick={() => first && go(first)}>{device === 'worker' ? tr(`tab.${id}`, lang).text : label}</button>;
    })}
  </nav>;
  return <div className="hs-shell" data-theme={info.theme} data-device={device} data-layout={side ? 'side' : undefined}>
    <a href="#hs-main" className="skip-link">Skip to screen</a>
    {side && <aside className="hs-sidebar" style={railTint}>
      <div className="hs-sidebar-brand">
        <img className="hs-logo" src={heatSafeLogo} alt="" width="72" height="72" />
        <p className="hs-product">Heat-Safe Crew</p>
        {!['stop-work', 'alert'].includes(screen.id) && <p className="hs-company">{brand?.name ?? session.person.organisation}</p>}
      </div>
      {rail}
    </aside>}
    <header className="hs-bar">
      {!side && showBrand && <BrandMark palette={brand} />}
      {!side && <img className="hs-logo" src={heatSafeLogo} alt="" width="72" height="72" />}
      {!side && <strong>Heat-Safe Crew</strong>}
      <span className="hs-muted">{info.name}</span>
      {session.caseView && <span className="hs-muted"><LiveClock view={session.caseView} /></span>}
      <span className="hs-grow" />
      {account
        ? <button type="button" className="hs-me" aria-current={screen.id === 'account' ? 'page' : undefined} aria-label={`My account: ${session.person.name}`} onClick={() => go(account)}><Avatar id={session.person.id} size={phone ? 'md' : undefined} /><span>{session.person.name}</span></button>
        : <span className="hs-person"><Avatar id={session.person.id} /><span>{session.person.name}</span></span>}
      <button type="button" className="hs-link" disabled={session.busy} onClick={() => void session.signOut()}>Sign out</button>
      {onLockAccess && <button type="button" className="hs-link" onClick={onLockAccess}>Lock access</button>}
    </header>
    {tabs && topTabs && tabBar}
    <div className="hs-body">
      {!side && !topTabs && rail}
      <main id="hs-main" tabIndex={-1} className="hs-main">
        {session.error && <p role="alert" className="hs-error">{session.error} <button type="button" className="hs-link" onClick={() => void session.refreshCase()}>Retry</button></p>}
        {session.feedback && <p role="status" className="hs-ok">{session.feedback}</p>}
        {permitted && parent && <button type="button" className="hs-link hs-back" lang={lang} dir={langOf(lang).dir} onClick={() => go(parent)}>‹ {device === 'worker' && parent.tab ? tr(`tab.${parent.tab}`, lang).text : parent.name}</button>}
        {!permitted ? <section className="hs-screen"><h1>This screen belongs to another role</h1>{device === 'site' && screen.id === 'headcount' && session.person.id === 'C05' && <p>Your own arrival is {session.caseView?.headcount?.arrivals.some(a => a.person_id === 'C05') ? 'recorded' : 'not yet recorded'}. Huda confirms the full crew headcount.</p>}<button type="button" className="hs-button" onClick={() => ownScreen ? go(ownScreen) : navigate(session.person?.id.startsWith('C') ? '/worker/now' : '/web/monitoring')}>Go to my screen</button></section> : Screen ? <Screen session={session} /> : <Placeholder screen={screen} session={session} />}
      </main>
    </div>
    {tabs && !topTabs && tabBar}
  </div>;
}

function DeviceSwitch({ current, personId }: { current: Device; personId?: string }) {
  return <p className="hs-switch">
    {(Object.keys(DEVICE_INFO) as Device[]).filter(d => d !== current && (!personId || screensFor(d).some(s => s.personas.includes(personId)))).map(d => <button key={d} type="button" className="hs-link" onClick={() => navigate(`/${d}`)}>{DEVICE_INFO[d].name}</button>)}
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

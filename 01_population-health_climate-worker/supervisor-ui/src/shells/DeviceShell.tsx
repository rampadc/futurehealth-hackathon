import { langOf, tr, useWorkerLanguage } from '../i18n';
import { navigate } from '../router';
import { useCaseSession } from '../session';
import { PERSONAS } from '../story';
import { DEVICE_INFO, findScreen, screensFor, type Device, type ScreenDef } from '../screens/registry';
import { Placeholder } from '../screens/Placeholder';
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

  if (session.initialising) return <div className="hs-shell" data-theme={info.theme} data-device={device}><p role="status" className="hs-pad">Loading case…</p></div>;

  if (!session.person) {
    const users = new Set(screens.flatMap(s => s.personas));
    const people = PERSONAS.filter(p => users.has(p.id));
    return <div className="hs-shell" data-theme={info.theme} data-device={device}>
      <main className="hs-signin">
        <p className="hs-label">Heat-Safe Crew · {info.name}</p>
        <h1>Choose who is using this {phone ? 'phone' : device === 'kiosk' ? 'kiosk' : 'workspace'}</h1>
        <p className="hs-muted">Named sign-in is demo persona selection, not authentication.</p>
        <ul className="hs-people">{people.map(p => <li key={p.id}><button type="button" className="hs-btn" disabled={session.busy} onClick={() => void session.signIn(p)}><b>{p.name}</b><span>{p.role} · {p.organisation}</span></button></li>)}</ul>
        {session.error && <p role="alert" className="hs-error">{session.error}</p>}
        <DeviceSwitch current={device} />
      </main>
    </div>;
  }

  const Screen = screen.component;
  const tabs = info.tabs;
  return <div className="hs-shell" data-theme={info.theme} data-device={device}>
    <a href="#hs-main" className="skip-link">Skip to screen</a>
    <header className="hs-bar">
      <strong>Heat-Safe Crew</strong>
      <span className="hs-muted">{info.name}</span>
      <span className="hs-grow" />
      <span>{session.person.name}</span>
      <button type="button" className="hs-link" disabled={session.busy} onClick={() => void session.signOut()}>Sign out</button>
      {onLockAccess && <button type="button" className="hs-link" onClick={onLockAccess}>Lock access</button>}
    </header>
    <div className="hs-body">
      <nav className="hs-rail" aria-label={`${info.name} screens`}>
        {screens.map(s => <button key={s.id} type="button" aria-current={s.id === screen.id ? 'page' : undefined} onClick={() => go(s)}><b>{s.id.toUpperCase()}</b> {s.name}{!s.component && <small> · planned</small>}</button>)}
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
    <button type="button" className="hs-link" onClick={() => navigate('/')}>Current desktop app</button>
  </p>;
}

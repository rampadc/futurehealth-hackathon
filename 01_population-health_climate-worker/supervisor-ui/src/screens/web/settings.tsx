import { useState } from 'react';
import { ADMIN, PERSONAS } from '../../story';
import { Badge, Head, List, Note, Row, Section, Avatar } from '../kit';
import type { ScreenProps } from '../registry';
import { BrandingSettings } from './branding';

type Tab = 'branding' | 'people';
const TABS: Array<[Tab, string]> = [['branding', 'Organisation branding'], ['people', 'People and roles']];
const initialTab = (): Tab => (window.location.hash === '#people' ? 'people' : 'branding');

/** Admin settings: organisation-wide configuration, kept apart from the case screens. */
export function AdminSettingsScreen({ session }: ScreenProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const admin = session.person?.id === ADMIN.id;
  const select = (next: Tab) => { setTab(next); window.history.replaceState(null, '', `#${next}`); };
  return <div className="hs-screen">
    <Head kicker="Admin" title="Admin settings" sub={admin ? 'Organisation-wide settings. Changes apply to every surface.' : `Read only. ${ADMIN.name}, the organisation admin, makes changes.`} />
    <div role="tablist" aria-label="Settings sections" className="hs-settings-tabs">
      {TABS.map(([id, label]) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`settings-${id}`} onClick={() => select(id)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`settings-${tab}`} aria-labelledby={`settings-tab-${tab}`}>
      {tab === 'branding' ? <BrandingSettings session={session} /> : <PeopleAndRoles />}
    </div>
  </div>;
}

function PeopleAndRoles() {
  return <div className="hs-settings-panel">
    <Section title="People in this demo" hint={`${PERSONAS.length + 1} named roles`}>
      <List label="People and roles">
        {[...PERSONAS, ADMIN].map(p => <Row key={p.id} lead={<Avatar id={p.id} size="md" />} title={`${p.name} · ${p.role}`} detail={`${p.organisation} · ${p.description}`} badge={p.id === ADMIN.id ? <Badge tone="done">Admin</Badge> : undefined} />)}
      </List>
    </Section>
    <Note>Sign-in is demo persona selection, not authentication. Who may record each case action is fixed by the case rules on the server, not edited here.</Note>
  </div>;
}

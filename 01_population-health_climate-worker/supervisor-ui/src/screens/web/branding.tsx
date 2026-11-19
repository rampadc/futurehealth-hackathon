import { useEffect, useState } from 'react';
import type { BrandCheck, BrandPalette, BrandSettings } from '../../contract';
import { live } from '../../live';
import { time } from '../data';
import { Badge, Computed, CtaBar, Draft, Empty, Hero, List, Metric, Note, Row, Section, ConfirmDialog } from '../kit';
import type { ScreenProps } from '../registry';

const EXAMPLE: BrandPalette = { name: 'Sandline', primary: '#1F3A5F', on_primary: '#FFFFFF', logo_text: 'SANDLINE', rail_tint: false };
type Surface = 'platform' | 'mobile';
const SURFACES: Array<[Surface, string, string]> = [
  ['platform', 'Platform', 'Supervisor web'],
  ['mobile', 'Mobile web', 'Site app, worker app and kiosk'],
];

/** Brand bar sample: the only place a company colour appears besides the logo mark. */
export function BrandMark({ palette }: { palette: BrandPalette }) {
  return <span className="hs-brandmark" style={{ background: palette.primary, color: palette.on_primary }}>{palette.logo_text}</span>;
}

/** Organisation branding (an admin settings section): company colours on every surface without weakening a safety signal. */
export function BrandingSettings({ session }: ScreenProps) {
  const admin = session.person?.id === 'P09';
  const [published, setPublished] = useState<BrandSettings | null>(null);
  const [draft, setDraft] = useState<Record<Surface, BrandPalette> | null>(null);
  const [checks, setChecks] = useState<Record<Surface, BrandCheck[]> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    live.brand().then(b => { setPublished(b); setDraft(b.platform && b.mobile ? { platform: b.platform, mobile: b.mobile } : null); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (!draft) { setChecks(null); return; }
    const timer = window.setTimeout(() => { live.checkBrand(draft.platform, draft.mobile).then(setChecks).catch(e => setError(e.message)); }, 250);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const passing = !!checks && [...checks.platform, ...checks.mobile].every(c => c.ok);
  const change = (surface: Surface, key: keyof BrandPalette, value: string | boolean) => { setSaved(''); setDraft(d => d && { ...d, [surface]: { ...d[surface], [key]: value } }); };
  const publish = async () => {
    if (!draft || !published) return;
    setConfirming(false); setError('');
    try {
      const next = await live.publishBrand(draft.platform, draft.mobile, published.version, 'PUBLISH');
      setPublished(next); setSaved(`Published version ${next.version}`);
      window.dispatchEvent(new Event('hs-brand-change'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Publishing failed'); }
  };

  return <div className="hs-settings-panel">
    <p className="hs-muted">Put the company’s colours on the platform and the mobile web apps without weakening any safety signal.</p>
    <Hero>
      <Metric label="Published" value={published?.version ? `v${published.version}` : 'None'} sub={published?.published_at ? `${time(published.published_at)} · ${published.published_by}` : 'Heat-Safe paper and ink'} />
      <Metric label="Guardrails" value={!checks ? '—' : passing ? 'All pass' : 'Failing'} sub="contrast and signal colours" tone={!checks ? undefined : passing ? 'ok' : 'red'} />
      <Metric label="Who can publish" value="Admin" sub={admin ? 'You' : 'Hessa Al Qamar (P09)'} />
    </Hero>
    {error && <p role="alert" className="hs-error">{error}</p>}
    {saved && <p role="status" className="hs-ok">{saved}</p>}
    {!draft ? <Empty action={admin ? <button type="button" className="hs-button is-primary" onClick={() => setDraft({ platform: EXAMPLE, mobile: EXAMPLE })}>Start with an example palette</button> : undefined}>
      No company palette yet. Every surface uses Heat-Safe paper and ink until the admin adds one.
    </Empty> : <>
      <div className="hs-grid">{SURFACES.map(([surface, title]) => <Section key={surface} title={title}>
        <fieldset className="hs-form" disabled={!admin}>
          <label className="hs-field">Name<input value={draft[surface].name} onChange={e => change(surface, 'name', e.target.value)} /></label>
          <div className="hs-form-row">
            <label className="hs-field">Brand colour<input type="color" value={draft[surface].primary} onChange={e => change(surface, 'primary', e.target.value.toUpperCase())} /></label>
            <label className="hs-field">Text on brand<input type="color" value={draft[surface].on_primary} onChange={e => change(surface, 'on_primary', e.target.value.toUpperCase())} /></label>
          </div>
          <label className="hs-field">Logo text<input value={draft[surface].logo_text} maxLength={40} onChange={e => change(surface, 'logo_text', e.target.value)} /></label>
          <label className="hs-option"><input type="checkbox" checked={draft[surface].rail_tint} onChange={e => change(surface, 'rail_tint', e.target.checked)} /> Tint the navigation rail</label>
        </fieldset>
        <List label={`${title} guardrails`}>{(checks?.[surface] ?? []).map(c => <Row key={c.id} title={c.label} badge={<Badge tone={c.ok ? 'done' : 'over'}>{c.ok ? 'Pass' : 'Fails'}</Badge>} />)}</List>
      </Section>)}</div>
      <Section title="Preview · draft">
        <Draft title="Draft · not published">
          <div className="hs-previews">{(['day', 'glare', 'night'] as const).map(theme => <div key={theme} data-theme={theme} className="hs-preview">
            <span className="hs-label">{theme}</span>
            <div className="hs-preview-bar"><BrandMark palette={draft.platform} /><span>Supervisor web</span></div>
            <div className="hs-preview-bar"><BrandMark palette={draft.mobile} /><span>Site and worker apps</span></div>
            <span className="hs-hold">Heavy-work hold</span>
          </div>)}</div>
        </Draft>
      </Section>
      <Section title="Where the brand appears">
        <List>
          <Row title="Brand bar and logo mark" detail="Every screen header." badge={<Badge tone="done">Yes</Badge>} />
          <Row title="Stamps, bands, buttons and charts" detail="Safety signals keep Heat-Safe colours." badge={<Badge tone="muted">Never</Badge>} />
          <Row title="Stop-work and emergency screens" detail="The stop-work instruction and the worker alert drop the brand entirely." badge={<Badge tone="muted">Never</Badge>} />
        </List>
      </Section>
      {admin ? <CtaBar note="Publishing changes every signed-in surface.">
        <button type="button" className="hs-button is-primary" disabled={!passing} onClick={() => setConfirming(true)}>Publish branding</button>
      </CtaBar> : <Note>Only the organisation admin can publish branding.</Note>}
    </>}
    {confirming && <ConfirmDialog title="Publish this branding?" body="Every supervisor, site and worker screen picks it up straight away. Safety colours do not change." onCancel={() => setConfirming(false)} onConfirm={() => void publish()} />}
    <Computed>Guardrails run on the server before anything is saved.</Computed>
  </div>;
}

import type { ReactNode } from 'react';
import { En, useT, useWorker } from './frame';

type Tr = ReturnType<typeof useT>;

/** A work/rest rate from the heat-stress rules, e.g. "45 min work / 15 min rest". */
function workRest(text: string, t: Tr) {
  const s = text.trim().toLowerCase();
  if (s === 'continuous self-paced') return t('wr.cont');
  if (s === 'continuous self-paced light work') return t('wr.contLight');
  const m = s.match(/^(\d+) min work \/ (\d+) min rest$/);
  return m ? t('wr.ratio', { work: m[1], rest: m[2] }) : null;
}

/** A fluid rate in litres an hour: "1.0-1.2" or "more than 1.2". */
function fluid(text: string, t: Tr) {
  const more = text.match(/^more than ([\d.]+)$/);
  if (more) return t('fl.more', { n: more[1] });
  return /^[\d.]+(-[\d.]+)?$/.test(text) ? text : null;
}

const ZONES = ['low', 'medium', 'high'];
const zone = (text: string, t: Tr) => ZONES.includes(text.toLowerCase()) ? t(`zone.${text.toLowerCase()}`) : null;
const MISSING: Record<string, string> = { 'site heat': 'm.site', wearable: 'm.wearable', 'local heat reading': 'm.local' };

const FIXED: Record<string, string> = {
  'Stop now and call for help. Your buddy stays with you.': 'a.emergency',
  'Stop work, rest in the cooled shelter and tell your foreman.': 'a.rest',
  'Low zone work only while you acclimatise. Ask your foreman for covered work.': 'a.lowzone',
  'Work only with special controls: a cooling garment and short exposures.': 'a.special',
  'Work as planned and drink regularly.': 'a.green',
  'You reported feeling unwell': 'f.unwell',
  'You have drunk less than this heat needs': 'f.lowfluid',
  'A health condition on your record lowers your heat tolerance': 'f.condition',
  'Your heart rate has kept rising at the same work': 'f.hr',
  'Site heat unknown': 'risk.siteUnknown',
};

/**
 * The worker's own heat-risk action or reason, sent by the server in English, in the worker's language.
 * Only the rule engine's fixed sentences are recognised; anything else stays in English and is marked so.
 */
export function riskText(text: string, t: Tr): ReactNode | null {
  if (FIXED[text]) return t(FIXED[text]);
  let m = text.match(/^Paced work: (.+)\. Drink (.+) litres an hour\.$/);
  if (m) { const wr = workRest(m[1], t), fl = fluid(m[2], t); return wr && fl ? t('a.paced', { workrest: wr, fluid: fl }) : null; }
  m = text.match(/^Drink now, then (.+) litres an hour\. (.+)\.$/);
  if (m) { const fl = fluid(m[1], t), wr = workRest(m[2], t); return wr && fl ? t('a.drink', { workrest: wr, fluid: fl }) : null; }
  m = text.match(/^Strict work and rest: (.+)\. Drink every 15 minutes\. Stop and tell your supervisor if you feel unwell\.$/);
  if (m) { const wr = workRest(m[1], t); return wr ? t('a.strict', { workrest: wr }) : null; }
  m = text.match(/^(Low|Medium|High) zone in the sun at (\d\d:\d\d) for your clothing \(TWL (\d+) W\/m²\)$/);
  if (m) return t('risk.zone', { zone: zone(m[1], t)!, hour: m[2], twl: m[3] });
  m = text.match(/^.+ lower your work limit to (\d+) W\/m² \((\w+) zone; work wear is (\w+)\)$/);
  if (m) { const z = zone(m[2], t), site = zone(m[3], t); return z && site ? t('f.clothing', { twl: m[1], zone: z, site }) : null; }
  m = text.match(/^Set one level higher because (.+) (?:is|are) missing$/);
  if (m) {
    const parts = m[1].split(' and ').map(p => MISSING[p] ? t(MISSING[p]) : null);
    return parts.every(Boolean) ? t('f.missing', { list: parts.join(', ') }) : null;
  }
  m = text.match(/^Still acclimatising: (.+)$/);
  if (m) {
    const [before, after] = t('f.accl').split('{reason}');
    return <>{before}<En>{m[1]}</En>{after}</>;
  }
  return null;
}

/** Server risk text in the worker's language, or the English marked as untranslated. */
export function RiskText({ text }: { text: string }) {
  const { lang } = useWorker();
  const t = useT();
  if (lang === 'en') return <>{text}</>;
  return <>{riskText(text, t) ?? <En>{text}</En>}</>;
}

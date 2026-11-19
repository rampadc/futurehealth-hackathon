import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CaseView } from '../live';
import { initialStory } from '../story';
import { ActivityLog, noticesFor, pathForAction } from './Notifications';

const view = (patch: Partial<CaseView> = {}): CaseView => ({
  case_id: 'case-1', version: 3, clock: '2025-08-04T08:05:00+04:00', capture: null,
  story: { ...initialStory(), issued: true, events: [
    { id: 'issue', actorId: 'P03', title: 'Maya instructed the crew to stop heavy trench work', occurred_at: '2025-08-04T08:00:01+04:00' },
    { id: 'escalate', actorId: 'system', title: 'Stop-work acknowledgment overdue; escalation recorded', occurred_at: '2025-08-04T08:02:01+04:00' },
    { id: 'report', actorId: 'C08', title: 'Bilal requested assistance', occurred_at: '2025-08-04T08:03:00+04:00' },
  ] },
  tasks: [
    { action: 'acknowledge', actor_id: 'C01', label: 'Acknowledge stop-work instruction', status: 'ready', due_at: '2025-08-04T08:02:01+04:00' },
    { action: 'escalation_followup', actor_id: 'P02', label: 'Follow up overdue acknowledgment', status: 'ready' },
    { action: 'checkin', actor_id: 'C05', label: 'Check in to cooled recovery', status: 'ready' },
    { action: 'report', actor_id: 'C05', label: 'Report symptoms', status: 'ready' },
  ],
  ...patch,
});

describe('notifications', () => {
  it('lists the person’s open tasks first, linked to the screen that records them', () => {
    const notices = noticesFor(view(), 'C01', 'site', 'en');
    expect(notices[0]).toMatchObject({ action: true, text: 'Acknowledge stop-work instruction', path: '/site/stop-work' });
    expect(notices.filter(n => !n.action).map(n => n.text)).toContain('Maya instructed the crew to stop heavy trench work');
  });

  it('links an escalation to the follow-up screen', () => {
    expect(pathForAction('web', 'P02', 'escalation_followup')).toBe('/web/response');
    expect(noticesFor(view(), 'P02', 'web', 'en').find(n => n.text.startsWith('Stop-work acknowledgment overdue'))?.path).toBe('/web/response');
  });

  it('gives workers crew-wide instructions only, never another worker’s report', () => {
    const notices = noticesFor(view(), 'C05', 'worker', 'en');
    expect(notices.map(n => n.text)).toEqual(['Check in at Shelter A', 'Stop-work instruction issued for heavy trench work']);
    expect(notices[0].path).toBe('/worker/check-in');
  });

  it('shows today’s actions with date and time in an expandable log', () => {
    render(<ActivityLog view={view()} />);
    fireEvent.click(screen.getByText(/Activity log · 4 Aug 2025/));
    expect(screen.getByText('4 Aug 2025 08:00:01 GST')).toBeTruthy();
    expect(screen.getByText(/Maya instructed the crew/)).toBeTruthy();
  });
});

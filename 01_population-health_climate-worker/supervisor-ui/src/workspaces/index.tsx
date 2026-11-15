import type { ComponentType } from 'react';
import { EvidenceAction } from '../EvidenceAction';
import { ForemanWorkspace } from './Foreman';
import { SafetyOfficerWorkspace } from './SafetyOfficer';
import { SuperintendentWorkspace } from './Superintendent';
import { FirstAiderWorkspace, LogisticsWorkspace, PermitWorkspace, ProjectManagerWorkspace } from './Support';
import { WorkerWorkspace } from './Worker';
import type { WorkProps, WorkspaceProps } from './types';

export type { WorkProps } from './types';

export const workspaceTitles: Record<string, string> = {
  P03: 'Heat response', C01: 'Crew coordination', C05: 'Your work and recovery', C08: 'Work and assistance',
  P06: 'First-aid response', P04: 'Permit review', P05: 'Delivery coordination', P02: 'Restart and handover', P01: 'Project review',
};

/** One workspace component per persona. Add a persona here; edit its own file to change it. */
const WORKSPACES: Record<string, ComponentType<WorkspaceProps>> = {
  P03: SafetyOfficerWorkspace,
  C01: ForemanWorkspace,
  C05: WorkerWorkspace,
  C08: WorkerWorkspace,
  P06: FirstAiderWorkspace,
  P04: PermitWorkspace,
  P05: LogisticsWorkspace,
  P02: SuperintendentWorkspace,
};

export function Workspace(props: WorkProps) {
  const { caseView, person, onAction, busy } = props;
  const actions = (ids: string[]) => ids.map(id => <EvidenceAction key={id} action={id} caseView={caseView} person={person} onAction={onAction} busy={busy} />);
  const Component = WORKSPACES[person.id] ?? ProjectManagerWorkspace;
  return <Component {...props} actions={actions} />;
}

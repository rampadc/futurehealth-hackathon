import type { ReactNode } from 'react';
import type { ReplayCapture } from '../replay';
import type { Persona, StoryState } from '../story';
import type { CaseView } from '../live';

export type ActionHandler = (id: string, payload: Record<string, unknown>) => Promise<void>;
export type WorkProps = { story: StoryState; person: Persona; capture: ReplayCapture; caseView: CaseView; onAction: ActionHandler; busy: boolean };
/** Renders the evidence buttons for the listed case actions. */
export type ActionsRenderer = (ids: string[]) => ReactNode;
export type WorkspaceProps = WorkProps & { actions: ActionsRenderer };

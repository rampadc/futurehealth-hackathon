import { Box, Stack, Typography } from '@mui/material';
import { Panel } from '../shared/ui';
import type { WorkspaceProps } from './types';

/** P06 · Salim, first aider. */
export function FirstAiderWorkspace({ story, actions }: WorkspaceProps) {
  return <Panel title="First-aid contact"><Typography sx={{ mb: 2 }}>{story.reported ? 'Bilal needs assistance. Huda confirms removal and location; record your contact separately.' : 'No assistance request is open in this case yet.'}</Typography>{actions(['firstaid'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Clinical notes stay outside the shared operations record.</Typography></Panel>;
}

/** P04 · Tariq, permit coordinator. */
export function PermitWorkspace({ actions }: WorkspaceProps) {
  return <Panel title="Permit check for trench restart"><Typography sx={{ mb: 2 }}>Confirm the permit check after Huda has recorded the fresh local reading. Rashid retains the restart review.</Typography>{actions(['permit'])}</Panel>;
}

/** P05 · Noura, logistics coordinator. */
export function LogisticsWorkspace({ story, actions }: WorkspaceProps) {
  return <Panel title="Move the materials delivery"><Stack direction="row" spacing={5} sx={{ mb: 3 }}><Box><Typography variant="overline">Current booking</Typography><Typography variant="h4">{story.deliveryAccepted ? '15:30' : '11:30'}</Typography></Box><Box><Typography variant="overline">Requested slot</Typography><Typography variant="h4" color="primary">15:30</Typography></Box></Stack>
    <Typography color="text.secondary" sx={{ mb: 2 }}>The receiving yard is constrained. Keep the original booking until supplier acceptance is recorded.</Typography>{actions(['draftDelivery', 'approveDelivery', 'sendDelivery', 'acceptDelivery'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Acceptance confirms the booking; arrival and unloading remain unconfirmed.</Typography>
  </Panel>;
}

/** P01 · Amal, project manager. */
export function ProjectManagerWorkspace({ actions }: WorkspaceProps) {
  return <Panel title="Project impact review"><Typography sx={{ mb: 2 }}>Review the shared chronology and the accepted delivery change after Rashid’s handover. Payroll, supplier charges and reimbursement remain unverified.</Typography>{actions(['costReview'])}<Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No cost estimate or commercial entitlement is created by this action.</Typography></Panel>;
}

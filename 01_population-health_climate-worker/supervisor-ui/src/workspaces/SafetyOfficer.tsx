import { Box, Stack, Typography } from '@mui/material';
import { ThermalWorkLimit } from '../ThermalWorkLimit';
import { timeLabel } from '../Timeline';
import { LaterStep, Panel, isReady } from '../shared/ui';
import type { WorkspaceProps } from './types';

/** P03 · Maya, safety officer. Screens: heat controls and fresh reading. */
export function SafetyOfficerWorkspace({ story, capture, caseView, actions }: WorkspaceProps) {
  const reading = capture.request.snapshot.readings[0];
  return <Stack spacing={3}>
    <Panel title="Civil trench conditions">
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 3, alignItems: 'start' }}>
        <ThermalWorkLimit reading={reading} decisionAt={capture.response.decision_at} />
        <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', pl: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Heavy trench work</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>{capture.response.heat.controls.find(control => control.task_id === 'civil_heavy')?.reason_codes.includes('twl_heavy_limit') ? story.issued ? 'The site’s heavy-work heat limit was reached. The stop-work instruction is recorded; the environmental band does not release it.' : 'The site’s heavy-work heat limit is reached. Stop heavy trench work even though the environmental band is green.' : 'The stop-work instruction remains active. Fresh local evidence and a separate review are required.'}</Typography>
          <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>Site task rule · assessed {timeLabel(capture.response.decision_at)} GST</Typography>
          {actions(['issue'])}
        </Box>
      </Box>
    </Panel>
    <LaterStep title="Prepare the restart evidence" ready={isReady(caseView, 'fresh') || story.fresh}><Typography color="text.secondary" sx={{ mb: 1 }}>After the crew response and first-aid handoff, record the fresh local evidence for a separate restart review.</Typography>{actions(['fresh', 'water'])}</LaterStep>
  </Stack>;
}

import { useEffect, useMemo, useRef } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import type { TimelineItem, TimelineOptions } from 'vis-timeline';
import moment from 'moment';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { dayEnd, dayStart, workScheduleModel } from './workScheduleModel';
import './WorkSchedule.css';

type Props = {
  state: any;
  contractor: string;
  selectedTaskId: string | null;
  earlyWindowSuggested: boolean;
  proposalLabel: string;
  accepted: boolean;
  onOpen: (id: string, trigger: HTMLButtonElement) => void;
};

export function WorkSchedule({ state, contractor, selectedTaskId, earlyWindowSuggested, proposalLabel, accepted, onOpen }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<Timeline | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const selectedTaskIdRef = useRef(selectedTaskId);
  selectedTaskIdRef.current = selectedTaskId;
  const model = useMemo(() => workScheduleModel(state, contractor, earlyWindowSuggested, proposalLabel, accepted), [state, contractor, earlyWindowSuggested, proposalLabel, accepted]);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!container.current) return;
    const options: TimelineOptions = {
      start: dayStart, end: dayEnd, min: dayStart, max: dayEnd,
      showCurrentTime: false, zoomMin: 60 * 60 * 1000, zoomMax: 9 * 60 * 60 * 1000, showMajorLabels: false, moveable: true, zoomable: true,
      editable: false, selectable: false, stack: false, verticalScroll: false,
      groupOrder: 'order', groupHeightMode: 'fixed', margin: { item: { horizontal: 4, vertical: 8 }, axis: 12 },
      orientation: 'top', moment: date => moment(date).utcOffset(240),
      groupTemplate: group => {
        const wrapper = document.createElement('div');
        wrapper.className = 'work-group-label';
        const name = document.createElement('strong');
        name.textContent = group?.content || '';
        const owner = document.createElement('span');
        owner.textContent = group?.title || '';
        wrapper.append(name, owner);
        return wrapper;
      },
      template: item => {
        const entry = item as TimelineItem;
        if (entry.type === 'background' || entry.id === 'suggested-civil-heavy') {
          const text = document.createElement('span');
          text.textContent = String(entry.content || '');
          return text;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'work-item-button';
        button.dataset.scheduleId = String(entry.id).startsWith('delivery-') ? 'delivery' : String(entry.id);
        button.classList.toggle('is-selected', button.dataset.scheduleId === selectedTaskIdRef.current);
        button.setAttribute('aria-pressed', String(button.dataset.scheduleId === selectedTaskIdRef.current));
        const label = document.createElement('strong');
        label.textContent = String(entry.content);
        const detail = document.createElement('span');
        detail.textContent = entry.type === 'range' ? (entry.title || '').split(' · ').slice(1).join(' · ') : '';
        button.setAttribute('aria-label', `${entry.title}. View details`);
        button.append(label, detail);
        return button;
      },
    };
    const instance = new Timeline(container.current, modelRef.current.items, modelRef.current.groups, options);
    instance.addCustomTime(new Date(state.clock), 'scenario-clock');
    instance.setCustomTimeTitle('Site time', 'scenario-clock');
    timeline.current = instance;
    return () => { instance.destroy(); timeline.current = null; };
  }, []);

  useEffect(() => {
    timeline.current?.setData({ items: model.items, groups: model.groups });
    if (Number.isFinite(Date.parse(state.clock))) timeline.current?.setCustomTime(new Date(state.clock), 'scenario-clock');
  }, [model, state.clock]);

  useEffect(() => {
    container.current?.querySelectorAll<HTMLButtonElement>('button[data-schedule-id]').forEach(button => {
      const selected = button.dataset.scheduleId === selectedTaskId;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }, [selectedTaskId, model]);

  return <div className="work-schedule">
    <div className="work-toolbar"><span>Mon 4 Aug 2025 · GST</span><div role="group" aria-label="Timeline controls"><button type="button" onClick={() => timeline.current?.zoomIn(.35)}>Zoom in +</button><button type="button" onClick={() => timeline.current?.zoomOut(.35)}>Zoom out −</button><button type="button" onClick={() => timeline.current?.setWindow(dayStart, dayEnd, { animation: false })}>Full day</button></div></div>
    <div className="work-timeline" ref={container} aria-label="Contractor work timeline" onClick={event => {
      const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-schedule-id]');
      if (trigger) onOpenRef.current(trigger.dataset.scheduleId!, trigger);
    }}/>
    <p className="work-hint">Select work for details · Drag timeline to pan</p>
  </div>;
}

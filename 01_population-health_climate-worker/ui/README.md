# Heat-Safe — Project Sandline UI

A local, synthetic operations workspace for the Project Sandline heat-response fixtures. There is no backend, live sensor feed, model call or operational safety approval.

## Run

Requires Node.js 22.12+ and npm. Run these commands from this `ui/` directory.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ for the stakeholder workspace. The server uses a fixed port and fails if another process already occupies it. Open `/presenter` in another tab for scenario selection and replay controls. The two views share state through localStorage and BroadcastChannel, so the operator view updates when the presenter advances an event.

## Demo path

Choose case **02**, apply each external event, and record the named human actions. Once complete, load the next connected case **03**, then **04** and **10**. This carries the current site state across cases. Case **06** is a standalone sensor-failure demonstration. Reset restores the selected case's standalone starting state.

The operator workspace shows current case status, local measurements, task assignments, case chronology, reference site data, policy classifications and an inspectable response graph. It can record a pending named action, but external event injection and scenario resets are controlled from `/presenter`.

All people, measurements, companies and actions are authored synthetic fixtures in `../demo`. The policy drawer distinguishes published requirements from invented site rules. Replay completion means fixture checks passed, not that a real site has clearance to restart work.

## Verify

```sh
npm test
npm run build
```

Browser checks require Google Chrome and a running `npm run dev` on port 5173. Run `npm run test:browser` in another terminal. These scripts exercise all ten scenarios, the connected journey, wrong-actor rejection, policy drawer, graph inspection, tab synchronisation, refresh, tablet overflow and absence of external requests.

The browser scripts may need updates when interaction flows change; unit tests and the production build are the primary automated checks.

Presenter clock controls can deliberately invalidate scheduled fixture events. If time is advanced beyond an event timestamp, the event is blocked; reset to replay the authored sequence.

## Design and operational intent

See [design notes](DESIGN_NOTES.md) for the gap analysis against the discovery brief and opportunity plan, Tracecat source reference and environmental-band/site-hold distinction. First launch starts with the synthetic 145 W/m² signal; the HSE decision is pending. Human decisions stage automatically; they are never applied automatically. Presenter reset returns to the standalone baseline.

## Live demonstration

Open `/presenter` alongside the workspace. The feed emits authored signals automatically; Play/Pause and speed are shared across presenter tabs. It pauses at a human decision. Use the workspace’s named action button and appropriate actor to approve or confirm; the feed resumes afterward and carries state/evidence through the connected journey. Assistant activity is scripted contextual preparation, not a live model call. Policy rules enforce holds and block invalid actions independently.

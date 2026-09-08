import React, { useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Text,
  TextArea,
  Toggle,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const RECENT_LIMIT = 20;

const PREVIEW_VARS = {
  issueKey: 'PROJ-42',
  actorDisplayName: 'Jamie Rivers',
  issueSummary: 'Ship the follow-up demo',
};

// Human-friendly labels for the "Insert variable" buttons. The button text
// stays short and readable ("+ Person's name") while the raw {{token}} is
// shown on hover via the button's `title` tooltip.
const VARIABLE_LABELS = {
  issueKey: "Issue key",
  actorDisplayName: "Person's name",
  issueSummary: 'Issue summary',
};

const humanLabel = (key) => VARIABLE_LABELS[key] || key;

function renderPreview(template) {
  const src = typeof template === 'string' && template.length > 0 ? template : '';
  return src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = PREVIEW_VARS[key];
    return v == null ? '' : String(v);
  });
}

const App = () => {
  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data
  const [projects, setProjects] = useState([]); // [{key, name, avatarUrl}]
  const [configuredRows, setConfiguredRows] = useState([]);
  const [combinedAudit, setCombinedAudit] = useState([]);
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [placeholders, setPlaceholders] = useState([]);

  // Editor form state
  const [selectedProjectKey, setSelectedProjectKey] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [triggerStatusId, setTriggerStatusId] = useState(null);
  const [triggerStatusName, setTriggerStatusName] = useState(null);
  const [template, setTemplate] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  // Opt-in gate — a space only receives follow-ups when this is true AND a
  // trigger status is picked.
  const [enabled, setEnabled] = useState(false);

  // Save state
  const [saveState, setSaveState] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);

  // Initial load: projects + configured summary + combined audit + default template.
  useEffect(() => {
    Promise.all([
      invoke('getProjects', {}),
      invoke('getAllConfigs', {}),
      invoke('getProjectAudit', {}),
      invoke('getConfig', { projectKey: '__seed__' }), // just to grab defaultTemplate + placeholders
    ])
      .then(([pRes, aRes, auRes, cRes]) => {
        if (pRes?.ok) setProjects(pRes.projects || []);
        else if (pRes) setError(pRes.error || 'Could not load Jira spaces.');
        if (aRes?.ok) {
          setConfiguredRows(aRes.rows || []);
        }
        if (auRes?.ok) setCombinedAudit(auRes.entries || []);
        if (cRes?.ok) {
          setDefaultTemplate(cRes.defaultTemplate || '');
          setPlaceholders(cRes.placeholders || []);
          if (!template) setTemplate(cRes.defaultTemplate || '');
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a space is picked, fetch its statuses + existing config in parallel.
  useEffect(() => {
    if (!selectedProjectKey) return;
    setStatusesLoading(true);
    Promise.all([
      invoke('getStatuses', { projectKey: selectedProjectKey }),
      invoke('getConfig', { projectKey: selectedProjectKey }),
    ])
      .then(([sRes, cRes]) => {
        if (sRes?.ok) setStatuses(sRes.statuses || []);
        else setStatuses([]);
        if (cRes?.ok) {
          if (cRes.config) {
            setTriggerStatusId(cRes.config.triggerStatusId || null);
            setTriggerStatusName(cRes.config.triggerStatusName || null);
            setTemplate(cRes.config.template || defaultTemplate || '');
            setIsCustom(true);
            setEnabled(cRes.config.enabled === true);
          } else {
            setTriggerStatusId(null);
            setTriggerStatusName(null);
            setTemplate(defaultTemplate || '');
            setIsCustom(false);
            setEnabled(false);
          }
        }
      })
      .finally(() => setStatusesLoading(false));
  }, [selectedProjectKey, defaultTemplate]);

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        label: `${p.name}  (${p.key})`,
        value: p.key,
      })),
    [projects],
  );
  const selectedProjectOption = useMemo(
    () => projectOptions.find((o) => o.value === selectedProjectKey) || null,
    [projectOptions, selectedProjectKey],
  );
  const statusOptions = useMemo(
    () =>
      // Show just the status name exactly as configured in Jira. Category
      // (To Do / In Progress / Done) is metadata used for sorting the list
      // — surfacing it in the label reads like a rendering bug to users,
      // especially on custom statuses where the category rarely matches
      // the intent (e.g. "QA Review" bucketed under "In Progress").
      statuses.map((s) => ({
        label: s.name,
        value: s.id,
      })),
    [statuses],
  );
  const selectedStatusOption = useMemo(
    () => statusOptions.find((o) => o.value === triggerStatusId) || null,
    [statusOptions, triggerStatusId],
  );
  const preview = useMemo(() => renderPreview(template), [template]);

  const refreshSummary = async () => {
    const [aRes, auRes] = await Promise.all([
      invoke('getAllConfigs', {}),
      invoke('getProjectAudit', {}),
    ]);
    if (aRes?.ok) setConfiguredRows(aRes.rows || []);
    if (auRes?.ok) setCombinedAudit(auRes.entries || []);
  };

  const onSave = async () => {
    if (!selectedProjectKey) return;
    // Enabling requires a status; disabling can save without one.
    if (enabled && !triggerStatusId) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await invoke('saveConfig', {
        projectKey: selectedProjectKey,
        enabled,
        triggerStatusId,
        triggerStatusName,
        template,
      });
      if (res?.ok) {
        setIsCustom(true);
        setEnabled(res.isEnabled === true);
        setSaveState('saved');
        refreshSummary();
        setTimeout(() => setSaveState(null), 2500);
      } else {
        setSaveState('error');
        setSaveError(res?.error || 'Save failed.');
      }
    } catch (e) {
      setSaveState('error');
      setSaveError(String(e));
    }
  };

  const onReset = async () => {
    if (!selectedProjectKey) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await invoke('resetConfig', { projectKey: selectedProjectKey });
      if (res?.ok) {
        setTriggerStatusId(null);
        setTriggerStatusName(null);
        setTemplate(res.defaultTemplate || '');
        setIsCustom(false);
        setEnabled(false);
        setSaveState('saved');
        refreshSummary();
        setTimeout(() => setSaveState(null), 2500);
      } else {
        setSaveState('error');
        setSaveError(res?.error || 'Reset failed.');
      }
    } catch (e) {
      setSaveState('error');
      setSaveError(String(e));
    }
  };

  if (loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="small" />
        <Text>Loading…</Text>
      </Inline>
    );
  }

  return (
    <Stack space="space.400">
      <Stack space="space.050">
        <Text>
          Follow-ups are <Strong>off by default</Strong>. Pick a Jira space
          below, then flip <Strong>"Enable follow-ups for this space"</Strong>
          to opt it in and choose which status should fire the comment.
        </Text>
      </Stack>

      {error && (
        <SectionMessage appearance="error" title="Could not load Jira spaces">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      {/* Editor */}
      <Stack space="space.200">
        <Heading as="h2">Configure a space</Heading>

        <Stack space="space.100">
          <Text>Space:</Text>
          <Select
            options={projectOptions}
            value={selectedProjectOption}
            onChange={(opt) => setSelectedProjectKey(opt?.value || null)}
            placeholder="Choose a Jira space…"
           
          />
        </Stack>

        {selectedProjectKey && (
          <>
            {/*
              Opt-in toggle — the master switch for this space. When off, no
              follow-up comments fire for this project and no audit rows are
              written. Users can still edit status/template while disabled
              (drafting), but must flip this on and pick a status to save an
              enabled config.
            */}
            <Stack space="space.100">
              <Inline space="space.100" alignBlock="center">
                <Toggle
                  label="Enable follow-ups for this space"
                  isChecked={enabled}
                  onChange={(e) => setEnabled(e?.target?.checked === true)}
                />
                <Text>Enable follow-ups for this space</Text>
                <Lozenge appearance={enabled ? 'success' : 'default'}>
                  {enabled ? 'On' : 'Off'}
                </Lozenge>
              </Inline>
              {!enabled && (
                <Text>
                  Follow-ups are <Strong>off</Strong> for this space. Turn the
                  switch on to start posting comments when issues enter the
                  chosen status.
                </Text>
              )}
            </Stack>

            <Stack space="space.100">
              <Text>Fire when an issue enters this status:</Text>
              <Select
                isDisabled={!enabled || statusesLoading}
                options={statusOptions}
                value={selectedStatusOption}
                onChange={(opt) => {
                  setTriggerStatusId(opt?.value || null);
                  const match = statuses.find((s) => s.id === opt?.value);
                  setTriggerStatusName(match?.name || null);
                }}
                placeholder={statusesLoading ? 'Loading statuses…' : 'Choose a status…'}
                isDisabled={statusesLoading}
              />
            </Stack>

            <Stack space="space.100">
              <Text>Comment template:</Text>
              <TextArea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                isDisabled={!enabled}
                placeholder="Write the follow-up comment. Use the Insert buttons below to add variables."
              />
              {/*
                Proposal A: compact "Insert variable" button row directly under
                the textarea. Clicking a button appends the raw {{token}} to
                the current template value. Hover shows the exact token via
                the button's title tooltip. Template storage / rendering is
                unchanged — this is a UX-only change.
              */}
              <Inline space="space.100" alignBlock="center">
                <Text>Insert variable:</Text>
                {placeholders.map((p) => (
                  <Button
                    key={p.key}
                    appearance="subtle"
                    title={`{{${p.key}}} — ${p.help}`}
                    onClick={() =>
                      setTemplate((prev) => `${prev || ''}{{${p.key}}}`)
                    }
                  >
                    {`+ ${humanLabel(p.key)}`}
                  </Button>
                ))}
              </Inline>
            </Stack>

            <Stack space="space.100">
              <Text>Preview (with sample values):</Text>
              <Box padding="space.200" backgroundColor="color.background.neutral.subtle">
                <Text>{preview || '(empty)'}</Text>
              </Box>
            </Stack>

            <Inline space="space.100" alignBlock="center">
              <Button
                appearance="primary"
                isDisabled={
                  saveState === 'saving' || (enabled && !triggerStatusId)
                }
                onClick={onSave}
              >
                {enabled ? 'Save & enable' : 'Save (disabled)'}
              </Button>
              <Button
                appearance="subtle"
                isDisabled={!isCustom || saveState === 'saving'}
                onClick={onReset}
              >
                Remove configuration
              </Button>
              {saveState === 'saving' && <Text>Saving…</Text>}
              {saveState === 'saved' && <Lozenge appearance="success">Saved</Lozenge>}
              {saveState === 'error' && <Lozenge appearance="removed">Save failed</Lozenge>}
            </Inline>
            {saveError && <Text>{saveError}</Text>}
          </>
        )}
      </Stack>

      {/* Configured-spaces table */}
      <Stack space="space.100">
        <Heading as="h2">Configured spaces</Heading>
        {configuredRows.length === 0 ? (
          <SectionMessage appearance="information">
            <Text>
              No spaces have follow-ups enabled yet. The app is <Strong>off
              for every space</Strong> until you opt one in above.
            </Text>
          </SectionMessage>
        ) : (
          configuredRows.map((r) => (
            <ProjectRow
              key={r.projectKey}
              row={r}
              onOpen={() => setSelectedProjectKey(r.projectKey)}
            />
          ))
        )}
      </Stack>

      {/* Combined audit */}
      <Stack space="space.100">
        <Heading as="h2">Recent follow-ups (all spaces)</Heading>
        {combinedAudit.length === 0 ? (
          <SectionMessage appearance="information">
            <Text>
              No follow-ups have been posted yet. Move an issue into a
              trigger status to see entries appear here.
            </Text>
          </SectionMessage>
        ) : (
          combinedAudit.slice(0, RECENT_LIMIT).map((e, i) => (
            <AuditRow key={i} entry={e} />
          ))
        )}
      </Stack>
    </Stack>
  );
};

function ProjectRow({ row, onOpen }) {
  const cfg = row.config || {};
  const isEnabled = row.isEnabled === true;
  const when = row.lastFiredAt
    ? new Date(row.lastFiredAt).toLocaleString()
    : 'never';
  return (
    <Box padding="space.150" backgroundColor="color.background.neutral.subtle">
      <Stack space="space.050">
        <Inline space="space.100" alignBlock="center">
          <Text><Strong>{row.projectKey}</Strong></Text>
          <Lozenge appearance={isEnabled ? 'success' : 'default'}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Lozenge>
          {cfg.triggerStatusName && (
            <Lozenge appearance="inprogress">
              Trigger: {cfg.triggerStatusName}
            </Lozenge>
          )}
          <Button appearance="link" onClick={onOpen}>
            Edit
          </Button>
        </Inline>
        <Text>
          Follow-ups posted: <Strong>{row.totalFollowUps || 0}</Strong> · Last
          fired: {when}
          {row.lastFiredIssueKey ? ` (${row.lastFiredIssueKey})` : ''}
        </Text>
      </Stack>
    </Box>
  );
}

function AuditRow({ entry }) {
  const when = new Date(entry.timestamp || Date.now()).toLocaleString();
  const outcome = entry.outcome || 'unknown';
  const summary = entry.issueSummary ? ` — ${entry.issueSummary}` : '';
  const actor = entry.actorDisplayName ? ` by ${entry.actorDisplayName}` : '';
  const trigger = entry.triggerStatusName ? ` (${entry.triggerStatusName})` : '';
  const appearance =
    outcome === 'commented' ? 'success' :
    outcome === 'skipped-duplicate' ? 'moved' :
    outcome === 'error' ? 'removed' : 'default';
  return (
    <Inline space="space.100" alignBlock="center">
      <Lozenge appearance={appearance}>{outcome}</Lozenge>
      <Text>
        <Strong>{entry.issueKey}</Strong>
        {entry.projectKey && !entry.issueKey?.startsWith(entry.projectKey + '-')
          ? ` (${entry.projectKey})`
          : ''}
        {trigger}{actor}{summary} · {when}
      </Text>
    </Inline>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  Link,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  Textfield,
  User,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// -----------------------------------------------------------------------------
// Team Pulse Board — auto-JQL for a Confluence page.
//
// The macro runs the JQL you'd write yourself: distinctive tokens from the
// page title (+ the page URL if anyone linked it) → related tickets, grouped
// by status. The list of match tokens is editable — add or remove words and
// the search re-runs live.
// -----------------------------------------------------------------------------

// --- Styles ------------------------------------------------------------------

const boardStyle = xcss({ padding: 'space.200' });

const headerStyle = xcss({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 'space.200',
});

const panelStyle = xcss({
  padding: 'space.200',
  borderRadius: 'border.radius.200',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderColor: 'color.border',
  backgroundColor: 'elevation.surface.raised',
});

const sectionStyle = xcss({ marginBottom: 'space.200' });

const sectionHeaderRowStyle = xcss({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 'space.100',
});

const chipRowStyle = xcss({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'space.075',
});

// User-added chip wrapper: same Lozenge as the auto tokens, with a small
// remove (✕) button sitting flush next to it. The lozenge itself is styled
// identically to auto tokens so the two visually read as the same "thing".
const removableChipStyle = xcss({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'space.025',
});

const addTokenRowStyle = xcss({
  display: 'flex',
  gap: 'space.100',
  alignItems: 'center',
  marginTop: 'space.150',
});

const addTokenInputStyle = xcss({ flexGrow: 1 });

const filterInputWrapStyle = xcss({ marginTop: 'space.100' });

// Disclosure (collapsible status section) — chevron flush left, indented body.
const disclosureHeaderWrapStyle = xcss({
  display: 'flex',
  justifyContent: 'flex-start',
  width: '100%',
});

const disclosureBodyStyle = xcss({
  paddingInlineStart: 'space.300',
  paddingBlockStart: 'space.100',
  paddingBlockEnd: 'space.100',
  maxHeight: '320px',
  overflowY: 'auto',
});

const ticketCardStyle = xcss({
  padding: 'space.150',
  borderRadius: 'border.radius.100',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderColor: 'color.border',
  backgroundColor: 'elevation.surface',
  marginBottom: 'space.100',
});

const emptyLineStyle = xcss({ paddingBlock: 'space.100' });

// --- Helpers -----------------------------------------------------------------

const STATUS_BUCKETS = [
  { key: 'new', label: 'To Do' },
  { key: 'indeterminate', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const bucketTickets = (tickets) => {
  const buckets = { new: [], indeterminate: [], done: [] };
  for (const t of tickets ?? []) {
    const key = buckets[t.statusCategory] ? t.statusCategory : 'new';
    buckets[key].push(t);
  }
  return buckets;
};

const statusAppearance = (statusCategory) => {
  switch (statusCategory) {
    case 'done':
      return 'success';
    case 'indeterminate':
      return 'inprogress';
    default:
      return 'default';
  }
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const includesCI = (needle, haystack) =>
  !needle ||
  String(haystack ?? '')
    .toLowerCase()
    .includes(needle.toLowerCase());

// --- Reusable components -----------------------------------------------------

const DisclosureSection = ({ isOpen, onToggle, label, count, children }) => (
  <Stack space="space.0">
    <Box xcss={disclosureHeaderWrapStyle}>
      <Button
        appearance="subtle"
        spacing="compact"
        iconBefore={isOpen ? 'chevron-down' : 'chevron-right'}
        onClick={onToggle}
        shouldFitContainer
      >
        {`${label}  (${count})`}
      </Button>
    </Box>
    {isOpen && <Box xcss={disclosureBodyStyle}>{children}</Box>}
  </Stack>
);

const TicketCard = ({ ticket }) => (
  <Box xcss={ticketCardStyle}>
    <Stack space="space.075">
      <Inline space="space.100" alignBlock="center">
        <Link href={ticket.url} openNewTab>
          <Text weight="medium">{ticket.key}</Text>
        </Link>
        <Lozenge appearance={statusAppearance(ticket.statusCategory)}>
          {ticket.status}
        </Lozenge>
      </Inline>
      <Text size="small">{ticket.summary}</Text>
      <Inline space="space.100" alignBlock="center" spread="space-between">
        {ticket.assigneeId ? (
          <User accountId={ticket.assigneeId} />
        ) : (
          <Text size="small" color="color.text.subtle">
            Unassigned
          </Text>
        )}
        <Text size="small" color="color.text.subtle">
          {formatDate(ticket.updated)}
        </Text>
      </Inline>
    </Stack>
  </Box>
);

// --- App ---------------------------------------------------------------------

const App = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const [ticketFilter, setTicketFilter] = useState('');
  const [extraTokens, setExtraTokens] = useState([]);
  const [newTokenDraft, setNewTokenDraft] = useState('');
  const [isAddingToken, setIsAddingToken] = useState(false);

  // Start collapsed — users see the ticket counts per status first, then
  // expand only the section(s) they care about.
  const [openSections, setOpenSections] = useState({
    new: false,
    indeterminate: false,
    done: false,
  });

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const load = useCallback(async (extras) => {
    try {
      setError(null);
      const resp = await invoke('getPageContext', {
        extraTokens: extras ?? [],
      });
      if (resp?.error) {
        setError(resp.error);
        setData(null);
      } else {
        setData(resp);
      }
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(extraTokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(extraTokens);
  };

  const handleAddToken = async () => {
    const t = newTokenDraft.trim();
    if (!t) return;
    const existing = [
      ...(data?.autoTokens ?? []),
      ...extraTokens,
    ].map((x) => x.toLowerCase());
    if (existing.includes(t.toLowerCase())) {
      setNewTokenDraft('');
      setIsAddingToken(false);
      return;
    }
    const next = [...extraTokens, t];
    setExtraTokens(next);
    setNewTokenDraft('');
    setIsAddingToken(false);
    setRefreshing(true);
    await load(next);
  };

  const handleCancelAddToken = () => {
    setNewTokenDraft('');
    setIsAddingToken(false);
  };

  const handleRemoveToken = async (tok) => {
    const next = extraTokens.filter((x) => x !== tok);
    setExtraTokens(next);
    setRefreshing(true);
    await load(next);
  };

  // Assignee-name lookup — used by the ticket filter so users can search by
  // "Alana" and hit tickets assigned to Alana.
  const nameByAccountId = useMemo(() => {
    const map = new Map();
    (data?.contributors ?? []).forEach((c) => {
      if (c.accountId) map.set(c.accountId, c.displayName ?? '');
    });
    return map;
  }, [data?.contributors]);

  const filteredTickets = useMemo(() => {
    const list = data?.relatedTickets ?? [];
    if (!ticketFilter.trim()) return list;
    return list.filter(
      (t) =>
        includesCI(ticketFilter, t.key) ||
        includesCI(ticketFilter, t.summary) ||
        includesCI(ticketFilter, t.status) ||
        includesCI(ticketFilter, nameByAccountId.get(t.assigneeId)),
    );
  }, [data?.relatedTickets, ticketFilter, nameByAccountId]);

  const bucketed = useMemo(
    () => bucketTickets(filteredTickets),
    [filteredTickets],
  );

  // --- Loading / error -------------------------------------------------------

  if (loading) {
    return (
      <Box xcss={boardStyle}>
        <Inline space="space.100" alignBlock="center">
          <Spinner size="medium" />
          <Text>Searching Jira for tickets related to this page…</Text>
        </Inline>
      </Box>
    );
  }

  if (error) {
    return (
      <Box xcss={boardStyle}>
        <SectionMessage title="Couldn't run the search" appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
        <Box paddingBlockStart="space.150">
          <Button onClick={handleRefresh}>Try again</Button>
        </Box>
      </Box>
    );
  }

  const { autoTokens = [], relatedTickets = [] } = data ?? {};

  // --- Main render -----------------------------------------------------------

  return (
    <Box xcss={boardStyle}>
      {/* Header */}
      <Box xcss={headerStyle}>
        <Stack space="space.050">
          <Heading size="medium">Related tickets</Heading>
          <Text size="small" color="color.text.subtle">
            {relatedTickets.length}{' '}
            {relatedTickets.length === 1 ? 'ticket' : 'tickets'} across Jira
            projects matching the words below
          </Text>
        </Stack>
        <LoadingButton
          isLoading={refreshing}
          onClick={handleRefresh}
          appearance="subtle"
        >
          Refresh
        </LoadingButton>
      </Box>

      {/* Tickets panel */}
      <Box xcss={panelStyle}>
        {/* Matching on */}
        <Box xcss={sectionStyle}>
          <Box xcss={sectionHeaderRowStyle}>
            <Text size="small" weight="medium">
              Matching on
            </Text>
            {!isAddingToken && (
              <Button
                appearance="subtle"
                spacing="compact"
                iconBefore="add"
                onClick={() => setIsAddingToken(true)}
              >
                Add word
              </Button>
            )}
          </Box>
          <Box xcss={chipRowStyle}>
            {autoTokens.length === 0 && extraTokens.length === 0 ? (
              <Text size="small" color="color.text.subtle">
                No tokens yet — click "Add word" to widen the search.
              </Text>
            ) : (
              <>
                {autoTokens.map((tok) => (
                  <Lozenge key={`auto-${tok}`} appearance="new">
                    {tok}
                  </Lozenge>
                ))}
                {extraTokens.map((tok) => (
                  <Box key={`extra-${tok}`} xcss={removableChipStyle}>
                    <Lozenge appearance="new">{tok}</Lozenge>
                    <Button
                      appearance="subtle"
                      spacing="none"
                      iconBefore="cross"
                      onClick={() => handleRemoveToken(tok)}
                      aria-label={`Remove ${tok}`}
                    />
                  </Box>
                ))}
              </>
            )}
          </Box>
          {isAddingToken && (
            <Box xcss={addTokenRowStyle}>
              <Box xcss={addTokenInputStyle}>
                <Textfield
                  placeholder="Add another word (e.g. project codename, product name)…"
                  value={newTokenDraft}
                  onChange={(e) => setNewTokenDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddToken();
                    else if (e.key === 'Escape') handleCancelAddToken();
                  }}
                  isCompact
                  autoFocus
                />
              </Box>
              <Button
                onClick={handleAddToken}
                isDisabled={!newTokenDraft.trim() || refreshing}
                appearance="primary"
                spacing="compact"
              >
                Add
              </Button>
              <Button
                onClick={handleCancelAddToken}
                appearance="subtle"
                spacing="compact"
              >
                Cancel
              </Button>
            </Box>
          )}
        </Box>

        {/* Filter results */}
        <Box xcss={sectionStyle}>
          <Text size="small" weight="medium">
            Filter results
          </Text>
          <Box xcss={filterInputWrapStyle}>
            <Textfield
              placeholder="Filter by key, summary, status, or assignee…"
              value={ticketFilter}
              onChange={(e) => setTicketFilter(e.target.value)}
              isCompact
            />
          </Box>
        </Box>

        {/* Status sections */}
        {relatedTickets.length === 0 ? (
          <Box xcss={emptyLineStyle}>
            <SectionMessage
              title="No related Jira tickets found"
              appearance="information"
            >
              <Text>
                No tickets matched the words above (or the page URL). Add
                another word — like a project codename or product name — to
                widen the search.
              </Text>
            </SectionMessage>
          </Box>
        ) : filteredTickets.length === 0 ? (
          <Box xcss={emptyLineStyle}>
            <Text size="small" color="color.text.subtle">
              No tickets match "{ticketFilter}".
            </Text>
          </Box>
        ) : (
          <Stack space="space.050">
            {STATUS_BUCKETS.map((bucket) => {
              const items = bucketed[bucket.key] ?? [];
              const isOpen = openSections[bucket.key];
              return (
                <DisclosureSection
                  key={bucket.key}
                  isOpen={isOpen}
                  onToggle={() => toggleSection(bucket.key)}
                  label={bucket.label}
                  count={items.length}
                >
                  {items.length === 0 ? (
                    <Text size="small" color="color.text.subtle">
                      No tickets in this status.
                    </Text>
                  ) : (
                    items.map((t) => <TicketCard key={t.key} ticket={t} />)
                  )}
                </DisclosureSection>
              );
            })}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

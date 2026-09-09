// Jira admin page for the Team Pulse Board app.
//
// Why this file exists
// --------------------
// Team Pulse Board is a Confluence macro. The macro's backend resolver
// calls the Jira REST API to find related tickets — and Jira rejects
// those calls (403 "The app is not installed on this instance") unless
// the app is explicitly installed in Jira. To install in Jira, the
// manifest must declare at least one Jira module.
//
// We chose `jira:adminPage` so the surface appears only under
// Jira Settings → Apps (admin-only), not in every user's top nav.
// This page is deliberately informational: it tells the admin who
// lands here *why* the app is installed and where the actual
// functionality lives (spoiler: Confluence).

import React from 'react';
import ForgeReconciler, {
  Box,
  Heading,
  Link,
  LinkButton,
  List,
  ListItem,
  SectionMessage,
  Stack,
  Strong,
  Text,
} from '@forge/react';

const App = () => {
  return (
    <Box padding="space.300">
      <Stack space="space.300">
        <Heading as="h1">Team Pulse Board</Heading>

        <SectionMessage appearance="information" title="This app's UI lives in Confluence">
          <Text>
            Team Pulse Board is a <Strong>Confluence macro</Strong>. This admin
            page in Jira exists only so the app can call the Jira REST API —
            it has no user-facing features here.
          </Text>
        </SectionMessage>

        <Stack space="space.100">
          <Heading as="h2">Where to use it</Heading>
          <Text>
            Open any Confluence page in this site, type <Strong>/</Strong>,
            and insert the <Strong>Team Pulse Board</Strong> macro. It will
            read the page title and surface Jira tickets whose summary or
            description matches — no manual linking required.
          </Text>
          <LinkButton appearance="primary" href="/wiki">
            Open Confluence
          </LinkButton>
        </Stack>

        <Stack space="space.100">
          <Heading as="h2">Why this page exists</Heading>
          <List>
            <ListItem>
              <Text>
                The Confluence macro calls the Jira REST API to find related
                tickets.
              </Text>
            </ListItem>
            <ListItem>
              <Text>
                Jira only accepts those calls if the Forge app is{' '}
                <Strong>installed in Jira</Strong> — otherwise it returns{' '}
                <Strong>403 "The app is not installed on this instance"</Strong>.
              </Text>
            </ListItem>
            <ListItem>
              <Text>
                Installing in Jira requires the manifest to declare at least
                one Jira module. We use <Strong>jira:adminPage</Strong> — the
                least intrusive option — so the surface only appears here,
                under Jira Settings → Apps, and never in a regular user's
                navigation.
              </Text>
            </ListItem>
          </List>
        </Stack>

        <Stack space="space.100">
          <Heading as="h2">Learn more</Heading>
          <Text>
            Team Pulse Board is part of the <Strong>Forge Inspired</Strong>{' '}
            collection — small, open-source Forge reference apps you can
            clone, install, and remix.
          </Text>
          <Link
            href="https://github.com/atlassian-labs/forge-inspired/tree/main/team-pulse-board"
            openNewTab={true}
          >
            View source on GitHub
          </Link>
        </Stack>
      </Stack>
    </Box>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from 'react';
import ForgeReconciler, {
  Box,
  Heading,
  Stack,
  Text,
  SectionMessage,
  xcss,
} from '@forge/react';

// This global page exists purely so the Forge app can be installed into Jira.
// The real UI is the Confluence macro (`team-pulse-board-macro`). Without a
// Jira module, `forge install --product jira` refuses to install, and the
// Confluence resolver's Jira REST calls fail with 403 "not installed".

const wrap = xcss({ padding: 'space.300', maxWidth: '640px' });

const App = () => (
  <Box xcss={wrap}>
    <Stack space="space.200">
      <Heading size="large">Team Pulse Board</Heading>
      <SectionMessage title="This app lives in Confluence" appearance="information">
        <Text>
          The Team Pulse Board macro is inserted on Confluence pages — type
          <strong> /Team Pulse Board </strong> in the Confluence editor to add
          it to a page.
        </Text>
      </SectionMessage>
      <Text>
        The app is also installed in this Jira instance so the macro can read
        related Jira tickets. There's nothing to configure here.
      </Text>
    </Stack>
  </Box>
);

ForgeReconciler.render(<App />);

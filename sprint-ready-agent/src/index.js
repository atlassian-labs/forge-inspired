import { handleInspectIssue } from './actions/inspect-issue.js';
import { handleApplyChanges } from './actions/apply-changes.js';

// For Forge action modules, each `function` entry points at an export that
// receives the invocation payload directly. No Resolver needed for single-op
// action functions.

export const inspectIssue = async (payload, context) => {
  return handleInspectIssue({ payload, context });
};

export const applyChanges = async (payload, context) => {
  return handleApplyChanges({ payload, context });
};


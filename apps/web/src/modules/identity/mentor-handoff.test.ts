import assert from "node:assert/strict";
import { test } from "node:test";

import { IncompleteHandoffContentError, validateHandoffCompletionContent } from "./mentor-handoff";

const VALID_CONTENT = {
  carryForwardNotes: "Loves long-form Discovery Projects; responds best to written reflection prompts.",
  inProgressNotes: "Midway through the Genius Development Signature Experience playbook.",
  expectationsForLearner: "Your new Mentor will keep the same weekly check-in rhythm you're used to.",
};

test("validateHandoffCompletionContent: accepts all three fields populated", () => {
  assert.doesNotThrow(() => validateHandoffCompletionContent(VALID_CONTENT));
});

test("validateHandoffCompletionContent: rejects a blank carryForwardNotes", () => {
  assert.throws(
    () => validateHandoffCompletionContent({ ...VALID_CONTENT, carryForwardNotes: "" }),
    IncompleteHandoffContentError,
  );
});

test("validateHandoffCompletionContent: rejects a whitespace-only inProgressNotes", () => {
  assert.throws(
    () => validateHandoffCompletionContent({ ...VALID_CONTENT, inProgressNotes: "   " }),
    IncompleteHandoffContentError,
  );
});

test("validateHandoffCompletionContent: rejects a blank expectationsForLearner", () => {
  assert.throws(
    () => validateHandoffCompletionContent({ ...VALID_CONTENT, expectationsForLearner: "" }),
    IncompleteHandoffContentError,
  );
});

test("validateHandoffCompletionContent: rejects when every field is blank", () => {
  assert.throws(
    () =>
      validateHandoffCompletionContent({ carryForwardNotes: "", inProgressNotes: "", expectationsForLearner: "" }),
    IncompleteHandoffContentError,
  );
});

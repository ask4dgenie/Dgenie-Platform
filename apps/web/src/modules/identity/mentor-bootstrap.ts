/**
 * The manually seeded first Mentor cohort -- Roadmap Part 5's Phase 1
 * section: "Phase 1 needs a small, manually seeded first cohort of Mentors
 * -- an Administrator directly creating and vouching for a handful of Role
 * records outside the formal certification workflow -- with the full New
 * Mentor Certification workflow arriving on schedule in Phase 2 ... Confirmed
 * by Duncan, 2026-08-17." The precedent this mirrors, per that same Part, is
 * "the Founder-seeded bootstrap for the Constitutional Council and Oversight
 * Body, Blueprint 08 Part Three."
 *
 * THIS IS A DELIBERATE, TEMPORARY BOOTSTRAP, NOT THE REAL CERTIFICATION
 * PATH. New Mentor Certification (Architecture Spec Part Seven, Workflow 6)
 * -- qualification confirmation by the Chief Educational Architect, Teacher
 * Creed affirmation, safeguarding certification per Blueprint 11 Section
 * Four -- does not exist yet; it is explicitly Phase 2 scope. Every Mentor
 * `Role` created by this file exists only so New Learner Onboarding
 * (Workflow 1) has at least one real caseload-eligible Mentor to assign a
 * learner to, closing the sequencing gap the Roadmap names directly:
 * Workflow 1 presumes a certified Mentor already exists, but Workflow 6
 * (which would normally produce one) ships in Phase 2, after Workflow 1.
 *
 * The identities below are placeholder operational seed accounts, not real
 * people -- `@dgenie.internal` is not a real, deliverable domain,
 * deliberately, so this data can never be mistaken for a genuine enrollment
 * or staff record. Whoever runs this seed in a real environment should
 * replace these with the actual first Administrator and Mentor accounts
 * before any real family is onboarded against them.
 */
export const bootstrapAdministrator = {
  email: "admin-bootstrap@dgenie.internal",
  name: "Bootstrap Administrator",
};

export const bootstrapMentors = [
  { email: "mentor-bootstrap-1@dgenie.internal", name: "Bootstrap Mentor 1" },
  { email: "mentor-bootstrap-2@dgenie.internal", name: "Bootstrap Mentor 2" },
  { email: "mentor-bootstrap-3@dgenie.internal", name: "Bootstrap Mentor 3" },
];

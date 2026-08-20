/**
 * A minimal, real community structure -- one `NationalCommunity`, one
 * `Region`, one `Circle` -- so the New Parent workflow's Circle-assignment
 * logic (connectFamilyToCircle / backfillCircleAssignments, new-parent.ts)
 * has an actual Circle to connect a family to. Architecture Spec Part Four:
 * "`Region` and `NationalCommunity` need only enough structure to hold
 * membership and support the Circle-assignment workflow" -- this is exactly
 * that, not a claim about real DGENIE geography. Whoever operates this
 * platform for real should replace or extend this with the actual first
 * Circles being stood up, the same "placeholder operational seed data, not
 * a real record" caveat this build already states for the Mentor bootstrap
 * (src/modules/identity/mentor-bootstrap.ts).
 */
export const seedNationalCommunity = {
  name: "Seed National Community",
};

export const seedRegion = {
  name: "Seed Region",
};

export const seedCircle = {
  name: "Seed Local Learning Circle",
};

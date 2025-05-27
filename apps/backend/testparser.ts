import { onSchema } from "./os";
import { onSummery } from "./os";
import { ArtifactProcessor } from "./parser";

const text = `
<postgArtifact id="healthcare-appointment-system" title="Healthcare Appointment Management System">
  <postgAction type="schema">
-- Specialties table
  </postgAction>

  <postgAction type="summary">
This schema enables a healthcare appointment system where:

1. Doctors can have multiple specialties (many-to-many relationship)
2. Patients can request appointments with specific doctor specialties
3. The system tracks doctor ratings (0-5 scale)
4. Appointments have statuses (scheduled, completed, cancelled, no_show)
5. All appointment changes (status, time, doctor reassignment) are tracked in an audit table
6. Timestamps record when records are created and updated

The design supports all required operations: making, cancelling, and rescheduling appointments, with full historical tracking of these changes.
  </postgAction>
</postgArtifact>
`
let artifactProcessor = new ArtifactProcessor(
    "",
    (schema) => onSchema(schema),
    (summery) => onSummery(summery)
  );
let artifact = "";
for (let line of text.split("\n")) {
    line = line + "\n";

    artifactProcessor.append(line);
    artifactProcessor.parse();
    artifact += line;
}

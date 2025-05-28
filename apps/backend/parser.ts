/*
    <postgArtifact>
        <postgAction type="schema">
            CREATE TABLE users (
                id bigint primary key generated always as identity,
                name text NOT NULL,
                email text UNIQUE NOT NULL,
                password_hash text NOT NULL,
                created_at timestamptz DEFAULT NOW(),
                updated_at timestamptz DEFAULT NOW()
            );
        </postgAction>
        <postgAction type="summary">
            user table with email and password hash
        </postgAction>
    </postgArtifact>
*/

export class ArtifactProcessor {
  public currentArtifact: string;
  private onSchema: (fileContent: string) => void;
  private onSummery: (summery: string) => void;

  constructor(
    currentArtifact: string,
    onSchema: (fileContent: string) => void,
    onSummery: (summery: string) => void
  ) {
    this.currentArtifact = currentArtifact;
    this.onSchema = onSchema;
    this.onSummery = onSummery;
  }

  append(artifact: string) {
    this.currentArtifact += artifact;
  }

  parse() {
    const latestActionStart = this.currentArtifact
      .split("\n")
      .findIndex((line) => line.includes("<postgAction type="));
    const latestActionEnd =
      this.currentArtifact
        .split("\n")
        .findIndex((line) => line.includes("</postgAction>")) ??
      this.currentArtifact.split("\n").length - 1;

    if (latestActionStart === -1) {
      return;
    }

    const latestActionType = this.currentArtifact
      .split("\n")
      [latestActionStart].split("type=")[1]
      .split(" ")[0]
      .split(">")[0];
    const latestActionContent = this.currentArtifact
      .split("\n")
      .slice(latestActionStart, latestActionEnd + 1)
      .join("\n");

    try {
      if (latestActionType === '"summary"') {
        let summery = latestActionContent.split("\n").slice(1).join("\n");
        if (summery.includes("</postgAction>")) {
          summery = summery.split("</postgAction>")[0];
          this.currentArtifact = this.currentArtifact.split(latestActionContent)[1];
          this.onSummery(summery);
        }
      } else if (latestActionType === '"schema"') {
        let fileContent = latestActionContent.split("\n").slice(1).join("\n");
        if (fileContent.includes("</postgAction>")) {
          fileContent = fileContent.split("</postgAction>")[0];
          this.currentArtifact = this.currentArtifact.split(latestActionContent)[1];
          this.onSchema(fileContent);
        }
      }
    } catch (e) {
      console.error("error while parsing artifact", e);
    }
  }
}

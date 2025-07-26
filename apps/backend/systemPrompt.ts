import { backendPrompt } from "./prompts/backendPrompt";
import { dbPrompt } from "./prompts/dbPrompt";
import { frontendPrompt } from "./prompts/frontendPrompt";

const agentDict: { [key: string]: string } = {
  db: dbPrompt,
  backend: backendPrompt,
  frontend: frontendPrompt,
}
export const systemPrompt = (agentType: string) => agentDict[agentType]

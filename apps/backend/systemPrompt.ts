import { backendPrompt } from "./prompts/backendPrompt";
import { dbPrompt } from "./prompts/dbPrompt";

const agentDict: { [key: string]: string } = {
  db: dbPrompt,
  backend: backendPrompt,
}
export const systemPrompt = (agentType: string) => agentDict[agentType]

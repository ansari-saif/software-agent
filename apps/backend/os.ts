export async function onSchema(schema: string) {
  console.log(`Schema: ${schema}`);
}

export async function onSummery(summery: string) {
  //npm run build && npm run start
  console.log(`Summery: ${summery}`);
}

export function onPromptEnd(promptId: string) {
  // on prompt end
}

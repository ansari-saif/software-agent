import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup(): Promise<void> {
  await clerkSetup();
}

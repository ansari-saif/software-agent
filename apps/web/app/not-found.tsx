import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="Nothing here"
      description="This page doesn't exist, or it belongs to a project you don't have access to."
      actions={
        <Button asChild>
          <Link href="/">Start a new project</Link>
        </Button>
      }
    />
  );
}

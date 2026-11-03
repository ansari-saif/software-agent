import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";
import { Button } from "@/components/ui/button";

export default function ProjectNotFound() {
  return (
    <StatusScreen
      code="404"
      title="Project not found"
      description="It may have been deleted, or it belongs to another account."
      actions={
        <Button asChild>
          <Link href="/">Start a new project</Link>
        </Button>
      }
    />
  );
}

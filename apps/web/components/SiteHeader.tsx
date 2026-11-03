"use client";

import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/Logo";
import { ProjectsDrawer } from "@/components/ProjectsDrawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-4",
        className
      )}
    >
      <Logo />
      <SignedIn>
        <ProjectsDrawer />
      </SignedIn>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <SignedOut>
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm">Sign up</Button>
          </SignUpButton>
        </div>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </header>
  );
}

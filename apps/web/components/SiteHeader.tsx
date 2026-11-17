"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Logo } from "@/components/Logo";
import { ProjectsDrawer } from "@/components/ProjectsDrawer";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/utils";

export function SiteHeader({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const role = me.data?.role;
  const canBuild = role === "member" || role === "superadmin";
  const signedIn = isLoaded && isSignedIn;

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-4",
        className
      )}
    >
      <Logo />
      {signedIn ? (
        <>
          {canBuild ? <ProjectsDrawer /> : null}
          {role === "superadmin" ? (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className={pathname === "/access" ? "bg-accent" : undefined}
            >
              <Link href="/access" aria-current={pathname === "/access" ? "page" : undefined}>
                Access
              </Link>
            </Button>
          ) : null}
        </>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {isLoaded && !isSignedIn ? <GoogleSignInButton /> : null}
      {signedIn ? <UserButton /> : null}
    </header>
  );
}

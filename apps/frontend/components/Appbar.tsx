"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

const Appbar = () => {
  const router = useRouter();

  return (
    <div className="flex justify-between items-center p-4">
      <div 
        className="text-2xl font-bold text-white cursor-pointer" 
        onClick={() => router.push("/")}
      >
        Software Agent
      </div>
      <div>
        <SignedOut>
          <SignInButton />
          <SignUpButton />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </div>
  );
};

export default Appbar;

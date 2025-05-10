import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import React from "react";

const Prompt = () => (
  <div>
    <Textarea placeholder="Create a chess application ..." />
    <div className="flex justify-end p-2">
      <Button>
        <Send />
      </Button>
    </div>
  </div>
);

export default Prompt;

"use client";

import { AccessListResponseSchema, AccessOkResponseSchema } from "@repo/contracts";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useApi, useSessionUser } from "@/hooks/useApi";
import { errorMessage } from "@/lib/api";
import { formatRelative } from "@/lib/format";

export function AccessPanel() {
  const api = useApi();
  const { userId } = useSessionUser();
  const list = useSWR(userId ? (["access", userId] as const) : null, () =>
    api.request("/access", { schema: AccessListResponseSchema })
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await list.mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (list.isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading access…
      </div>
    );
  }

  if (list.error) {
    return <p className="text-sm text-destructive">{errorMessage(list.error)}</p>;
  }

  const requests = list.data?.requests ?? [];
  const enabled = list.data?.enabled ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium text-muted-foreground">Requests</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No one is waiting.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border bg-surface">
            {requests.map((person) => (
              <li key={person.email} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{person.email}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(person.createdAt)}</p>
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => api.request("/access", { method: "POST", body: { email: person.email }, schema: AccessOkResponseSchema }))}
                >
                  Enable
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api.request("/access/request", {
                        method: "DELETE",
                        body: { email: person.email },
                        schema: AccessOkResponseSchema,
                      })
                    )
                  }
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground">Enabled</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = email.trim();
            if (!next) return;
            void run(async () => {
              await api.request("/access", {
                method: "POST",
                body: { email: next },
                schema: AccessOkResponseSchema,
              });
              setEmail("");
            });
          }}
        >
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            aria-label="Email to enable"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || email.trim() === ""}>
            Enable
          </Button>
        </form>
        {enabled.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No one else is enabled.</p>
        ) : (
          <ul className="mt-3 divide-y rounded-xl border bg-surface">
            {enabled.map((person) => (
              <li key={person.email} className="flex items-center gap-2 px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{person.email}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api.request("/access", {
                        method: "DELETE",
                        body: { email: person.email },
                        schema: AccessOkResponseSchema,
                      })
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

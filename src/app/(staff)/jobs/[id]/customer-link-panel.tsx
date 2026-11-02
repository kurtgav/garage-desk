"use client";

import { MessageCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/data/types";
import { whatsappUrl } from "@/lib/format";
import { createCustomerLink, revokeCustomerLink } from "../actions";

type Props = {
  jobId: string;
  /** Already formatted on the server (garage timezone). */
  link: { created: string; lastViewed: string | null } | null;
  /** Create/regenerate is allowed only in LINKABLE_STATUSES; revoke works in any status. */
  canCreate: boolean;
  /** One line about what the customer sees right now, when the job is outside the linkable statuses. */
  note?: string;
  customerPhone: string;
  /** WhatsApp message; the URL is appended. */
  shareText: string;
};

/**
 * Create, regenerate and revoke the customer link (PRD FR6). The server returns the full URL once;
 * only its hash is stored, so after a reload the URL cannot be shown again.
 */
export function CustomerLinkPanel({ jobId, link, canCreate, note, customerPhone, shareText }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionResult<{ url: string }> | null, FormData>(
    async (prev, formData) => {
      const result = await createCustomerLink(prev, formData);
      setConfirmOpen(false);
      return result;
    },
    null,
  );
  const [revokeState, revoke, revoking] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await revokeCustomerLink(prev, formData);
    setRevokeOpen(false);
    return result;
  }, null);
  // Once the server reports no active link (revoked), the URL from an earlier create is dead: hide it.
  const url = state?.ok && link ? state.url : null;

  return (
    <div className="grid gap-4">
      {note && <p className="text-sm text-muted">{note}</p>}
      {link ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Link created</dt>
          <dd className="text-ink">{link.created}</dd>
          <dt className="text-muted">Last viewed</dt>
          <dd className={link.lastViewed ? "text-ink" : "text-muted"}>{link.lastViewed ?? "Not opened yet"}</dd>
        </dl>
      ) : canCreate ? (
        <p className="text-sm text-muted">
          A private link where the customer can read the quote, approve or decline it, and follow progress. No login
          needed.
        </p>
      ) : (
        <p className="text-sm text-muted">No active customer link.</p>
      )}

      {url && (
        <div className="grid gap-2">
          <Label htmlFor="customer-link-url">Customer link</Label>
          <div className="flex flex-wrap gap-2">
            <input
              id="customer-link-url"
              data-testid="customer-link-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-describedby="customer-link-once"
              className="h-11 min-w-0 flex-1 basis-56 rounded-md border border-control bg-raised px-3 text-sm text-ink"
            />
            <CopyButton value={url} />
          </div>
          <p id="customer-link-once" className="text-sm text-muted">
            Shown only now. Send it to the customer before you leave this page.
          </p>
          <a
            href={whatsappUrl(customerPhone, `${shareText} ${url}`)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            <MessageCircle aria-hidden />
            Share via WhatsApp
          </a>
        </div>
      )}

      {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
      {revokeState && !revoking && !(revokeState.ok && link) && (
        <Alert tone={revokeState.ok ? "success" : "danger"}>
          {revokeState.ok ? "Link revoked. The old link now shows “page not found”." : revokeState.error}
        </Alert>
      )}
      {url && !pending && (
        <p role="status" className="sr-only">
          Customer link created.
        </p>
      )}

      <div className="grid gap-2">
        {canCreate && link && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="w-full">
                Regenerate link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form action={dispatch} className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>Regenerate the customer link?</DialogTitle>
                  <DialogDescription>
                    The current link stops working straight away. Anyone who opens it will see a &ldquo;page not
                    found&rdquo; message. Send the customer the new link.
                  </DialogDescription>
                </DialogHeader>
                <input type="hidden" name="job_id" value={jobId} />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Keep current link
                    </Button>
                  </DialogClose>
                  <Button type="submit" loading={pending}>
                    Regenerate link
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {canCreate && !link && (
          <form action={dispatch}>
            <input type="hidden" name="job_id" value={jobId} />
            <Button type="submit" loading={pending} className="w-full">
              Create customer link
            </Button>
          </form>
        )}
        {link && (
          <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="w-full text-danger hover:bg-danger-soft">
                Revoke link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form action={revoke} className="grid gap-4">
                <DialogHeader>
                  <DialogTitle>Revoke the customer link?</DialogTitle>
                  <DialogDescription>The customer will no longer be able to open this link.</DialogDescription>
                </DialogHeader>
                <input type="hidden" name="job_id" value={jobId} />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Keep link
                    </Button>
                  </DialogClose>
                  <Button type="submit" variant="danger" loading={revoking}>
                    Revoke link
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

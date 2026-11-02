"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { submitKeepingValues, submitRequired } from "@/components/form-submit";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import type { ActionResult, CustomerListItem } from "@/lib/data/types";
import { formatPlate } from "@/lib/format";
import { addVehicle, deleteCustomer, updateCustomer, updateVehicle } from "../actions";
import { CUSTOMER_REQUIRED, CustomerFields, VEHICLE_REQUIRED, VehicleFields, type Errors } from "../fields";

type Vehicle = CustomerListItem["vehicles"][number];

export function EditCustomerForm({ customer }: { customer: CustomerListItem }) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(updateCustomer, null);
  const [errors, setErrors] = useState<Errors>({});

  return (
    <form onSubmit={submitRequired(dispatch, CUSTOMER_REQUIRED, setErrors)} noValidate className="grid gap-4">
      <input type="hidden" name="customer_id" value={customer.id} />
      <CustomerFields prefix="edit" errors={errors} customer={customer} />
      {state && !pending && (state.ok ? <Alert tone="success">Customer saved.</Alert> : <Alert tone="danger">{state.error}</Alert>)}
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Save customer
        </Button>
      </div>
    </form>
  );
}

/** Add form (no `vehicle`) or edit form for one vehicle. */
export function VehicleForm({
  customerId,
  vehicle,
  onDone,
}: {
  customerId: string;
  vehicle?: Vehicle;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await (vehicle ? updateVehicle : addVehicle)(prev, formData);
    if (result.ok) {
      if (vehicle) onDone?.();
      else formRef.current?.reset();
    }
    return result;
  }, null);

  return (
    <form ref={formRef} onSubmit={submitRequired(dispatch, VEHICLE_REQUIRED, setErrors)} noValidate className="grid gap-4">
      {vehicle ? (
        <input type="hidden" name="vehicle_id" value={vehicle.id} />
      ) : (
        <input type="hidden" name="customer_id" value={customerId} />
      )}
      <VehicleFields prefix={vehicle ? `vehicle-${vehicle.id}` : "add-vehicle"} errors={errors} vehicle={vehicle} />
      {state && !pending && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && !pending && !vehicle && <Alert tone="success">Vehicle added.</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant={vehicle ? "primary" : "secondary"} loading={pending}>
          {vehicle ? "Save vehicle" : "Add vehicle"}
        </Button>
        {vehicle && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** One vehicle row: read-only with Edit, or its edit form. */
export function VehicleRow({ customerId, vehicle, children }: { customerId: string; vehicle: Vehicle; children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <VehicleForm customerId={customerId} vehicle={vehicle} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {children}
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit vehicle ${formatPlate(vehicle.plate)}`}>
        Edit
      </Button>
    </div>
  );
}

/** Owner only (canDelete). The DB refuses while the customer has jobs; that sentence shows here. */
export function DeleteCustomer({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(async (prev, formData) => {
    const result = await deleteCustomer(prev, formData);
    if (result.ok) router.push("/customers");
    else setOpen(false);
    return result;
  }, null);

  return (
    <div className="grid gap-3 sm:justify-items-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-danger hover:bg-danger-soft">
            <Trash2 aria-hidden />
            Delete customer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submitKeepingValues(dispatch)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This cannot be undone. A customer with jobs cannot be deleted.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="customer_id" value={customerId} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Keep customer
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" loading={pending}>
                Delete customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {state && !state.ok && !pending && <Alert tone="danger">{state.error}</Alert>}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { currency } from "@/lib/catalog";
import { fetchInvoices, formatDate } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/admin/invoices/")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: fetchInvoices,
  });

  return (
    <AdminShell
      title="Invoices"
      actions={
        <Button asChild size="sm" variant="brass">
          <Link to="/admin/pos">New sale</Link>
        </Button>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  Loading invoices…
                </td>
              </tr>
            )}
            {!isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  No invoices yet — create one from the Point of Sale screen.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    to="/admin/invoices/$invoiceId"
                    params={{ invoiceId: inv.id }}
                    className="font-medium hover:underline"
                  >
                    {inv.invoice_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{inv.customer_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.created_at)}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {inv.payment_method}
                </td>
                <td className="px-4 py-3 text-right">{currency(inv.total)}</td>
                <td className="px-4 py-3 text-right">
                  {currency(Math.max(0, Number(inv.total) - Number(inv.amount_paid)))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Search, ScanLine, Camera } from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { currency, fetchProducts, type Product } from "@/lib/catalog";
import { fetchCustomers, type PaymentMethod } from "@/lib/pos";
import { CameraScanner } from "@/components/admin/BarcodeScanner";

export const Route = createFileRoute("/_authenticated/admin/pos")({
  component: PosPage,
});

type Line = { product: Product; qty: number };

function PosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });

  const [query, setQuery] = useState("");
  const [scan, setScan] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [walkIn, setWalkIn] = useState("Walk-in customer");
  const [discount, setDiscount] = useState("0");
  const [amountPaid, setAmountPaid] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter((p) =>
        [p.name, p.sku, p.color, p.size, p.finish]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [products, query]);

  const subtotal = lines.reduce((acc, l) => acc + Number(l.product.price) * l.qty, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));

  function addLine(product: Product) {
    setLines((prev) => {
      const found = prev.find((l) => l.product.id === product.id);
      if (found) return prev.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product, qty: 1 }];
    });
  }

  const handleScan = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (lastScan.current.code === code && now - lastScan.current.at < 1200) return;
      lastScan.current = { code, at: now };

      const match = products.find(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === code.toLowerCase()),
      );
      if (!match) {
        toast.error(`No product with barcode ${code}`);
        return;
      }
      addLine(match);
      toast.success(`${match.name} added`);
    },
    [products],
  );

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const checkout = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one product");
      const customer = customers.find((c) => c.id === customerId);
      const { data: user } = await supabase.auth.getUser();
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          customer_id: customerId || null,
          customer_name: customer?.name ?? walkIn.trim() ?? "Walk-in customer",
          subtotal,
          discount: Number(discount) || 0,
          total,
          amount_paid: Number(amountPaid) || 0,
          payment_method: method,
          notes: notes.trim() || null,
          created_by: user.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      const items = lines.map((l) => ({
        invoice_id: invoice.id,
        product_id: l.product.id,
        product_name: l.product.name,
        quantity: l.qty,
        unit: l.product.unit,
        unit_price: Number(l.product.price),
        line_total: Number(l.product.price) * l.qty,
      }));
      const { error: itemsError } = await supabase.from("invoice_items").insert(items);
      if (itemsError) throw itemsError;

      await Promise.all(
        lines.map((l) =>
          supabase
            .from("products")
            .update({ stock_qty: Math.max(0, Number(l.product.stock_qty) - l.qty) })
            .eq("id", l.product.id),
        ),
      );

      if (customer) {
        const due = total - (Number(amountPaid) || 0);
        if (due > 0) {
          await supabase
            .from("customers")
            .update({ outstanding_balance: Number(customer.outstanding_balance) + due })
            .eq("id", customer.id);
        }
      }

      return invoice.id as string;
    },
    onSuccess: (invoiceId) => {
      toast.success("Invoice created");
      queryClient.invalidateQueries();
      navigate({ to: "/admin/invoices/$invoiceId", params: { invoiceId } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AdminShell title="Point of Sale">
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 rounded-md border border-brass/40 bg-brass/5 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-2.5 size-4 text-brass" />
                <Input
                  ref={scanRef}
                  className="pl-9"
                  placeholder="Scan barcode here — item is added automatically"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleScan(scan);
                      setScan("");
                    }
                  }}
                />
              </div>
              <Button
                variant="stone"
                onClick={() => setCameraOn((v) => !v)}
                className="sm:w-auto"
              >
                <Camera className="size-4" /> {cameraOn ? "Stop camera" : "Use camera"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Keep this field focused for a USB or Bluetooth scanner, or scan with the tablet camera.
            </p>
            {cameraOn && (
              <CameraScanner onDetected={handleScan} onClose={() => setCameraOn(false)} />
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search product by name, reference, colour or size"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => addLine(p)}
                className="rounded-md border border-border p-3 text-left transition-colors hover:border-foreground"
              >
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[p.color, p.size, p.finish].filter(Boolean).join(" · ") || p.unit}
                </p>
                <p className="mt-1 text-sm">
                  {currency(p.price)}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {p.stock_qty} {p.unit} in stock
                  </span>
                </p>
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-sm text-muted-foreground">No products match that search.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Current sale</h2>
          <div className="mt-3 divide-y divide-border">
            {lines.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                Tap a product to start the invoice.
              </p>
            )}
            {lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {currency(l.product.price)} / {l.product.unit}
                  </p>
                </div>
                <Input
                  type="number"
                  min="1"
                  className="w-20"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x) =>
                        x.product.id === l.product.id
                          ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) }
                          : x,
                      ),
                    )
                  }
                />
                <span className="w-24 text-right text-sm">
                  {currency(Number(l.product.price) * l.qty)}
                </span>
                <button
                  onClick={() =>
                    setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))
                  }
                  aria-label={`Remove ${l.product.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Walk-in / cash customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!customerId && (
                <Input
                  value={walkIn}
                  onChange={(e) => setWalkIn(e.target.value)}
                  placeholder="Customer name on invoice"
                  maxLength={100}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount (PKR)</Label>
                <Input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount paid</Label>
                <Input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment method</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "bank", "credit"] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-md border px-3 py-2 text-sm capitalize ${
                      method === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
            </div>

            <div className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{currency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{currency(Number(discount) || 0)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{currency(total)}</span>
              </div>
            </div>

            <Button
              variant="brass"
              size="xl"
              className="w-full"
              disabled={checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? "Saving…" : "Complete sale"}
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
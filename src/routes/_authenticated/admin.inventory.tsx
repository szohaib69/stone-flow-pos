import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, currency, fetchProducts, type Category, type Product } from "@/lib/catalog";
import { useRoles } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: InventoryPage,
});

type Draft = {
  name: string;
  sku: string;
  category: Category;
  description: string;
  color: string;
  size: string;
  finish: string;
  unit: string;
  price: string;
  stock_qty: string;
  pieces_per_carton: string;
  low_stock_threshold: string;
};

const emptyDraft: Draft = {
  name: "",
  sku: "",
  category: "marble",
  description: "",
  color: "",
  size: "",
  finish: "",
  unit: "sq ft",
  price: "0",
  stock_qty: "0",
  pieces_per_carton: "8",
  low_stock_threshold: "10",
};

function toDraft(p: Product): Draft {
  return {
    name: p.name,
    sku: p.sku ?? "",
    category: p.category,
    description: p.description ?? "",
    color: p.color ?? "",
    size: p.size ?? "",
    finish: p.finish ?? "",
    unit: p.unit,
    price: String(p.price),
    stock_qty: String(p.stock_qty),
    pieces_per_carton: p.pieces_per_carton ? String(p.pieces_per_carton) : "",
    low_stock_threshold: String(p.low_stock_threshold),
  };
}

function InventoryPage() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });
  const { data: roles = [] } = useRoles();
  const isAdmin = roles.includes("admin");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState<Category | "all">("all");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        category: draft.category,
        description: draft.description.trim(),
        color: draft.color.trim() || null,
        size: draft.size.trim() || null,
        finish: draft.finish.trim() || null,
        unit: draft.unit.trim() || "unit",
        price: Number(draft.price) || 0,
        stock_qty: Number(draft.stock_qty) || 0,
        pieces_per_carton:
          draft.category === "tiles" && Number(draft.pieces_per_carton) > 0
            ? Number(draft.pieces_per_carton)
            : null,
        low_stock_threshold: Number(draft.low_stock_threshold) || 0,
      };
      if (!payload.name) throw new Error("Product name is required");
      const { error } = editing
        ? await supabase.from("products").update(payload).eq("id", editing.id)
        : await supabase.from("products").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product added");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = filter === "all" ? products : products.filter((p) => p.category === filter);

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <AdminShell
      title="Inventory"
      actions={
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setDraft(emptyDraft);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="brass">
              Add product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit product" : "Add product"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input {...field("name")} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as Category }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Stock code (e.g. 100B)</Label>
                <Input {...field("sku")} maxLength={40} placeholder="100B" />
              </div>
              <div className="space-y-2">
                <Label>Colour</Label>
                <Input {...field("color")} maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label>Size</Label>
                <Input {...field("size")} maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label>Finish</Label>
                <Input {...field("finish")} maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input {...field("unit")} maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label>Price (PKR)</Label>
                <Input type="number" min="0" {...field("price")} />
              </div>
              <div className="space-y-2">
                <Label>Stock quantity</Label>
                <Input type="number" min="0" {...field("stock_qty")} />
              </div>
              <div className="space-y-2">
                <Label>Low stock alert at</Label>
                <Input type="number" min="0" {...field("low_stock_threshold")} />
              </div>
              {draft.category === "tiles" && (
                <div className="space-y-2">
                  <Label>Tiles per carton</Label>
                  <Input type="number" min="1" {...field("pieces_per_carton")} />
                  <p className="text-xs text-muted-foreground">
                    Used at the counter to bill by carton (e.g. 8 tiles per carton).
                  </p>
                </div>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={3} {...field("description")} maxLength={600} />
              </div>
            </div>
            <Button
              variant="brass"
              className="mt-2 w-full"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save product"}
            </Button>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="flex flex-wrap gap-2">
        {(["all", ...CATEGORIES.map((c) => c.key)] as (Category | "all")[]).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filter === key ? "border-foreground bg-foreground text-background" : "border-border"
            }`}
          >
            {key === "all" ? "All" : CATEGORIES.find((c) => c.key === key)!.label}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  Loading inventory…
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[p.color, p.size, p.finish].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {currency(p.price)} <span className="text-xs text-muted-foreground">/ {p.unit}</span>
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    p.stock_qty <= p.low_stock_threshold ? "text-destructive" : ""
                  }`}
                >
                  {p.stock_qty}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(p);
                      setDraft(toDraft(p));
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && (
        <p className="mt-3 text-xs text-muted-foreground">
          Note: only admin accounts can save product changes.
        </p>
      )}
    </AdminShell>
  );
}
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Search, Upload, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
    unit: p.unit,
    price: String(p.price),
    stock_qty: String(p.stock_qty),
    pieces_per_carton: p.pieces_per_carton ? String(p.pieces_per_carton) : "",
    low_stock_threshold: String(p.low_stock_threshold),
  };
}

const EXPORT_COLUMNS = [
  "Stock code",
  "Name",
  "Category",
  "Colour",
  "Size",
  "Unit",
  "Price",
  "Stock qty",
  "Tiles per carton",
  "Low stock alert",
  "Description",
] as const;

const NEW_KEY = "inventory-new-products";

const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, "");

function readCell(row: Record<string, unknown>, keys: string[]) {
  const wanted = keys.map(norm);
  for (const k of Object.keys(row)) {
    if (wanted.includes(norm(k))) {
      const v = row[k];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s !== "") return s;
    }
  }
  return "";
}

const toNumber = (v: string) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

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
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [newIds, setNewIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(NEW_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  const markNew = (ids: string[]) => {
    if (!ids.length) return;
    setNewIds((prev) => {
      const next = Array.from(new Set([...prev, ...ids]));
      try {
        localStorage.setItem(NEW_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const clearNew = () => {
    setNewIds([]);
    try {
      localStorage.removeItem(NEW_KEY);
    } catch {
      /* ignore */
    }
  };


  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        category: draft.category,
        description: draft.description.trim(),
        color: draft.color.trim() || null,
        size: draft.size.trim() || null,
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
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        return null;
      }
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      return (data?.id as string) ?? null;
    },
    onSuccess: (id) => {
      toast.success(editing ? "Product updated" : "Product added");
      if (id) markNew([id]);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
    },
    onError: (err: Error) => toast.error(err.message),
  });


  const remove = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importRows = useMutation({
    mutationFn: async (file: File) => {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = book.SheetNames[0];
      if (!sheetName) throw new Error("That file has no sheets.");
      const sheet = book.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (!rows.length) throw new Error("No rows found. Row 1 must contain the column headers.");

      // Always compare against the latest DB state, not a cached list.
      const { data: existingRows, error: fetchErr } = await supabase
        .from("products")
        .select("id, name, sku");
      if (fetchErr) throw fetchErr;
      const bySku = new Map<string, string>();
      const byName = new Map<string, string>();
      for (const p of existingRows ?? []) {
        if (p.sku) bySku.set(String(p.sku).trim().toLowerCase(), p.id);
        byName.set(String(p.name).trim().toLowerCase(), p.id);
      }

      const valid = new Set(CATEGORIES.map((c) => c.key));
      const inserts: Record<string, unknown>[] = [];
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const [i, row] of rows.entries()) {
        const sku = readCell(row, ["Stock code", "stockcode", "sku", "code"]);
        const name = readCell(row, ["Name", "product", "productname", "title"]) || sku;
        if (!name) {
          skipped += 1;
          continue;
        }
        const rawCategory = readCell(row, ["Category", "type"]).toLowerCase();
        const category = (valid.has(rawCategory as Category) ? rawCategory : "tiles") as Category;
        const perCarton = toNumber(
          readCell(row, ["Tiles per carton", "piecespercarton", "percarton"]),
        );
        const payload = {
          name,
          sku: sku || null,
          category,
          description: readCell(row, ["Description", "notes"]),
          color: readCell(row, ["Colour", "Color"]) || null,
          size: readCell(row, ["Size"]) || null,
          unit: readCell(row, ["Unit"]) || (category === "tiles" ? "tile" : "unit"),
          price: toNumber(readCell(row, ["Price", "rate", "unitprice"])),
          stock_qty: toNumber(readCell(row, ["Stock qty", "Stock", "quantity", "qty"])),
          pieces_per_carton: category === "tiles" && perCarton > 0 ? perCarton : null,
          low_stock_threshold:
            toNumber(readCell(row, ["Low stock alert", "lowstockthreshold", "lowstock"])) || 10,
        };

        const key = sku ? sku.toLowerCase() : name.toLowerCase();
        const existingId = sku ? bySku.get(key) : byName.get(key);
        if (existingId) {
          const { error } = await supabase.from("products").update(payload).eq("id", existingId);
          if (error) errors.push(`Row ${i + 2}: ${error.message}`);
          else updated += 1;
        } else {
          inserts.push(payload);
          if (sku) bySku.set(key, "pending");
          else byName.set(key, "pending");
        }
      }

      const newIdsFromImport: string[] = [];
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200);
        const { data, error } = await supabase.from("products").insert(chunk).select("id");
        if (error) errors.push(`Insert batch ${i / 200 + 1}: ${error.message}`);
        else newIdsFromImport.push(...(data ?? []).map((d) => d.id as string));
      }

      if (!updated && !newIdsFromImport.length && errors.length) throw new Error(errors[0]);

      return { created: newIdsFromImport.length, updated, skipped, errors, ids: newIdsFromImport };
    },
    onSuccess: ({ created, updated, skipped, errors, ids }) => {
      markNew(ids);
      toast.success(
        `Import complete — ${created} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}`,
      );
      if (errors.length) toast.error(`${errors.length} row(s) failed. ${errors[0]}`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: Error) => toast.error(err.message || "Import failed"),
  });


  function exportExcel() {
    const data = rows.map((p) => ({
      "Stock code": p.sku ?? "",
      Name: p.name,
      Category: p.category,
      Colour: p.color ?? "",
      Size: p.size ?? "",
      Unit: p.unit,
      Price: Number(p.price),
      "Stock qty": Number(p.stock_qty),
      "Tiles per carton": p.pieces_per_carton ?? "",
      "Low stock alert": Number(p.low_stock_threshold),
      Description: p.description ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(data, { header: [...EXPORT_COLUMNS] });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Inventory");
    XLSX.writeFile(book, `city-tiles-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => filter === "all" || p.category === filter)
      .filter((p) =>
        !q
          ? true
          : [p.name, p.sku, p.color, p.size, p.unit, p.description]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [products, filter, search]);

  const field = (key: keyof Draft) => ({
    value: draft[key],
    onChange: (e: { target: { value: string } }) =>
      setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <AdminShell
      title="Inventory"
      actions={
        isAdmin ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importRows.mutate(file);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <Download className="size-4" /> Export Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={importRows.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> {importRows.isPending ? "Importing…" : "Import Excel"}
            </Button>
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
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, category: e.target.value as Category }))
                      }
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
          </>
        ) : null
      }
    >
      {newIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
          <p className="text-sm">
            <span className="font-medium">{newIds.length} new product{newIds.length > 1 ? "s" : ""} added</span>{" "}
            <span className="text-muted-foreground">
              — marked “New” below. This notice shows once.
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={clearNew}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="relative mb-4">

        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by stock code, name, colour or size"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">
                  No products match that search.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">
                    {p.name}
                    {newIds.includes(p.id) && (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        New
                      </span>
                    )}
                  </p>

                  <p className="text-xs text-muted-foreground">{p.sku ?? "—"}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[p.color, p.size].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {currency(p.price)}{" "}
                  <span className="text-xs text-muted-foreground">/ {p.unit}</span>
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    p.stock_qty <= p.low_stock_threshold ? "text-destructive" : ""
                  }`}
                >
                  {p.stock_qty}
                </td>
                <td className="px-4 py-3">
                  {isAdmin && (
                    <div className="flex justify-end gap-2">
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
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${p.name}" from inventory?`)) remove.mutate(p);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isAdmin && (
        <p className="mt-3 text-xs text-muted-foreground">
          You have view-only access to inventory. Only the admin can add, edit or delete products.
        </p>
      )}
    </AdminShell>
  );
}

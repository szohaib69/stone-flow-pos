import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "cashier";
export type PaymentMethod = "cash" | "bank" | "credit";

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  outstanding_balance: number;
  created_at: string;
};

export type Invoice = {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  customer_name: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  payment_method: PaymentMethod;
  notes: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export function useSession() {
  return useQuery({
    queryKey: ["session-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
  });
}

export function useRoles() {
  const { data: user } = useSession();
  return useQuery({
    queryKey: ["roles", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as Role);
    },
  });
}

export async function fetchCustomers() {
  const { data, error } = await supabase.from("customers").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Customer[];
}

export async function fetchInvoices() {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Invoice[];
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export async function markInvoicePaid(invoice: Invoice) {
  const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid));
  if (balance <= 0) return;
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({ amount_paid: Number(invoice.total) })
    .eq("id", invoice.id)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    throw new Error("You do not have permission to update this invoice.");
  }

  if (invoice.customer_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("outstanding_balance")
      .eq("id", invoice.customer_id)
      .maybeSingle();
    if (customer) {
      await supabase
        .from("customers")
        .update({
          outstanding_balance: Math.max(0, Number(customer.outstanding_balance) - balance),
        })
        .eq("id", invoice.customer_id);
    }
  }
}
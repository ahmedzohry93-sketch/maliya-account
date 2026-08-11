import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  id: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  logo_path: string | null;
  currency: string;
  footer_note: string | null;
};

export type CompanyBrand = CompanySettings & { logo_data_url: string | null };

export async function fetchCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as CompanySettings | null) ?? null;
}

export async function getLogoDataUrl(logoPath: string | null | undefined): Promise<string | null> {
  if (!logoPath) return null;
  try {
    const { data, error } = await supabase.storage.from("company-assets").download(logoPath);
    if (error || !data) return null;
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(data);
    });
  } catch {
    return null;
  }
}

export async function fetchCompanyBrand(): Promise<CompanyBrand | null> {
  const c = await fetchCompanySettings();
  if (!c) return null;
  const logo = await getLogoDataUrl(c.logo_path);
  return { ...c, logo_data_url: logo };
}

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });
}

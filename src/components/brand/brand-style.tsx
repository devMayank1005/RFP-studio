import { getActiveBrand } from "@/db/queries/brand";
import { renderBrandCss } from "@/domain/brand";

/**
 * The workspace's brand, applied in server HTML so there is no flash. Emits
 * nothing for the seeded defaults; only validated hex and a known font stack
 * ever reach the style block (see renderBrandCss).
 */
export async function BrandStyle({ workspaceId }: { workspaceId: string }) {
  const brand = await getActiveBrand(workspaceId);
  const css = renderBrandCss(brand);
  if (!css) return null;
  return <style id="brand-style" dangerouslySetInnerHTML={{ __html: css }} />;
}

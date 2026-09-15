import { redirect } from "next/navigation";

export default async function RfpIndexPage({ params }: PageProps<"/rfps/[rfpId]">) {
  const { rfpId } = await params;
  redirect(`/rfps/${rfpId}/workspace`);
}

import type { Metadata } from "next";
import { FiKey } from "react-icons/fi";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "API keys" };

export default function KeysPage() {
  return (
    <EmptyState
      icon={<FiKey size={20} />}
      title="API keys"
      description="Create keys to anchor files programmatically against your credit balance."
    />
  );
}

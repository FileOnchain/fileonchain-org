import type { Metadata } from "next";
import { FiDollarSign } from "react-icons/fi";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <EmptyState
      icon={<FiDollarSign size={20} />}
      title="Credits"
      description="Fund your account with USDC to let FileOnChain anchor uploads for you."
    />
  );
}

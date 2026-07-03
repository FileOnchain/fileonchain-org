import type { Metadata } from "next";
import { FiShield } from "react-icons/fi";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Bring your own keys" };

export default function ByokPage() {
  return (
    <EmptyState
      icon={<FiShield size={20} />}
      title="Bring your own keys"
      description="Store provider API keys (e.g. Autonomys Auto Drive) and route uploads through your existing credit there."
    />
  );
}

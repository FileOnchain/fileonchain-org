import type { Metadata } from "next";
import { FiActivity } from "react-icons/fi";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Activity logs" };

export default function LogsPage() {
  return (
    <EmptyState
      icon={<FiActivity size={20} />}
      title="No activity yet"
      description="Sign-ins, uploads, credit events, and API calls will appear here."
    />
  );
}

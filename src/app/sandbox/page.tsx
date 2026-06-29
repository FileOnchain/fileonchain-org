"use client";

import * as React from "react";
import { FiInbox, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { CopyButton } from "@/components/ui/CopyButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChainBadge } from "@/components/ui/ChainBadge";
import { StatusStepper } from "@/components/ui/StatusStepper";
import { Identicon } from "@/components/ui/Identicon";

/**
 * /sandbox — visual scratchpad for the UI primitives. Delete before merging
 * v2; only exists so Phase 2 can be visually verified end-to-end.
 */
export default function SandboxPage() {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState("overview");

  return (
    <TooltipProvider>
      <main className="mx-auto max-w-5xl space-y-10 p-6 md:p-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">UI Primitives Sandbox</h1>
          <p className="text-muted">Visual verification page — remove before merge.</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Buttons</h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="danger">Danger</Button>
            <Button isLoading>Loading</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="private">🔒 Private</Badge>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Inputs</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Basic input" label="Label" hint="Helper text" />
            <Input placeholder="With error" label="Error state" error="This field is required" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cards</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Default card</CardTitle>
              </CardHeader>
              <CardDescription>Surface + border, used for grouped content.</CardDescription>
            </Card>
            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated</CardTitle>
              </CardHeader>
              <CardDescription>Elevated surface + soft shadow.</CardDescription>
            </Card>
            <Card variant="outlined">
              <CardHeader>
                <CardTitle>Outlined</CardTitle>
              </CardHeader>
              <CardDescription>Transparent fill, border only.</CardDescription>
            </Card>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Chain badges</h2>
          <div className="flex flex-wrap gap-2">
            <ChainBadge chainName="Ethereum" shortName="ETH" />
            <ChainBadge chainName="Base" shortName="BASE" />
            <ChainBadge chainName="Solana" shortName="SOL" />
            <ChainBadge chainName="Aptos" shortName="APT" />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Identicons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Identicon value="0xA1B2C3D4E5F6" size={32} />
            <Identicon value="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" size={48} />
            <Identicon value="5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" size={64} />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">CopyButton + Tooltip</h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs">
              bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
              <CopyButton value="bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi" />
            </div>
            <Tooltip content="Tooltip on a button">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Status stepper</h2>
          <Card padding="md">
            <StatusStepper
              current="anchor"
              states={{
                drop: "done",
                hash: "done",
                anchor: "active",
                done: "idle",
              }}
              steps={[
                { id: "drop", label: "Drop file" },
                { id: "hash", label: "Hash chunks" },
                { id: "anchor", label: "Anchor on chain" },
                { id: "done", label: "Finalized" },
              ]}
            />
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Skeleton</h2>
          <div className="flex items-center gap-3">
            <Skeleton width={48} height={48} rounded="full" />
            <div className="flex-1 space-y-2">
              <Skeleton width="40%" height={12} />
              <Skeleton width="80%" height={12} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Empty state</h2>
          <EmptyState
            icon={<FiSearch size={20} />}
            title="No results"
            description="Try a different CID prefix or chain."
            action={<Button>Back to upload</Button>}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Modal + Tabs</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setOpen(true)}>Open modal</Button>
          </div>
          <Modal
            open={open}
            onOpenChange={setOpen}
            title="Modal title"
            description="Accessible dialog with framer-motion entrance."
            footer={
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => setOpen(false)}>Confirm</Button>
              </>
            }
          >
            <p className="text-sm text-muted">Body content for the modal.</p>
          </Modal>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="chunks">Chunks</TabsTrigger>
              <TabsTrigger value="registry">Registry</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>Overview panel</Card>
            </TabsContent>
            <TabsContent value="chunks">
              <Card>Chunks panel</Card>
            </TabsContent>
            <TabsContent value="registry">
              <Card>Registry panel</Card>
            </TabsContent>
          </Tabs>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Empty inbox</h2>
          <EmptyState
            icon={<FiInbox size={20} />}
            title="Nothing uploaded yet"
            description="Your recent uploads will show here once you drop a file."
          />
        </section>
      </main>
    </TooltipProvider>
  );
}
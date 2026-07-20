import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { mkdir, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  db,
  evidenceEnvelopes,
  agentRuns,
  exportJobs,
  type ExportJobFilter,
} from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";
import { logActivity } from "@/lib/server/activity";

/**
 * Bulk `.evidence.json` exports. User-facing flow:
 *
 *   POST /api/v1/exports { projectId?, filter?: ExportJobFilter,
 *                          includeAgentRunIndex?: boolean }
 *     returns { jobId, status: 'pending' }
 *
 * Build is asynchronous. Right after `createExportJob` returns we kick
 * off `buildExportJob` in `queueMicrotask`; the route never blocks the
 * caller on it. The build streams a cursor-paginated read of
 * `evidence_envelope` rows into a TAR archive (one file per envelope,
 * named `<envelopeId>.evidence.json`). The TAR format is chosen over
 * ZIP because it is byte-streamed without needing a compression
 * library — the build never has the full archive in memory.
 *
 * When the build is complete, the row carries a server-local file path
 * and an opaque `download_token`. The download route at
 * `/api/v1/exports/[id]/download?token=<token>` checks the token
 * against the row and streams the TAR. Filesystem cleanup runs daily
 * via the `exports-sweep` cron route (`vercel.json`: 03:37 UTC).
 *
 * Expiry: 24 hours after `completed_at`. Past expiry the row's status
 * becomes `expired` and the download route returns 410 Gone.
 */

const EXPORT_DIR = join(tmpdir(), "foc-exports");
const DEFAULT_TTL_HOURS = 24;
const TAR_BLOCK_SIZE = 512;

const TAR_TYPE = {
  REGULAR: "0",
  DIRECTORY: "5",
} as const;

/** Compute octal-permission-string + modification-time header. */
const buildTarHeader = (
  name: string,
  size: number,
  mode: number = 0o644,
  type: keyof typeof TAR_TYPE = "REGULAR",
): Buffer => {
  const header = Buffer.alloc(TAR_BLOCK_SIZE);
  // POSIX ustar (ustar prefix + magic + version). Each numeric field is
  // padded with NULs to a fixed width and big-endian octal-checksummed.
  const writeAt = (offset: number, value: string | Buffer, length: number) => {
    const str = (typeof value === "string" ? value : value.toString("utf8"));
    const padded = str + "\0".repeat(length);
    header.write(padded.slice(0, length), offset, length, "utf8");
  };
  writeAt(0, name, 100);
  writeAt(100, "0000644\0", 8);
  writeAt(108, "0000000\0", 8);
  writeAt(116, "0000000\0", 8);
  writeAt(124, (size >>> 0).toString(8).padStart(11, "0") + "\0", 12);
  writeAt(136, (Math.floor(Date.now() / 1000) >>> 0).toString(8).padStart(11, "0") + "\0", 12);
  // checksum placeholder
  header.fill(0x20, 148, 156);
  writeAt(156, type === "REGULAR" ? "0" : "5\0", 1);
  writeAt(257, "ustar\0", 6);
  writeAt(263, "00", 2);
  // magic^W ustar signature in the same offsets the spec uses; some
  // readers want it at offset 257.
  writeAt(257, "ustar  \0", 8);

  // Compute the checksum over the header (with the 8-byte field zeroed
  // per the spec).
  header.fill(0, 148, 156);
  let sum = 0;
  for (let i = 0; i < TAR_BLOCK_SIZE; i++) {
    sum += header[i];
  }
  header.write(
    sum.toString(8).padStart(6, "0") + "\0 ",
    148,
    8,
    "utf8",
  );
  return header;
};

/** Write a single file entry to the writable side of a tar stream. */
const writeTarEntry = async (
  stream: NodeJS.WritableStream,
  name: string,
  body: Buffer,
): Promise<void> => {
  const header = buildTarHeader(name, body.length);
  await new Promise<void>((resolve, reject) => {
    stream.write(header, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    stream.write(body, (err) => (err ? reject(err) : resolve()));
  });
  // Pad to TAR_BLOCK_SIZE; partial trailing block is filled with NULs.
  const pad = TAR_BLOCK_SIZE - (body.length % TAR_BLOCK_SIZE);
  if (pad !== TAR_BLOCK_SIZE) {
    await new Promise<void>((resolve, reject) => {
      stream.write(Buffer.alloc(pad), (err) => (err ? reject(err) : resolve()));
    });
  }
};

/** Two 512-byte zero blocks terminate a tar archive. */
const writeTarEOF = async (stream: NodeJS.WritableStream): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    stream.write(Buffer.alloc(TAR_BLOCK_SIZE * 2), (err) =>
      err ? reject(err) : resolve(),
    );
  });
};

/** Page through evidence_envelope rows for an (org, filter) scope.
 *  Cursor paginates on `(created_at, id)` so a re-read between batches
 *  does not double-write (new rows stay strictly after the cursor). */
const pageEnvelopes = async (
  orgId: string,
  projectId: string | null,
  filter: ExportJobFilter,
  cursor: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<
  Array<{
    envelopeId: string;
    envelope: unknown;
    createdAt: Date;
  }>
> => {
  const conditions = [eq(evidenceEnvelopes.orgId, orgId)];
  if (projectId) {
    conditions.push(eq(evidenceEnvelopes.projectId, projectId));
  } else {
    conditions.push(isNull(evidenceEnvelopes.projectId));
  }
  if (filter.from) {
    conditions.push(sql`${evidenceEnvelopes.createdAt} >= ${new Date(filter.from)}`);
  }
  if (filter.to) {
    conditions.push(sql`${evidenceEnvelopes.createdAt} <= ${new Date(filter.to)}`);
  }
  if (filter.profile) {
    conditions.push(eq(evidenceEnvelopes.profile, filter.profile));
  }
  if (cursor) {
    conditions.push(
      sql`(${evidenceEnvelopes.createdAt}, ${evidenceEnvelopes.id}) > (${cursor.createdAt}, ${cursor.id})`,
    );
  }
  return db
    .select({
      envelopeId: evidenceEnvelopes.id,
      envelope: evidenceEnvelopes.envelope,
      createdAt: evidenceEnvelopes.createdAt,
    })
    .from(evidenceEnvelopes)
    .where(and(...conditions))
    .orderBy(evidenceEnvelopes.createdAt, evidenceEnvelopes.id)
    .limit(limit);
};

/** Public — create an export request. Returns the new job id. */
export const createExportJob = async (
  orgId: string,
  userId: string,
  options: {
    projectId?: string | null;
    filter?: ExportJobFilter;
    includeAgentRunIndex?: boolean;
  },
): Promise<string> => {
  const id = crypto.randomUUID();
  await db.insert(exportJobs).values({
    id,
    orgId,
    projectId: options.projectId ?? null,
    requestedByUserId: userId,
    filter: options.filter ?? {},
    includeAgentRunIndex: options.includeAgentRunIndex ?? false,
    status: "pending",
    expiresAt: new Date(Date.now() + DEFAULT_TTL_HOURS * 3600 * 1000),
  });
  await logActivity(userId, "export_requested", {
    exportId: id,
    projectId: options.projectId ?? null,
  });
  // Kick off the build asynchronously. queueMicrotask keeps the API
  // response time bounded by the insert, not the row count.
  queueMicrotask(() => {
    buildExportJob(id).catch((error) => {
      console.error("export build failed", { id, error });
    });
  });
  return id;
};

/** Build a TAR archive for the job's filter scope and stamp the row
 *  ready. Internal — invoked by `createExportJob` via queueMicrotask. */
export const buildExportJob = async (
  jobId: string,
): Promise<{ envelopeCount: number; byteSize: number }> => {
  const [job] = await db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.id, jobId))
    .limit(1);
  if (!job) throw new Error(`export job ${jobId} not found`);

  await db
    .update(exportJobs)
    .set({ status: "building" })
    .where(eq(exportJobs.id, jobId));

  await mkdir(EXPORT_DIR, { recursive: true });
  const filePath = join(EXPORT_DIR, `${jobId}.tar`);
  const stream = createWriteStream(filePath);

  let envelopeCount = 0;
  let byteSize = 0;
  let cursor: { createdAt: Date; id: string } | null = null;
  try {
    for (;;) {
      const page = await pageEnvelopes(
        job.orgId,
        job.projectId ?? null,
        job.filter as ExportJobFilter,
        cursor,
        200,
      );
      if (page.length === 0) break;
      for (const row of page) {
        const envelopeJson = Buffer.from(
          JSON.stringify(row.envelope, null, 2),
          "utf8",
        );
        await writeTarEntry(stream, `${row.envelopeId}.evidence.json`, envelopeJson);
        envelopeCount += 1;
        byteSize += TAR_BLOCK_SIZE * Math.ceil(envelopeJson.length / TAR_BLOCK_SIZE);
        cursor = { createdAt: row.createdAt, id: row.envelopeId };
      }
    }

    if (job.includeAgentRunIndex) {
      const runs = await db
        .select({
          runId: agentRuns.runId,
          agentId: agentRuns.agentId,
          envelopeId: agentRuns.envelopeId,
          createdAt: agentRuns.createdAt,
        })
        .from(agentRuns)
        .where(eq(agentRuns.orgId, job.orgId))
        .orderBy(agentRuns.createdAt);
      const index = Buffer.from(JSON.stringify(runs, null, 2), "utf8");
      await writeTarEntry(stream, "agent-runs.json", index);
    }

    await writeTarEOF(stream);
    await new Promise<void>((resolve, reject) =>
      stream.end((err: unknown) => (err ? reject(err) : resolve())),
    );
  } catch (error) {
    await new Promise<void>((resolve) => stream.end(() => resolve()));
    await db
      .update(exportJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: error instanceof Error ? error.message : "build failed",
      })
      .where(eq(exportJobs.id, jobId));
    throw error;
  }

  // Stat the file for the row's `byte_size` (after the stream closed).
  const fileStat = await stat(filePath).catch(() => ({ size: byteSize }));
  const finalSize = fileStat.size ?? byteSize;
  const downloadToken = randomBytes(24).toString("base64url");

  await db
    .update(exportJobs)
    .set({
      status: "ready",
      filePath,
      downloadToken,
      envelopeCount,
      byteSize: finalSize,
      completedAt: new Date(),
    })
    .where(eq(exportJobs.id, jobId));

  await logActivity(job.requestedByUserId, "export_completed", {
    exportId: jobId,
    envelopeCount,
    byteSize: finalSize,
  });
  // No webhook fan-out for exports — the UI discovers ready status via
  // the dashboard's GET and the API surface's poll. Adding
  // `export.ready` to the WebhookEventType union is straightforward
  // follow-up work but not required for the v1 surface; exports are
  // typically user-initiated from a dashboard tab.
  return { envelopeCount, byteSize: finalSize };
};

/** Verify a download token + ownership; return the row. 404 on miss. */
export const authorizeDownload = async (
  jobId: string,
  token: string,
  apiKeyOrgId: string | null,
): Promise<typeof exportJobs.$inferSelect> => {
  const [row] = await db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.id, jobId))
    .limit(1);
  if (!row) throw new HttpError(404, "Export not found", "not_found");
  if (apiKeyOrgId && row.orgId !== apiKeyOrgId) {
    // No info leak across orgs.
    throw new HttpError(404, "Export not found", "not_found");
  }
  if (row.downloadToken !== token) {
    throw new HttpError(403, "Invalid download token", "forbidden");
  }
  if (row.status === "expired") {
    throw new HttpError(410, "Export expired", "not_found");
  }
  if (row.status !== "ready" || !row.filePath) {
    throw new HttpError(409, "Export not ready", "conflict");
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    // Lazy expire on read — also swept by the cron.
    await db
      .update(exportJobs)
      .set({ status: "expired" })
      .where(eq(exportJobs.id, row.id));
    throw new HttpError(410, "Export expired", "not_found");
  }
  return row;
};

/** Best-effort delete of a job + its file. Used by both the sweep and
 *  the per-row DELETE route. The filesystem delete is idempotent — a
 *  missing file is fine. */
export const purgeExportJob = async (
  jobId: string,
): Promise<{ removedFile: boolean; removedRow: boolean }> => {
  const [row] = await db
    .select({ filePath: exportJobs.filePath })
    .from(exportJobs)
    .where(eq(exportJobs.id, jobId))
    .limit(1);
  if (row?.filePath) {
    await rm(row.filePath, { force: true }).catch(() => {
      // ignore — file may already be gone.
    });
    return { removedFile: true, removedRow: true };
  }
  return { removedFile: false, removedRow: false };
};

/** Daily sweep. Marks expired rows + removes their files. Batched the
 *  same way `sweepExpiredEnvelopes` does. */
export const sweepExpiredExportJobs = async (
  { batchSize = 200 }: { batchSize?: number } = {},
): Promise<{ deleted: number }> => {
  let total = 0;
  for (;;) {
    const due = await db
      .select({ id: exportJobs.id })
      .from(exportJobs)
      .where(
        and(
          isNotNull(exportJobs.expiresAt),
          lte(exportJobs.expiresAt, sql`now()`),
        ),
      )
      .limit(batchSize);
    if (due.length === 0) break;
    const ids = due.map((r) => r.id);
    for (const id of ids) await purgeExportJob(id);
    await db.delete(exportJobs).where(inArray(exportJobs.id, ids));
    total += ids.length;
    if (due.length < batchSize) break;
  }
  return { deleted: total };
};

/** List recent exports for an org. The dashboard surfaces the most
 *  recent 20 by default; the API caps the limit at 100. */
export const listExportJobs = async (
  orgId: string,
  { limit = 20 }: { limit?: number } = {},
) => {
  const capped = Math.min(Math.max(limit, 1), 100);
  return db
    .select()
    .from(exportJobs)
    .where(eq(exportJobs.orgId, orgId))
    .orderBy(desc(exportJobs.createdAt))
    .limit(capped);
};

/** Resolve a single export job, scoped to org. */
export const getExportJob = async (
  orgId: string,
  jobId: string,
) => {
  const [row] = await db
    .select()
    .from(exportJobs)
    .where(
      and(eq(exportJobs.id, jobId), eq(exportJobs.orgId, orgId)),
    )
    .limit(1);
  if (!row) throw new HttpError(404, "Export not found", "not_found");
  return row;
};

/**
 * Next.js runs register() once when the server process boots. We use it to
 * resume any pending-photo compression that a previous process left unfinished
 * (rows stuck in "processing" whose worker died mid-encode).
 *
 * Node runtime only — the Edge runtime cannot touch Prisma, Sharp or the disk.
 */
export async function register() {
  // Next.js replaces NEXT_RUNTIME at build time and removes branches for the
  // other runtime. Keep the Node-only import inside a positive runtime check;
  // an early-return guard still leaves Sharp and filesystem modules reachable
  // while webpack compiles the Edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sweepPendingCompression } = await import("./lib/compressionWorker");
    // Don't block startup on the sweep; let it run in the background.
    void sweepPendingCompression().catch((err) =>
      console.error("Pending compression sweep failed:", err)
    );
  }
}

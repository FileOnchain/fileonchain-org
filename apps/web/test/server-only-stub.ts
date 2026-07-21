// Stub for the `server-only` package when imported under vitest.
// The real package throws unless the importer is a Next server
// component; under vitest (Node, no React reconciler) every import
// would throw, blocking every test that touches a server-only
// module. Production code never resolves this stub — only vitest.
export {};

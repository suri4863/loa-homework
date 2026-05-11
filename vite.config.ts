import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

async function runLocalApiHandler(
  server: ViteDevServer,
  modulePath: string,
  req: IncomingMessage,
  res: ServerResponse,
  routeQuery: Record<string, string | string[]> = {}
) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1")
  const query: Record<string, string | string[]> = { ...routeQuery }
  requestUrl.searchParams.forEach((value, key) => {
    const prev = query[key]
    query[key] = prev == null ? value : Array.isArray(prev) ? [...prev, value] : [prev, value]
  })

  let statusCode = 200
  const vercelResponse = {
    status(code: number) {
      statusCode = code
      return vercelResponse
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.statusCode = statusCode
        res.setHeader("content-type", "application/json; charset=utf-8")
      }
      res.end(JSON.stringify(payload))
      return vercelResponse
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      res.setHeader(name, value)
      return vercelResponse
    },
  }

  try {
    const mod = await server.ssrLoadModule(modulePath)
    await mod.default({ method: req.method, query, url: req.url, headers: req.headers }, vercelResponse)
  } catch (error) {
    if (!res.writableEnded) {
      res.statusCode = 500
      res.setHeader("content-type", "application/json; charset=utf-8")
      res.end(JSON.stringify({ ok: false, error: "LOCAL_API_FAILED", detail: error instanceof Error ? error.message : String(error) }))
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-vercel-api",
      configureServer(server) {
        server.middlewares.use("/api/growth/kloa-character", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/kloa-character.ts", req, res)
        })
        server.middlewares.use("/api/growth/market-prices", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/market-prices.ts", req, res)
        })
        server.middlewares.use("/api/growth/gem-prices", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/[kind].ts", req, res, { kind: "gem-prices" })
        })
        server.middlewares.use("/api/growth/accessory-prices", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/[kind].ts", req, res, { kind: "accessory-prices" })
        })
        server.middlewares.use("/api/growth/engraving-prices", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/[kind].ts", req, res, { kind: "engraving-prices" })
        })
        server.middlewares.use("/api/growth/avatar-prices", (req, res) => {
          void runLocalApiHandler(server, "/api/growth/[kind].ts", req, res, { kind: "avatar-prices" })
        })
      },
    },
  ],
  server: {
    port: 5173,
  },
})

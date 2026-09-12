import fs from "fs/promises"
import path from "path"

type LogInput = {
  method: string
  path: string
  action?: string
  statusCode?: number
  user?: string | null
  ip?: string | null
  userAgent?: string | null
  queryString?: string | null
  payload?: unknown   // ✅ add this
  response?: unknown  // ✅ add this
  error?: unknown
}

const MAX_PAYLOAD_SIZE = 200

const LOG_DIR = path.join(process.cwd(), "logs")

function getLogFilePath(): string {
  return path.join(
    LOG_DIR,
    `${new Date().toISOString().slice(0, 10)}.log.ndjson`
  )
}

async function ensureLogFile() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
    const logFile = getLogFilePath()
    await fs.access(logFile).catch(async () => {
      await fs.writeFile(logFile, "")
    })
  } catch (err) {
    // If we can't prepare the log file, surface to console but don't block APIs.
    console.error("[api-logger] unable to prepare log file", err)
  }
}

function extractUserFromCookies(headerValue: string | null): string | null {
  if (!headerValue) return null
  const parts = headerValue.split(";")
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=")
    if (name === "user") {
      return decodeURIComponent(rest.join("=") || "")
    }
  }
  return null
}

async function getRequestBody(request: Request): Promise<any> {
  try {
    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("application/json")) {
      const clone = request.clone()
      return await clone.json()
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const clone = request.clone()
      const text = await clone.text()
      return text
    }

    return null
  } catch {
    return "[unreadable body]"
  }
}

async function getResponseBody(response: Response): Promise<any> {
  try {
    const contentType = response.headers.get("content-type") || ""

    const clone = response.clone()

    if (contentType.includes("application/json")) {
      return await clone.json()
    }

    return await clone.text()
  } catch {
    return "[unreadable response]"
  }
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp
  return (request as any).ip ?? null
}

export async function logApiEvent(input: LogInput) {
  try {
    await ensureLogFile()
    const logFile = getLogFilePath()
    const record = {
      ...input,
      error: input.error ? String(input.error)?.slice(0, 500) : null,
      timestamp: new Date().toISOString(),
    }
    await fs.appendFile(logFile, `${JSON.stringify(record)}\n`, "utf8")
  } catch (err) {
    console.error("[api-logger] failed to log event", err)
  }
}

function sanitize(data: any) {
  if (!data || typeof data !== "object") return data

  const clone = { ...data }
  // if (clone.password) clone.password = "***"
  // if (clone.token) clone.token = "***"

  return clone
}

function truncate(data: unknown, maxSize: number) {
  try {
    if (data == null) return data

    const str =
      typeof data === "string" ? data : JSON.stringify(data)

    if (!str) return null

    if (str.length <= maxSize) return data

    return str.slice(0, maxSize) + "...[TRUNCATED]"
  } catch {
    return "[unserializable]"
  }
}

export function withApiLogging<
  Handler extends (req: any, context?: any) => Promise<Response>
>(handler: Handler, action?: string) {
  return (async (request: Request, context?: any) => {
    const url = new URL(request.url)

    const requestBody = await getRequestBody(request)

    const meta = {
      method: request.method,
      path: url.pathname,
      queryString: url.search || null,
      user: extractUserFromCookies(request.headers.get("cookie")),
      ip: getClientIp(request),
      userAgent: request.headers.get("user-agent"),
    }

    let statusCode: number | undefined
    let error: unknown
    let responseBody: any = null

    try {
      const response = await handler(request, context)

      statusCode = response.status ?? 200
      responseBody = await getResponseBody(response)

      return response
    } catch (err) {
      statusCode = 500
      error = err
      throw err
    } finally {
      await logApiEvent({
        ...meta,
        action,
        statusCode,
        error,
        payload:truncate(sanitize(requestBody), MAX_PAYLOAD_SIZE),
        response: truncate(sanitize(responseBody), MAX_PAYLOAD_SIZE),
      })
    }
  }) as Handler
}
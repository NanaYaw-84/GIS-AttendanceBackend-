import { NextResponse, type NextRequest } from "next/server"

const FIVE_MINUTES_MS = 5 * 60 * 1000
const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
}

const clearSessionCookies = (response: NextResponse) => {
  for (const name of ["user", "user_email", "last_activity"]) {
    response.cookies.set(name, "", { ...cookieBase, maxAge: 0 })
  }
}

const touchLastActivity = (response: NextResponse, timestamp: number) => {
  response.cookies.set("last_activity", String(timestamp), { ...cookieBase, maxAge: 60 * 5 })
}

export async function middleware(request: NextRequest) {
  const now = Date.now()
  const userCookie = request.cookies.get("user")
  const lastActivityCookie = request.cookies.get("last_activity")
  const lastActivity = lastActivityCookie ? Number(lastActivityCookie.value) : null
  const hasValidLastActivity = lastActivity !== null && !Number.isNaN(lastActivity)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')
  const isDepartmentHeadRoute = request.nextUrl.pathname.startsWith('/dashboard/department-head')

  const inactivityExceeded = Boolean(userCookie && hasValidLastActivity && now - (lastActivity as number) > FIVE_MINUTES_MS)

  if (inactivityExceeded) {
    const response = isApiRoute
      ? NextResponse.json({ error: "Session expired due to inactivity" }, { status: 401 })
      : NextResponse.redirect(new URL('/auth/login', request.url))
    clearSessionCookies(response)
    return response
  }

  // Role gate for department head dashboard
  if (isDepartmentHeadRoute) {
    const user = request.cookies.get('user')?.value

    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    try {
      const userData = JSON.parse(decodeURIComponent(user))
      if (userData.role !== 'department_head') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } catch (error) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
  }

  // CORS for API routes
  if (isApiRoute) {
    if (request.method === 'OPTIONS') {
      const preflight = new NextResponse(null, { status: 204 })
      // Allow all origins for preflight
      preflight.headers.set('Access-Control-Allow-Origin', '*')
      preflight.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      preflight.headers.set('Access-Control-Allow-Headers', request.headers.get('access-control-request-headers') || 'Content-Type, Authorization')
      preflight.headers.set('Access-Control-Max-Age', '86400')
      if (userCookie) {
        touchLastActivity(preflight, now)
      }
      return preflight
    }
    
    const response = NextResponse.next()
    // Allow all origins for API responses
    response.headers.set('Access-Control-Allow-Origin', '*')
    if (userCookie) {
      touchLastActivity(response, now)
    }
    return response
  }

  const response = NextResponse.next()
  if (userCookie) {
    touchLastActivity(response, now)
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
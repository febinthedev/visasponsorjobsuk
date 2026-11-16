import { createClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/auth/profile'
import { safeNextPath } from '@/lib/auth/safe-next'

// The client you created from the Server-Side Auth instructions
import { NextResponse } from 'next/server'


export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL (same-site paths only)
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      // First sign-in creates the profile; later sign-ins leave it untouched.
      await ensureProfile(data.user.id)

      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // send the user back to login, which shows a "sign-in failed" message
  return NextResponse.redirect(`${origin}/auth/login?error=1`)
}
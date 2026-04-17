import type { Env } from './types'

export function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  // Allow the configured origin + localhost for dev
  const allowed =
    origin === env.ALLOWED_ORIGIN ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')

  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export function jsonResponse(data: unknown, env: Env, request: Request, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, request),
    },
  })
}

export function errorResponse(message: string, env: Env, request: Request, status = 400): Response {
  return jsonResponse({ error: message }, env, request, status)
}

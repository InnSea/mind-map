export class PlatformRequestError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'PlatformRequestError'
    this.code = options.code
    this.status = options.status
    this.payload = options.payload
  }
}

let unauthorizedNotified = false

function getParentWindow() {
  if (typeof window === 'undefined' || window.parent === window) return null
  return window.parent
}

export function getPlatformContext() {
  if (typeof window === 'undefined') {
    return { apiBase: '/', token: null, groupId: null, isPublic: false }
  }

  try {
    const parentWindow = getParentWindow()
    const parentProvider = parentWindow && parentWindow.getMindmapPlatformContext
    const localProvider = window.getMindmapPlatformContext
    const configuredContext = window.mindmapPlatformContext
    const context =
      typeof parentProvider === 'function'
        ? parentProvider()
        : typeof localProvider === 'function'
        ? localProvider()
        : typeof configuredContext === 'function'
        ? configuredContext()
        : configuredContext

    return {
      apiBase: '/',
      token: null,
      groupId: null,
      isPublic: false,
      ...(context || {})
    }
  } catch (error) {
    console.error('读取平台认证上下文失败:', error)
    return { apiBase: '/', token: null, groupId: null, isPublic: false }
  }
}

function buildApiUrl(path, apiBase) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new PlatformRequestError('平台接口必须使用 /api/ 相对路径')
  }

  const base = String(apiBase || '/').trim()
  if (!base || base === '/') return path
  return `${base.replace(/\/+$/, '')}${path}`
}

function getPayloadMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback
  return payload.msg || payload.message || payload.detail || fallback
}

async function notifyUnauthorized(message) {
  if (unauthorizedNotified) return
  unauthorizedNotified = true
  setTimeout(() => {
    unauthorizedNotified = false
  }, 1000)

  let handler = null
  try {
    const parentWindow = getParentWindow()
    handler = parentWindow && parentWindow.handleMindmapUnauthorized
  } catch (error) {
    return
  }
  if (typeof handler !== 'function') return
  try {
    await handler(message)
  } catch (error) {
    console.error('同步平台登录状态失败:', error)
  }
}

function createRequestHeaders(headers, context, path) {
  const requestHeaders = new Headers(headers || {})
  const usesDocumentProjectScope = /^\/api\/(?:document(?:\/|$)|ai\/document(?:\/|$))/.test(
    path
  )
  if (context.token && !requestHeaders.has('token')) {
    requestHeaders.set('token', context.token)
  }
  if (
    !usesDocumentProjectScope &&
    context.groupId !== null &&
    context.groupId !== undefined &&
    !requestHeaders.has('X-Group-Id')
  ) {
    requestHeaders.set('X-Group-Id', String(context.groupId))
  }
  return requestHeaders
}

export async function platformFetch(path, options = {}) {
  const { requireAuth = true, headers, ...fetchOptions } = options
  const context = getPlatformContext()

  if (requireAuth && !context.token) {
    const message = context.isPublic
      ? '公开导图不支持此操作'
      : '登录状态不可用，请重新登录'
    if (!context.isPublic) await notifyUnauthorized(message)
    throw new PlatformRequestError(message, { code: 401 })
  }

  const response = await fetch(buildApiUrl(path, context.apiBase), {
    credentials: 'same-origin',
    ...fetchOptions,
    headers: createRequestHeaders(headers, context, path)
  })

  if (response.status === 401) {
    await notifyUnauthorized('登录状态已失效，请重新登录')
  }
  return response
}

async function readResponsePayload(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return text
  }
}

function isUnauthorizedPayload(payload) {
  return payload && typeof payload === 'object' && Number(payload.code) === 401
}

function createResponseError(response, payload) {
  const fallback = response.ok ? '平台接口调用失败' : `请求失败 (${response.status})`
  return new PlatformRequestError(getPayloadMessage(payload, fallback), {
    code: payload && typeof payload === 'object' ? payload.code : undefined,
    status: response.status,
    payload
  })
}

export async function platformRequest(path, options = {}) {
  const response = await platformFetch(path, options)
  const payload = await readResponsePayload(response)

  if (isUnauthorizedPayload(payload)) {
    const message = getPayloadMessage(payload, '登录状态已失效，请重新登录')
    await notifyUnauthorized(message)
    throw createResponseError(response, payload)
  }
  if (!response.ok) throw createResponseError(response, payload)
  if (
    payload &&
    typeof payload === 'object' &&
    payload.code !== undefined &&
    Number(payload.code) !== 0
  ) {
    throw createResponseError(response, payload)
  }
  return payload
}

export async function platformStream(path, options = {}) {
  const response = await platformFetch(path, options)
  const contentType = response.headers.get('content-type') || ''

  if (!response.ok || contentType.includes('application/json')) {
    const payload = await readResponsePayload(response)
    if (isUnauthorizedPayload(payload)) {
      await notifyUnauthorized(
        getPayloadMessage(payload, '登录状态已失效，请重新登录')
      )
    }
    throw createResponseError(response, payload)
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new PlatformRequestError('当前浏览器不支持流式响应')
  }
  return response.body.getReader()
}

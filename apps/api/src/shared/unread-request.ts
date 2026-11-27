// Without code generation (Cloudflare Workers, see worker.ts) Elysia reads every request
// body before the handler runs. worker.ts keeps an unread copy of a request whose handler
// passes the request on to a library that reads the body itself, such as better-auth.
const unread = new WeakMap<Request, Request>();

export function keepUnreadCopy(request: Request): Request {
  unread.set(request, request.clone());
  return request;
}

// The unread copy when worker.ts kept one, otherwise the request itself.
export function unreadRequest(request: Request): Request {
  return unread.get(request) ?? request;
}

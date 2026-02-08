function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function installFatalErrorOverlay() {
  const show = (title: string, details: unknown) => {
    const el = document.getElementById('app')
    if (!el) return
    const text =
      details instanceof Error ? `${details.name}: ${details.message}\n\n${details.stack ?? ''}` : typeof details === 'string' ? details : String(details)
    el.innerHTML = `<pre style="max-width: 960px; white-space: pre-wrap; padding: 16px; margin: 16px; border-radius: 12px; background: rgba(0,0,0,0.65); color: #f4f2ec; font: 14px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${escapeHtml(
      title,
    )}\n\n${escapeHtml(text)}</pre>`
  }

  window.addEventListener('error', (e) => show('Uncaught error', (e as ErrorEvent).error ?? (e as ErrorEvent).message))
  window.addEventListener('unhandledrejection', (e) => show('Unhandled promise rejection', (e as PromiseRejectionEvent).reason))
}


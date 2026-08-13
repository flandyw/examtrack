import { useEffect, useState } from "react"
import { ImageIcon } from "lucide-react"
import type { MistakeAttachment } from "@/lib/exam-data"
import { createMistakeAttachmentUrls } from "@/lib/mistake-attachments"

export function MistakeAttachments({ attachments, compact = false }: { attachments?: MistakeAttachment[]; compact?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const pathKey = attachments?.map(({ storagePath }) => storagePath).join("\u0000") ?? ""

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    const paths = pathKey ? pathKey.split("\u0000") : []
    if (!paths.length) {
      setUrls({})
      return
    }
    createMistakeAttachmentUrls(paths)
      .then((items) => {
        if (!cancelled) setUrls(Object.fromEntries(items.map((item) => [item.path, item.signedUrl])))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [pathKey])

  if (!attachments?.length) return null
  if (failed) return <p className="text-xs text-muted-foreground">Saved images could not be loaded.</p>

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
      {attachments.map((attachment) => urls[attachment.storagePath] ? (
        <a key={attachment.id} href={urls[attachment.storagePath]} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border bg-muted/30" title={attachment.name}>
          <img src={urls[attachment.storagePath]} alt={attachment.name || "Mistake context"} className={`${compact ? "h-20" : "h-32"} w-full object-contain`} />
        </a>
      ) : (
        <div key={attachment.id} className={`${compact ? "h-20" : "h-32"} flex items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground`}><ImageIcon className="size-5" /></div>
      ))}
    </div>
  )
}

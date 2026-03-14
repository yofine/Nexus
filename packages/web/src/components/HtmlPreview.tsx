interface HtmlPreviewProps {
  filePath: string
}

export function HtmlPreview({ filePath }: HtmlPreviewProps) {
  const src = `/api/file/raw?path=${encodeURIComponent(filePath)}`

  return (
    <iframe
      src={src}
      sandbox="allow-scripts allow-same-origin"
      title={filePath}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
      }}
    />
  )
}

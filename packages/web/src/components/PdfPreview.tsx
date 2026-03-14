interface PdfPreviewProps {
  filePath: string
}

export function PdfPreview({ filePath }: PdfPreviewProps) {
  const src = `/api/file/raw?path=${encodeURIComponent(filePath)}`

  return (
    <embed
      src={src}
      type="application/pdf"
      style={{ width: '100%', height: '100%', border: 'none' }}
    />
  )
}

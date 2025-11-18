import React, { useRef, useState } from 'react'
import { Upload, File, X, CheckCircle, AlertCircle, Image, FileText } from 'lucide-react'
import { colors } from '../../config/colors'

interface FileUploaderProps {
  onFileSelect: (file: File | File[] | null) => void
  accept?: string
  maxSize?: number
  label?: string
  description?: string
  showPreview?: boolean
  multiple?: boolean
  disabled?: boolean
}

type FileWithPreview = {
  file: File
  preview: string | null
}

const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelect,
  accept = 'image/*,.pdf',
  maxSize = 5 * 1024 * 1024, // 5MB
  label = 'Upload Receipt',
  description = 'JPG, PNG or PDF (Max 5MB)',
  showPreview = true,
  multiple = false,
  disabled = false,
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): boolean => {
    setError('')

    if (file.size > maxSize) {
      setError(`File size exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB`)
      return false
    }

    const acceptedTypes = accept.split(',').map((t) => t.trim())
    const fileType = file.type
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()

    const isValid = acceptedTypes.some((type) => {
      if (type.includes('*')) {
        const baseType = type.split('/')[0]
        return fileType.startsWith(baseType)
      }
      return type === fileType || type === fileExt
    })

    if (!isValid) {
      setError('Invalid file type. Please check accepted formats.')
      return false
    }

    return true
  }

  const generatePreview = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return null

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })
  }

  const handleFileChange = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    setLoading(true)
    setError('')

    const filesToProcess = multiple ? Array.from(selectedFiles) : [selectedFiles[0]]
    const validFiles: FileWithPreview[] = []

    for (const file of filesToProcess) {
      if (validateFile(file)) {
        const preview = showPreview ? await generatePreview(file) : null
        validFiles.push({ file, preview })
      }
    }

    if (validFiles.length > 0) {
      setFiles(validFiles)
      onFileSelect(multiple ? validFiles.map((f) => f.file) : validFiles[0].file)
    }

    setLoading(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    handleFileChange(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index)
    setFiles(updated)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onFileSelect(updated.length > 0 ? (multiple ? updated.map((f) => f.file) : updated[0].file) : null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image
    if (file.type === 'application/pdf') return FileText
    return File
  }

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium mb-2">{label}</label>}

      {files.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          style={{
            borderColor: isDragging ? colors.primary : error ? colors.error : 'rgba(255, 255, 255, 0.2)',
            background: isDragging ? `${colors.primary}10` : error ? `${colors.error}05` : 'rgba(255, 255, 255, 0.05)',
          }}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="File upload area"
          aria-disabled={disabled}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: `${colors.primary}20`,
                boxShadow: isDragging ? `0 0 30px ${colors.primary}60` : `0 0 20px ${colors.primary}40`,
              }}
            >
              <Upload size={32} style={{ color: colors.primary }} />
            </div>

            <div>
              <p className="font-semibold mb-1">
                {loading ? 'Processing...' : isDragging ? 'Drop file here' : 'Click or drag file to upload'}
              </p>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {description}
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            onChange={(e) => handleFileChange(e.target.files)}
            className="hidden"
            aria-label="File input"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((item, index) => (
            <div
              key={`${item.file.name}-${index}`}
              className="rounded-xl border overflow-hidden"
              style={{
                background: `${colors.accentGreen}10`,
                borderColor: `${colors.accentGreen}50`,
              }}
            >
              {/* Preview */}
              {item.preview && showPreview && (
                <div className="mt-3 relative">
                    <div
                      className="rounded-lg overflow-hidden flex items-center justify-center w-full"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '60vh',
                        background: 'rgba(0,0,0,0.2)',
                        minHeight: '120px',
                      }}
                    >
                      <img
                        src={item.preview}
                        alt="Receipt preview"
                        className="object-contain"
                        style={{
                          maxWidth: '100%',
                          width: 'auto',
                          maxHeight: '60vh',
                          height: 'auto',
                          display: 'block',
                        }}
                      />
                    </div>
                  {/* <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute top-2 right-2 p-2 rounded-full bg-red-500 hover:bg-red-600"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button> */}
                </div>
              )}

              {/* File Info */}
              <div className="flex items-center gap-4 p-4">
                <div className="p-3 rounded-lg shrink-0" style={{ background: `${colors.accentGreen}20` }}>
                  {React.createElement(getFileIcon(item.file), {
                    size: 24,
                    style: { color: colors.accentGreen },
                  })}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-sm wrap-break-word whitespace-normal"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    {formatFileSize(item.file.size)}
                  </p>
                </div>

                <CheckCircle size={20} style={{ color: colors.accentGreen }} className="shrink-0" />

                <button
                  onClick={() => removeFile(index)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                  aria-label={`Remove ${item.file.name}`}
                  disabled={disabled}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mt-2" role="alert">
          <AlertCircle size={16} style={{ color: colors.error }} />
          <p className="text-sm" style={{ color: colors.error }}>
            {error}
          </p>
        </div>
      )}
    </div>
  )
}

export default FileUploader

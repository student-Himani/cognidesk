import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  Eye,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit3,
  Check,
  X,
  Download,
  FileCode,
  Layers,
  FileCheck,
} from 'lucide-react';
import AIProcessingLoader from '../components/loading/AIProcessingLoader';
import { useAppDispatch, useAppSelector } from '../hooks/useRedux';
import {
  setSearchTerm,
  setSelectedType,
  setIsUploading,
  setUploadProgress,
  addDocument,
  removeDocument,
  setDocuments,
  updateDocument,
  DocumentItem
} from '../store/slices/documentsSlice';
import {
  uploadDocumentFile,
  deleteDocumentById,
  fetchDocuments as getDocumentsApi,
  renameDocument as renameDocumentApi,
  getDocumentPreviewUrl,
  getDocumentContent,
  processDocumentManual
} from '../services/documentService';
import { useToast } from '../hooks/useToast';
import { useWorkspace } from '../context/WorkspaceContext';

export const DocumentsPage: React.FC = () => {
  const { activeWorkspace } = useWorkspace();
  const dispatch = useAppDispatch();
  const { items: documents, searchTerm, selectedType, isUploading, uploadProgress } = useAppSelector(
    (state) => state.documents
  );
  const { showSuccess, showError } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  // Editing & Renaming states
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Preview & Extracted Text Modal state
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'extracted'>('preview');
  const [extractedData, setExtractedData] = useState<{
    id?: string;
    name?: string;
    status: string;
    raw_text: string;
    cleaned_text: string;
    word_count: number;
    page_count: number;
    metadata: Record<string, any>;
    error_message?: string;
  } | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Fetch documents on mount & when active workspace changes
  const loadDocuments = async () => {
    setLoadingList(true);
    try {
      const data = await getDocumentsApi();
      dispatch(setDocuments(data));
    } catch (err: any) {
      showError('Error', 'Failed to fetch document library from SQLite database');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [activeWorkspace?.id]);

  // Fetch extracted content when opening modal in 'extracted' tab or switching tabs
  useEffect(() => {
    if (previewDoc && activeTab === 'extracted') {
      loadExtractedContent(previewDoc.id);
    }
  }, [previewDoc, activeTab]);

  const loadExtractedContent = async (id: string) => {
    setLoadingContent(true);
    try {
      const content = await getDocumentContent(id);
      setExtractedData(content);
    } catch (err: any) {
      showError('Content Error', 'Failed to load extracted text content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleReprocess = async (id: string) => {
    try {
      await processDocumentManual(id);
      showSuccess('Reprocessing Started', 'Document extraction re-triggered in background');
      setTimeout(() => {
        loadDocuments();
        if (previewDoc?.id === id) {
          loadExtractedContent(id);
        }
      }, 1500);
    } catch (err: any) {
      showError('Reprocess Error', 'Failed to initiate re-processing');
    }
  };

  const uploadFile = async (file: File) => {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'csv', 'md', 'png', 'jpg', 'jpeg', 'bmp'];

    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      showError(
        'Upload Failed',
        `Format .${fileExt || 'unknown'} not supported. Allowed formats: ${allowedExtensions.join(', ')}`
      );
      return;
    }

    dispatch(setIsUploading(true));
    dispatch(setUploadProgress(0));

    try {
      const uploadedDoc = await uploadDocumentFile(file, (progress) => {
        dispatch(setUploadProgress(progress));
      });

      dispatch(addDocument(uploadedDoc));
      showSuccess('Upload Success', `File "${file.name}" uploaded successfully. Text extraction started.`);
      
      // Auto refresh list after 2s to show extracted stats
      setTimeout(() => {
        loadDocuments();
      }, 2000);

    } catch (err: any) {
      console.error('Upload error:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Failed to upload document to backend';
      showError('Upload Failed', errMsg);
    } finally {
      dispatch(setIsUploading(false));
      dispatch(setUploadProgress(0));
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadFile(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteDocumentById(id);
      dispatch(removeDocument(id));
      showSuccess('Document Deleted', `Removed "${name}" from workspace library`);
    } catch (err: any) {
      showError('Delete Failed', err.response?.data?.detail || 'Failed to delete file from backend');
    }
  };

  const startEditing = (doc: DocumentItem) => {
    setEditingDocId(doc.id);
    const dotIndex = doc.name.lastIndexOf('.');
    setEditValue(dotIndex !== -1 ? doc.name.substring(0, dotIndex) : doc.name);
  };

  const saveRename = async (id: string) => {
    const nameTrimmed = editValue.trim();
    if (!nameTrimmed) {
      showError('Invalid Name', 'Filename cannot be empty');
      return;
    }

    try {
      const updatedDoc = await renameDocumentApi(id, nameTrimmed);
      dispatch(updateDocument(updatedDoc));
      showSuccess('Rename Success', `Document name updated to "${updatedDoc.name}"`);
      setEditingDocId(null);
    } catch (err: any) {
      showError('Rename Failed', err.response?.data?.detail || 'Failed to rename file');
    }
  };

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType ? doc.type.toLowerCase() === selectedType.toLowerCase() : true;
    return matchesSearch && matchesType;
  });

  const uniqueTypes = Array.from(new Set(documents.map((d) => d.type)));

  const isPreviewable = (type: string): boolean => {
    const previewable = ['PDF', 'TXT', 'MD', 'PNG', 'JPG', 'JPEG', 'BMP', 'CSV'];
    return previewable.includes(type.toUpperCase());
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.csv,.md,image/*"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Document Library</h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Upload, extract, clean, and manage document metadata locally.</p>
          </div>
          <button
            onClick={loadDocuments}
            disabled={loadingList}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 transition-colors shadow-xs shrink-0"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <button
          onClick={handleUploadClick}
          disabled={isUploading}
          className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white font-medium text-sm shadow-lg shadow-blue-600/25 transition-all cursor-pointer self-start sm:self-auto min-h-[42px]"
        >
          <Upload className="w-4 h-4" />
          <span>Upload File</span>
        </button>
      </div>

      {/* Drag & Drop Upload Zone / Progress Card */}
      {isUploading ? (
        <AIProcessingLoader
          title="Uploading & Ingesting Document"
          subtitle="Streaming to offline storage and initiating local vector extraction"
          stage="LOCAL INGESTION"
          progress={uploadProgress}
          size={85}
          className="border-blue-500/40"
        />
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleUploadClick}
          className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer space-y-3 ${
            isDragging
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-blue-300/70 dark:border-blue-800/50 hover:border-blue-500 bg-white/80 dark:bg-slate-900/40 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 shadow-[0_8px_24px_rgba(37,99,235,0.04)]'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 flex items-center justify-center mx-auto border border-blue-200 dark:border-blue-800/40">
            <Upload className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">Drag and drop files here or click to browse</h3>
            <p className="text-xs text-slate-500 mt-1">
              Supports PDF (PyMuPDF), DOCX, PPTX, XLSX, TXT, CSV, Markdown, Images (EasyOCR)
            </p>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4 relative">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => dispatch(setSearchTerm(e.target.value))}
            placeholder="Search documents by name..."
            className="w-full bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border text-xs font-medium hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs ${
              selectedType ? 'border-blue-500 text-blue-700 dark:text-cyan-300' : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{selectedType ? `Type: ${selectedType}` : 'Filter Type'}</span>
          </button>

          {showFilterDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-2xl shadow-xl z-30 py-1.5 space-y-0.5 animate-pop-in">
              <button
                onClick={() => {
                  dispatch(setSelectedType(null));
                  setShowFilterDropdown(false);
                }}
                className={`w-full text-left px-3.5 py-1.5 text-xs ${
                  selectedType === null ? 'text-blue-600 dark:text-cyan-400 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800'
                }`}
              >
                All File Types
              </button>
              {uniqueTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    dispatch(setSelectedType(type));
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3.5 py-1.5 text-xs ${
                    selectedType === type ? 'text-blue-600 dark:text-cyan-400 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white/85 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-3xl overflow-x-auto scrollbar-thin shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-lg">
        {loadingList ? (
          <div className="p-12 text-center text-slate-500 space-y-2 flex flex-col items-center justify-center min-w-[500px]">
            <AIProcessingLoader
              title="Querying Document Registry"
              subtitle="Fetching metadata & local extraction status"
              stage="SQLITE REPOSITORY"
              size={75}
            />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2 min-w-[500px]">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
            <h4 className="font-semibold text-slate-700 dark:text-slate-400 text-sm">No documents found</h4>
            <p className="text-xs text-slate-500">Try uploading a new file to your workspace library.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Document Name</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Size</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Extracted Stats</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200 flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-cyan-400 shrink-0" />
                    {editingDocId === doc.id ? (
                      <div className="flex items-center space-x-2 w-full max-w-sm">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(doc.id);
                            if (e.key === 'Escape') setEditingDocId(null);
                          }}
                          className="bg-white dark:bg-slate-950 border border-blue-500 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none w-full focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={() => saveRename(doc.id)}
                          className="p-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-cyan-300 border border-blue-200 dark:border-blue-500/30 hover:bg-blue-200 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingDocId(null)}
                          className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 group/title truncate">
                        <span className="truncate max-w-xs sm:max-w-md md:max-w-lg font-semibold text-slate-800 dark:text-slate-200" title={doc.name}>
                          {doc.name}
                        </span>
                        <button
                          onClick={() => startEditing(doc)}
                          className="opacity-0 group-hover/title:opacity-100 p-1 rounded hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-600 dark:hover:text-cyan-300 transition-opacity cursor-pointer"
                          title="Rename file"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/50 text-blue-700 dark:text-cyan-300 text-xs font-semibold">
                      {doc.type}
                    </span>
                    {['PNG', 'JPG', 'JPEG', 'BMP'].includes(doc.type) && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-md bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold uppercase">
                        OCR
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{doc.size}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        doc.status === 'Indexed' || doc.status === 'Processed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : doc.status === 'Failed'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                      }`}
                    >
                      {doc.status === 'Indexed' || doc.status === 'Processed' ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <RefreshCw className={`w-3 h-3 ${doc.status === 'Processing' ? 'animate-spin' : ''}`} />
                      )}
                      <span>{doc.status}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-xs space-y-0.5">
                    {doc.word_count !== undefined && doc.word_count > 0 ? (
                      <div className="flex items-center space-x-2 text-slate-300">
                        <FileCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{doc.word_count.toLocaleString()} words</span>
                        {doc.page_count ? <span className="text-slate-500">({doc.page_count} pages)</span> : null}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Processing text...</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setPreviewDoc(doc);
                        setActiveTab('preview');
                      }}
                      className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-cyan-300 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                      title="Inspect Document & Extracted Text"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id, doc.name)}
                      className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-transparent transition-colors cursor-pointer"
                      title="Delete file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Multi-Format Preview & Extracted Text Modal (Module 05) */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-pop-in">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between sm:justify-start space-x-3 min-w-0">
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-cyan-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-slate-200 truncate pr-2 text-sm sm:text-base">{previewDoc.name}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-cyan-300 text-[10px] uppercase font-bold shrink-0">
                    {previewDoc.type}
                  </span>
                </div>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="sm:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between sm:justify-end space-x-2 shrink-0">
                {/* Tab Switches */}
                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setActiveTab('preview')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'preview'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow'
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>File View</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('extracted')}
                    className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeTab === 'extracted'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow'
                        : 'text-slate-600 dark:text-slate-400 hover:text-blue-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Extracted</span>
                  </button>
                </div>

                <a
                  href={getDocumentPreviewUrl(previewDoc.id)}
                  download={previewDoc.name}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                  title="Download raw file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="hidden sm:flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-[#F8FAFC] dark:bg-slate-950/30">
              {activeTab === 'preview' ? (
                /* Raw File Preview */
                isPreviewable(previewDoc.type) ? (
                  <>
                    {previewDoc.type === 'PDF' && (
                      <iframe
                        src={getDocumentPreviewUrl(previewDoc.id)}
                        className="w-full h-[60vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
                        title="PDF Preview"
                      />
                    )}
                    {['PNG', 'JPG', 'JPEG', 'BMP'].includes(previewDoc.type) && (
                      <div className="flex items-center justify-center bg-white dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-850 p-4 h-[60vh] shadow-sm">
                        <img
                          src={getDocumentPreviewUrl(previewDoc.id)}
                          alt={previewDoc.name}
                          className="max-w-full max-h-full object-contain rounded shadow-lg"
                        />
                      </div>
                    )}
                    {['TXT', 'MD', 'CSV'].includes(previewDoc.type) && (
                      <iframe
                        src={getDocumentPreviewUrl(previewDoc.id)}
                        className="w-full h-[60vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-sm"
                        title="Text Preview"
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 rounded-3xl p-12 text-center space-y-4 max-w-md mx-auto my-12 shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400 flex items-center justify-center border border-blue-200 dark:border-blue-800/40 shadow-inner">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 dark:text-slate-200 text-sm">Natively Unpreviewable Format</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-500">
                        Binary Office files (DOCX, PPTX, XLSX) cannot render directly in iframe. Click "Extracted Text" tab above to view parsed text content.
                      </p>
                    </div>
                    <a
                      href={getDocumentPreviewUrl(previewDoc.id)}
                      download={previewDoc.name}
                      className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-xs shadow-lg shadow-blue-600/30 transition-all w-full"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Raw File</span>
                    </a>
                  </div>
                )
              ) : (
                /* Module 05: Extracted & Cleaned Text Inspector */
                <div className="space-y-4">
                  {loadingContent ? (
                    <div className="p-10 text-center space-y-2 flex flex-col items-center justify-center">
                      <AIProcessingLoader
                        title="Extracting Text & Metadata"
                        subtitle="Parsing token chunks from local SQLite database"
                        stage={previewDoc?.type === 'PDF' ? 'PYMUPDF PIPELINE' : ['PNG', 'JPG', 'JPEG', 'BMP'].includes(previewDoc?.type || '') ? 'OCR OCR-ENGINE' : 'LOCAL PARSER'}
                        size={80}
                      />
                    </div>
                  ) : extractedData ? (
                    <>
                      {/* Stats Overview */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Status</span>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{extractedData.status}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Word Count</span>
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{extractedData.word_count.toLocaleString()}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs">
                          <span className="text-[10px] text-slate-500 font-semibold uppercase">Pages / Units</span>
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{extractedData.page_count}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-xs flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Actions</span>
                            <p className="text-xs font-semibold text-blue-700 dark:text-cyan-400">Reprocess</p>
                          </div>
                          <button
                            onClick={() => handleReprocess(previewDoc.id)}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-700 dark:text-slate-300 transition-colors border border-blue-200/60 dark:border-transparent"
                            title="Re-run text extraction"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Error Banner if any */}
                      {extractedData.error_message && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 text-xs">
                          <strong>Extraction Error:</strong> {extractedData.error_message}
                        </div>
                      )}

                      {/* OCR Details Banner if image document */}
                      {extractedData.metadata?.ocr_engine && (
                        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-600/30 text-blue-700 dark:text-cyan-300 font-bold text-[10px] uppercase tracking-wider border border-blue-200 dark:border-transparent">
                              Offline OCR
                            </span>
                            <span className="text-slate-800 dark:text-slate-300 font-semibold">{extractedData.metadata.ocr_engine}</span>
                          </div>
                          <div className="flex items-center space-x-4 text-slate-700 dark:text-slate-300 text-xs">
                            {extractedData.metadata.ocr_confidence !== undefined && (
                              <span>Confidence: <strong className="text-emerald-600 dark:text-emerald-400">{extractedData.metadata.ocr_confidence}%</strong></span>
                            )}
                            {extractedData.metadata.ocr_blocks_count !== undefined && (
                              <span>Blocks: <strong className="text-blue-700 dark:text-cyan-300">{extractedData.metadata.ocr_blocks_count}</strong></span>
                            )}
                            {extractedData.metadata.image_width ? (
                              <span>Dimensions: <strong className="text-slate-700 dark:text-slate-400">{extractedData.metadata.image_width}x{extractedData.metadata.image_height}</strong></span>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {/* Extracted Cleaned Text Display — High-Contrast Slate Glass */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
                          <span>Cleaned Text Output</span>
                          <span>{extractedData.cleaned_text.length.toLocaleString()} characters</span>
                        </div>
                        <textarea
                          readOnly
                          value={extractedData.cleaned_text || 'No text extracted.'}
                          className="w-full h-[45vh] bg-slate-50 dark:bg-[#131c2e] border border-slate-300 dark:border-blue-900/50 rounded-2xl p-4 text-xs font-mono text-slate-800 dark:text-slate-300 focus:outline-none resize-none leading-relaxed shadow-inner"
                        />
                      </div>

                      {/* Metadata JSON string if available */}
                      {extractedData.metadata && Object.keys(extractedData.metadata).length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Extracted Metadata</span>
                          <pre className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl p-3.5 text-[11px] font-mono text-blue-900 dark:text-cyan-300 overflow-x-auto shadow-inner">
                            {JSON.stringify(extractedData.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center text-slate-500">No content data available</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;

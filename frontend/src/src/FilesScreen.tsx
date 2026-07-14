import { useEffect, useRef, useState } from 'react';
import type { Attachment, Project, Requirement } from './types';
import { attachmentsApi, projectsApi, requirementsApi } from './api';
import './FilesScreen.css';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return d.slice(0, 10);
}

function fileTag(item: Attachment) {
  if (item.type === 'link') return { label: 'LINK', color: 'var(--file-link)' };
  const ext = item.original_name.split('.').pop()?.toLowerCase() || '';
  const mime = item.mime_type;
  if (mime?.startsWith('image/')) return { label: 'IMG', color: 'var(--file-image)' };
  if (ext === 'pdf') return { label: 'PDF', color: 'var(--file-pdf)' };
  if (['ppt', 'pptx'].includes(ext)) return { label: 'PPT', color: 'var(--file-ppt)' };
  if (['doc', 'docx'].includes(ext)) return { label: 'DOC', color: 'var(--file-doc)' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: 'XLS', color: 'var(--file-sheet)' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', color: 'var(--file-zip)' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), color: 'var(--file-generic)' };
}

type TabKey = 'upload' | 'link';

export default function FilesScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('upload');

  const [uploader, setUploader] = useState('');
  const [uploadRequirementId, setUploadRequirementId] = useState<number | ''>('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkUploader, setLinkUploader] = useState('');
  const [linkRequirementId, setLinkRequirementId] = useState<number | ''>('');
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.list().then((data) => {
      setProjects(data);
      if (data.length > 0) setProjectId(data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) { setRequirements([]); return; }
    requirementsApi.list({ project_id: projectId }).then(setRequirements).catch(() => {});
  }, [projectId]);

  async function load() {
    if (!projectId) { setFiles([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await attachmentsApi.list({ project_id: projectId });
      setFiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !projectId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        await attachmentsApi.upload(file, projectId, uploader.trim() || '익명', uploadRequirementId || null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    if (!linkTitle.trim()) { setLinkError('링크 제목을 입력해주세요.'); return; }
    if (!/^https?:\/\//.test(linkUrl.trim())) { setLinkError('http:// 또는 https://로 시작하는 URL을 입력해주세요.'); return; }
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      await attachmentsApi.createLink({
        project_id: projectId,
        requirement_id: linkRequirementId || null,
        title: linkTitle.trim(),
        url: linkUrl.trim(),
        uploader: linkUploader.trim() || '익명',
      });
      setLinkTitle('');
      setLinkUrl('');
      await load();
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : '링크 추가 중 오류가 발생했습니다.');
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function handleDelete(f: Attachment) {
    const label = f.type === 'link' ? '링크' : '파일';
    if (!confirm(`"${f.original_name}" ${label}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await attachmentsApi.remove(f.id);
    await load();
  }

  const totalSize = files.reduce((sum, f) => sum + f.file_size, 0);
  const fileCount = files.filter((f) => f.type === 'file').length;
  const linkCount = files.filter((f) => f.type === 'link').length;

  return (
    <div className="files-screen">
      <header className="screen-header">
        <div>
          <h1>기획 문서 첨부</h1>
          <p className="screen-subtitle">프로젝트별 산출물, 기획서, PPT, 참고 링크 등을 업로드하고 관리합니다</p>
        </div>
      </header>

      <section className="toolbar">
        <select
          className="project-select"
          value={projectId ?? ''}
          onChange={(e) => setProjectId(Number(e.target.value))}
          disabled={projects.length === 0}
        >
          {projects.length === 0 && <option value="">프로젝트 없음</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="files-stat">
          파일 {fileCount}개 · 링크 {linkCount}개 · 총 {formatSize(totalSize)}
        </div>
      </section>

      {projects.length === 0 ? (
        <div className="empty-state">
          <strong>먼저 프로젝트를 생성해주세요.</strong>
          <span>파일은 특정 프로젝트에 소속되어 관리됩니다.</span>
        </div>
      ) : (
        <>
          <div className="tab-row">
            <button className={`tab-btn ${tab === 'upload' ? 'is-active' : ''}`} onClick={() => setTab('upload')}>
              파일 업로드
            </button>
            <button className={`tab-btn ${tab === 'link' ? 'is-active' : ''}`} onClick={() => setTab('link')}>
              링크 추가
            </button>
          </div>

          {tab === 'upload' && (
            <section
              className={`dropzone ${dragOver ? 'is-dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <div className="dropzone-inner">
                <span className="dropzone-icon">⇪</span>
                <div className="dropzone-text">
                  <strong>파일을 여기로 끌어다 놓거나 클릭해서 업로드</strong>
                  <span>PPT, 문서, 이미지 등 최대 20MB · 프로젝트: {projects.find((p) => p.id === projectId)?.name}</span>
                </div>
                <div className="dropzone-actions">
                  <select
                    className="uploader-input"
                    value={uploadRequirementId}
                    onChange={(e) => setUploadRequirementId(e.target.value === '' ? '' : Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">요구사항 연결 안 함</option>
                    {requirements.map((r) => (
                      <option key={r.id} value={r.id}>📋 {r.title}</option>
                    ))}
                  </select>
                  <input
                    className="uploader-input"
                    placeholder="업로더 이름 (선택)"
                    value={uploader}
                    onChange={(e) => setUploader(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? '업로드 중...' : '파일 선택'}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            </section>
          )}

          {tab === 'link' && (
            <section className="link-form-wrap">
              <form className="link-form" onSubmit={handleAddLink}>
                <select
                  className="link-input link-input-req"
                  value={linkRequirementId}
                  onChange={(e) => setLinkRequirementId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">요구사항 연결 안 함</option>
                  {requirements.map((r) => (
                    <option key={r.id} value={r.id}>📋 {r.title}</option>
                  ))}
                </select>
                <input
                  className="link-input link-input-title"
                  placeholder="링크 제목 (예: QA 기획서 - Google Docs)"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
                <input
                  className="link-input link-input-url"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
                <input
                  className="link-input link-input-uploader"
                  placeholder="등록자 (선택)"
                  value={linkUploader}
                  onChange={(e) => setLinkUploader(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={linkSubmitting}>
                  {linkSubmitting ? '추가 중...' : '링크 추가'}
                </button>
              </form>
              {linkError && <div className="field-error" style={{ marginTop: 10 }}>⚠ {linkError}</div>}
            </section>
          )}

          {error && <div className="error-banner">⚠ {error} — 백엔드 서버(http://localhost:4000)가 실행 중인지 확인해주세요.</div>}

          {loading ? (
            <div className="empty-state">불러오는 중...</div>
          ) : files.length === 0 ? (
            <div className="empty-state">
              <strong>첨부된 파일/링크가 없습니다.</strong>
              <span>위 탭에서 파일을 업로드하거나 링크를 추가해보세요.</span>
            </div>
          ) : (
            <div className="file-list">
              {files.map((f) => {
                const tag = fileTag(f);
                return (
                  <div className="file-row" key={f.id}>
                    <span className="file-tag" style={{ background: tag.color }}>{tag.label}</span>
                    <div className="file-info">
                      <div className="file-name">
                        {f.original_name}
                        {f.requirement_title && <span className="req-badge">📋 {f.requirement_title}</span>}
                      </div>
                      <div className="file-meta">
                        {f.type === 'link' ? f.url : formatSize(f.file_size)} · {f.uploader || '익명'} · {formatDate(f.created_at)}
                      </div>
                    </div>
                    <div className="file-actions">
                      {f.type === 'link' ? (
                        <a className="btn-ghost-sm" href={f.url ?? '#'} target="_blank" rel="noopener noreferrer">열기</a>
                      ) : (
                        <a className="btn-ghost-sm" href={attachmentsApi.downloadUrl(f.id)}>다운로드</a>
                      )}
                      <button className="btn-icon-sm" onClick={() => handleDelete(f)} title="삭제">✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

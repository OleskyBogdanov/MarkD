import { ArrowRight, Clock3, FilePlus2, FileText, FolderOpen } from 'lucide-react';
import type { RecentProjectSummary, RecoveryRecord } from '@/shared/ipc-channels';
import './start-screen.css';

type StartScreenProps = {
  recentProjects: RecentProjectSummary[];
  loading: boolean;
  openingProjectId: string | null;
  statusMessage: string;
  statusKind: 'idle' | 'success' | 'error';
  recovery: RecoveryRecord | null;
  onRestore: () => void;
  onDiscardRecovery: () => void;
  onCreateBlank: () => void;
  onOpenTemplate: () => void;
  onCreate: () => void;
  onOpen: () => void;
  onOpenRecent: (projectId: string) => void;
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const formatModifiedAt = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата неизвестна' : dateFormatter.format(date);
};

export const StartScreen = ({
  recentProjects,
  loading,
  openingProjectId,
  statusMessage,
  statusKind,
  recovery, onRestore, onDiscardRecovery, onCreateBlank, onOpenTemplate,
  onCreate,
  onOpen,
  onOpenRecent
}: StartScreenProps) => (
  <main className="start-screen" data-testid="start-screen">
    <header className="start-header">
      <div className="start-brand" aria-label="MarkD">
        <span className="start-brand-mark" aria-hidden="true">M</span>
        <span>MarkD</span>
      </div>
    </header>

    <div className="start-content">
      <section className="start-titlebar" aria-labelledby="start-title">
        <h1 id="start-title">Проекты</h1>
        {recovery ? <section className="recovery-notice" aria-label="Восстановление документа">
          <p>Найден несохранённый черновик от {formatModifiedAt(recovery.savedAt)}.</p>
          <button type="button" onClick={onRestore}>Восстановить черновик</button>
          <button type="button" onClick={onDiscardRecovery}>Удалить черновик</button>
        </section> : null}
        <div className="start-actions">
          <button type="button" className="start-primary-action" disabled={Boolean(recovery)} onClick={onCreate}>
            <FilePlus2 aria-hidden="true" /> Новый проект
          </button>
          <button type="button" className="start-secondary-action" disabled={Boolean(recovery)} onClick={onOpen}>
            <FolderOpen aria-hidden="true" /> Открыть…
          </button>
          <button type="button" className="start-secondary-action" disabled={Boolean(recovery)} onClick={onCreateBlank}>Пустой документ</button>
          <button type="button" className="start-secondary-action" disabled={Boolean(recovery)} onClick={onOpenTemplate}>Из шаблона…</button>
        </div>
        <p
          className={statusMessage ? `start-status start-status-${statusKind}` : 'sr-only'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {statusMessage}
        </p>
      </section>

      <section className="recent-projects" aria-labelledby="recent-projects-title">
        <div className="recent-heading">
          <h2 id="recent-projects-title">Недавние</h2>
        </div>

        {loading ? (
          <div className="recent-empty" role="status">Загрузка…</div>
        ) : recentProjects.length ? (
          <div className="recent-grid">
            {recentProjects.map((project) => (
              <button
                type="button"
                className="recent-card"
                key={project.id}
                aria-label={`Открыть проект ${project.displayName}`}
                title={project.path}
                disabled={openingProjectId !== null || Boolean(recovery)}
                onClick={() => onOpenRecent(project.id)}
              >
                <span className="recent-card-icon"><FileText aria-hidden="true" /></span>
                <span className="recent-card-copy">
                  <strong>{project.displayName}</strong>
                  <span className="recent-card-meta"><Clock3 aria-hidden="true" /> {formatModifiedAt(project.modifiedAt)}</span>
                  <span className="recent-card-path">{project.path}</span>
                </span>
                {project.legacyFormat ? <span className="legacy-badge">KPDoc</span> : null}
                <span className="recent-card-arrow" aria-hidden="true">
                  {openingProjectId === project.id ? '…' : <ArrowRight />}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="recent-empty">
            <FileText aria-hidden="true" />
            <strong>Недавних проектов пока нет</strong>
          </div>
        )}
      </section>
    </div>
  </main>
);

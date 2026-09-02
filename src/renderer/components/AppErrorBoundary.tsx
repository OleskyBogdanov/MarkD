import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    window.desktop?.reportRendererError({
      event: 'react.error-boundary',
      message: error.message,
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim()
    });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error-screen" role="alert">
        <span>MARKD / RECOVERY</span>
        <h1>Редактор столкнулся с ошибкой</h1>
        <p>Подробности сохранены в папке журналов приложения. Открыть её можно через меню «Помощь».</p>
        <button type="button" onClick={() => window.location.reload()}>Перезагрузить интерфейс</button>
      </main>
    );
  }
}

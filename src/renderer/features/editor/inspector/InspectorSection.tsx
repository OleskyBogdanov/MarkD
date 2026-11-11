import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type InspectorSectionProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  summary?: string;
  title: string;
};

export const InspectorSection = ({
  children,
  summary,
  title
}: InspectorSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <section className="inspector-section" data-open={isOpen ? 'true' : 'false'}>
      <h4 className="inspector-section-heading">
        <button
          className="inspector-section-toggle"
          type="button"
          aria-label={title}
          aria-controls={contentId}
          aria-expanded={isOpen}
          popoverTarget={contentId}
        >
          <span>{title}</span>
          <span className="inspector-section-meta">
            {summary ? <span className="inspector-section-summary">{summary}</span> : null}
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
          </span>
        </button>
      </h4>
      <div
        className="inspector-section-content"
        id={contentId}
        popover="auto"
        onToggle={(event) => setIsOpen(event.newState === 'open')}
      >
        <h4 className="inspector-popover-title">{title}</h4>
        {children}
      </div>
    </section>
  );
};

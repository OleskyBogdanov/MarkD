import type { KpRect } from '@/renderer/domain/model';

type GeometryFieldsProps = {
  rect: KpRect;
  onChange: (rect: KpRect) => void;
  showHeight?: boolean;
};

const readNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const GeometryFields = ({ rect, onChange, showHeight = true }: GeometryFieldsProps) => (
  <fieldset className="geometry-fields">
    <legend>Положение и размер</legend>
    <div className="geometry-grid">
      <label>
        <span>X</span>
        <span className="measurement-input">
          <input
            aria-label="X, мм"
            type="number"
            value={rect.x}
            min={0}
            step={0.5}
            onChange={(event) => onChange({ ...rect, x: readNumber(event.currentTarget.value, rect.x) })}
          />
          <small aria-hidden="true">мм</small>
        </span>
      </label>
      <label>
        <span>Y</span>
        <span className="measurement-input">
          <input
            aria-label="Y, мм"
            type="number"
            value={rect.y}
            min={0}
            step={0.5}
            onChange={(event) => onChange({ ...rect, y: readNumber(event.currentTarget.value, rect.y) })}
          />
          <small aria-hidden="true">мм</small>
        </span>
      </label>
      <label>
        <span>Ширина</span>
        <span className="measurement-input">
          <input
            aria-label="Ширина, мм"
            type="number"
            value={rect.width}
            min={4}
            step={0.5}
            onChange={(event) => onChange({ ...rect, width: readNumber(event.currentTarget.value, rect.width) })}
          />
          <small aria-hidden="true">мм</small>
        </span>
      </label>
      {showHeight ? (
        <label>
          <span>Высота</span>
          <span className="measurement-input">
            <input
              aria-label="Высота, мм"
              type="number"
              value={rect.height}
              min={4}
              step={0.5}
              onChange={(event) => onChange({ ...rect, height: readNumber(event.currentTarget.value, rect.height) })}
            />
            <small aria-hidden="true">мм</small>
          </span>
        </label>
      ) : null}
    </div>
  </fieldset>
);

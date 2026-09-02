import type { TextAlign, VerticalAlign } from '@/renderer/domain/model';

type TextPlacementControlProps = {
  horizontal: TextAlign;
  vertical: VerticalAlign;
  label?: string;
  onHorizontalChange: (value: TextAlign) => void;
  onVerticalChange: (value: VerticalAlign) => void;
};

export const TextPlacementControl = ({
  horizontal,
  vertical,
  label = 'Расположение текста',
  onHorizontalChange,
  onVerticalChange
}: TextPlacementControlProps) => (
  <div className="text-placement-control" role="group" aria-label={label}>
    <button
      type="button"
      className="text-placement-side text-placement-top"
      aria-label="Расположить текст сверху"
      aria-pressed={vertical === 'top'}
      title="Сверху; повторное нажатие — по центру"
      onClick={() => onVerticalChange(vertical === 'top' ? 'middle' : 'top')}
    >
      <span aria-hidden="true" />
    </button>
    <button
      type="button"
      className="text-placement-side text-placement-right"
      aria-label="Расположить текст справа"
      aria-pressed={horizontal === 'right'}
      title="Справа; повторное нажатие — по центру"
      onClick={() => onHorizontalChange(horizontal === 'right' ? 'center' : 'right')}
    >
      <span aria-hidden="true" />
    </button>
    <button
      type="button"
      className="text-placement-side text-placement-bottom"
      aria-label="Расположить текст снизу"
      aria-pressed={vertical === 'bottom'}
      title="Снизу; повторное нажатие — по центру"
      onClick={() => onVerticalChange(vertical === 'bottom' ? 'middle' : 'bottom')}
    >
      <span aria-hidden="true" />
    </button>
    <button
      type="button"
      className="text-placement-side text-placement-left"
      aria-label="Расположить текст слева"
      aria-pressed={horizontal === 'left'}
      title="Слева; повторное нажатие — по центру"
      onClick={() => onHorizontalChange(horizontal === 'left' ? 'center' : 'left')}
    >
      <span aria-hidden="true" />
    </button>
    <span className="text-placement-center" aria-hidden="true">Aa</span>
  </div>
);

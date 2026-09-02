import { useMemo } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp, Italic, Plus, Trash2, X } from 'lucide-react';
import { ICON_NAMES, type IconName, type KpRect, type TextAlign, type VerticalAlign } from '@/renderer/domain/model';
import { ICON_LABELS } from '@/renderer/domain/iconRegistry';
import { useEditorStore } from '@/renderer/store/useEditorStore';
import { ColorControl } from '@/renderer/components/ui/ColorControl';
import { BufferedTextarea } from '@/renderer/components/ui/BufferedTextControl';
import { TextPlacementControl } from '@/renderer/components/ui/TextPlacementControl';

type GeometryFieldsProps = {
  rect: KpRect;
  onChange: (rect: KpRect) => void;
  showHeight?: boolean;
};

const readNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const GeometryFields = ({ rect, onChange, showHeight = true }: GeometryFieldsProps) => (
  <div className="geometry-grid">
    <label>
      X, мм
      <input
        type="number"
        value={rect.x}
        min={0}
        step={0.5}
        onChange={(event) => onChange({ ...rect, x: readNumber(event.currentTarget.value, rect.x) })}
      />
    </label>
    <label>
      Y, мм
      <input
        type="number"
        value={rect.y}
        min={0}
        step={0.5}
        onChange={(event) => onChange({ ...rect, y: readNumber(event.currentTarget.value, rect.y) })}
      />
    </label>
    <label>
      Ширина, мм
      <input
        type="number"
        value={rect.width}
        min={4}
        step={0.5}
        onChange={(event) => onChange({ ...rect, width: readNumber(event.currentTarget.value, rect.width) })}
      />
    </label>
    {showHeight ? (
      <label>
        Высота, мм
        <input
          type="number"
          value={rect.height}
          min={4}
          step={0.5}
          onChange={(event) => onChange({ ...rect, height: readNumber(event.currentTarget.value, rect.height) })}
        />
      </label>
    ) : null}
  </div>
);

type AlignmentControlProps = {
  value: TextAlign;
  onChange: (value: TextAlign) => void;
};

const AlignmentControl = ({ value, onChange }: AlignmentControlProps) => (
  <div className="segmented-control segmented-control-wide" role="group" aria-label="Выравнивание текста">
    {([
      ['left', AlignLeft, 'По левому краю'],
      ['center', AlignCenter, 'По центру'],
      ['right', AlignRight, 'По правому краю']
    ] as const).map(([align, Icon, label]) => (
      <button
        type="button"
        key={align}
        className={value === align ? 'active' : ''}
        aria-label={label}
        aria-pressed={value === align}
        title={label}
        onClick={() => onChange(align)}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    ))}
  </div>
);

export const Inspector = () => {
  const {
    project,
    selected,
    updateElementRect,
    updateTableHeader,
    updateTableSettings,
    updateTableStyle,
    updateTableColumnAlign,
    updateTableRowAlign,
    updateTableColumnVerticalAlign,
    updateTableRowVerticalAlign,
    updateTableRowHeight,
    updateTableColumnWidth,
    moveTableColumn,
    moveTableRow,
    deleteSelected,
    deleteTableRow,
    deleteTableColumn,
    addTableColumn,
    addTableRow,
    updateText,
    updateTextStyle,
    updateShape,
    updateTextField,
    updateSelectField,
    addSelectOption,
    updateSelectOption,
    deleteSelectOption,
    updateProjectTitle
  } = useEditorStore();

  const selectedElement = useMemo(() => {
    if (selected.type !== 'element') return null;
    const page = project.pages.find((item) => item.id === selected.pageId);
    if (!page) return null;
    return {
      page,
      element: page.elements.find((candidate) => candidate.id === selected.elementId)
    };
  }, [project, selected]);

  if (!selectedElement?.element) {
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Документ</span>
          <h2>Настройки проекта</h2>
          <p>Выберите элемент на листе или настройте документ целиком.</p>
        </div>

        <div className="inspector-block">
          <label>
            Название документа
            <input
              value={project.metadata.title}
              onChange={(event) => updateProjectTitle(event.currentTarget.value)}
            />
          </label>
          <ColorControl
            label="Фон первой страницы"
            value={project.pages[0]?.background?.type === 'color' ? project.pages[0].background.value : '#ffffff'}
            onChange={(value) => {
              const page = project.pages[0];
              if (page) useEditorStore.getState().updatePageBackground(page.id, { type: 'color', value });
            }}
          />
        </div>

        <div className="inspector-note">
          <strong>{project.pages.length}</strong>
          <span>{project.pages.length === 1 ? 'страница' : 'страницы'} в документе</span>
        </div>
      </section>
    );
  }

  const { element } = selectedElement;
  const pageId = selectedElement.page.id;
  const updateRect = (rect: KpRect): void => updateElementRect(pageId, element.id, rect);

  if (element.type === 'text') {
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Текст</h2>
          <p>Содержание, типографика и положение на листе.</p>
        </div>

        <div className="inspector-block">
          <label>
            Содержание
            <BufferedTextarea
              value={element.text}
              rows={5}
              onCommit={(value) => updateText(pageId, element.id, value)}
            />
          </label>

          <label>
            Гарнитура
            <select
              value={element.style.fontFamily}
              onChange={(event) => updateTextStyle(pageId, element.id, { fontFamily: event.currentTarget.value })}
            >
              <option value="Avenir Next, -apple-system, BlinkMacSystemFont, sans-serif">Avenir Next</option>
              <option value="Arial, -apple-system, sans-serif">Arial</option>
              <option value="Georgia, Times New Roman, serif">Georgia</option>
              <option value="Menlo, Monaco, monospace">Menlo</option>
            </select>
          </label>

          <div className="type-controls">
            <label>
              Размер, px
              <input
                type="number"
                value={element.style.fontSize}
                min={8}
                max={72}
                onChange={(event) => updateTextStyle(pageId, element.id, {
                  fontSize: readNumber(event.currentTarget.value, element.style.fontSize)
                })}
              />
            </label>
            <div className="segmented-control" aria-label="Начертание">
              <button
                type="button"
                className={element.style.bold ? 'active' : ''}
                aria-label="Полужирный"
                aria-pressed={element.style.bold}
                title="Полужирный"
                onClick={() => updateTextStyle(pageId, element.id, { bold: !element.style.bold })}
              >
                <Bold size={15} />
              </button>
              <button
                type="button"
                className={element.style.italic ? 'active' : ''}
                aria-label="Курсив"
                aria-pressed={element.style.italic}
                title="Курсив"
                onClick={() => updateTextStyle(pageId, element.id, { italic: !element.style.italic })}
              >
                <Italic size={15} />
              </button>
            </div>
          </div>

          <AlignmentControl value={element.style.align} onChange={(align) => updateTextStyle(pageId, element.id, { align })} />
          <ColorControl label="Цвет текста" value={element.style.color} onChange={(color) => updateTextStyle(pageId, element.id, { color })} />
        </div>

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />

        <button className="danger-action" type="button" onClick={deleteSelected}>
          <Trash2 size={15} /> Удалить текст
        </button>
      </section>
    );
  }

  if (element.type === 'textField') {
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Текстовое поле</h2>
          <p>Подпись, значение, иконка и оформление поля.</p>
        </div>

        <div className="inspector-block">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.showLabel}
              onChange={(event) => updateTextField(pageId, element.id, { showLabel: event.currentTarget.checked })}
            />
            <span>Показывать подпись</span>
          </label>
          <label>
            Подпись
            <input disabled={!element.showLabel} value={element.label} onChange={(event) => updateTextField(pageId, element.id, { label: event.currentTarget.value })} />
          </label>
          <label>
            Значение
            <BufferedTextarea
              className="text-field-value"
              value={element.value}
              rows={2}
              onCommit={(value) => updateTextField(pageId, element.id, { value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) event.preventDefault();
              }}
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.showPlaceholder}
              onChange={(event) => updateTextField(pageId, element.id, { showPlaceholder: event.currentTarget.checked })}
            />
            <span>Показывать placeholder</span>
          </label>
          <label>
            Placeholder
            <input disabled={!element.showPlaceholder} value={element.placeholder} onChange={(event) => updateTextField(pageId, element.id, { placeholder: event.currentTarget.value })} />
          </label>
          <label>
            Иконка Lucide
            <select
              value={element.iconName ?? ''}
              onChange={(event) => updateTextField(pageId, element.id, { iconName: (event.currentTarget.value || undefined) as IconName | undefined })}
            >
              <option value="">Без иконки</option>
              {ICON_NAMES.map((iconName) => <option key={iconName} value={iconName}>{ICON_LABELS[iconName]}</option>)}
            </select>
          </label>
          <label>
            Размер текста, px
            <input
              type="number"
              min={8}
              max={32}
              value={element.style.fontSize}
              onChange={(event) => updateTextField(pageId, element.id, { style: { fontSize: readNumber(event.currentTarget.value, element.style.fontSize) } })}
            />
          </label>
          <span className="inspector-field-label">Расположение текста</span>
          <TextPlacementControl
            horizontal={element.textAlign}
            vertical={element.verticalAlign}
            onHorizontalChange={(textAlign) => updateTextField(pageId, element.id, { textAlign })}
            onVerticalChange={(verticalAlign) => updateTextField(pageId, element.id, { verticalAlign })}
          />
        </div>

        <div className="inspector-section-label">Цвета</div>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => updateTextField(pageId, element.id, { style: { textColor } })} />
          <ColorControl label="Цвет подписи" value={element.style.labelColor} onChange={(labelColor) => updateTextField(pageId, element.id, { style: { labelColor } })} />
          <ColorControl label="Иконка" value={element.style.iconColor} onChange={(iconColor) => updateTextField(pageId, element.id, { style: { iconColor } })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => updateTextField(pageId, element.id, { style: { backgroundColor } })} />
          <ColorControl label="Граница" value={element.style.borderColor} onChange={(borderColor) => updateTextField(pageId, element.id, { style: { borderColor } })} />
        </div>

        <div className="inspector-block appearance-toggles">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.style.backgroundTransparent}
              onChange={(event) => updateTextField(pageId, element.id, { style: { backgroundTransparent: event.currentTarget.checked } })}
            />
            <span>Прозрачный фон</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.style.borderVisible}
              onChange={(event) => updateTextField(pageId, element.id, { style: { borderVisible: event.currentTarget.checked } })}
            />
            <span>Показывать границу</span>
          </label>
        </div>

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />
        <button className="danger-action" type="button" onClick={deleteSelected}><Trash2 size={15} /> Удалить поле</button>
      </section>
    );
  }

  if (element.type === 'selectField') {
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Выпадающий список</h2>
          <p>Настройте подпись, выбранное значение и устойчивые варианты.</p>
        </div>

        <div className="inspector-block">
          <label>
            Подпись
            <input value={element.label} onChange={(event) => updateSelectField(pageId, element.id, { label: event.currentTarget.value })} />
          </label>
          <label>
            Placeholder
            <input value={element.placeholder} onChange={(event) => updateSelectField(pageId, element.id, { placeholder: event.currentTarget.value })} />
          </label>
          <label>
            Выбранный вариант
            <select value={element.selectedOptionId ?? ''} onChange={(event) => updateSelectField(pageId, element.id, { selectedOptionId: event.currentTarget.value || null })}>
              <option value="">Не выбран</option>
              {element.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <div className="inspector-section-label option-list-heading">
          <span>Варианты</span>
          <button type="button" aria-label="Добавить вариант" title="Добавить вариант" onClick={() => addSelectOption(pageId, element.id)}><Plus size={14} /></button>
        </div>
        <div className="option-list">
          {element.options.map((option, index) => (
            <div className="option-row" key={option.id}>
              <input aria-label={`Вариант ${index + 1}`} value={option.label} onChange={(event) => updateSelectOption(pageId, element.id, option.id, event.currentTarget.value)} />
              <button type="button" aria-label={`Удалить вариант ${index + 1}`} title="Удалить вариант" onClick={() => deleteSelectOption(pageId, element.id, option.id)} disabled={element.options.length <= 1}><X size={14} /></button>
            </div>
          ))}
        </div>

        <div className="inspector-section-label">Цвета</div>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => updateSelectField(pageId, element.id, { style: { textColor } })} />
          <ColorControl label="Цвет подписи" value={element.style.labelColor} onChange={(labelColor) => updateSelectField(pageId, element.id, { style: { labelColor } })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => updateSelectField(pageId, element.id, { style: { backgroundColor } })} />
          <ColorControl label="Граница" value={element.style.borderColor} onChange={(borderColor) => updateSelectField(pageId, element.id, { style: { borderColor } })} />
        </div>

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />
        <button className="danger-action" type="button" onClick={deleteSelected}><Trash2 size={15} /> Удалить список</button>
      </section>
    );
  }

  if (element.type === 'image') {
    const asset = project.assets.find((item) => item.id === element.assetId);
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Изображение</h2>
          <p>{asset?.name ?? 'Импортированное изображение'} · кадрирование по области.</p>
        </div>

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />

        <button
          className="button button-outline fit-page-action"
          type="button"
          onClick={() => updateRect({
            x: 0,
            y: 0,
            width: selectedElement.page.widthMm,
            height: selectedElement.page.heightMm
          })}
        >
          На весь лист
        </button>

        <button className="danger-action" type="button" onClick={deleteSelected}>
          <Trash2 size={15} /> Удалить изображение
        </button>
      </section>
    );
  }

  if (element.type === 'shape') {
    const isLine = element.shape === 'line';
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Фигура</h2>
          <p>Форма, заливка, контур, текст и положение на листе.</p>
        </div>

        <div className="inspector-block">
          <label>
            Тип фигуры
            <select value={element.shape} onChange={(event) => updateShape(pageId, element.id, { shape: event.currentTarget.value as typeof element.shape })}>
              <option value="rectangle">Прямоугольник</option>
              <option value="ellipse">Эллипс</option>
              <option value="triangle">Треугольник</option>
              <option value="line">Линия</option>
            </select>
          </label>
          {element.shape === 'rectangle' ? (
            <label>
              Скругление, px
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={element.style.cornerRadius}
                onChange={(event) => updateShape(pageId, element.id, {
                  style: { cornerRadius: readNumber(event.currentTarget.value, element.style.cornerRadius) }
                })}
              />
            </label>
          ) : null}
        </div>

        {!isLine ? (
          <>
            <div className="inspector-section-label">Заливка</div>
            <div className="color-grid">
              <ColorControl label="Цвет заливки" value={element.style.fillColor} onChange={(fillColor) => updateShape(pageId, element.id, { style: { fillColor } })} />
            </div>
            <div className="inspector-block appearance-toggles">
              <label className="toggle-row">
                <input type="checkbox" checked={element.style.fillTransparent} onChange={(event) => updateShape(pageId, element.id, { style: { fillTransparent: event.currentTarget.checked } })} />
                <span>Без заливки</span>
              </label>
            </div>
          </>
        ) : null}

        <div className="inspector-section-label">Контур</div>
        <div className="color-grid">
          <ColorControl label={isLine ? 'Цвет линии' : 'Цвет контура'} value={element.style.strokeColor} onChange={(strokeColor) => updateShape(pageId, element.id, { style: { strokeColor } })} />
        </div>
        <div className="table-settings-grid shape-stroke-settings">
          <label>
            Толщина, px
            <input type="number" min={0} max={12} step={0.5} value={element.style.strokeWidth} onChange={(event) => updateShape(pageId, element.id, { style: { strokeWidth: readNumber(event.currentTarget.value, element.style.strokeWidth) } })} />
          </label>
          <label>
            Тип линии
            <select value={element.style.strokeStyle} onChange={(event) => updateShape(pageId, element.id, { style: { strokeStyle: event.currentTarget.value as typeof element.style.strokeStyle } })}>
              <option value="solid">Сплошная</option>
              <option value="dashed">Штриховая</option>
              <option value="dotted">Точечная</option>
            </select>
          </label>
        </div>

        {!isLine ? (
          <>
            <div className="inspector-section-label">Текст внутри</div>
            <div className="inspector-block">
              <label>
                Содержание
                <BufferedTextarea
                  value={element.text}
                  rows={4}
                  placeholder="Дважды нажмите по фигуре или введите текст здесь"
                  onCommit={(text) => updateShape(pageId, element.id, { text })}
                />
              </label>
              <label>
                Гарнитура
                <select
                  value={element.textStyle.fontFamily}
                  onChange={(event) => updateShape(pageId, element.id, { textStyle: { fontFamily: event.currentTarget.value } })}
                >
                  <option value="Avenir Next, -apple-system, BlinkMacSystemFont, sans-serif">Avenir Next</option>
                  <option value="Arial, -apple-system, sans-serif">Arial</option>
                  <option value="Georgia, Times New Roman, serif">Georgia</option>
                  <option value="Menlo, Monaco, monospace">Menlo</option>
                </select>
              </label>
              <div className="type-controls">
                <label>
                  Размер, px
                  <input
                    type="number"
                    value={element.textStyle.fontSize}
                    min={8}
                    max={72}
                    onChange={(event) => updateShape(pageId, element.id, {
                      textStyle: { fontSize: readNumber(event.currentTarget.value, element.textStyle.fontSize) }
                    })}
                  />
                </label>
                <div className="segmented-control" aria-label="Начертание текста фигуры">
                  <button
                    type="button"
                    className={element.textStyle.bold ? 'active' : ''}
                    aria-label="Полужирный"
                    aria-pressed={element.textStyle.bold}
                    title="Полужирный"
                    onClick={() => updateShape(pageId, element.id, { textStyle: { bold: !element.textStyle.bold } })}
                  >
                    <Bold size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={element.textStyle.italic ? 'active' : ''}
                    aria-label="Курсив"
                    aria-pressed={element.textStyle.italic}
                    title="Курсив"
                    onClick={() => updateShape(pageId, element.id, { textStyle: { italic: !element.textStyle.italic } })}
                  >
                    <Italic size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <AlignmentControl value={element.textStyle.align} onChange={(align) => updateShape(pageId, element.id, { textStyle: { align } })} />
              <ColorControl label="Цвет текста" value={element.textStyle.color} onChange={(color) => updateShape(pageId, element.id, { textStyle: { color } })} />
            </div>
          </>
        ) : null}

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />
        <button className="danger-action" type="button" onClick={deleteSelected}><Trash2 size={15} aria-hidden="true" /> Удалить фигуру</button>
      </section>
    );
  }

  if (element.type === 'table') {
    return (
      <section className="inspector-panel">
        <div className="inspector-heading">
          <span className="inspector-kicker">Элемент</span>
          <h2>Таблица</h2>
          <p>{element.rows.length} строк · {element.columns.length} колонок</p>
        </div>

        <div className="inspector-block">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.showPageHeader}
              onChange={(event) => updateTableSettings(pageId, element.id, { showPageHeader: event.currentTarget.checked })}
            />
            <span>Показывать заголовок блока</span>
          </label>
          <label>
            Заголовок блока
            <input
              disabled={!element.showPageHeader}
              value={element.pageHeader}
              onChange={(event) => updateTableHeader(pageId, element.id, event.currentTarget.value)}
            />
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={element.firstRowHeader}
              onChange={(event) => updateTableSettings(pageId, element.id, { firstRowHeader: event.currentTarget.checked })}
            />
            <span>Первая строка — шапка таблицы</span>
          </label>
          <span className="inspector-field-label">Расположение текста по умолчанию</span>
          <TextPlacementControl
            label="Расположение текста во всей таблице"
            horizontal={element.style.align}
            vertical={element.style.verticalAlign}
            onHorizontalChange={(align) => updateTableStyle(pageId, element.id, { align })}
            onVerticalChange={(verticalAlign) => updateTableStyle(pageId, element.id, { verticalAlign })}
          />
        </div>

        <div className="inspector-section-label">Текст и ячейки</div>
        <div className="table-settings-grid">
          <label>
            Размер текста, px
            <input type="number" min={8} max={24} value={element.style.fontSize} onChange={(event) => updateTableStyle(pageId, element.id, { fontSize: readNumber(event.currentTarget.value, element.style.fontSize) })} />
          </label>
          <label>
            Высота строки, px
            <input type="number" min={24} max={96} value={element.style.rowHeight} onChange={(event) => updateTableStyle(pageId, element.id, { rowHeight: readNumber(event.currentTarget.value, element.style.rowHeight) })} />
          </label>
          <label>
            Отступ ячейки, px
            <input type="number" min={0} max={24} value={element.style.cellPadding} onChange={(event) => updateTableStyle(pageId, element.id, { cellPadding: readNumber(event.currentTarget.value, element.style.cellPadding) })} />
          </label>
        </div>
        <div className="inspector-block appearance-toggles">
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.wrapText} onChange={(event) => updateTableStyle(pageId, element.id, { wrapText: event.currentTarget.checked })} />
            <span>Переносить текст</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.headerRowBold} disabled={!element.firstRowHeader} onChange={(event) => updateTableStyle(pageId, element.id, { headerRowBold: event.currentTarget.checked })} />
            <span>Полужирная шапка</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.alternatingRows} onChange={(event) => updateTableStyle(pageId, element.id, { alternatingRows: event.currentTarget.checked })} />
            <span>Чередовать цвет строк</span>
          </label>
        </div>

        <div className="inspector-section-label">Цвета таблицы</div>
        <div className="color-grid">
          <ColorControl label="Текст" value={element.style.textColor} onChange={(textColor) => updateTableStyle(pageId, element.id, { textColor })} />
          <ColorControl label="Фон" value={element.style.backgroundColor} onChange={(backgroundColor) => updateTableStyle(pageId, element.id, { backgroundColor })} />
          <ColorControl label="Текст блока" value={element.style.headerTextColor} onChange={(headerTextColor) => updateTableStyle(pageId, element.id, { headerTextColor })} />
          <ColorControl label="Фон блока" value={element.style.headerBackgroundColor} onChange={(headerBackgroundColor) => updateTableStyle(pageId, element.id, { headerBackgroundColor })} />
          <ColorControl label="Текст шапки" value={element.style.headerRowTextColor} onChange={(headerRowTextColor) => updateTableStyle(pageId, element.id, { headerRowTextColor })} />
          <ColorControl label="Фон шапки" value={element.style.headerRowBackgroundColor} onChange={(headerRowBackgroundColor) => updateTableStyle(pageId, element.id, { headerRowBackgroundColor })} />
          {element.style.alternatingRows ? <ColorControl label="Чётные строки" value={element.style.alternateRowColor} onChange={(alternateRowColor) => updateTableStyle(pageId, element.id, { alternateRowColor })} /> : null}
          <ColorControl label="Границы" value={element.style.borderColor} onChange={(borderColor) => updateTableStyle(pageId, element.id, { borderColor })} />
        </div>

        <div className="inspector-section-label">Границы</div>
        <div className="inspector-block">
          <label className="toggle-row">
            <input type="checkbox" checked={element.style.borderVisible} onChange={(event) => updateTableStyle(pageId, element.id, { borderVisible: event.currentTarget.checked })} />
            <span>Показывать границы</span>
          </label>
          <div className="table-settings-grid">
            <label>
              Толщина, px
              <input disabled={!element.style.borderVisible} type="number" min={0} max={6} step={0.5} value={element.style.borderWidth} onChange={(event) => updateTableStyle(pageId, element.id, { borderWidth: readNumber(event.currentTarget.value, element.style.borderWidth) })} />
            </label>
            <label>
              Стиль
              <select aria-label="Стиль границы" disabled={!element.style.borderVisible} value={element.style.borderStyle} onChange={(event) => updateTableStyle(pageId, element.id, { borderStyle: event.currentTarget.value as typeof element.style.borderStyle })}>
                <option value="solid">Сплошная</option><option value="dashed">Штриховая</option><option value="dotted">Точечная</option>
              </select>
            </label>
          </div>
        </div>

        <div className="inspector-section-label">Колонки</div>
        <div className="table-structure-list">
          {element.columns.map((columnId, index) => (
            <div className="table-structure-row" key={columnId}>
              <strong>Колонка {index + 1}</strong>
              <div className="table-structure-actions">
                <button type="button" aria-label={`Сдвинуть колонку ${index + 1} влево`} onClick={() => moveTableColumn(pageId, element.id, columnId, -1)} disabled={index === 0}><ChevronUp size={13} /></button>
                <button type="button" aria-label={`Сдвинуть колонку ${index + 1} вправо`} onClick={() => moveTableColumn(pageId, element.id, columnId, 1)} disabled={index === element.columns.length - 1}><ChevronDown size={13} /></button>
                <button type="button" aria-label={`Удалить колонку ${index + 1}`} onClick={() => deleteTableColumn(pageId, element.id, columnId)} disabled={element.columns.length <= 1}><Trash2 size={13} /></button>
              </div>
              <label>Ширина, мм<input aria-label={`Ширина колонки ${index + 1}`} type="number" min={10} max={120} step={1} value={element.rows[0]?.cells[index]?.widthMm ?? 35} onChange={(event) => updateTableColumnWidth(pageId, element.id, columnId, readNumber(event.currentTarget.value, 35))} /></label>
              <label>Выравнивание<select aria-label={`Выравнивание колонки ${index + 1}`} value={element.style.columnAlign[columnId] ?? ''} onChange={(event) => updateTableColumnAlign(pageId, element.id, columnId, (event.currentTarget.value || null) as TextAlign | null)}>
                  <option value="">Как у таблицы</option><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
                </select></label>
              <label>По вертикали<select aria-label={`Вертикальное выравнивание колонки ${index + 1}`} value={element.style.columnVerticalAlign[columnId] ?? ''} onChange={(event) => updateTableColumnVerticalAlign(pageId, element.id, columnId, (event.currentTarget.value || null) as VerticalAlign | null)}>
                  <option value="">Как у таблицы</option><option value="top">Сверху</option><option value="middle">По центру</option><option value="bottom">Снизу</option>
                </select></label>
            </div>
          ))}
        </div>

        <div className="inspector-section-label">Строки</div>
        <div className="table-structure-list">
          {element.rows.map((row, index) => (
            <div className="table-structure-row table-structure-row-compact" key={row.id}>
              <strong>{element.firstRowHeader && index === 0 ? 'Шапка' : `Строка ${index + 1}`}</strong>
              <div className="table-structure-actions">
                <button type="button" aria-label={`Поднять строку ${index + 1}`} onClick={() => moveTableRow(pageId, element.id, row.id, -1)} disabled={index === 0}><ChevronUp size={13} /></button>
                <button type="button" aria-label={`Опустить строку ${index + 1}`} onClick={() => moveTableRow(pageId, element.id, row.id, 1)} disabled={index === element.rows.length - 1}><ChevronDown size={13} /></button>
                <button type="button" aria-label={`Удалить строку ${index + 1}`} onClick={() => deleteTableRow(pageId, element.id, row.id)} disabled={element.rows.length <= 1}><Trash2 size={13} /></button>
              </div>
              <label>Выравнивание<select aria-label={`Выравнивание строки ${index + 1}`} value={element.style.rowAlign[row.id] ?? ''} onChange={(event) => updateTableRowAlign(pageId, element.id, row.id, (event.currentTarget.value || null) as TextAlign | null)}>
                  <option value="">Колонка / таблица</option><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option>
                </select></label>
              <label>Высота, px<input aria-label={`Высота строки ${index + 1}`} type="number" min={24} max={96} step={1} value={element.style.rowHeights[row.id] ?? element.style.rowHeight} onChange={(event) => updateTableRowHeight(pageId, element.id, row.id, readNumber(event.currentTarget.value, element.style.rowHeight))} /></label>
              <label>По вертикали<select aria-label={`Вертикальное выравнивание строки ${index + 1}`} value={element.style.rowVerticalAlign[row.id] ?? ''} onChange={(event) => updateTableRowVerticalAlign(pageId, element.id, row.id, (event.currentTarget.value || null) as VerticalAlign | null)}>
                  <option value="">Колонка / таблица</option><option value="top">Сверху</option><option value="middle">По центру</option><option value="bottom">Снизу</option>
                </select></label>
            </div>
          ))}
        </div>

        <div className="inspector-section-label">Геометрия</div>
        <GeometryFields rect={element.rect} onChange={updateRect} />

        <div className="inspector-actions inspector-actions-stack">
          <button type="button" onClick={() => addTableRow(pageId, element.id)}>Добавить строку</button>
          <button type="button" onClick={() => addTableColumn(pageId, element.id)}>Добавить колонку</button>
        </div>
        <button className="danger-action" type="button" onClick={deleteSelected}><Trash2 size={15} /> Удалить таблицу</button>
      </section>
    );
  }

  return null;
};

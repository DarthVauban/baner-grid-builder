import { useCallback, useEffect, useRef } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { html as htmlLanguage } from '@codemirror/lang-html';

const sourceEditorExtensions = [
  htmlLanguage({ autoCloseTags: true, matchClosingTags: true }),
  EditorView.contentAttributes.of({
    'aria-label': 'Редактор HTML, CSS та JavaScript',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false'
  })
];

const sourceEditorBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  indentOnInput: true,
  syntaxHighlighting: true
};

export function CatalogSourceCodeEditor({
  value,
  maxLength,
  onChange
}: {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleChange = useCallback((nextValue: string) => {
    onChangeRef.current(nextValue.slice(0, maxLength));
  }, [maxLength]);

  return <div className="rich-editor__source" data-language="HTML / CSS / JavaScript">
    <CodeMirror
      value={value}
      height="480px"
      theme="dark"
      autoFocus
      placeholder="Введіть HTML, CSS або JavaScript…"
      extensions={sourceEditorExtensions}
      basicSetup={sourceEditorBasicSetup}
      onChange={handleChange}
    />
    <footer><span>HTML / CSS / JavaScript</span><span>{value.length.toLocaleString('uk-UA')} / {maxLength.toLocaleString('uk-UA')}</span></footer>
  </div>;
}

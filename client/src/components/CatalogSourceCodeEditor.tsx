import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLanguage } from '@codemirror/lang-html';

export function CatalogSourceCodeEditor({
  value,
  maxLength,
  onChange
}: {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  return <div className="rich-editor__source" data-language="HTML / CSS / JavaScript">
    <CodeMirror
      value={value}
      height="480px"
      theme="dark"
      extensions={[htmlLanguage({ autoCloseTags: true, matchClosingTags: true })]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        indentOnInput: true,
        syntaxHighlighting: true
      }}
      onChange={(nextValue) => onChange(nextValue.slice(0, maxLength))}
    />
    <footer><span>HTML / CSS / JavaScript</span><span>{value.length.toLocaleString('uk-UA')} / {maxLength.toLocaleString('uk-UA')}</span></footer>
  </div>;
}


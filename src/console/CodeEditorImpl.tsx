import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** CodeMirror 6 Python editor (loaded lazily via LazyCodeEditor). */
export function CodeEditorImpl({ value, onChange }: Props) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={[python()]}
        theme="dark"
        height="420px"
        basicSetup={{ lineNumbers: true, foldGutter: true }}
      />
    </div>
  );
}

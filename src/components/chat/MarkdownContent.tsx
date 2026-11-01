import type { ReactNode } from "react";

function citationLabel(part: string) {
  const match = part.match(/^\[(S?)(\d+)\]$/i);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2]}`;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[S?\d+\]|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/gi;
  const parts = text.split(pattern).filter((part) => part !== "");
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }

    const citation = citationLabel(part);
    if (citation) {
      return (
        <sup key={key}>
          <span className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-accent/15 bg-accent-soft px-1 align-baseline font-mono text-[8px] text-accent-bright">
            {citation}
          </span>
        </sup>
      );
    }

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-bright underline decoration-accent/30 underline-offset-2 transition hover:decoration-accent"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number) {
  if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(
    lines[index + 1],
  );
}

function renderHeading(depth: number, text: string, key: string) {
  const content = renderInline(text, key);
  if (depth === 1) {
    return (
      <h1 key={key} className="text-[16px] font-semibold">
        {content}
      </h1>
    );
  }
  if (depth === 2) {
    return (
      <h2 key={key} className="text-[14px] font-semibold">
        {content}
      </h2>
    );
  }
  if (depth === 3) {
    return (
      <h3 key={key} className="text-[12.5px] font-semibold">
        {content}
      </h3>
    );
  }
  return (
    <h4 key={key} className="text-[11.5px] font-semibold">
      {content}
    </h4>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let blockIndex = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <div key={`code-${blockIndex}`} className="overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line bg-white/[0.025] px-3 py-1.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-subtle">
              {language || "code"}
            </span>
          </div>
          <pre className="overflow-x-auto p-3">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const depth = line.match(/^#+/)?.[0].length ?? 3;
      const text = line.replace(/^#{1,6}\s/, "");
      blocks.push(renderHeading(depth, text, `heading-${blockIndex}`));
      blockIndex += 1;
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      const alignments = splitTableRow(lines[index + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : "left";
      });
      const rows: string[][] = [];
      index += 2;
      while (
        index < lines.length &&
        lines[index].trim() !== "" &&
        lines[index].includes("|")
      ) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table-${blockIndex}`} className="overflow-x-auto rounded-xl border border-line">
          <table>
            <thead>
              <tr>
                {headers.map((header, cellIndex) => (
                  <th
                    key={`table-${blockIndex}-h-${cellIndex}`}
                    className={`text-${alignments[cellIndex] ?? "left"}`}
                  >
                    {renderInline(header, `table-${blockIndex}-h-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`table-${blockIndex}-r-${rowIndex}`}>
                  {headers.map((_, cellIndex) => (
                    <td
                      key={`table-${blockIndex}-r-${rowIndex}-c-${cellIndex}`}
                      className={`text-${alignments[cellIndex] ?? "left"}`}
                    >
                      {renderInline(
                        row[cellIndex] ?? "",
                        `table-${blockIndex}-r-${rowIndex}-c-${cellIndex}`,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      blockIndex += 1;
      continue;
    }

    if (line.trim().startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${blockIndex}`}>
          {renderInline(quoteLines.join(" "), `quote-${blockIndex}`)}
        </blockquote>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${blockIndex}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-${blockIndex}-${itemIndex}`}>
              {renderInline(item, `ul-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      blockIndex += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${blockIndex}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-${blockIndex}-${itemIndex}`}>
              {renderInline(item, `ol-${blockIndex}-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      blockIndex += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push(<hr key={`hr-${blockIndex}`} className="my-4 border-line" />);
      blockIndex += 1;
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[index]) &&
      !lines[index].trim().startsWith("```") &&
      !lines[index].trim().startsWith("> ") &&
      !/^[-*]\s/.test(lines[index].trim()) &&
      !/^\d+\.\s/.test(lines[index].trim()) &&
      lines[index].trim() !== "---" &&
      !isTableStart(lines, index)
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`p-${blockIndex}`}>
        {renderInline(paragraphLines.join(" "), `p-${blockIndex}`)}
      </p>,
    );
    blockIndex += 1;
  }

  return <div className="answer-content">{blocks}</div>;
}

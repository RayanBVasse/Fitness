import type { ReactNode } from "react";

/**
 * Just enough Markdown to read a pasted review.
 *
 * The daily and weekly reviews arrive from an outside model as Markdown:
 * headings, bold labels, bullets, sometimes a table. Rendering them as plain
 * text loses the structure that makes them scannable, and rendering them
 * through a real Markdown library means a dependency and an HTML string.
 *
 * This produces React elements, never HTML, so there is no innerHTML anywhere
 * on the path and nothing in a pasted document can become markup. What it
 * does not understand it shows as text, which is the right failure: an
 * unrendered "##" is legible, a swallowed paragraph is not.
 *
 * Deliberately absent: links. A URL in a pasted review is a reference, not a
 * destination, and making it clickable invites a tap that leaves the app.
 */

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_ROW = /^\|(.*)\|$/;
/** The header separator line of a table: pipes, dashes and colons only. */
const TABLE_RULE = /^\|[\s|:-]+\|$/;

function cells(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** True when this line opens a block of its own, so a paragraph must stop. */
function opensBlock(line: string): boolean {
  return (
    line === "" ||
    HEADING.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    RULE.test(line) ||
    TABLE_ROW.test(line)
  );
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    if (RULE.test(trimmed)) {
      blocks.push({ kind: "rule" });
      i += 1;
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // A table needs a header row and the separator beneath it. Without the
    // separator it is a run of lines that happen to contain pipes, and
    // guessing wrong would eat the text.
    if (TABLE_ROW.test(trimmed) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1].trim())) {
      const header = cells(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i].trim())) {
        rows.push(cells(lines[i].trim()));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const bullet = BULLET.exec(trimmed);
    const ordered = ORDERED.exec(trimmed);
    if (bullet || ordered) {
      const isOrdered = bullet === null;
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        const match = isOrdered ? ORDERED.exec(next) : BULLET.exec(next);
        if (!match) break;
        items.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }

    if (QUOTE.test(trimmed)) {
      const parts: string[] = [];
      while (i < lines.length) {
        const match = QUOTE.exec(lines[i].trim());
        if (!match) break;
        parts.push(match[1]);
        i += 1;
      }
      blocks.push({ kind: "quote", text: parts.join("\n") });
      continue;
    }

    // A paragraph runs to the next blank line or block opener. Its own line
    // breaks are kept: a review that puts each claim on its own line means it.
    const parts: string[] = [];
    while (i < lines.length && !opensBlock(lines[i].trim())) {
      parts.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: parts.join("\n") });
  }

  return blocks;
}

/** Bold, italic and code. One pass, no nesting. */
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

export function inline(text: string, keyPrefix = ""): ReactNode[] {
  return text.split(INLINE).map((piece, index) => {
    const key = `${keyPrefix}${index}`;
    if (!piece) return null;
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold">
          {piece.slice(2, -2)}
        </strong>
      );
    }
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return (
        <code key={key} className="rounded px-1 text-[0.9em]" style={{ background: "var(--surface-2)" }}>
          {piece.slice(1, -1)}
        </code>
      );
    }
    if (
      (piece.startsWith("*") && piece.endsWith("*")) ||
      (piece.startsWith("_") && piece.endsWith("_"))
    ) {
      return (
        <em key={key} className="italic">
          {piece.slice(1, -1)}
        </em>
      );
    }
    return <span key={key}>{piece}</span>;
  });
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        const key = String(index);
        switch (block.kind) {
          case "heading":
            return (
              <p
                key={key}
                className={
                  block.level <= 2
                    ? "pt-1 text-[13px] font-bold uppercase tracking-wide"
                    : "pt-1 text-sm font-bold"
                }
              >
                {inline(block.text, `${key}-`)}
              </p>
            );
          case "rule":
            return <hr key={key} className="border-border" />;
          case "list":
            return block.ordered ? (
              <ol key={key} className="ml-4 list-decimal space-y-1">
                {block.items.map((item, n) => (
                  <li key={n}>{inline(item, `${key}-${n}-`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="ml-4 list-disc space-y-1">
                {block.items.map((item, n) => (
                  <li key={n}>{inline(item, `${key}-${n}-`)}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="whitespace-pre-line border-l-2 border-border pl-3 text-text-dim"
              >
                {inline(block.text, `${key}-`)}
              </blockquote>
            );
          case "table":
            return (
              // A pasted table can be wider than a phone. Scroll the table,
              // not the page.
              <div key={key} className="-mx-1 overflow-x-auto px-1">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-text-faint">
                      {block.header.map((cell, n) => (
                        <th key={n} className="whitespace-nowrap pb-1 pr-3 font-bold">
                          {inline(cell, `${key}-h${n}-`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {block.rows.map((row, r) => (
                      <tr key={r} className="tnum">
                        {row.map((cell, c) => (
                          <td key={c} className="py-1 pr-3 align-top">
                            {inline(cell, `${key}-${r}-${c}-`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-line">
                {inline(block.text, `${key}-`)}
              </p>
            );
        }
      })}
    </div>
  );
}

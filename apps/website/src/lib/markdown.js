// Minimal, dependency-free Markdown → HTML for blog posts.
// Handles headings, bold/italic/code, links, ordered/unordered lists,
// blockquotes and paragraphs — the subset our editor + AI produce.

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Only allow safe link schemes (block javascript:, data:, etc.).
function safeHref(url) {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : "#";
}

function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => `<a href="${safeHref(url)}" rel="noopener">${text}</a>`);
}

export function mdToHtml(md) {
  if (!md) return "";
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "";
  let i = 0;
  const isBlock = (l) => /^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*>\s?)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }

    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      const lv = Math.min(m[1].length, 6);
      html += `<h${lv}>${inline(m[2].trim())}</h${lv}>`;
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      html += "<ul>";
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`; i++; }
      html += "</ul>"; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`; i++; }
      html += "</ol>"; continue;
    }
    if (/^\s*>\s?/.test(line)) {
      html += `<blockquote>${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`; i++; continue;
    }
    // paragraph
    let para = line; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlock(lines[i])) { para += " " + lines[i]; i++; }
    html += `<p>${inline(para.trim())}</p>`;
  }
  return html;
}

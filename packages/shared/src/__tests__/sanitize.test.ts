import { describe, expect, it } from "vitest";
import { sanitizeDefinitionHtml, definitionExcerpt } from "../sanitize.js";

describe("sanitizeDefinitionHtml", () => {
  it("passes through allowed tags unchanged", () => {
    const input =
      "<p>A <b>channeler</b> bound to the <i>White Tower</i> by the <em>Three Oaths</em>. <strong>See</strong> also<sup>1</sup><sub>2</sub>.</p><ul><li>one</li></ul><ol><li>two</li></ol><span>note</span><br />";
    expect(sanitizeDefinitionHtml(input)).toBe(input);
  });

  it("strips script tags and their content", () => {
    const result = sanitizeDefinitionHtml("<p>Safe</p><script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert(1)");
  });

  it("strips style tags and their content", () => {
    const result = sanitizeDefinitionHtml("<style>body{display:none}</style><p>Safe</p>");
    expect(result).not.toContain("<style>");
    expect(result).not.toContain("display:none");
  });

  it("strips img tags", () => {
    const result = sanitizeDefinitionHtml('<img src="https://evil.example.com/x.png"><p>Safe</p>');
    expect(result).not.toContain("<img");
  });

  it("strips div and table, unwrapping their text content", () => {
    const result = sanitizeDefinitionHtml("<div><table><tr><td>Text</td></tr></table></div>");
    expect(result).not.toContain("<div");
    expect(result).not.toContain("<table");
    expect(result).toContain("Text");
  });

  it("strips inline style attributes", () => {
    const result = sanitizeDefinitionHtml('<p style="color:red">Text</p>');
    expect(result).not.toContain("style=");
    expect(result).toContain("Text");
  });

  it("keeps an internal cross-reference link", () => {
    const result = sanitizeDefinitionHtml('<a href="#e0042">Aes Sedai</a>');
    expect(result).toBe('<a href="#e0042">Aes Sedai</a>');
  });

  it("strips the href from an external link but keeps the text", () => {
    const result = sanitizeDefinitionHtml('<a href="https://evil.example.com">click me</a>');
    expect(result).not.toContain("evil.example.com");
    expect(result).toContain("click me");
  });

  it("strips javascript: hrefs", () => {
    const result = sanitizeDefinitionHtml("<a href=\"javascript:alert(1)\">click</a>");
    expect(result).not.toContain("javascript:");
  });
});

describe("definitionExcerpt", () => {
  it("truncates plain text longer than 256 characters and appends '...'", () => {
    const longText = "a".repeat(300);
    const result = definitionExcerpt(`<p>${longText}</p>`);
    expect(result).toBe("a".repeat(256) + "...");
  });

  it("returns the full text with no '...' when 256 characters or fewer", () => {
    const shortText = "A channeler bound to the White Tower.";
    const result = definitionExcerpt(`<p><b>${shortText}</b></p>`);
    expect(result).toBe(shortText);
  });

  it("returns exactly 256 characters with no '...' when the plain text is exactly the limit", () => {
    const exactText = "a".repeat(256);
    const result = definitionExcerpt(`<p>${exactText}</p>`);
    expect(result).toBe(exactText);
  });

  it("decodes HTML entities after stripping tags", () => {
    const result = definitionExcerpt("<p>Fish &amp; chips</p>");
    expect(result).toBe("Fish & chips");
  });

  it("respects a custom maxLength", () => {
    const result = definitionExcerpt("<p>Hello World</p>", 5);
    expect(result).toBe("Hello...");
  });
});

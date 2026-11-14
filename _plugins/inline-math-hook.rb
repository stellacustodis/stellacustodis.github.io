#!/usr/bin/env ruby
# frozen_string_literal: true

#
# Protect inline math from kramdown.
#
# Posts write inline math as `$ ... $` (POST-RULES). kramdown only recognises
# `$$ ... $$`, so a single-dollar span is parsed as ordinary Markdown before
# MathJax ever sees it:
#
#   $\{D_i\}_{i=1}^{d}$   ->  ${D_i}<em>{i=1}^{d}$      (escapes eaten, `_` = emphasis)
#   $\|x\|_2$, $\%$       ->  $|x|_2$, $%$
#   문단 속 $p(x|y)$      ->  문단 전체가 표(<table>)로 렌더링
#
# Rewrite each single-dollar span to kramdown's native inline math before
# rendering, so its content reaches the page verbatim as `\( ... \)`.
# The source files keep the `$ ... $` notation.

module InlineMathHook
  FENCE = /\A\s{0,3}(```+|~~~+)/.freeze

  # Alternatives, in order: inline code, existing `$$..$$`, escaped `\$`,
  # then a single-dollar span (captured). A span opens with `$` followed by a
  # non-space, closes with `$` preceded by a non-space and not followed by a
  # digit, so prices such as `$3,080,000` are left alone.
  TOKEN = /(`+)(?:(?!\1).)+?\1|\$\$.*?\$\$|\\\$|\$(?=[^\s$])((?:\\.|[^$\\])+?)(?<=[^\s\\]|\\\\)\$(?!\d)/.freeze

  # List / blockquote markers that may precede the first span of a block.
  BLOCK_LEAD = /\A\s*(?:(?:[-*+]|\d+[.)])\s+|>\s?)*/.freeze

  TEXT_GROUP_OR_ESCAPED_UNDERSCORE =
    /(\\(?:text[a-z]*|operatorname\*?|math(?:rm|tt|sf|it|bf))\s*\{[^{}]*\})|\\_/.freeze

  LONE_RELATION = /\A\s*(=+|-+)\s*$/.freeze

  module_function

  def fix_span(tex)
    # `\_` was a manual workaround for the emphasis problem; it is not needed
    # (and would print a literal underscore) once the span is real math.
    # Inside \text{..}-like groups it is a genuine literal underscore: keep it.
    tex = tex.gsub(TEXT_GROUP_OR_ESCAPED_UNDERSCORE) { Regexp.last_match(1) || '_' }
    # kramdown splits table cells on `|` even inside math, and a paragraph
    # line containing `|` can start a table. Use the equivalent macros.
    unless tex.include?('\\begin{')
      tex = tex.gsub('\\|', '\\Vert ').gsub('|', '\\vert ')
    end
    tex
  end

  def convert_line(line)
    lead = line[BLOCK_LEAD]
    line.gsub(TOKEN) do |token|
      match = Regexp.last_match
      body = match[2]
      next token if body.nil?
      # Leave math inside image alt text alone: it ends up in an attribute.
      next token if match.pre_match =~ /!\[[^\]]*\z/

      converted = "$$#{fix_span(body)}$$"
      # A block that consists of one `$$..$$` is display math in kramdown;
      # the leading backslash keeps it inline.
      converted = "\\#{converted}" if match.pre_match == lead && match.post_match.strip.empty?
      converted
    end
  end

  def convert(content)
    out = []
    fence = nil
    in_display = false
    first_display_line = false

    content.each_line do |line|
      if fence
        fence = nil if line =~ /\A\s{0,3}#{Regexp.escape(fence[0])}{#{fence.size},}\s*$/
        out << line
        next
      end

      if !in_display && (m = line.match(FENCE))
        fence = m[1]
        out << line
        next
      end

      delimiters = line.gsub(/`[^`\n]*`/, '').scan('$$').size

      if in_display
        in_display = false if delimiters.odd?
        # `$$` followed by a line holding only `=` / `-` is read as a setext
        # heading whose text is "$$". `{}=` is the same relation to TeX.
        out << (first_display_line && line =~ LONE_RELATION ? line.sub(/(=+|-+)/) { "{}#{Regexp.last_match(1)}" } : line)
        first_display_line = false
        next
      end

      if delimiters.odd?
        in_display = true
        first_display_line = true
        out << line
        next
      end

      out << (line.include?('$') ? convert_line(line) : line)
    end

    out.join
  end
end

Jekyll::Hooks.register :posts, :pre_render do |post|
  content = post.content.to_s
  next unless content.include?('$')

  post.content = InlineMathHook.convert(content)
end

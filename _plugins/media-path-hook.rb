#!/usr/bin/env ruby
#
# Normalize media paths inserted by the editor.
#
# When an image is pasted into a post, VS Code writes the file to the location
# configured by `markdown.copyFiles.destination` (.vscode/settings.json) and
# inserts a path *relative to the document*:
#
#   _posts/2026-07-15-skala-prompt-engineering.md
#     ![alt](../assets/img/posts/skala-prompt-engineering/image.png)
#
# That path is correct on disk, so the VS Code preview and the GitHub repo view
# both resolve it. Jekyll, however, serves the post from /posts/<slug>/, where
# `../assets/...` no longer points at the asset. Rewrite it to a site-absolute
# path at build time so the source stays editor-friendly and the output stays
# correct.

Jekyll::Hooks.register %i[posts pages], :pre_render do |doc|
  content = doc.content.to_s
  next if content.empty?

  # ](../assets/...)  and  src="../assets/..."  ->  /assets/...
  doc.content = content.gsub(%r{(\]\(|src=["'])(?:\.\./)+assets/}, '\1/assets/')
end

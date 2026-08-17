#!/usr/bin/env ruby

Jekyll::Hooks.register :posts, :pre_render do |post|
  current_title = post.data['title'].to_s.strip
  next unless current_title.empty?

  heading_title = post.content.to_s.lines
                    .map(&:strip)
                    .find { |line| line.start_with?('# ') }

  if heading_title
    post.data['title'] = heading_title.sub(/^#\s+/, '').strip
    next
  end

  slug = post.basename_without_ext.to_s
  slug = slug.sub(/^\d{4}-\d{2}-\d{2}-/, '')
  fallback = slug.split('-').reject(&:empty?).map(&:capitalize).join(' ')
  post.data['title'] = fallback.empty? ? 'Untitled Post' : fallback
end

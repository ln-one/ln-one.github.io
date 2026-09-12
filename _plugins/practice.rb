# Render the same Markdown used in Obsidian without adding web metadata to it.
module Jekyll
  class PracticeGenerator < Generator
    def generate(site)
      page = site.pages.find { |item| item.data['permalink'] == '/practice/' }
      %w[Workflow Figures Standards].each do |title|
        body = File.read(File.join(site.source, '_practice', "#{title}.md"))
        # Keep this personal remark in the source, but omit it from the public site.
        body = body.sub(" Doing this knowingly is academic misconduct; doing it unknowingly is stupidity, not an excuse.", "") if title == "Standards"
        body = body.gsub(/\[\[(Workflow|Figures|Standards)\]\]/) do
          "[#{$1}](#{site.baseurl}/practice/##{$1.downcase})"
        end
        body = body.gsub('](assets/', "](#{site.baseurl}/practice/assets/")
        body = body.sub(/(!\[Aizen — BLEACH\]\([^\n]+\))/, '\1{: width="1826" height="2048" loading="lazy"}')
        body = body.gsub(/^(\#{1,5}) /, '\\1# ')
        page.content += "\n\n## #{title}\n\n#{body}"
        redirect = PageWithoutAFile.new(site, site.source, "practice/#{title.downcase}", 'index.html')
        redirect.data = { 'layout' => nil, 'search' => false, 'sitemap' => false }
        target = "#{site.baseurl}/practice/##{title.downcase}"
        redirect.content = %(<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=#{target}"><link rel="canonical" href="#{site.config['url']}#{target}"><title>Practice</title></head><body><a href="#{target}">Continue to #{title}</a></body></html>)
        site.pages << redirect
      end
      Dir.glob(File.join(site.source, '_practice/assets/*')).each do |asset|
        file = StaticFile.new(site, site.source, '_practice/assets', File.basename(asset))
        def file.destination(dest)
          File.join(dest, 'practice/assets', name)
        end
        site.static_files << file
      end
    end
  end
end

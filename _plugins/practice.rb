# Render the same Markdown used in Obsidian without adding web metadata to it.
module Jekyll
  class PracticeGenerator < Generator
    def generate(site)
      %w[Workflow Figures Standards].each do |title|
        page = PageWithoutAFile.new(site, site.source, "practice/#{title.downcase}", 'index.md')
        page.data = { 'layout' => 'practice', 'title' => title }
        body = File.read(File.join(site.source, '_practice', "#{title}.md"))
        body = body.gsub(/\[\[(Workflow|Figures|Standards)\]\]/) do
          "[#{$1}](#{site.baseurl}/practice/#{$1.downcase}/)"
        end
        body = body.gsub('](assets/', "](#{site.baseurl}/practice/assets/")
        body = body.sub(/(!\[Aizen — BLEACH\]\([^\n]+\))/, '\1{: width="1826" height="2048" loading="lazy"}')
        page.content = "# #{title}\n\n#{body}"
        site.pages << page
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

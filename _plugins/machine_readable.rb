# Build machine-readable views from the same public records as the website.
require 'json'
require 'bibtex'
require 'date'
require 'cgi'

module MachineReadable
  def self.url(site, path)
    site.config.fetch('url').sub(%r{/$}, '') + site.config.fetch('baseurl', '').sub(%r{/$}, '') + '/' + path.sub(%r{^/}, '')
  end

  def self.records(site)
    BibTeX.open(File.join(site.source, 'assets/ref.bib')).entries.values.each_with_index.sort_by do |entry, index|
      month = Date::MONTHNAMES.index(entry[:month].to_s) || Integer(entry[:month].to_s, exception: false) || 0
      [-Integer(entry[:year].to_s), -month, index]
    end.map(&:first)
  end

  def self.authors(entry)
    entry.author.map { |a| [a.given, a.prefix, a.family, a.suffix].map(&:to_s).reject(&:empty?).join(' ') }
  end

  def self.person(site)
    config = site.config
    {
      '@type' => 'Person', '@id' => url(site, '/#person'),
      'name' => config['name'], 'url' => url(site, '/'),
      'jobTitle' => config['title'], 'email' => "mailto:#{config['email']}",
      'affiliation' => { '@type' => 'CollegeOrUniversity', 'name' => config['institution'] },
      'sameAs' => config.fetch('links').values_at('orcid', 'google_scholar', 'github', 'researchgate').reject { |v| v.to_s.empty? }
    }
  end

  def self.article(site, entry)
    canonical = url(site, "/publications/#pub-#{entry.key}")
    work = {
      '@type' => 'ScholarlyArticle', '@id' => canonical, 'url' => canonical,
      'name' => entry[:title].to_s,
      'author' => authors(entry).map { |name| name == site.config['name'] ? { '@id' => url(site, '/#person') } : { '@type' => 'Person', 'name' => name } },
      'description' => entry[:summary].to_s,
      'creativeWorkStatus' => entry[:note].to_s
    }
    work['sameAs'] = "https://arxiv.org/abs/#{entry[:arxiv]}" unless entry[:arxiv].to_s.empty?
    unless entry[:doi].to_s.empty?
      work['identifier'] = { '@type' => 'PropertyValue', 'propertyID' => 'DOI', 'value' => entry[:doi].to_s, 'url' => "https://doi.org/#{entry[:doi]}" }
    end
    unless entry[:code].to_s.empty?
      work['subjectOf'] = { '@type' => 'SoftwareSourceCode', 'codeRepository' => entry[:code].to_s, 'url' => entry[:code].to_s }
    end
    work
  end

  def self.write(site, filename, text)
    page = Jekyll::PageWithoutAFile.new(site, site.source, '', filename)
    page.data['layout'] = nil
    page.data['permalink'] = '/' + filename
    page.data['sitemap'] = false
    page.data['search'] = false
    page.output = text
    site.pages << page
  end

  def self.markdown(text)
    text.to_s.gsub(/([\\\[\]*_`])/) { |character| "\\#{character}" }
  end
end

Jekyll::Hooks.register :site, :pre_render do |site|
  site.data['machine_person'] = MachineReadable.person(site)
  site.data['machine_articles'] = MachineReadable.records(site).map { |entry| MachineReadable.article(site, entry) }
end

Jekyll::Hooks.register :site, :post_render do |site|
  about = site.pages.find { |page| page.url == '/about/' }
  fragment = about.output[%r{<div class="biography"[^>]*>(.*?)</div>}m, 1].to_s
  bio = fragment.scan(%r{<p>(.*?)</p>}m).flatten.map { |p| CGI.unescapeHTML(p.gsub(/<[^>]+>/, '')).strip }.join("\n\n")
  education = site.data.fetch('profile').fetch('education')
  link = ->(path) { MachineReadable.url(site, path) }
  md = ->(text) { MachineReadable.markdown(text) }
  text = ["# #{md.call(site.config['name'])}",
          "Source: #{link.call('/about/')}", bio,
          '## Education',
          "#{md.call(site.config['institution'])}\n\n#{md.call(education['degree'])}; #{education['start']} - #{education['end']} (expected completion: #{education['expected']}).\n\n#{md.call(education['school'])}. #{md.call(education['location'])}.",
          '## Research interests', site.data['profile']['research_interests'].map { |i| i['name'] }.join('; '),
          '## Contact and profiles', "- Email: #{site.config['email']}"]
  %w[google_scholar github orcid researchgate].each do |key|
    value = site.config['links'][key]
    text << "- #{key.tr('_', ' ')}: #{value}" unless value.to_s.empty?
  end
  text << "- [CV (PDF)](#{link.call(site.config['links']['cv'])})"
  text << '## Research works'
  text << "Complete list; the homepage displays at most four selected works. Status is recorded per work. Source: #{link.call('/publications/')}"
  MachineReadable.records(site).each do |entry|
    text << "### #{md.call(entry[:title])}"
    text << "Authors: #{MachineReadable.authors(entry).map { |name| md.call(name) }.join('; ')}\n\nYear: #{entry[:year]}\n\nStatus: #{md.call(entry[:note])}"
    text << md.call(entry[:summary]) unless entry[:summary].to_s.empty?
    resources = ["- [Website record](#{link.call("/publications/#pub-#{entry.key}")})"]
    resources << "- [arXiv](https://arxiv.org/abs/#{entry[:arxiv]})" unless entry[:arxiv].to_s.empty?
    resources << "- [DOI](https://doi.org/#{entry[:doi]})" unless entry[:doi].to_s.empty?
    resources << "- [Code](#{entry[:code]})" unless entry[:code].to_s.empty?
    text << resources.join("\n")
  end
  text << "## News\n\n[Full news archive](#{link.call('/allnews.html')})"
  MachineReadable.write(site, 'profile.md', text.join("\n\n") + "\n")
  MachineReadable.write(site, 'llms.txt', <<~TEXT)
    # #{site.config['name']}

    > Personal academic website of #{site.config['name']}, #{site.config['title']} at #{site.config['institution']}.

    ## Main sources
    - [Complete profile and research works (Markdown)](#{link.call('/profile.md')}): Biography, education, research interests, contact links, complete author lists, work status, and paper/code links. Generated from the same public records as the website.
    - [About](#{link.call('/about/')}): Human-readable biography and education.
    - [Publications](#{link.call('/publications/')}): Complete research list with BibTeX and source links; the homepage is only a selection.
    - [CV](#{link.call(site.config['links']['cv'])}): Academic CV in PDF.
    - [News archive](#{link.call('/allnews.html')}): Dated updates.

    Work status is listed explicitly. Preprints are not presented as accepted journal or conference publications. Linked manuscripts are the primary sources for methods and results; website summaries are brief descriptions.
  TEXT
end

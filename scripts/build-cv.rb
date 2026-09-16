# Generate RenderCV input using the same records as the website.
require 'yaml'
require 'date'
require 'fileutils'
require 'bibtex'

config = YAML.load_file('_config.yml')
profile = YAML.load_file('_data/profile.yml')
education = profile.fetch('education')
document = YAML.load_file('docs/cv/design.yaml')
entries = BibTeX.open('assets/ref.bib').entries.values
# Stable ties preserve the curated same-month order used by Jekyll Scholar.
entries = entries.each_with_index.sort_by do |entry, index|
  month = Date::MONTHNAMES.index(entry[:month].to_s) || Integer(entry[:month].to_s, exception: false) || 0
  [-Integer(entry[:year].to_s), -month, index]
end.map(&:first)
preprints = entries.map do |entry|
  unless entry[:note].to_s.downcase.include?('preprint') && !entry[:arxiv].to_s.empty?
    abort "CV: #{entry.key} needs a reviewed publication section/status before inclusion."
  end
  {
    'title' => entry[:title].to_s,
    'authors' => entry.author.map { |author| [author.given, author.prefix, author.family, author.suffix].map(&:to_s).reject(&:empty?).join(' ') },
    'date' => Integer(entry[:year].to_s),
    'journal' => "arXiv:#{entry[:arxiv]}",
    'url' => "https://arxiv.org/abs/#{entry[:arxiv]}",
    'summary' => (entry[:cv_summary] || entry[:summary]).to_s,
    # RenderCV's custom Markdown supports an empty field for missing code links.
    'resources' => entry[:code].to_s.empty? ? '' : " · [Code](#{entry[:code]})"
  }
end
connections = [['google_scholar', 'Google Scholar', 'graduation-cap'], ['github', 'GitHub', 'github'], ['orcid', 'ORCID', 'orcid']].filter_map do |key, label, icon|
  url = config.fetch('links')[key]
  { 'fontawesome_icon' => icon, 'placeholder' => label, 'url' => url } unless url.to_s.empty?
end
document['cv'] = {
  'name' => config.fetch('name'),
  'headline' => "#{education.fetch('school')} | #{config.fetch('institution')}",
  'email' => config.fetch('email'),
  'website' => config.fetch('url') + config.fetch('baseurl', ''),
  'custom_connections' => connections,
  'sections' => {
    'Education' => [{ 'name' => config.fetch('institution'), 'date' => "#{education.fetch('start')} - #{education.fetch('end')}", 'summary' => "#{education.fetch('degree')} (expected #{education.fetch('expected')})", 'location' => education.fetch('location') }],
    'Research interests' => [profile.fetch('research_interests').map { |interest| interest.fetch('name') }.join(', ') + '.'],
    'Preprints' => preprints
  }
}
document['settings']['current_date'] = Date.today.iso8601
document['settings']['pdf_title'] = "#{config.fetch('name')} - Curriculum Vitae"
FileUtils.mkdir_p('output/pdf')
File.write('output/pdf/Chunran_Zhang_CV.yaml', YAML.dump(document))

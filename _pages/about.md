---
title: "About"
layout: page
permalink: /about/
---

<div class="page-heading" markdown="0">
<h1>About</h1>
<a class="cv-link" href="{{ site.links.cv | prepend: '/' | relative_url }}">{% include icon.html name="cv" %} View CV <span>PDF</span></a>
</div>

<p>{% include biography.html %}</p>

{% include research-interests.html %}

## Education

<div class="section-card" markdown="1">
### {{ site.institution }}

**{{ site.data.profile.education.degree }}** · {{ site.data.profile.education.start }} – {{ site.data.profile.education.end }} (expected)<br>
{{ site.data.profile.education.school }}<br>
{{ site.data.profile.education.location }}
</div>

## Contact & profiles

- **Email:** [chronis@my.swjtu.edu.cn](mailto:chronis@my.swjtu.edu.cn)
- **Google Scholar:** [Publications and citations](https://scholar.google.com/citations?user=nxuJYO0AAAAJ&hl=en)
- **ORCID:** [0009-0005-8865-2090](https://orcid.org/0009-0005-8865-2090)
- **GitHub:** [ln-one](https://github.com/ln-one)
- **ResearchGate:** [Chunran Zhang]({{ site.links.researchgate }})
